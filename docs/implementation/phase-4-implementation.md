# Phase 4 实现任务清单 —— 认证双轨改造（refresh token 滑动轮换）

> 对应 [ADR-0013](../adr/0013-auth-refresh-token-rotation.md)。
> **目标**:把「单 JWT 7 天」换成「短 access + 长效 refresh 滑动轮换」，清掉原生 app 的认证阻塞点；顺带删 `User.role` 死重。
> **不在本期**:Apple/Google 登录；access token 迁内存；登录设备管理；Web 全 cookie。
> **完成判定**:[验收清单](../acceptance/phase-4-checklist.md) 全过。

## ⚠️ 关键前置发现

**1. 401 全局处理已存在，缺的是「先 refresh 再 logout」的钩子，不是机制。** `request()` 抛带 `status` 的 `ApiError`（[api.ts](../../apps/web/lib/api.ts)）,SWR fetcher 复用。当前代码里**没有**统一 401 拦截——401 是各消费方自行处理的（chat 页捕 `error.message.includes('401')`）。本期要把 401 处理收敛进 `request()` 内部：拦截 → 单飞 refresh → 重放，消费方无感。

**2. `JwtAuthGuard` 验签点唯一，`type` 判别只改一处。** [jwt-auth.guard.ts](../../apps/server/src/auth/jwt-auth.guard.ts) 手写 `verifyAsync`,payload 形状 `{sub, email}` 在此断言。加 `type: 'access'` 后，guard 里加一行 `payload.type !== 'access'` 即拒，refresh token（opaque，根本不是 JWT）在 guard 这一层天然过不去——「防混淆」不靠运行时检查，靠 refresh 不走 JWT 通道的结构事实。

**3. chat 流式路径的 401 要在 transport 的 fetch 层处理，不是 `request()`。** chat 页用 `DefaultChatTransport` + `customFetch`（[page.tsx](../../apps/web/app/(screen)/chat/[[...slug]]/page.tsx)），绕开了 `lib/api.ts`。401 单飞重试逻辑要抽成 `lib/` 下的独立函数（如 `refreshOnce()`),`request()` 和 `customFetch` 两处复用，**单飞 Promise 是模块级共享态，两处必须共享同一份**，否则 chat 请求和普通请求会各自起 refresh 互相作废。

**4. 迁移目录已有空的 `20260810094902_add_refresh_token/`。** 是 `prisma migrate dev` 生成了目录但没写 schema 就中断的残留。本期**直接续用这个目录**(`prisma migrate dev` 会在同一目录生成 sql)，不留第二个迁移。删 `User.role` 与建 `RefreshToken` 表在**同一迁移**内完成。

**5. login/register 响应形状变更会打穿前端三处消费方。** `{token, user}` → `{accessToken, user}`:`lib/auth.ts`（`loginApi`/`registerApi` 的 `AuthResponse`)、`lib/use-auth.tsx`(`persist(data.token, ...)`)、登录页。三处一处都不能漏，且 `use-auth.tsx` 的 `persist` 签名跟着改。grep `data.token` / `\.token,` 兜底。

**6. cookie 需要后端能读——`@Res` 手写 Set-Cookie，不引 cookie-parser。** refresh/logout 端点要种/清 cookie,login/register 也要种。Nest 直接用 `@Res({passthrough: true})` 拿 response 对象 `setHeader('Set-Cookie', ...)` 即可，不值得为两个端点引 `cookie-parser` 中间件；读 cookie 时手写 `req.headers.cookie` 解析（就一个 key)。**注意**:`chat.controller.ts` 现有 `@Res({passthrough: false})` 的先例，别照搬错 passthrough 模式。

**7. 滑动过期的「重置 30 天」在轮换时天然完成。** 一次一换 = 作废旧行插新行，新行 `expiresAt = now + 30d` 即滑动。不需要独立「续期」逻辑，别多写一个分支。

**8. `use-auth.tsx` 的启动恢复逻辑要变。** 现在启动时从 localStorage 读 token + user 直接恢复会话。改后 access 15 分钟短命，**启动时 localStorage 里的 access 很可能已过期**——启动流程改为：读 localStorage 恢复 user 快照（UI 不闪登出）→ 后台静默 `refreshOnce()` 换新 access；refresh 失败才真 logout。这决定首屏是否需要骨架态，前端实现时与 AuthGuard 的 loading 语义对齐。

