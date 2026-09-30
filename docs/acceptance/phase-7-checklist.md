# Phase 7 验收清单：库存与购物清单下线

- **依据**：[ADR-0017](../adr/0017-remove-pantry-and-shopping-list.md)
- **验收方式**：代码/数据库核对 + API 冒烟 + 浏览器手动走查；每条须记录实际证据
- **状态**：已验收（2026-09-30）。证据见 [Phase 7 实施清单](../implementation/phase-7-implementation.md#实施与验证证据)；全库质量门的既有 Web 限制已如实记录。

## A. 旧库存面完全移除

| # | 场景 | 通过条件 |
|---|---|---|
| [x] A1 | 访问旧 `/pantry` 路由 | Web `/pantry` 实测 404，不显示兼容页面 |
| [x] A2 | 调用旧 `/pantry` API | `GET` 与 `PUT /pantry` 实测均为 404，无库存兼容 API |
| [x] A3 | Web 导航与首页发现入口 | 浏览器实测无“食材”库存导航；搜索样式卡片进入 `/filter`，文案与 `aria-label` 为“筛选菜谱” |
| [x] A4 | 详情页与共享域 | 浏览器实测无匹配度、缺料或购物清单；Recipe.ingredients 用量保留。运行时检索确认按原料搜索链仍存在、库存专用共享域代码无剩余引用 |

## B. 纯偏好推荐与安全边界

| # | 场景 | 通过条件 |
|---|---|---|
| [x] B1 | `GET /recipes/personalized` | 实测 200；排序仅使用时间/健康目标/每日轮换，权重为 3/11、3/11、5/11 |
| [x] B2 | AI `search_recipes` | 真实对话实测调用 `search_recipes`，返回 6 道含鸡蛋菜；逐个详情确认仍按菜谱原料检索，且与 personalized 共用排序事实源 |
| [x] B3 | 设置忌口与过敏原后 `GET /recipes/personalized` / AI `search_recipes` | 设置牛肉忌口、虾过敏后，`personalized.today` 4 条结果均不含 blocked；真实 AI 搜索返回结果也逐个确认不含牛肉/虾。不将独立 quick 列表纳入本条范围 |
| [x] B4 | 普通对话描述临时食材 | 真实 `POST /chat` 为 200：临时描述鸡蛋和番茄后，AI 回复西红柿炒鸡蛋并明确不保存库存，SSE 无 error |

## C. AI 工具与历史消息

| # | 场景 | 通过条件 |
|---|---|---|
| [x] C1 | 工具清单与 prompt | 运行时检索无 `get_pantry`、`add_pantry_items`、`remove_pantry_items`、库存 prompt 注入或库存撤销链 |
| [x] C2 | 历史消息回放 | 真实历史回放为 200，含 `tool-search_recipes`、无 pantry；移动端浏览器回放正常。真实库没有库存工具历史消息；对应变形由 shadow-table SQL 回归覆盖 |
| [x] C3 | Message parts 保留性 | `check-pantry-removal.sql` 在 shadow 表验证混合 parts 保序、收藏 part 保留、未完成与 dynamic-tool 库存调用清理，工具独占消息删除；真实库迁移前库存工具消息为 0 |
| [x] C4 | 摘要重置 | `check-pantry-removal.sql` 验证受影响摘要重置、无关会话保留及 `seq` 不重编号；真实库无受影响库存工具消息 |

## D. 数据迁移与文档

| # | 场景 | 通过条件 |
|---|---|---|
| [x] D1 | destructive migration 前备份 | 迁移前生成备份，最终保存于 `~/shiguang-migration/shiguang-pre-migrate-20260930.sql`（84,391 bytes、0600、SHA-256 `88a0c0ea1219360f0198b1e1b6eb6972e0ebf3fe3505a3a90ba822bc70561f52`）；独立 PostgreSQL 16 `restore_check` 恢复退出码 0，Message/Conversation/Recipe 哈希一致 |
| [x] D2 | PantryItem 删除 | `20260930000000_remove_pantry` 已成功应用，`db:generate` 成功，数据库表不存在；运行时检索无库存依赖 |
| [x] D3 | 文档一致性 | ADR、Phase 7 实施/验收、两份 AGENTS、glossary、索引同步；旧 ADR 仅有精确 supersede 指针，Phase 5 归档未改 |
| [x] D4 | 历史回归清单 | Phase 1/2–3 中库存旧条目已退役并指向 Phase 7 |

## 已知质量限制

- server 8 suites / 85 tests、server build/tsc/lint 与 domain build 均通过。
- `pnpm -r lint` 仍被既有 Web React 19 3 个错误和 `prompt-input` 1 个 unused warning 阻塞；Web `tsc` 仍有未改 `prompt-input.tsx` 的 7 个 BaseUI 类型错误。它们不属于本期改动，故不宣称全库检查通过。
- 独立 quick 快手列表仍可含 blocked 食材，是既有安全缺口；本期硬过滤验收仅覆盖 `personalized.today` 与 AI `search_recipes`。
