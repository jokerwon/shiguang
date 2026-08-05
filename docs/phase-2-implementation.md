# Phase 2 实现任务清单 —— AI 会动手

> 对应 [ADR-0008](./adr/0008-theme-ai-capability-leap.md)(分期)、[ADR-0009](./adr/0009-ai-tool-calling-agent.md)(工具与分级确认)、[ADR-0010](./adr/0010-persistent-conversations.md)(持久化会话)。
> **目标**:AI 从顾问变代理。四块:① Conversation/Message 持久化 ② Chat 后端重构为 tool-loop ③ 只读工具 + pantry/收藏写工具 ④ 前端会话列表 + 操作卡片 undo。
> **不在本期**:偏好档案写入(确认卡片)、会话摘要、体验打磨 —— 属 Phase 3。

## ⚠️ 关键前置发现

**1. `PantryService` 只有「整体替换」(`replace`),没有增删单条的语义。** AI 工具的 `add_pantry_items` / `remove_pantry_items` 需要基于 `findAll + replace` 组合实现(读当前 → 计算新数组 → 整体替换),并在工具层做**去重与幂等**(已存在的跳过、不存在的忽略),返回实际增删的条目供操作卡片渲染。

**2. `FavoriteService` 只有 `toggle`,对 AI 是危险语义。** AI 说「收藏这道菜」时若已是收藏状态,toggle 会变成取消。写工具必须是**幂等的 `set(userId, recipeId, saved)` 语义**,service 需新增方法(controller 的 toggle 端点保留不动,前端收藏按钮仍在用)。

**3. 会话历史必须服务端组装,不能信客户端全量。** 当前 `POST /chat` 接收前端发来的完整 `UIMessage[]`(useChat 默认行为)。持久化后若沿用此模式,每轮都重复落库且滑窗形同虚设。→ 改为:**body 只带 `conversationId` + 最新一条用户消息,后端从 DB 取最近 N 条组装上下文**,前端 transport 用 `prepareSendMessagesRequest` 裁剪。这也顺带解决「客户端篡改历史」的隐患。

**4. 工具必须继承安全硬过滤。** ADR-0006 的硬过滤(忌口 ∪ 过敏原)目前体现在候选菜谱的预筛里;候选注入移除后,`search_recipes` 工具**必须自己应用同一套硬过滤**(`RecommendationService.loadSignals` 的 `blocked`),否则 AI 可能通过工具查出含过敏原的菜并推荐——这是安全事故路径。

**5. 前端 ai-elements 未安装 Tool 组件。** 现有 `components/ai-elements/` 只有 conversation / message / prompt-input / shimmer / suggestion。工具调用过程与操作卡片需要新增渲染组件(可经 `ai-elements` skill 添加,或手写最小卡片)。

**6. AI SDK 版本能力点(实现时照此核对,勿凭记忆写 API)**:tools 经 `tool({ description, inputSchema, execute })` 定义;多步 tool-loop 用 `stopWhen: stepCountIs(n)` 控制上限;流式结果中 tool 调用以 UIMessage parts(`tool-<name>`,含 state/output)下发,`DefaultChatTransport` 自动处理;`onFinish` 回调拿最终 assistant 消息用于落库。**动手前先看 `node_modules/ai` 的类型与文档核对签名。**

**前端利好**:`DefaultChatTransport` 已支持自定义 `prepareSendMessagesRequest` 与动态 headers;`useChat` 的 `id` + `setMessages` 天然支持会话切换;写操作后的数据一致性直接 `mutate('/pantry')` / `mutate('/favorites')` 即可,无需新机制。

---

