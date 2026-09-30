# Phase 7 实施清单：移除库存、购物清单与匹配链

> **状态**：已交付（2026-09-30）。依据 [ADR-0017](../adr/0017-remove-pantry-and-shopping-list.md)。验收证据与已知质量限制见本文“实施与验证证据”。

## 目标与边界

移除用户现有食材库存及其完整产品链路，恢复纯偏好排序；保留菜谱原料用量、按原料搜索、普通对话临时描述食材、收藏、偏好，以及忌口/过敏原硬过滤。

## 关键前置发现

以下事实来自对真实代码、文档和调用关系的探索，不是计划假设：

1. `PantryItem` 是唯一库存持久化实体；服务端写入集中在 `PantryService.replace`，缺料、匹配度和购物清单均为派生计算，不另行持久化。
2. Web 库存消费者覆盖 `/pantry` 页面、导航、首页发现卡、`usePantry`、详情匹配度、购物清单浮层、聊天撤销卡片和聊天页全局刷新；domain 中 `matchScore`、`matchRecipes`、`hasIng`、`missingIngredients`、`resolveIng` 等库存专用纯函数在移除消费者后可删。
3. Server 库存消费者覆盖 PantryController/Service/Module、chat 的库存依赖与工具、prompt context、摘要工具标签，以及 `RecommendationService.loadSignals` 和 `search_recipes` 的排序输入；两个推荐消费者共用 `recommendation.scoring`。
4. 推荐硬过滤由 UserPreference 的忌口与过敏原驱动，不依赖 pantry；`Recipe.ingredients` 是菜谱自身的 `{name, amount}` 内容，按原料搜索也不等同于库存查询。
5. 当前排序为 pantry 0.45、时间 0.15、健康目标 0.15、每日轮换 0.25；移除 pantry 后按 ADR-0017 归一为时间 3/11、健康目标 3/11、每日轮换 5/11。
6. `Message.parts` 保存 assistant tool parts，历史回放会据此渲染工具过程；库存工具完整记录/结果必须在备份后定向清理。非库存 parts 的顺序与内容、消息正文和其他会话必须保留；受影响 Conversation 的 summary/summaryUpToSeq 必须重置。
7. `docs/glossary.md` 有 9 处受影响术语/指路；旧 ADR 只允许添加精确 supersede 指针，不改历史正文；Phase 5 工件已归档，不改。

## 实施工作流

### A. 设计与文档（本清单启动前置）

- [x] ADR-0017 已创建并写明范围、3/11/3/11/5/11 权重、备份与历史 JSON 一次性例外。
- [x] 本 Phase 实施清单、验收清单、`docs/README.md`、`docs/adr/README.md` 已同步。
- [x] 旧 ADR 仅添加精确取代指针；归档实施/验收工件不被改写。

### B. 数据库与历史迁移（父代理负责）
- [x] 迁移前以 `pg_dump` 生成可恢复备份，并在本清单记录路径、时间、数据库对象校验证据。
- [x] 删除 `PantryItem` schema、迁移和生成物；迁移后确认无库存表/API 所需数据库依赖。
- [x] 备份后清理 `Message.parts` 中库存工具完整记录/结果；非库存 parts 顺序与内容逐条保持。
- [x] 重置所有受影响 `Conversation.summary` 与 `summaryUpToSeq`；不删除正文、不影响其他会话。
- [x] 记录清理前后计数、保留校验和、受影响会话范围与可恢复备份位置。

### C. Web 与共享域移除

- [x] 删除 `/pantry` 页面、导航入口、旧首页库存入口与库存专用 hooks/API。
- [x] 删除详情匹配度徽章、缺料/购物清单 UI 与 domain 零消费者库存纯函数；不删 `Recipe.ingredients` 展示和按原料搜索。
- [x] 保留首页搜索样式卡片：`href=/filter`，文案与 `aria-label` 为“筛选菜谱”，hero 副标题为“按口味挑一道，或和食光聊聊”。
- [x] 删除聊天库存撤销链及 `/pantry` 全局刷新；保留收藏与偏好卡片。

### D. Server 与 AI 移除

- [x] 删除 `/pantry` controller/service/module/API 及库存依赖；确认旧路由不再注册。
- [x] 删除 `get_pantry`、`add_pantry_items`、`remove_pantry_items`、库存 prompt 注入、库存工具标签与撤销依赖。
- [x] 推荐硬过滤仍先执行忌口/过敏原；`personalized` 与 `search_recipes` 共用纯偏好排序，权重为 3/11、3/11、5/11。
- [x] 普通对话仍可理解临时食材描述；`search_recipes` 仍支持按菜谱原料搜索。

