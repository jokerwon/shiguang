# ADR-0013: 认证双轨改造 —— 长效 refresh token + 滑动轮换，面向原生 app

- **状态**:已接受
- **日期**:2026-08-10
- **决策者**:Kai(经 grill 会话确认)
- **驱动**:原生 app 前置（审查发现这是出 app 的唯一架构级认证阻塞点）

## 背景 (Context)

当前认证（ADR 前史，无独立 ADR）：邮箱+密码 → `POST /auth/login|register` 返回单个 JWT（payload `{sub, email}`，7 天硬编码于 [auth.module.ts](../../apps/server/src/auth/auth.module.ts)），前端存 `localStorage`（`shiguang:token`），所有请求手贴 `Authorization: Bearer`。**无 refresh、无吊销、无设备概念**——7 天后用户被静默踢出。

这个形态在 Web 上是小瑕疵（重新登录一次的事），在原生 app 上是**卸载级体验事故**：移动端用户对「打开 app 发现要重新登录」的容忍度远低于 Web，且系统要求会话持久（Keychain 里躺着的凭据 7 天就死，等于没存）。同时 `User.role` 字段全链路透传但服务端零处消费（grep 验证），属于随本次重构一并处理的死重。

**grill 过程中的关键代码实证**:

- 401 全局处理**已存在**：`request()` 抛带 `status` 的 `ApiError`（[api.ts](../../apps/web/lib/api.ts)），SWR fetcher 复用它，缺的是一个统一捕获 401 → 先 refresh 再 logout 的钩子，不是机制缺口。
- `JwtAuthGuard` 手写验签（[jwt-auth.guard.ts](../../apps/server/src/auth/jwt-auth.guard.ts)），验的就是 `JwtModule` 签发的 token——把 payload 加 `type: 'access'` 判别只改这一处。
- 迁移目录里已有一个**空目录** `20260810094902_add_refresh_token/`（`prisma migrate dev` 生成了目录但未写 schema 即中断），本期直接在其上续写，不产生第二个迁移。
- chat 流式请求走 `DefaultChatTransport` + `headers()` 回调（[chat page](../../apps/web/app/(screen)/chat/[[...slug]]/page.tsx)），token 在每次请求时实时读取——只要 401 重试逻辑换到 transport 的 `customFetch` 层，流式路径天然兼容，无需为 SSE 开口子。

## 决策 (Decision)

### 1. 双 token 模型：短 access + 长效 refresh

- **access token**:JWT，payload `{sub, email, type: 'access'}`，有效期 **15 分钟**。裸 Bearer 不变（原生 app 无 XSS 面，Web 维持现状不再加 CSRF 面）。
- **refresh token**: opaque 随机串（非 JWT），**30 天滑动过期**（每次 refresh 换发新的并重置 30 天），DB 只存 **bcrypt 哈希**（复用 auth 模块现成依赖，不透明串落库可比对但不泄露可用凭据）。
- `JwtAuthGuard` 验签时断言 `type === 'access'`，refresh token 不能当 access 用（防混淆）。

### 2. 一次一换（rotation）+ 复用检测

- `POST /auth/refresh` 收旧 refresh token → 验哈希 + 过期 → **作废旧行、签发新对**（access + refresh）。
- **复用检测**: 一个已作废的 refresh token 再次被提交 = 凭据可能泄露 → **吊销该用户全部 refresh token**（token family 整族吊销，最严但实现最简：按 userId 删全表行）。对合法用户的误伤场景是多端同时 refresh 竞态，由前端单飞（决策 4）压到接近零。
- refresh 响应**带新 user 对象**（与 login 同构），前端一次刷新同时校正本地用户快照。

### 3. 存储：Web 双轨，原生按需

