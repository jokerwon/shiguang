# ADR-0017: 移除库存与购物清单 —— 回归纯偏好排序与筛选入口

- **状态**:已接受
- **日期**:2026-09-30
- **决策者**:Kai(经 grill 会话确认)
- **取代**:[ADR-0004](./0004-server-side-user-data.md) 中 PantryItem 与现有食材持久化部分、[ADR-0005](./0005-personalized-recommendation.md) 中 pantry 排序信号部分、[ADR-0006](./0006-ai-context-injection.md) 中 pantry 注入部分、[ADR-0007](./0007-shopping-list-snapshot.md) 全文、[ADR-0009](./0009-ai-tool-calling-agent.md) 中 pantry 工具与可撤销写操作部分；[ADR-0012](./0012-phase-3-preference-confirm-and-summary.md) 仅涉及历史消息不可变约束的本次一次性例外

## 背景 (Context)

食材库存（`PantryItem`）把“用户现在有什么”建模为长期服务端数据，并进一步支撑首页排序、AI 上下文、库存写工具、匹配度和缺料购物清单。真实代码探索确认，这条链路与必须保留的菜谱原料（`Recipe.ingredients`）、普通对话中临时描述食材、按原料关键词搜索菜谱是不同概念；后者不依赖库存持久化。

本次下线前的调用事实：

- Web 有独立 `/pantry` 页面、导航入口、首页“按食材匹配”入口、`usePantry` 和库存撤销卡片；详情页还消费匹配度与缺料清单。
- Server 有 `/pantry` API、`PantryService`/模块、`PantryItem` 模型，以及 `get_pantry`、`add_pantry_items`、`remove_pantry_items` 工具。库存还被注入 system prompt，并作为推荐排序信号。
- `/recipes/personalized` 与 AI `search_recipes` 共用推荐排序纯函数。当前硬过滤来自忌口与过敏原，独立于 pantry；时间、健康目标和每日轮换信号可在移除 pantry 后继续工作。
- assistant `Message.parts` 会保存历史库存工具记录；`Conversation.summary` 可能保存库存操作摘要。消息 parts 按 ADR-0011 不可变，但保留已下线工具的历史 UI 与撤销链会继续制造已删除功能的兼容面。

## 决策 (Decision)

1. **完整移除库存功能**：删除 Pantry 页面、导航与首页旧库存入口、`usePantry`、库存 API/服务/模块、`PantryItem` 模型及其专属调用链。旧 `/pantry` 路由与 API 直接移除，不保兼容。
2. **完整移除库存衍生功能**：删除匹配度、缺料计算、购物清单及其 UI、服务端排序中的 pantry 信号；删除零消费者的库存专用领域代码。保留 `Recipe.ingredients` 用量、按原料搜索菜谱、普通对话临时按食材提问、收藏/偏好和忌口与过敏原硬过滤。
3. **纯偏好排序**：`personalized` API 与 AI `search_recipes` 继续共用排序事实源。硬过滤仍先排除忌口和过敏原；排序仅使用时间适配、健康目标、每日轮换，权重固定为 **3/11、3/11、5/11**。
4. **首页筛选入口**：保留搜索样式卡片，改为 `href=/filter`，文案和 `aria-label` 为“筛选菜谱”；hero 副标题为“按口味挑一道，或和食光聊聊”。
5. **AI 链路收口**：删除 `get_pantry`、`add_pantry_items`、`remove_pantry_items`、库存 prompt 注入、库存操作卡片撤销链及其专用标签/依赖。普通对话仍可理解用户消息中的临时食材描述；`search_recipes` 仍可按原料搜索并执行忌口/过敏原硬过滤。
6. **数据与历史一次性处理**：实施前按根 `AGENTS.md` 对数据库做 `pg_dump` 备份，再迁移删除 `PantryItem` 表。备份后扫描 `Message.parts`，仅更新命中 `get_pantry`、`add_pantry_items`、`remove_pantry_items` 的消息行：从原始 UIMessage 数组中完整剔除对应 tool part（该 part 的 `input`/`output`/`state` 一并移除），保留其余 parts 的原顺序与内容；若消息不再含正文或其他有效 parts，则删除该空工具消息，不重编号其余 `seq`。重置受影响 `Conversation.summary` 与 `summaryUpToSeq`，保留正文消息及其他会话。该次历史 JSON 清理是为移除已下线功能而对消息不可变约束作出的**一次性、范围受限例外**，不建立可重复编辑历史消息的通用能力；不保留 pantry UI 兼容渲染或撤销。

