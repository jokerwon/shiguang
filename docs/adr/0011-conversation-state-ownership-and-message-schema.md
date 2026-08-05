# ADR-0011: 会话状态归属（URL）与 Message 表重审

- **状态**:已接受
- **日期**:2026-08-05
- **决策者**:Kai(经 grill 会话确认)
- **取代**:ADR-0010 的「会话 UI 状态管理」隐含假设(前端 `useState` 持有当前会话 id)与「Message 表 schema」(content/toolCalls 冗余列、无 seq、role 注释三类但实际两类)

## 背景 (Context)

ADR-0010 落地后,经对真实代码的盘问(grill 会话)发现两类问题:

**A. 会话状态归属与一致性**

1. **"当前会话"无持久化**:`activeId` 只活在 `apps/web/app/(screen)/chat/page.tsx` 的 `useState`——不进 URL、不进 localStorage。刷新页面 → 丢失当前会话落到"新对话"空状态;多标签页同会话各自独立、互不可见。
2. **并发新建会话竞态**:`transport` 是依赖 `activeId` 的 `useMemo`。新会话状态下连发两条消息,第二条可能在 `activeId` 仍为 `null` 时发出 → 后端创建第二个会话,前端只追到第一个,消息分裂到两个会话。
3. **流结束后不刷新 `/conversations`**:`onFinish` 更新了 `conversation.updatedAt`,但前端流后 effect 只 `mutate('/pantry')` / `mutate('/favorites')`,侧栏排序失真。
4. **删除会话错误静默吞掉**:`useConversations.remove` 无 try/catch,失败时用户无感知。

**B. Message 表设计债**

5. **`content` 与 `toolCalls` 列是死重量**:经 CodeGraph 确认,活路径上无任何读取者。唯一读取点是 mapper 的"兼容旧数据"退化分支(仅当 `parts` 列为空时回退)。注释声称 `content` 用于"title 生成/调试/全文",但实际 title 生成用的是**入库前的内存消息**(`chat.service.ts` 的 `messageText()`),从不读 DB 的 `content` 列。
6. **无 `seq` 字段,排序靠 `createdAt`**:同毫秒并列、时钟漂移、滑窗边界脆弱。`recentMessages` 用 `desc take 20 reverse`,同毫秒时顺序未定义。
7. **`role` 注释三类(user/assistant/tool)但实际只存两类**:tool 信息在 assistant 的 `parts` 里,从未单独落 `role=tool` 行。注释与代码漂移。

**本期不碰(已知债,留 Future Work)**

- 孤儿 user 消息:流中途断开 → `onFinish` 不触发 → DB 留下无回复的 user 消息。本期维持 user 先落、assistant 靠 `onFinish` 的现状,不引入原子轮次。

## 决策 (Decision)

### 1. 会话状态归属:URL 拥有

- **路由**:`/chat/new`(新会话)、`/chat/:id`(已有会话)。
- **`activeId` 改为从 `useParams()` 读取**,不再用 `useState`。URL 是当前会话的单一事实源。
- **新建会话**:用户在 `/chat/new` 发首条消息 → 后端建会话、响应头回传 `x-conversation-id` → 前端 `router.replace('/chat/:realId')`。
- **根治并发竞态(问题 2)**:URL 是单一事实源后,第一条消息建会话后 URL 已带 id,第二条消息发出时 `prepareSendMessagesRequest` 读到的就是真实 id,不会再以 `null` 发出。
- **越权访问 `/chat/:id`**:后端 404,前端提示"会话不存在"并跳回 `/chat/new`。

### 2. useChat 的 `id`:常量化(P1 方案)

`useChat({ id: activeId ?? 'new' })` 在新建会话瞬间会让 `id` 在流式中途从 `'new'` 切到 `realId`,行为未定义、有丢消息/dup 风险。

- **改用常量 `id`(如 `'chat'`)**:`useChat({ id: 'chat' })` 恒定不变。
- **切换会话**:由 `useEffect(params.id)` 触发 → 拉历史 → `setMessages()` 还原。
- **新建会话**:流式中 `useChat` 的 `id` 不切,流式稳;结束后 URL 已是 `realId`,下次切换时从服务端拉取。
- **代价**:丢失 `useChat` 的 per-conversation 内存缓存——但本项目切换会话本就走服务端拉历史(现状已是 `fetchConversationMessages`),无功能损失。

### 3. Message 表 schema 重审

```prisma
model Message {
  id             String       @id @default(cuid())
  conversationId String
  seq            Int          // 消息在会话中的单调递增序号(消息级,1 起)
  role           String       // user | assistant(实际两类;tool 信息在 assistant.parts 内)
  parts          Json         // 原始 UIMessage parts 数组(保序,还原唯一来源)
  createdAt      DateTime     @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@unique([conversationId, seq])
  @@index([conversationId, seq])
}
```