## W0 · Schema + 会话 CRUD(阻塞性前置)

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 0.1 | 定义 Conversation / Message 模型 | `apps/server/prisma/schema.prisma` | 按 ADR-0010 schema;`User` 加 `conversations` relation;`@@index` 按 ADR |
| 0.2 | 跑迁移 + 重新生成 Client | — | `pnpm --filter @shiguang/server db:migrate` + `db:generate`(独立 migration) |
| 0.3 | `ConversationModule` | `apps/server/src/conversation/` | `GET /conversations`(按 updatedAt 倒序,只返回 id/title/updatedAt)、`GET /conversations/:id/messages`(按 createdAt 升序)、`DELETE /conversations/:id`(级联删消息)。全部挂 `JwtAuthGuard`,**每个端点校验 `conversation.userId === userId`,越权返回 404**(不泄露存在性) |
| 0.4 | UIMessage ↔ DB 映射器 | `apps/server/src/conversation/conversation.mapper.ts` | 纯函数:`toUIMessage(msg)` / `fromUIMessage(parts)`。`content` 存拼接文本,`toolCalls` 存非 text 的 parts(工具调用/结果,操作卡片渲染所需)。**text 与 tool parts 都要能无损还原** |
| 0.5 | 注册模块 | `apps/server/src/app.module.ts` | `imports` 加 `ConversationModule` |
| 0.6 | (保险)端点能力探测脚本 | `apps/server/scripts/probe-tool-calling.ts`(临时,不进 git 或放 scripts/) | 最小 `streamText` + 一个 dummy tool,验证当前端点流式 tool_calls 行为符合预期。用户已确认支持,此脚本做最终验证,跑通即删 |

**验收**:三端点 Postman/ curl 走通;越权访问他人会话返回 404;mapper 单测覆盖 text-only / 含 toolCalls / 空 content 三种形态。

---

## W1 · Chat 后端重构:tool-loop + 持久化 + 注入演进

> 依赖 W0。本期 chat 的核心手术,建议一次提交完成,避免半新半旧状态。

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 1.1 | 定义只读工具 | `apps/server/src/chat/tools/read-tools.ts` | `search_recipes`(keyword/cuisine/tags/maxTime/maxKcal/minProtein/limit)、`get_recipe`(id)、`get_pantry`、`get_favorites`、`get_preferences`。execute 内注入 userId,**search_recipes 先过 `blocked` 硬过滤再排序**(复用 `RecommendationService` 的打分,单一事实源);返回精简字段(名/菜系/时长/营养/tags/id),控制 tool result token |
| 1.2 | 定义写工具 | `apps/server/src/chat/tools/write-tools.ts` | `add_pantry_items(names[])` / `remove_pantry_items(names[])`(读-算-整体替换,幂等,返回 `{ added/removed, pantry }`);`set_favorite(recipeId, saved)`(幂等 set,返回 `{ saved, favorites }`) |
| 1.3 | `FavoriteService.set` | `apps/server/src/favorite/favorite.service.ts` | 新增幂等 set:目标状态已一致则直接返回当前列表;否则 create/delete |
| 1.4 | 工具集装配 | `apps/server/src/chat/tools/index.ts` | `createChatTools(deps, userId)` 工厂:按请求组装工具集,闭包捕获 userId。单测友好(纯函数注入 fake service) |
| 1.5 | `ChatService` 重构 | `apps/server/src/chat/chat.service.ts` | 入参改 `(conversationId ㇑ undefined, message: UIMessage, userId)`;无 conversationId 则**创建会话**(title = 用户消息文本截断 ~20 字);落库用户消息;DB 取最近 20 条 → `convertToModelMessages`;`streamText({ tools, stopWhen: stepCountIs(5) })`;`onFinish` 落库 assistant 消息(含 tool parts)+ touch `conversation.updatedAt` |
| 1.6 | 注入演进(修订 ADR-0006) | `apps/server/src/chat/prompts/context-builder.ts` | 保留偏好/pantry/季节/用户名注入;**删除 candidates 注入块与 `CandidateRecipe`**;`ChatService` 不再调 `recommend(userId, 8)`(`loadSignals` 仍需要) |
| 1.7 | 提示词改写 | `apps/server/src/chat/prompts/recipe.ts`、`behavior.ts`、`guardrails.ts` | 「只能从候选菜谱推荐」→「推荐具体菜谱前必须先用 `search_recipes` 查库,禁止编造库中没有的菜」;新增工具使用规范:改 pantry/收藏后一句话复述结果;查不到就如实说;安全护栏保留(忌口/过敏绝对红线) |
| 1.8 | `ChatController` 改造 | `apps/server/src/chat/chat.controller.ts` | body 改 `{ conversationId?: string, message: UIMessage }`;校验会话归属(复用 W0 的 404 语义);流式管道不变 |
| 1.9 | 单测 | `apps/server/src/chat/tools/*.spec.ts` | 工具 execute 纯逻辑:硬过滤生效、add/remove 幂等与去重、set_favorite 幂等。参考 `recommendation.scoring.spec.ts` 的零 DB 风格 |

