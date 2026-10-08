# 架构决策记录 (Architecture Decision Records)

食光的决策记录。每条 ADR 记录一个已确认的架构 / 产品决策及其背景、理由与后果。

> **编号沿革（2026-08-05）**:Phase 编号曾按「主题内分期」编排（ADR-0001 主题分 Phase 1/2,ADR-0008 主题分 Phase 3/4)。现统一为全局顺序:已交付的「地基+体验」合并为 **Phase 1**;AI 能力跃迁两阶段为 **Phase 2 / Phase 3**(原 3/4)。ADR-0001~0007 与 phase-1-implementation.md 保留原文不改,其中出现的「Phase 1/2」指旧编号。

| 编号 | 决策 | Phase |
|------|------|-------|
| [ADR-0001](./0001-theme-content-depth-personalization.md) | 主题:内容深度 + 个性化,分两 Phase 交付 | — |
| [ADR-0002](./0002-recipe-schema-depth.md) | 菜谱 schema 扩展:食材用量 + 营养三要素 | 1 |
| [ADR-0003](./0003-recipe-content-expansion.md) | 菜谱扩充:人工 + AI 混合,图片走占位符 | 1 |
| [ADR-0004](./0004-server-side-user-data.md) | 用户数据服务端持久化：Favorite / UserPreference 继续有效；PantryItem 与现有食材部分已被 ADR-0017 取代 | 1 |
| [ADR-0005](./0005-personalized-recommendation.md) | 个性化推荐：服务端 `/recipes/personalized`；pantry 排序部分已被 ADR-0017 取代 | 1 |
| [ADR-0006](./0006-ai-context-injection.md) | AI 对话升级：上下文注入；pantry 注入部分已被 ADR-0017 取代 | 1 |
| [ADR-0007](./0007-shopping-list-snapshot.md) | 缺料购物清单：决策全文已被 ADR-0017 取代 | 1 |
| [ADR-0008](./0008-theme-ai-capability-leap.md) | 主题:AI 能力跃迁(动嘴不动手),分两 Phase 交付 | — |
| [ADR-0009](./0009-ai-tool-calling-agent.md) | AI tool-calling:工具清单、注入演进、分级确认 | 2 / 3 |
| [ADR-0010](./0010-persistent-conversations.md) | 持久化多会话:Conversation/Message 表、最小会话列表、滑窗+摘要(部分被 ADR-0011 取代) | 2 / 3 |
| [ADR-0011](./0011-conversation-state-ownership-and-message-schema.md) | 会话状态归属(URL)+ Message 表重审(砍 content/toolCalls、加 seq) | 2 |
| [ADR-0012](./0012-phase-3-preference-confirm-and-summary.md) | Phase 3 设计定稿:草稿=操作集、刷新后卡片只读、摘要异步+增量、种子脚本形态 | 3 |
| [ADR-0013](./0013-auth-refresh-token-rotation.md) | 认证双轨:短 access + 长效 refresh 滑动轮换、复用检测整族吊销、Web cookie/原生 body 双轨、删 User.role | 4 |
| [ADR-0014](./0014-theme-mobile-first-native-app.md) | ~~主题:原生 app 首发,移动主战场~~（**已作废**,被 ADR-0016 取代） | 5 |
| [ADR-0015](./0015-shared-domain-layer.md) | 共享域层 `packages/domain`:Web 与服务端共用的领域类型与纯函数（移动端动机已作废,决策继续有效） | 5 |
| [ADR-0016](./0016-remove-mobile-client.md) | 移除移动客户端:删 `apps/mobile`,平台回归 Web 单客户端;保留 `packages/domain` 与 body 双轨 | — |
| [ADR-0017](./0017-remove-pantry-and-shopping-list.md) | 移除库存与购物清单：纯偏好排序、首页筛选入口、备份及历史 JSON 清理的一次性例外 | 7 |
| [ADR-0018](./0018-ingredient-catalog-and-filtering.md) | 食材资料库、稳定身份与菜谱关联、别名共用、全部包含筛选及安全边界；整体设计已确认，未实施 | 8 |
| [ADR-0019](./0019-recipe-ingredient-single-source.md) | 菜谱原料以 `RecipeIngredient` 为唯一事实源：主键改 (recipeId, position)，下线 `Recipe.ingredients` | 9 |

## Phase 总览

**Phase 1(内容深度 + 个性化,已交付)** — 主题见 ADR-0001
- 菜谱 schema 扩展 + 12 道老菜回填(ADR-0002)
- Favorite / UserPreference 服务端持久化继续有效；PantryItem 与现有食材功能已由 Phase 7 移除(ADR-0004, ADR-0017)
- 菜谱扩至 80–100 道(ADR-0003)
- 偏好设置页 + 首页软提示(ADR-0005)
- 个性化首页 `/recipes/personalized`(ADR-0005；排序规则由 ADR-0017 更新)
- 缺料购物清单(ADR-0007；已由 ADR-0017 移除)
- AI 上下文注入(ADR-0006；pantry 注入已由 ADR-0017 移除)
- 占位符视觉升级 + 详情页营养区块(ADR-0003)

