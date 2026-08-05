# Phase 2.1 实施清单 —— 会话状态归属(URL)与 Message 表重审

> **依据 ADR**: [ADR-0011](../adr/0011-conversation-state-ownership-and-message-schema.md)(已接受)
> **状态**: 已交付
> **前置 Phase**: Phase 2(已交付)

## 目标

落实 ADR-0011 的四项决策:
1. 会话状态归属由前端 `useState` 改为 URL 拥有(`/chat/new`、`/chat/:id`)。
2. `useChat` 的 `id` 常量化(P1 方案),消除流式中途切 id 的未定义行为。
3. Message 表:砍 `content`、砍 `toolCalls`、加 `seq`、滑窗改按 seq。
4. 前端一致性补丁:流后刷新 `/conversations`、删除错误处理。

## 关键前置发现(来自真实代码探索)

1. **`Message.content` 是 `NOT NULL`**(见迁移 `20260805065744_add_conversation_message/migration.sql`)。删列前必须先迁移数据,且折算后 `parts` 列要有值——否则删 `content` 后旧数据(仅含 `content`、无 `parts`)会丢失文本。迁移顺序:先回填 `parts`(把仅 `content` 的旧行折算成 `[{type:'text',text:content}]` + 合并 `toolCalls`)→ 加 `seq` → 删 `content`、`toolCalls`。
2. **`parts` 列是后加的**(`20260805091113_add_message_parts_column`)。早于该迁移写入的数据行可能 `parts IS NULL`、只有 `content` + `toolCalls`。折算逻辑必须覆盖这类旧行,不能假设 `parts` 总有值。
3. **`seq` 回填**需按 `createdAt ASC, id ASC` 确定性地为每个会话内的消息编号 1..N。不能仅靠 `createdAt`(同毫秒并列时顺序未定义),用 `createdAt, id` 复合排序保证幂等。PostgreSQL 用窗口函数:`ROW_NUMBER() OVER (PARTITION BY conversationId ORDER BY createdAt, id)`。
4. **前端 chat 路由是单文件** `app/(screen)/chat/page.tsx`。要支持 `/chat` 与 `/chat/:id`,改用 catch-all `app/(screen)/chat/[[...slug]]/page.tsx`(`[[...slug]]` 可选 catch-all,匹配 `/chat`、`/chat/new`、`/chat/:id`)。导航入口 `app-nav.tsx` 的 `/chat` 无需改(可选 catch-all 命中 `/chat`)。
5. **`prepareSendMessagesRequest` 的 `conversationId` 读取源变更**:现状从 `activeId` state 读(闭包捕获,`useMemo` 依赖 `activeId`)。URL 方案下从路由 param 读。但 `prepareSendMessagesRequest` 在 `DefaultChatTransport` 构造时定义——需确保它读到的 id 是"当前 URL 的 id"而非 transport 构造时的快照。由于 transport 不再依赖 `activeId`(改常量化后 `useChat` 的 transport 可稳定),`conversationId` 应在 `prepareSendMessagesRequest` 回调内**实时**从路由取(如通过 ref 持有最新 params,避免 transport 重建)。
6. **`useChat` 常量 id + 切换载入**:`useChat({ id: 'chat' })` 恒定。切换会话由 `useEffect(params.id)` 触发 `fetchConversationMessages` → `setMessages()`。新建会话(`/chat/new`)时 `setMessages([])` 清空。**注意**:`useChat` 内部会缓存 `'chat'` id 的消息,切换前需主动 `setMessages([])` 或直接覆盖,避免上一会话消息闪现。
7. **`x-conversation-id` 与 `router.replace` 时机**:首条消息发出后,后端建会话、响应头回传 id。前端 `customFetch` 拦截到 id 后 `router.replace('/chat/:id')`。由于 `useChat` 的 `id` 已常量化,URL 变化不会触发 `useChat` 重新初始化,流式不中断。`router.replace` 而非 `push`(不污染历史,后退不会回到 `/chat/new` 空态)。
8. **越权 404 处理**:`fetchConversationMessages` 对不属于自己的会话返回 404(`assertOwned` 抛 `NotFoundException`)。前端需捕获 404 → 提示"会话不存在"→ `router.replace('/chat/new')`。当前 `fetchConversationMessages` 走 `request<T>`,失败抛 `ApiError`(带 `status`),可在 `selectConversation` 的 try/catch 中识别。
9. **`chat-action-card` undo 不依赖 seq**:seq 改造对该组件无影响,无需改动。撤销逻辑只读 tool output 的 `added`/`removed`/`saved` 字段。
10. **`conversation.mapper.ts` 退化分支将失效**:砍 `content`/`toolCalls` 后,mapper 的"兼容旧数据"分支(读 `content`+`toolCalls` 拼装 parts)失去输入源。但迁移已把所有旧行折算进 `parts`,迁移后 `parts` 必有值,退化分支可删。**前提**:迁移必须覆盖所有旧行,不能有遗漏。