**验收**:`search_recipes` 结果不含 blocked 食材;「我买了牛腩」→ pantry 实际入库且回复复述;「收藏这道菜」对已收藏菜谱不产生翻转;无 conversationId 的首条消息自动建会话;20 条之外的旧消息不进入上下文;候选注入从 system prompt 消失。

---

## W2 · 前端:会话列表 + transport 改造 + 操作卡片

> 依赖 W1 的 API 形态。UI 细节遵循现有设计系统(绿色主题、圆角卡片)。

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 2.1 | 会话 API + hook | `apps/web/lib/api.ts`、`apps/web/lib/use-conversations.ts` | `fetchConversations` / `fetchConversationMessages` / `deleteConversation`;`useConversations()` 走 SWR(key `/conversations`) |
| 2.2 | transport 改造 | `apps/web/app/(screen)/chat/page.tsx` | `useChat({ id: activeConversationId })`;`prepareSendMessagesRequest` 只发 `{ conversationId, message: 最后一条 }`;切换会话时拉 messages 并 `setMessages` 还原(经 W0.4 映射的 UIMessage 含 tool parts) |
| 2.3 | 会话列表 UI | `apps/web/app/(screen)/chat/page.tsx`(或拆 `components/chat-sidebar.tsx`) | 桌面:左侧栏(会话列表 + 「新对话」+ 每项删除按钮);移动:顶部触发抽屉。删除需二次确认(级联删消息不可逆)。列表项显示 title + 相对时间 |
| 2.4 | Tool 渲染组件 | `apps/web/components/ai-elements/tool.tsx`(新增) | 渲染工具调用过程(调用中 shimmer / 完成折叠)。可经 ai-elements skill 添加后按设计系统裁剪 |
| 2.5 | 操作卡片 + undo | `apps/web/components/chat-action-card.tsx`(新增) | 写工具的 tool part 渲染为结果卡片(「已添加 牛腩 到食材清单」「已收藏 宫保鸡丁」),附「撤销」:add↔remove、set_favorite↔反向 set,复用 `replacePantry` / 新 `setFavorite` API,成功后 `mutate` 对应 SWR key。**已撤销的卡片置灰防重复点击** |
| 2.6 | 写后数据一致性 | `apps/web/app/(screen)/chat/page.tsx` | 流结束(`status` 回到 ready)后 `mutate('/pantry')`、`mutate('/favorites')` 兜底刷新,保证食材页/收藏页数据最新 |
| 2.7 | `setFavorite` API | `apps/web/lib/api.ts` | 若 undo 需要精确 set 而非 toggle,后端对应端点:`POST /favorites/:recipeId` 带 body `{ saved: boolean }`(兼容现有 toggle:无 body 时维持 toggle 语义) |

**验收**:刷新/换设备后对话历史完整(含操作卡片);「新对话」开空白会话;删除会话后列表与 DB 同步;操作卡片 undo 后食材页/收藏页数据一致;移动端抽屉可用。

---

## W3 · 收尾

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 3.1 | 文档同步 | `apps/server/CLAUDE.md`、`apps/web/CLAUDE.md` | 模块结构(chat/tools、conversation)、数据模型、数据层表格(chat hooks)更新 |
| 3.2 | 全量回归 | — | `pnpm --filter @shiguang/server test`、`pnpm --filter @shiguang/web lint`;手动过一遍:推荐页 / 食材页 / 收藏页 / 对话页全链路 |
| 3.3 | ADR 状态回写 | `docs/adr/README.md` | Phase 2 条目标记完成 |

---

## 依赖关系与并行策略

```
W0 (schema + 会话 CRUD)
 └─ W1 (chat 后端重构)        ← 阻塞核心
     └─ W2 (前端)             ← 2.1/2.3 可在 W1 接口定形后先行
         └─ W3 (收尾)
```

W0.6 探测脚本若失败(端点实际不支持流式 tool_calls)→ 停下来,回到 ADR-0009 启用「JSON 指令协议」备选,**不要硬写**。

## 明确不做(本期边界)

- 偏好档案写工具 + 确认卡片(Phase 3,ADR-0009 已定方案)
- 会话摘要(Phase 3;本期滑窗 N=20 兜底,超长会话旧消息直接不进上下文)
- 会话重命名 / 置顶 / 搜索(ADR-0010 明确不做)
- 对话中生成新菜谱入库(staging 流程保持人工,ADR-0003 不变)