变更:
- **砍 `content` 列**:死重量,无活读取者。迁移时把旧行的 `content` 折算进 `parts`(text part),之后删列。
- **砍 `toolCalls` 列**:死重量,`parts` 是唯一还原来源。迁移时把旧行的 `toolCalls` 合并进 `parts`,之后删列。
- **加 `seq Int`**:消息级序号,`@@unique([conversationId, seq])` 兜底。应用层 `max(seq)+1` 计算;因 URL 拥有 + 单标签视图,并发写同会话概率极低,冲突时重试。
- **`role` 保持 string**:暂不改 enum(避免本期引入 PostgreSQL `ALTER TYPE` 迁移复杂度);但修正注释为"实际两类"。
- **滑窗改按 seq**:`recentMessages` 从 `orderBy createdAt desc take 20` 改为 `orderBy seq desc take 20`,语义等价但顺序确定。

### 4. 前端一致性补丁

- 流结束后 effect 补 `globalMutate('/conversations')`(修问题 3)。
- `useConversations.remove` 加 try/catch + 用户反馈(修问题 4)。

## 理由 (Rationale)

- **URL 归属**:三选一(前端内存/URL/服务端)中,URL 是唯一能同时解决"刷新可恢复""多标签共享""根治并发竞态"且不引入服务端"上次活跃"状态的方案。状态由路由拥有,语义最清晰。
- **常量化 useChat id**:`useChat` 的 `id` 中途变更是已知未定义行为,P1(常量 + 手动载入)是三个出路中最稳的,且与本项目"切换走服务端拉历史"的现状一致,零功能损失。
- **砍 content/toolCalls**:CodeGraph 实证无活读取者,保留只增加写放大与心智负担。`parts` 单列还原是更诚实的设计。
- **加 seq**:`createdAt` 排序的同毫秒/漂移/滑窗边界问题在批量落库或未来原子轮次时会真实爆发;seq 把顺序变成显式数据,与写入时机解耦,代价(应用层 max+1)在本项目并发模型下可接受。
- **不碰孤儿消息**:可靠性改造与状态归属/表重审是正交问题,本期聚焦后者,不扩大战线。原子轮次留 Future Work。

## 备选方案 (Alternatives Considered)

- **会话状态前端内存拥有(现状)**:刷新即丢、多标签隔离、并发竞态,否。
- **会话状态服务端拥有(记"上次活跃会话")**:多端一致但引入服务端状态语义与额外端点,过度设计,否。
- **useChat id 跟 URL,流式中冻结 replace(P2)**:流式中 URL 仍是 `/chat/new`,刷新丢流(可接受),但需把 `x-conversation-id` 存 ref 延后用,控制流更复杂,P1 更简。
- **seq 改 turn 级(每轮一序号)**:与"本期不做原子轮次"决策耦合,且消息级 seq 已能满足排序与滑窗需求,turn 级留待 Future Work。
- **role 改 Prisma enum**:真 enum 在 PostgreSQL 需 `ALTER TYPE`,本期不引入此迁移复杂度,保持 string + 注释修正。
- **保留 content 作全文检索冗余**:当前无全文检索需求,真有需求时再加,不为假想需求保留。

## 后果 (Consequences)

- 正面:刷新/分享 URL 可恢复当前会话;并发竞态根治;侧栏排序准确;Message 表减两列加一列,更诚实;滑窗顺序确定。
- 负面:一次 Prisma 迁移(含旧行 content/toolCalls → parts 折算 + 回填 seq);前端路由结构与状态读取重构;`useChat` 失去 per-conversation 内存缓存(无功能损失)。
- Future Work:
  - **原子轮次**:user + assistant 作为一组落库,消除孤儿消息。引入 turn 概念后,seq 可升格为 turn 级。本期仅预留(seq 已是消息级,可平滑演进)。
  - **会话摘要(Phase 3,ADR-0010 既定)**:超出滑窗的历史压缩。

## 相关 ADR

- [ADR-0010](./0010-persistent-conversations.md)(被本 ADR 取代 UI 状态归属假设与 Message schema)
- [ADR-0009](./0009-ai-tool-calling-agent.md)(tool-loop 与持久化的上层消费者)

## 实施勘误(2026-08-05)

决策 2「useChat 常量 id」原计划用 `useRef` 在 `prepareSendMessagesRequest` 回调内实时读路由 id(本文「决策 2」「关键前置发现 5/7」均据此描述)。实施时发现:本项目前端启用 React Compiler,其 `react-hooks/refs` 规则**禁止在 render 期可执行代码(含 `useMemo`/`useCallback` 工厂体)内访问 `ref.current`**,无论是否经函数包裹 Compiler 均会内联判定。ref 方案无法通过 lint。

实际采用:**transport 依赖 `routeId`(state)用 `useMemo` 重建**,`prepareSendMessagesRequest` 直接闭包读 `routeId`。语义安全性论证:URL 方案下 `router.replace('/chat/:id')` 在首条消息**响应头到达时**触发(`customFetch` 拦截),此时流式请求**已发出在飞**,transport 引用变化不影响进行中的请求,下次 `sendMessage` 才用新 transport——流式不中断,与决策 2 的目标(消除流式中途切 id 的未定义行为)等价。`useChat({ id: 'chat' })` 常量化不变。

决策 1/3/4 与本文描述一致,无偏差。