## 任务分解

### W0 — Schema 迁移(阻塞性前置)

- [x] **W0.1** 修改 `prisma/schema.prisma` `Message` 模型:加 `seq Int`,加 `@@unique([conversationId, seq])`、`@@index([conversationId, seq])`,删 `content`、`toolCalls`,修正 `role` 注释为"实际两类(user|assistant)"。
- [x] **W0.2** 手写迁移 SQL(不用 `prisma migrate dev` 自动生成,因含数据折算):
  1. 回填 `parts`:`UPDATE "Message" SET "parts" = jsonb_build_array(...) WHERE "parts" IS NULL`(把 `content` → text part,`toolCalls` → tool parts,合并保序)。注意早期数据 `toolCalls` 在 `content` 之后(与 mapper 退化分支一致:text 在前、tool 在后)。
  2. 加 `seq` 列:`ALTER TABLE "Message" ADD COLUMN "seq" INTEGER`。
  3. 回填 `seq`:`UPDATE "Message" SET "seq" = sub.rn FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY "conversationId" ORDER BY "createdAt", "id") AS rn FROM "Message") sub WHERE "Message".id = sub.id`。
  4. 设 `seq NOT NULL`。
  5. 删 `content`、`toolCalls` 列:`ALTER TABLE "Message" DROP COLUMN "content"`, `DROP COLUMN "toolCalls"`。
  6. 建唯一索引、普通索引:`CREATE UNIQUE INDEX "Message_conversationId_seq_key" ON "Message"("conversationId", "seq")`,`CREATE INDEX "Message_conversationId_seq_idx" ON "Message"("conversationId", "seq")`。
  7. 删旧索引 `Message_conversationId_createdAt_idx`。
- [x] **W0.3** `pnpm db:generate` 重新生成 Prisma Client。
- [x] **W0.4** 跑迁移、验证:旧行全部有 `parts` 且 `seq` 连续;抽样检查 tool 消息的 parts 还原正确。
- **验收**:迁移幂等(重跑不报错);无 `parts IS NULL` 行;每个会话 `seq` 从 1 连续;`content`/`toolCalls` 列已不存在。

### W1 — 后端 service/mapper 改造

- [x] **W1.1** `conversation.mapper.ts`:
  - `MessageRow` 接口删 `content`、`toolCalls`,加 `seq`。
  - `toUIMessage`:删"兼容旧数据"退化分支,直接 `parts = msg.parts as AnyPart[]`(迁移后必有值)。
  - `fromUIMessage`:删 `content`、`toolCalls` 产出,只返回 `{ role, parts }`。
  - `partsToText` 保留(title 生成仍用,见 W1.3)。
- [x] **W1.2** `conversation.service.ts`:
  - `appendMessage`:写入时计算 `seq = max(seq)+1`,配 `@@unique` 冲突重试(因 URL 拥有 + 单标签,并发概率极低,简单重试 1-2 次即可)。需新增 `nextSeq(conversationId)` 方法。
  - `recentMessages`:`orderBy createdAt desc` 改 `orderBy seq desc`。
  - `listMessages`:`orderBy createdAt asc` 改 `orderBy seq asc`。
- [x] **W1.3** `chat.service.ts`:
  - `messageText()` 仍从内存 UIMessage 取(title 生成),不受影响。
  - `appendMessage` 调用方不变(service 内部已算 seq)。
- [x] **W1.4** 更新单测 `conversation.mapper.spec.ts`:覆盖新 mapper(纯 parts 还原、fromUIMessage 只产 role+parts)。补 `nextSeq` 的并发/冲突重试测试(若可单测,否则在 service 集成测)。
- **验收**:mapper 单测通过;`recentMessages`/`listMessages` 按 seq 排序;`appendMessage` 写入的 `seq` 连续;越权仍 404。

### W2 — 前端路由与状态归属重构