**Phase 2(会动手,已交付)** — AI 从顾问变代理(ADR-0008)
- 持久化多会话 + 最小会话列表(ADR-0010)
- 只读工具:查菜谱 / 查用户数据(ADR-0009；库存工具已由 ADR-0017 移除)
- 写收藏:直接执行 + 操作卡片可撤销(ADR-0009；库存写工具已由 ADR-0017 移除)
- 注入演进:偏好保留注入,候选菜谱改工具按需查询(ADR-0009, ADR-0017)
- 历史上下文:简单滑窗(ADR-0010)
- 实施清单:[implementation/phase-2-implementation.md](../implementation/phase-2-implementation.md)

**Phase 3(更懂你,已交付)** — 记忆的深度与安全(ADR-0008,定稿见 ADR-0012)
- 写偏好档案:`update_preferences` 工具只产出待确认草稿,前端确认卡片显式确认才落库(ADR-0009);草稿=操作集、确认时合并、刷新后只读(ADR-0012)
- 历史消息只读:区分历史拉取与流式新消息,操作卡片撤销与确认卡片共用同一只读边界(ADR-0012,顺带修 A4 过期快照 bug)
- 滑窗 + 会话摘要:异步生成、增量更新、`Conversation` 加 `summary`/`summaryUpToSeq` 两列(ADR-0010,机制定稿 ADR-0012)
- 长会话种子脚本:插库 + 直调摘要 service(ADR-0012;[验收清单](../acceptance/phase-2-3-checklist.md) F3)
- 体验打磨:限缩为 E/F 实现中长出的部分(ADR-0012)
- 实施清单:[implementation/phase-3-implementation.md](../implementation/phase-3-implementation.md)

**Phase 5(原生 app 首发,已交付后移除)** — ~~移动主战场~~(ADR-0014,经 grill 会话确认;**该主题已由 ADR-0016 作废**)
- 曾交付:Expo/React Native `apps/mobile`(iOS 先行),子集为发现/食材/收藏/我的 + 菜谱详情 + 缺料清单 + 登录注册
- 曾交付:离线只读缓存(浏览链:个性化/详情/收藏)、移动端认证(refresh 存 Keychain,access 仅内存)
- **2026-09-28 整体删除 `apps/mobile`**(ADR-0016,平台回归 Web 单客户端);`packages/domain` 共享域层保留(ADR-0015 决策继续有效)
- 历史工件:[implementation/phase-5-implementation.md](../implementation/phase-5-implementation.md)、[acceptance/phase-5-checklist.md](../acceptance/phase-5-checklist.md)(均已标注不再维护)

**Phase 4(认证双轨,已交付)** — 原生 app 的认证前置(ADR-0013)
- 双 token:15 分钟 access(JWT)+ 30 天滑动 refresh(opaque,bcrypt 哈希落库)
- refresh 一次一换 + 复用检测整族吊销;Web refresh 走 httpOnly cookie、原生走 body
- `POST /auth/refresh` / `/auth/logout` 新增;login/register 响应改 `{accessToken, user}`
- 前端 401 单飞 refresh 重放(chat 与 api 共用同一 inflight);启动静默 refresh
- 删 `User.role` 死重(零消费方)
- 实施清单:[implementation/phase-4-implementation.md](../implementation/phase-4-implementation.md)

**Phase 2 / 3 验收标准**见 [acceptance/phase-2-3-checklist.md](../acceptance/phase-2-3-checklist.md)(手动场景走查制);**Phase 4** 见 [acceptance/phase-4-checklist.md](../acceptance/phase-4-checklist.md)。

**Phase 7(库存与购物清单下线,已交付)** — ADR-0017
- 实施清单:[implementation/phase-7-implementation.md](../implementation/phase-7-implementation.md)（含迁移、回滚、运行时与质量检查证据）
- 验收清单:[acceptance/phase-7-checklist.md](../acceptance/phase-7-checklist.md)（已验收；既有 Web 质量限制如实记录）

**Phase 8(食材资料库与按食材筛选,活跃)** — ADR-0018
- 实施清单:[implementation/phase-8-implementation.md](../implementation/phase-8-implementation.md)（8-1/8-2/8-3/8-7 各自独立成篇）
- 验收清单:[acceptance/phase-8-checklist.md](../acceptance/phase-8-checklist.md)

**Phase 9(菜谱原料单一事实源,已交付)** — ADR-0019
- 关联行 `(recipeId, position)` 成为原料唯一事实源，下线 `Recipe.ingredients` Json 列
- 读取/写入/归一/AI 工具全部改读关联行；同身份多写法各保留一行，不再合并丢用量
- 实施清单:[implementation/phase-9-implementation.md](../implementation/phase-9-implementation.md)（含迁移、备份对账与运行时证据）

**术语**见 [glossary.md](../glossary.md)。