---

## W0 · Schema + 迁移（一切的地基）

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 0.1 | `RefreshToken` 表 + 删 `User.role` | `apps/server/prisma/schema.prisma` | 新表字段照 ADR-0013 决策 6;`User` 删 `role` 行 + `Role` enum 整体删除；`User` 加 `refreshTokens RefreshToken[]` 关系 |
| 0.2 | 迁移 | `apps/server/prisma/migrations/20260810094902_add_refresh_token/` | 续用现有空目录，`prisma migrate dev` 生成 sql + `db:generate`。**破坏性**:drop `role` 列——确认线上无依赖后执行 |
| 0.3 | 删 role 的所有代码引用 | `apps/server/src/auth/auth.service.ts`、`apps/web/lib/auth.ts`(`AuthUser.role`) | grep `\.role\b` / `Role\.` 兜底；`AuthUser` 接口同步删 |

**验收**:`prisma migrate dev` 干净通过；`generated/prisma/client` 里 `User` 无 `role`、有 `RefreshToken` 模型。

**⚠️ 迁移已验证（2026-08-11）**:`prisma migrate dev` 报 **Already in sync**（零漂移）。过程中发现前置发现 4 的空目录实为**已应用但 SQL 未落盘**的 phantom 迁移（账本记为 `20260810094902_add_refresh_token` 已应用、校验和对应已丢失的旧草稿 SQL，DB 里实际带 `familyId/revokedAt/replacedByTokenId` 三列 + `Message.parts NOT NULL` 的旧草稿 schema）。收口过程：`resolve --rolled-back` 只认失败态迁移（P3012）无法使用；最终经确认后删除该账本行，以**幂等 sync SQL**（`CREATE TABLE IF NOT EXISTS` + `DROP COLUMN IF EXISTS` + 条件加索引/FK + `parts SET NOT NULL` + `DROP TYPE IF EXISTS "Role"`）由 `migrate deploy` 正规应用并记录正确校验和。该幂等 SQL 同时兼容「干净历史回放」（shadow）与「旧草稿表收口」两条路径。附带的 `Message.parts NOT NULL` 是 pre-existing 存量缺口（历史迁移只 ADD COLUMN + 回填、从未 SET NOT NULL），随本迁移一并补齐。

---

## W1 · 后端 auth 改造

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 1.1 | refresh token 纯逻辑 | `apps/server/src/auth/refresh-token.ts`（新增） | 纯函数 + 显式依赖（对齐 `summary.ts`/tools 的单测友好风格）:`issueRefreshToken(prisma, userId)` → 插行返回明文 token;`rotateRefreshToken(prisma, oldToken)` → 验哈希+过期 → 作废旧行+发新行；**复用检测**:旧 token 哈希命中但行已不存在 → 删该 userId 全部行 + 抛 `ReuseDetectedError`。bcrypt compare/hash 复用 |
| 1.2 | JwtModule 配置 | `apps/server/src/auth/auth.module.ts` | `expiresIn: '7d'` → `'15m'`;`JwtPayload` 加 `type: 'access'` |
| 1.3 | guard 断言 type | `apps/server/src/auth/jwt-auth.guard.ts` | 验签后断言 `type === 'access'`；同时 payload 接口同步 |
| 1.4 | `POST /auth/refresh` | `apps/server/src/auth/auth.controller.ts` | 无 guard;token 从 body.refreshToken ?? cookie 读（body 优先，ADR 决策 3)；成功 → 种新 cookie + body 返回 `{accessToken, refreshToken, user}`；失败 401。`@Res({passthrough: true})` 种 cookie |
| 1.5 | `POST /auth/logout` | 同上 | 按 refresh token 定位删除该行 + 清 cookie；无 guard（拿得到 refresh 就能登出自己）;**幂等**(token 不存在也返回 ok) |
| 1.6 | login/register 改造 | `apps/server/src/auth/auth.service.ts`、`auth.controller.ts` | 返回 `{accessToken, user}` + 种 refresh cookie + body 带 refreshToken；删 `token` 字段、`user` 里删 `role` |
| 1.7 | 单测 | `apps/server/src/auth/refresh-token.spec.ts`（新增） | 纯函数零 DB(mock prisma):issue/rotate 正常路径、过期拒绝、**复用检测触发整族吊销**、旋转后旧 token 作废 |