## 理由 (Rationale)

- 库存是可选的长期状态，不是菜谱内容或安全偏好的必要条件；移除它能让个性化回到可解释、低维护的偏好排序。
- 忌口和过敏原硬过滤已经是独立安全边界。删除 pantry 不会削弱该边界，也不会删除 `Recipe.ingredients` 或按原料检索能力。
- 两个排序消费者继续共享一个纯函数，改权重即可同步 API 与 AI 搜索，避免保留一条无数据来源的库存分支。
- 旧库存历史记录若继续渲染或提供撤销，会让已删除 API 和 UI 重新成为兼容负担；备份后定向清理比永久保留死工具标签更诚实。正文和非库存 parts 保留，限制数据损失范围。
- 首页仍需要一个发现入口；筛选页表达临时意图，符合既有 `useFilters` 的本地语义，较删除卡片更少损失发现能力。

## 备选方案 (Alternatives Considered)

- **只删除 UI，保留 API/表和 AI 工具**：表面兼容但保留死数据、死服务与安全维护面，否。
- **保留库存但不再参与排序**：仍需维护页面、写入、撤销和历史语义，且没有确认的产品价值，否。
- **保留缺料购物清单但改为不依赖库存**：缺料定义本身就是相对库存的派生概念，失去语义基础，否。
- **保留历史库存 parts 并加永久兼容渲染**：会把已删除功能的展示和撤销链带入未来，且历史工具结果可能代表已不存在的状态，否。
- **不清理历史 JSON，仅依赖回退渲染**：会留下 raw 工具名和已废弃操作记录；本次有备份并可限定清理范围，否。
- **保持原 0.15/0.15/0.25 权重并让总和小于 1**：排序差异不可解释且无法表达释放的库存权重，否；采用 3/11、3/11、5/11 重新归一。

## 后果 (Consequences)

- **正面**：Web、Server、domain 不再维护库存专用路径；首页与 AI 排序共享纯偏好信号；安全硬过滤、收藏、偏好、菜谱原料和按原料搜索继续存在；筛选入口保留。
- **负面**：用户不能维护服务端现有食材，也不再看到匹配度、缺料或购物清单；旧库存 API/路由不兼容；历史库存工具记录经过一次性清理，受影响摘要被重置。
- **数据约束**：`PantryItem` 删除前必须有可恢复备份；迁移、JSON 清理、摘要重置必须在 Phase 7 清单中记录证据。正文与非库存 `Message.parts` 顺序保持不变，其他会话不受影响。
- **影响面**：`apps/web`、`apps/server/src`、`packages/domain/src`、Prisma schema/migrations、历史消息迁移、`docs/**`。`Recipe.ingredients` 与普通临时食材对话不在删除范围。

## 相关 ADR

- [ADR-0004](./0004-server-side-user-data.md)（服务端用户数据；仅 PantryItem 部分被取代）
- [ADR-0005](./0005-personalized-recommendation.md)（pantry 排序信号被取代，偏好排序继续）
- [ADR-0006](./0006-ai-context-injection.md)（pantry 注入被取代）
- [ADR-0007](./0007-shopping-list-snapshot.md)（全文被取代）
- [ADR-0009](./0009-ai-tool-calling-agent.md)（pantry 工具与撤销部分被取代）
- [ADR-0011](./0011-conversation-state-ownership-and-message-schema.md)（Message.parts 不可变的既有边界）
- [ADR-0012](./0012-phase-3-preference-confirm-and-summary.md)（本次历史 JSON 清理的一次性例外）
- [ADR-0015](./0015-shared-domain-layer.md)（保留共享域层；库存专用导出随零消费者删除）
