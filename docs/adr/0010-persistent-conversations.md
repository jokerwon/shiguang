# ADR-0010: 持久化多会话 —— Conversation/Message 表、最小会话列表、滑窗+摘要

- **状态**:已接受
- **日期**:2026-08-04
- **决策者**:Kai(经 grill 会话确认)

## 背景 (Context)

当前 AI 对话是无状态单次流式请求:刷新即清空,换设备即丢失,AI 无法引用用户之前说过的任何话。ADR-0008 的「动嘴不动手」场景要求对话有连续性——「上次说的那个牛腩菜谱」必须能接上。

## 决策 (Decision)

**对话持久化到服务端,多会话制。**

### 数据模型(新增两表)

```prisma
model Conversation {
  id        String    @id @default(cuid())
  userId    String
  title     String    // 首条用户消息截断生成,或 AI 概括
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages  Message[]

  @@index([userId, updatedAt])
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  role           String       // user | assistant | tool
  content        String       // 文本内容
  toolCalls      Json?        // 工具调用与结果(含操作卡片/确认卡片渲染所需数据)
  createdAt      DateTime     @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
}
```

### 会话 UI:最小会话列表

- 对话页提供**当前会话 + 历史会话列表**(可切换、可删除);桌面侧边栏、移动端抽屉。
- **不做**:重命名、置顶、搜索、分享。后续有真实需求再加。

### 上下文注入:滑窗 + 摘要

- **Phase 2**:简单滑窗——每轮请求携带最近 N 条消息原文(默认 N=20,实现时按 token 实测调整)。
- **Phase 3**:滑窗 + 会话摘要——超出滑窗的历史由 AI 异步压缩为摘要,随 system prompt 注入;超长会话上下文不丢失、成本有界。
- 历史消息的首要职责是**上下文连续性**;「从对话抽取事实进偏好画像」不做为独立机制——偏好变更统一走 ADR-0009 的确认卡片路径(用户可见、可控)。

## 理由 (Rationale)

- 持久化多会话是「记忆」卖点的前提,也是工具链价值的放大器(AI 改过的 pantry、推过的菜谱都在历史里可追溯)。
- 最小会话列表:会话管理 UI 是工作量大头,先做「能用」(切换/删除),重命名等细节等真实需求。
- 滑窗+摘要而非全量注入:当前 system prompt 已有偏好+pantry 注入,基数不小;全量历史成本随会话长度线性涨,长会话必爆。摘要把成本压成常数。
- 不做「对话原文全量进上下文 + 画像抽取双轨制」:画像变更走确认卡片,一条路径,语义清晰。

## 备选方案 (Alternatives Considered)

- **单会话多轮(内存态)**:零新表,但刷新即丢,「记忆」名存实亡,否。
- **抽取事实存画像,不存对话原文**:存储最小、隐私最好,但实现微妙(抽取质量、事实冲突、用户不可见),且与「偏好变更必须用户确认」的红线冲突,否。
- **全量历史注入**:实现最简单,token 成本不可持续,否。

## 后果 (Consequences)

- 正面:对话可续、可回溯;为摘要、画像演进留出数据结构;`toolCalls` 落库使操作卡片/确认卡片在刷新后仍可渲染(**卡片只读**——撤销边界为刷新前,见 [验收清单](../acceptance/phase-2-3-checklist.md))。
- 负面:新增存储与两个模型的 CRUD/列表 API;摘要机制(Phase 3)引入异步任务;会话删除需级联清理。
- 影响:`/chat` 端点需接受 `conversationId`、落库消息、返回会话句柄;前端对话页增加会话列表与历史加载。

**相关 ADR**:[0008](0008-theme-ai-capability-leap.md) [0009](0009-ai-tool-calling-agent.md)