**验收**:login → 拿到短 access + cookie 里有 refresh；带 refresh 调 `/auth/refresh` → 新对返回、旧 refresh 立即失效；**同一个旧 refresh 再调一次 → 该用户全部 refresh 被清**（复用检测）;guard 拒绝拿 refresh 当 access 用。

**✅ API 冒烟已验证（2026-08-11）**:register 201 → body `{accessToken, refreshToken, user}`（无 `token`、user 无 `role`）+ `Set-Cookie: shiguang_rt`（HttpOnly/SameSite=Lax/Path=/auth/Max-Age=30d）；C1（refresh 当 Bearer）401；C5（伪造）401；access 调 `/recipes/personalized` 200；`/auth/refresh` 轮换 200 新对；C2（复用旧 refresh）401 且 **DB 该用户 RefreshToken 行数清 0**（整族吊销）；A3 登出幂等、A4 登出后旧 refresh 401。

---

## W2 · 前端 401 单飞 refresh + 启动恢复

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 2.1 | 单飞 refresh 模块 | `apps/web/lib/auth.ts` 或新 `lib/refresh.ts` | 模块级 `let inflight: Promise<void> \| null`;`refreshOnce()`:inflight 存在则直接返回它，否则发起 `/auth/refresh`(**带 credentials**),成功写新 access 进 localStorage，失败 logout 并 rethrow。**chat 与 api 共用这一份** |
| 2.2 | `request()` 401 拦截 | `apps/web/lib/api.ts` | 401 → `await refreshOnce()` → 重放原请求（一次，不递归）;refresh 抛错 → 向上抛原 401（此时已 logout) |
| 2.3 | chat transport 401 | `apps/web/app/(screen)/chat/[[...slug]]/page.tsx` | `customFetch` 内：响应 401 → `refreshOnce()` → 重发。**注意流式响应已建立的不动，只管新请求** |
| 2.4 | login/register 消费方 | `apps/web/lib/auth.ts`、`use-auth.tsx`、`app/login/page.tsx` | `AuthResponse` 改 `{accessToken, user}`;`persist` 签名同步；登录页如直接引用 `data.token` 一并改 |
| 2.5 | 启动静默 refresh | `apps/web/lib/use-auth.tsx` | 启动：恢复 user 快照 → 后台 `refreshOnce()`；成功换 access，失败 logout。与 AuthGuard loading 对齐（前置发现 8) |
| 2.6 | logout 调后端 | `apps/web/lib/use-auth.tsx` | 先 `POST /auth/logout`（带 refresh)→ 再清本地；后端失败也照清本地（登出不能因网络卡死） |

**验收**:DevTools 把 access 改成过期/乱串 → 任意请求自动 refresh 重放成功（用户无感）;refresh 也被毁 → 跳登录页；两个 tab 同刻操作不互相把对方踢下线（单飞生效）。

**✅ 前端 lint/tsc**：本次改动 6 文件零新增错误（剩余错误为 pre-existing ai-elements / 页面的 React 19 规则，Phase 3.5 已声明延后）。**✅ 浏览器手动走查**（2026-08-11）：B/D/E 节全过（无感续期、双 tab 单飞、并发重放、启动静默 refresh、五页 + 完整对话冒烟），见验收清单验证状态。

---

## W3 · 收尾

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 3.1 | 全量走查 | [验收清单](../acceptance/phase-4-checklist.md) | 逐条过；**回归 D3**(token 过期场景语义已变：现在是无感 refresh 而非提示重登） |
| 3.2 | 常驻层文档审计 | 根/子 `AGENTS.md`、`docs/glossary.md` | 认证章节改写（双 token、端点、cookie/body 双轨）;`schema.prisma` 字段引用（RefreshToken、User 删 role);web `AGENTS.md` 认证机制节（localStorage 措辞、启动恢复） |
| 3.3 | 索引同步 | `docs/README.md`、`docs/adr/README.md` | Phase 4 行 + ADR-0013 登记；检查无断链 |
| 3.4 | `.env.example` 核对 | `apps/server/.env.example` | 确认无需新 env(JWT_SECRET 复用）；若引入 access 有效期 env 则补 |
