# 架构决策记录 (Architecture Decision Records)

食光的决策记录。每条 ADR 记录一个已确认的架构 / 产品决策及其背景、理由与后果。

> **编号沿革（2026-08-05）**:Phase 编号曾按「主题内分期」编排（ADR-0001 主题分 Phase 1/2,ADR-0008 主题分 Phase 3/4)。现统一为全局顺序:已交付的「地基+体验」合并为 **Phase 1**;AI 能力跃迁两阶段为 **Phase 2 / Phase 3**(原 3/4)。ADR-0001~0007 与 phase-1-implementation.md 保留原文不改,其中出现的「Phase 1/2」指旧编号。

| 编号 | 决策 | Phase |
|------|------|-------|
| [ADR-0001](./0001-theme-content-depth-personalization.md) | 主题:内容深度 + 个性化,分两 Phase 交付 | — |
| [ADR-0002](./0002-recipe-schema-depth.md) | 菜谱 schema 扩展:食材用量 + 营养三要素 | 1 |
| [ADR-0003](./0003-recipe-content-expansion.md) | 菜谱扩充:人工 + AI 混合,图片走占位符 | 1 |
| [ADR-0004](./0004-server-side-user-data.md) | 用户数据服务端持久化:Pantry / Favorite / UserPreference | 1 |
| [ADR-0005](./0005-personalized-recommendation.md) | 个性化推荐:服务端 `/recipes/personalized` | 1 |
| [ADR-0006](./0006-ai-context-injection.md) | AI 对话升级:上下文注入(非 tool-calling)。候选注入部分已被 ADR-0009 取代 | 1 |
| [ADR-0007](./0007-shopping-list-snapshot.md) | 缺料购物清单:详情页即时快照,不持久化 | 1 |
| [ADR-0008](./0008-theme-ai-capability-leap.md) | 主题:AI 能力跃迁(动嘴不动手),分两 Phase 交付 | — |
| [ADR-0009](./0009-ai-tool-calling-agent.md) | AI tool-calling:工具清单、注入演进、分级确认 | 2 / 3 |
| [ADR-0010](./0010-persistent-conversations.md) | 持久化多会话:Conversation/Message 表、最小会话列表、滑窗+摘要(部分被 ADR-0011 取代) | 2 / 3 |
| [ADR-0011](./0011-conversation-state-ownership-and-message-schema.md) | 会话状态归属(URL)+ Message 表重审(砍 content/toolCalls、加 seq) | 2 |
| [ADR-0012](./0012-phase-3-preference-confirm-and-summary.md) | Phase 3 设计定稿:草稿=操作集、刷新后卡片只读、摘要异步+增量、种子脚本形态 | 3 |
| [ADR-0013](./0013-auth-refresh-token-rotation.md) | 认证双轨:短 access + 长效 refresh 滑动轮换、复用检测整族吊销、Web cookie/原生 body 双轨、删 User.role | 4 |

## Phase 总览

**Phase 1(内容深度 + 个性化,已交付)** — 主题见 ADR-0001
- 菜谱 schema 扩展 + 12 道老菜回填(ADR-0002)
- 新增 PantryItem / Favorite / UserPreference 三表,收藏/食材迁服务端(ADR-0004)
- 菜谱扩至 80–100 道(ADR-0003)
- 偏好设置页 + 首页软提示(ADR-0005)
- 个性化首页 `/recipes/personalized`(ADR-0005)
- 缺料购物清单(ADR-0007)
- AI 上下文注入(ADR-0006)
- 占位符视觉升级 + 详情页营养区块(ADR-0003)

**Phase 2(会动手,已交付)** — AI 从顾问变代理(ADR-0008)
- 持久化多会话 + 最小会话列表(ADR-0010)
- 只读工具:查菜谱 / 查用户数据(ADR-0009)
- 写 pantry / 收藏:直接执行 + 操作卡片可撤销(ADR-0009)
- 注入演进:偏好+pantry 保留注入,候选菜谱改工具按需查询(ADR-0009)
- 历史上下文:简单滑窗(ADR-0010)
- 实施清单:[implementation/phase-2-implementation.md](../implementation/phase-2-implementation.md)

**Phase 3(更懂你,已交付)** — 记忆的深度与安全(ADR-0008,定稿见 ADR-0012)
- 写偏好档案:`update_preferences` 工具只产出待确认草稿,前端确认卡片显式确认才落库(ADR-0009);草稿=操作集、确认时合并、刷新后只读(ADR-0012)
- 历史消息只读:区分历史拉取与流式新消息,操作卡片撤销与确认卡片共用同一只读边界(ADR-0012,顺带修 A4 过期快照 bug)
- 滑窗 + 会话摘要:异步生成、增量更新、`Conversation` 加 `summary`/`summaryUpToSeq` 两列(ADR-0010,机制定稿 ADR-0012)
- 长会话种子脚本:插库 + 直调摘要 service(ADR-0012;[验收清单](../acceptance/phase-2-3-checklist.md) F3)
- 体验打磨:限缩为 E/F 实现中长出的部分(ADR-0012)
- 实施清单:[implementation/phase-3-implementation.md](../implementation/phase-3-implementation.md)

**Phase 4(认证双轨,进行中)** — 原生 app 的认证前置(ADR-0013)
- 双 token:15 分钟 access(JWT)+ 30 天滑动 refresh(opaque,bcrypt 哈希落库)
- refresh 一次一换 + 复用检测整族吊销;Web refresh 走 httpOnly cookie、原生走 body
- `POST /auth/refresh` / `/auth/logout` 新增;login/register 响应改 `{accessToken, user}`
- 前端 401 单飞 refresh 重放(chat 与 api 共用同一 inflight);启动静默 refresh
- 删 `User.role` 死重(零消费方)
- 实施清单:[implementation/phase-4-implementation.md](../implementation/phase-4-implementation.md)

**Phase 2 / 3 验收标准**见 [acceptance/phase-2-3-checklist.md](../acceptance/phase-2-3-checklist.md)(手动场景走查制);**Phase 4** 见 [acceptance/phase-4-checklist.md](../acceptance/phase-4-checklist.md)。

**术语**见 [glossary.md](../glossary.md)。