### E. 文档收口

- [x] glossary 的 PantryItem、匹配度、缺料、购物清单、个性化推荐、上下文注入、工具调用、分级确认、操作卡片 9 处定义与现状一致，算法链接不再指向已迁移/删除路径。
- [x] `apps/web/AGENTS.md` 与 `apps/server/AGENTS.md` 删除库存现状、API、算法、组件和数据模型指引，补充保留边界与 Phase 7 指向。
- [x] 旧回归验收清单中的库存条目标为退役并指向 Phase 7。

## 实施与验证证据

- **数据迁移与回滚**：迁移前通过 `postgres:16-alpine` 的 `pg_dump` 经 stdout 生成备份，最终保存于 `~/shiguang-migration/shiguang-pre-migrate-20260930.sql`（原临时路径 `/tmp/shiguang-pre-migrate-20260930.sql`；84,391 bytes、权限 0600、SHA-256 `88a0c0ea1219360f0198b1e1b6eb6972e0ebf3fe3505a3a90ba822bc70561f52`）。迁移前 `PantryItem=0`、`Message=7`、库存工具消息=0。备份已恢复到独立临时 PostgreSQL 16 容器中的 `restore_check`，恢复退出码 0；以 JSONB canonical 与 `ORDER BY id COLLATE "C"` 对比，Message、Conversation、Recipe 与真实库迁移前数据哈希一致，随后已删除临时容器。
- **迁移与历史边界**：`pnpm --filter @shiguang/server db:migrate` 已成功应用 `20260930000000_remove_pantry`，`db:generate` 成功，`PantryItem` 表不存在。由于真实库不存在库存工具历史消息，`apps/server/scripts/check-pantry-removal.sql` 在临时 shadow 表执行边界回归：混合 parts 保序、收藏保留、未完成库存调用、工具独占消息删除、dynamic-tool、`seq` 不重编号、受影响摘要重置和无关会话保留均通过。复跑命令：`psql "$DIRECT_URL" -X -v ON_ERROR_STOP=1 -f scripts/check-pantry-removal.sql`（cwd `apps/server`）。
- **运行时与 UI**：旧 `GET`/`PUT /pantry` 及 Web `/pantry` 均为 404；`/recipes/personalized`、favorites、preferences 均为 200。首页搜索卡进入 `/filter`；详情仍显示原料用量、无匹配度/购物清单；390px 下为四项导航且无横向溢出。运行时检索 `apps/server/src`、Web `app/components/lib`、`packages/domain/src` 与 schema，没有剩余 pantry、匹配度、缺料、购物清单或库存 API 引用。
- **推荐与对话**：设置牛肉忌口、虾过敏后，`/recipes/personalized.today` 的 4 条结果均不含 blocked 食材。真实 `POST /chat` 返回 200：用户临时描述鸡蛋和番茄时，AI 调用 `search_recipes`，返回 6 道含鸡蛋菜；逐个详情确认不含牛肉/虾，回复明确不保存库存，SSE 无 error。历史回放为 200，含 `tool-search_recipes`、无 pantry，移动端浏览器回放正常。
- **质量检查**：server 8 suites / 85 tests、server build/tsc/lint、domain build 均通过。`pnpm -r lint` 仍受已记录的 Web React 19 3 个错误及 `prompt-input` 1 个 unused warning 阻塞；Web `tsc` 仍有未改 `prompt-input.tsx` 的 7 个 BaseUI 类型错误。它们不属于本期改动，未将全库质量门误记为通过。
- **验收资源清理**：临时账号及其偏好、会话已级联删除，Message 恢复为原有 7 条；额外启动的 `pantry-removal-api` 服务已停止。持久备份复制后校验 SHA-256 与原文件一致。

## 已知限制

- 忌口/过敏原硬过滤的本期验证范围是 `/recipes/personalized.today` 与 AI `search_recipes`。独立 quick 快手列表直接查询 `time <= 15`，仍可能包含 blocked 食材（实测可含虾）；这是既有安全缺口，不在本期范围内，未以文档或代码掩盖。
- 删除旧路由是刻意的不兼容变更；客户端必须切换到 `/filter` 或普通对话，不保留 pantry shim。
