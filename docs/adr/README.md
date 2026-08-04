# 架构决策记录 (Architecture Decision Records)

食光的决策记录。每条 ADR 记录一个已确认的架构 / 产品决策及其背景、理由与后果。

| 编号 | 决策 | Phase |
|------|------|-------|
| [ADR-0001](./0001-theme-content-depth-personalization.md) | 主题:内容深度 + 个性化,分两 Phase 交付 | — |
| [ADR-0002](./0002-recipe-schema-depth.md) | 菜谱 schema 扩展:食材用量 + 营养三要素 | 1 |
| [ADR-0003](./0003-recipe-content-expansion.md) | 菜谱扩充:人工 + AI 混合,图片走占位符 | 2 |
| [ADR-0004](./0004-server-side-user-data.md) | 用户数据服务端持久化:Pantry / Favorite / UserPreference | 1 |
| [ADR-0005](./0005-personalized-recommendation.md) | 个性化推荐:服务端 `/recipes/personalized` | 2 |
| [ADR-0006](./0006-ai-context-injection.md) | AI 对话升级:上下文注入(非 tool-calling)。候选注入部分已被 ADR-0009 取代 | 2 |
| [ADR-0007](./0007-shopping-list-snapshot.md) | 缺料购物清单:详情页即时快照,不持久化 | 2 |
| [ADR-0008](./0008-theme-ai-capability-leap.md) | 主题:AI 能力跃迁(动嘴不动手),分两 Phase 交付 | — |
| [ADR-0009](./0009-ai-tool-calling-agent.md) | AI tool-calling:工具清单、注入演进、分级确认 | 3 / 4 |
| [ADR-0010](./0010-persistent-conversations.md) | 持久化多会话:Conversation/Message 表、最小会话列表、滑窗+摘要 | 3 / 4 |

## Phase 总览

**Phase 1(地基)** — 立数据架构,无用户可见功能
- 菜谱 schema 扩展 + 12 道老菜回填(ADR-0002)
- 新增 PantryItem / Favorite / UserPreference 三表,收藏/食材迁服务端(ADR-0004)

**Phase 2(体验)** — 地基之上的用户可感知价值
- 菜谱扩至 80–100 道(ADR-0003)
- 偏好设置页 + 首页软提示(ADR-0005)
- 个性化首页 `/recipes/personalized`(ADR-0005)
- 缺料购物清单(ADR-0007)
- AI 上下文注入(ADR-0006)
- 占位符视觉升级 + 详情页营养区块(ADR-0003)

**Phase 3(会动手)** — AI 从顾问变代理(ADR-0008)
- 持久化多会话 + 最小会话列表(ADR-0010)
- 只读工具:查菜谱 / 查用户数据(ADR-0009)
- 写 pantry / 收藏:直接执行 + 操作卡片可撤销(ADR-0009)
- 注入演进:偏好+pantry 保留注入,候选菜谱改工具按需查询(ADR-0009)
- 历史上下文:简单滑窗(ADR-0010)

**Phase 4(更懂你)** — 记忆的深度与安全(ADR-0008)
- 写偏好档案:前端确认卡片,显式确认才落库(ADR-0009)
- 滑窗 + 会话摘要(ADR-0010)
- 长会话种子脚本:摘要验收前置([验收清单](../acceptance/phase-3-4-checklist.md) F3)
- 体验打磨

**Phase 3 / 4 验收标准**见 [acceptance/phase-3-4-checklist.md](../acceptance/phase-3-4-checklist.md)(手动场景走查制)。

**术语**见 [glossary.md](../glossary.md)。