- **refresh token 存 httpOnly cookie**(`Set-Cookie: shiguang_rt=...; HttpOnly; SameSite=Lax; Path=/auth`,Secure 由部署环境决），XSS 摸不到它——这是把「长期凭据」从 localStorage 挪走的核心理由。
- **access token 维持 localStorage 现状**（15 分钟短命，泄露窗口有界；Web 请求仍手贴 Bearer，不引入 cookie 请求的 CSRF 问题）。是否进一步迁内存属后续打磨，不在本期。
- **原生 app** 不读 cookie:refresh 端点**同时在 JSON body 返回 refresh token**,app 存 Keychain/Keystore，刷新时从 body 提交。cookie/body 双轨由客户端形态自选，服务端两种来源都认（body 优先）。

### 4. 前端 401 → refresh 单飞重试

- `lib/api.ts` 的 `request()` 遇 401：先查**进行中 refresh 的共享 Promise**（单飞，防并发刷新互相作废），无则发起 refresh;refresh 成功 → 换新 access 重放原请求；refresh 失败（401/网络错）→ logout。
- 流式 chat 路径在 transport 的 `customFetch` 层套同一单飞逻辑（响应头读到 401 时同样走）。
- **已经在飞的流式响应**不因 token 过期中断（流是已建立的连接）；只有新发请求会撞 401。

### 5. 登录/注册/登出端点调整

- `POST /auth/login|register` 响应从 `{token, user}` 改 `{accessToken, user}` + 种 refresh cookie + body 带 refresh token。
- 新增 `POST /auth/refresh`（无 guard，凭 refresh token 本身认证）。
- 新增 `POST /auth/logout`：作废当前 refresh token 行（按 cookie/body 里的 token 定位），清 cookie。前端 logout 从「纯本地清」改为「先调后端再本地清」。
- `JwtModule` 的 `signOptions.expiresIn` 从 `7d` 改 `15m`（refresh 不挂 JwtModule，纯 opaque）。

### 6. Schema:`RefreshToken` 表 + 删 `User.role`

```prisma
model RefreshToken {
  id        String   @id @default(cuid())
  userId    String
  tokenHash String   @unique  // bcrypt(opaque token)，不存明文
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

- 不记 device/UA 字段：当前无「登录设备管理」产品面，滚动行数低（30 天滑动 + 一次一换，单行复用），需要时再补。
- **`User.role` 随本次迁移删除**（连同 auth 响应里的 `role` 字段）：零消费方，留着只会让未来的权限设计被这个无主字段绑架。这是表结构破坏性变更，在同一迁移单元内完成。

### 7. 失败与竞态语义

- refresh 请求本身 401（token 无效/已轮换/已过期）→ 前端 logout，提示重新登录。
- 复用检测触发整族吊销 → 该用户所有设备被迫重新登录（安全事件的代价，可接受）。
- 并发 refresh（同用户多端/多 tab 同刻）→ 后到者拿已作废 token → 触发整族吊销。**风险由前端单飞 + 原生端 app 内串行化压制**；真发生时表现是「被要求重新登录一次」，不丢数据。

## 理由 (Rationale)

- **15 分钟 access**:Bearer token 一旦泄露即万能，缩短寿命是唯一不引入 revocation 列表的收口手段；refresh 无感续期使用户无感。
- **opaque refresh + bcrypt 哈希落库**:refresh 是长效凭据，DB 泄露不得等价于凭据泄露；bcrypt 已在依赖里，不为它引新 hashing 库。opaque 而非 JWT：refresh 不需要自包含声明，可吊销性必须由 DB 保证，JWT 的「无状态验签」在这里是反模式。
- **rotation + 整族吊销**:OAuth 2.0 Security BCP 的标准做法；一次一换让「同一个 refresh 被两处方使用」成为泄露信号。整族吊销对单用户产品误伤面小、实现最简（无需 parent-child 链）。
- **Web cookie + 原生 body 双轨**:cookie 解决 Web 端 XSS 摸长期凭据的问题；原生没有 cookie jar 语义、Keychain 才是正确容器。一个端点两种取法，比开两个端点或让 Web 也手管 refresh 都简单。
- **删 role 而非留作占位**:零消费方的字段是负资产——未来的权限设计（管理端/审核）应当基于彼时真实需求建模，而不是被一个从没被验证过的 `USER/ADMIN` 枚举预支。
- **不做设备管理、不做 IP 绑定**:单用户量级下安全收益不抵复杂度；真实泄露面由 rotation + 整族吊销兜住。

## 备选方案 (Alternatives Considered)

- **双 token 都 localStorage**:实现零改动，但长期凭据暴露在 XSS 面下，且原生端照样要另做存储——两头不讨好，否。
- **Web 也全 cookie(access + refresh)**:能蹭浏览器自动带 cookie，但所有 API 请求都要加 CSRF 防护（SameSite 不够，跨站表单仍可触发 GET 外的请求），为了一个「少贴 header」引入一整面防护，否。
- **refresh 也签 JWT**:少一张表，但「无状态」= 不可单点吊销，只能等过期——与「改密/登出即失效」的基本预期冲突，否。
- **不轮换、refresh 用到 30 天**:实现最简，但无泄露检测手段，且 refresh 端点一次泄露即 30 天裸奔，否。
- **接 NextAuth/Auth.js 或 Supabase Auth**:重托管方案，换掉整个 auth 自研层。当前 auth 只有邮箱密码一条路，自建双 token 成本远低于迁托管 + 数据迁移；未来上 Apple/Google 登录时再评估托管不迟（届时本 ADR 的 refresh 表可平滑映射过去），否。

## 后果 (Consequences)

- **正面**:
  - 原生 app 认证阻塞点清除——Keychain 存 refresh 即可实现「永久登录直到主动退出」。
  - Web 端长期凭据移出 localStorage,XSS 能摸到的只剩 15 分钟短 token。
  - 获得吊销能力（登出/复用检测/未来改密），此前完全没有。
  - 顺带清掉 `role` 死重，schema 与代码同净。
- **负面**:
  - auth 从「一签一验」变成「签/验/轮换/吊销/复用检测」五态，是本项目目前状态最多的模块；单测必须覆盖轮换与复用检测。
  - 前端 `request()` 与 chat transport 都要进 401 重试逻辑，且单飞 Promise 是隐式共享态，需注释明确。
  - 线上存量用户（若有）在部署后 access 过期即被强制走一次 refresh;没有 refresh 的直接重新登录——一次性冲击，产品面可接受。
- **影响面**:`auth` 模块全部文件、`schema.prisma`(RefreshToken 新表 + User 删 role)、`lib/api.ts`、`lib/use-auth.tsx`、`lib/auth.ts`、chat transport fetch、登录/注册页返回值消费方。
- **Future Work**:Apple/Google 登录（届时评估托管方案，refresh 表可映射）;access token 迁内存 + Web 全 cookie(若 XSS 防线升级);登录设备管理（RefreshToken 补 device 字段）。

## 相关 ADR

- [ADR-0004](./0004-server-side-user-data.md)（用户数据服务端化的前序决策，本次是其认证侧的补完）
- [ADR-0010](./0010-persistent-conversations.md) / [0011](./0011-conversation-state-ownership-and-message-schema.md)（会话数据的跨设备连续性，是「app 不能登出即丢」的产品前提）