- [x] **W2.1** 路由改造:`app/(screen)/chat/page.tsx` → `app/(screen)/chat/[[...slug]]/page.tsx`。从 `useParams()` 读 `slug`:`[]` 或 `['new']` → 新会话态;`[id]` → 已有会话。`app-nav.tsx` 的 `/chat` 链接不改(可选 catch-all 命中)。
- [x] **W2.2** `useChat` 常量化:`useChat({ id: 'chat', transport })`。`transport` 不再依赖 `activeId`(去掉 `useMemo` 的 `activeId` 依赖),`prepareSendMessagesRequest` 内通过 ref 实时读当前路由 id(见 W2.3)。
- [x] **W2.3** `conversationId` 实时读取:用 `useRef` 持有最新路由 id,`useEffect` 同步;`prepareSendMessagesRequest` 回调内读 ref.current。新会话态(`[]`/`['new']`)发 `conversationId: undefined`。
- [x] **W2.4** 切换会话载入:`useEffect` 监听路由 id 变化 → 若是已有会话,`fetchConversationMessages` → `setMessages`(注意先清空避免闪烁);若是新会话,`setMessages([])`。保留 `loadingHistory` 状态。
- [x] **W2.5** 新建会话回填:`customFetch` 拦截 `x-conversation-id` → `router.replace('/chat/:id')`(非 push)+ `refreshConversations()`。**不再 `setActiveId`**(URL 是事实源)。
- [x] **W2.6** 越权 404 处理:`selectConversation`(或载入 effect)try/catch 捕获 `ApiError`,`status === 404` → 提示"会话不存在"→ `router.replace('/chat/new')`。
- [x] **W2.7** `ChatSidebar`:
  - `activeId` prop 改从路由派生(父组件传入),或 sidebar 内部 `useParams`。
  - `onSelect` 改为 `router.push('/chat/:id')`(由路由驱动载入,而非直接调 `selectConversation`)。
  - `onNew` 改为 `router.push('/chat/new')`。
  - 删除当前会话后:若删的是当前会话,`router.replace('/chat/new')`。
- [x] **W2.8** 删除 `activeId` useState、`selectConversation`/`newConversation` 中的 state 操作,改为路由驱动。
- **验收**:刷新页面保持当前会话;`/chat/new` 发首条消息后 URL 自动变 `/chat/:id` 且流式不中断;连发两条消息不会分裂会话;访问不属于自己的 `/chat/:id` 提示并跳回;侧栏切换/新建/删除均经路由。

### W3 — 前端一致性补丁

- [x] **W3.1** 流后刷新 effect 补 `globalMutate('/conversations')`(修侧栏排序失真)。
- [x] **W3.2** `useConversations.remove` 加 try/catch:失败时回滚乐观删除(`mutate` 恢复)+ 用户提示(toast 或内联)。成功时保持乐观删除。
- [x] **W3.3** `ChatSidebar` 删除按钮的 `confirm` 后 `remove` 改为 await,失败提示。
- **验收**:流结束后侧栏时间戳更新;删除失败有用户可见反馈且列表不误删。

### W4 — 收尾

- [x] **W4.1** 全量回归:按 [phase-2-3-checklist.md](../acceptance/phase-2-3-checklist.md) A 类(持久化多会话)走查,确认无回归。
- [x] **W4.2** 文档同步:
  - `apps/server/AGENTS.md` 数据模型段(Message 表字段更新)、`apps/web/AGENTS.md` 路由结构段(chat 路由改 `[[...slug]]`)与数据层段。
  - [phase-2-3-checklist.md](../acceptance/phase-2-3-checklist.md) 补充 URL 归属相关验收场景(刷新恢复、越权提示、并发不分裂)。
  - [ADR-0011](../adr/0011-conversation-state-ownership-and-message-schema.md) 状态回写(已接受,无需改;但若实施中发现偏差,记 ADR 勘误)。
- [x] **W4.3** 常驻层审计:确认 `apps/server/AGENTS.md`、`apps/web/AGENTS.md`、`docs/glossary.md` 与代码实际行为一致(Phase 收尾纪律)。

## 明确不做(本期边界)

- **孤儿消息 / 原子轮次**:维持 user 先落、assistant 靠 `onFinish` 的现状。ADR-0011 Future Work。
- **会话摘要(Phase 3)**:不在本期。
- **role 改 Prisma enum**:保持 string + 注释修正。
- **会话重命名/置顶/搜索**:ADR-0010 既定不做。

## 风险

- **迁移数据折算**:W0.2 是最关键一步,旧行 `parts IS NULL` 的折算必须全覆盖。建议迁移前 `SELECT count(*) FROM "Message" WHERE "parts" IS NULL` 确认量级,迁移后再次确认 0 行。本地 dev 数据可 `db:reset` 重来,生产需谨慎(本项目目前无生产)。
- **`prepareSendMessagesRequest` 闭包陷阱**:若不通过 ref 实时读路由 id,transport 构造时的快照会导致 `conversationId` 错误。W2.3 必须用 ref。
- **`useChat` 切换载入闪烁**:常量 id 下,切换会话前若不先清空,上一会话消息会闪现。W2.4 需处理(先 `setMessages([])` 或在 loadingHistory 期间不渲染消息列表)。
