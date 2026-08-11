# Phase 4 验收走查清单 —— 认证双轨改造

- **依据**:[ADR-0013](../adr/0013-auth-refresh-token-rotation.md)
- **验收方式**:手动场景走查 + DevTools 网络/应用面板，每条场景须可复现、通过条件明确
- **前置**:Phase 4 实施清单 W0–W2 完成；本地库已跑迁移

## 验收原则(已确认的边界)

| 决策点 | 结论 |
|--------|------|
| access 寿命 | 15 分钟，过期后用户**无感**(refresh 自动续) |
| refresh 泄露信号 | 已轮换的 refresh 再次被提交 → 整族吊销 |
| Web 存储 | access 在 localStorage(短命),refresh 在 httpOnly cookie |
| 登出 | 必须同时作废服务端 refresh 行，不只清本地 |
| 存量用户 | 部署后旧 7 天 token 过期即强制重新登录一次，可接受 |

## 验证状态（2026-08-11，全部通过）

- ✅ **已验（API 冒烟）**：A1 / A2 响应形状与 cookie、A3 登出幂等、A4 登出后 refresh 失效、C1 / C2 / C5、轮换成功后旧 refresh 立即失效。其中 C2 已确认 **DB 该用户 RefreshToken 行清 0**（整族吊销）。
- ✅ **已验（单测）**：C4 过期拒绝（`refresh-token.spec.ts`）、轮换/复用检测/吊销纯逻辑（94 个后端测试全过）。
- ✅ **已验（浏览器手动走查）**：B 节全部（无感续期、真实 15 分钟过期、流式 chat 中过期、刷新浏览器静默换新）、D 节全部（双 tab 单飞、并发重放、inflight 复用）、E 节回归（登录页跳转、AuthGuard 重定向、chat 401 提示、五页 + 完整对话冒烟）。

## A. 登录 / 注册 / 登出

| # | 场景 | 通过条件 |
|---|------|---------|
| A1 | 邮箱密码登录 | 返回 `{accessToken, user}`(无 `token` 字段、user 无 `role`);DevTools → Application → Cookies 出现 `shiguang_rt`(HttpOnly);响应 body 同时带 `refreshToken`(供原生端) |
| A2 | 注册 | 同 A1,且直接以新身份进入 |
| A3 | 登出 | 服务端该 refresh 行被删(DB 可查);cookie 清除；本地 token/user 清除；回到 `/login` |
| A4 | 登出后用原 refresh 调 `/auth/refresh` | 401,拿不到新 access |

## B. 无感续期(核心场景)

| # | 场景 | 通过条件 |
|---|------|---------|
| B1 | access 过期后发起任意请求 | DevTools 里先见 401 → 紧跟一次 `/auth/refresh` → 原请求自动重放成功；**用户全程无感**，页面无报错、不跳登录 |
| B2 | 等 15 分钟真实过期(或后端临时改 30s) | 同 B1，无感续期 |
| B3 | 流式 chat 中 access 过期 | 下一条消息发送时自动 refresh 重发；**正在流的响应不中断** |
| B4 | 刷新浏览器(access 还在 cookie 之外) | localStorage access 若仍有效直接用；启动时后台静默 refresh 换新(网络面板可见),UI 不闪登出 |

## C. 安全语义(红线)

| # | 场景 | 通过条件 |
|---|------|---------|
| C1 | 拿 refresh token 当 access 用(贴进 `Authorization: Bearer`) | 401(opaque 非 JWT,guard 验签不过) |
| C2 | refresh 一次后，**再用同一个旧 refresh** 调 `/auth/refresh` | 第一次成功(轮换),第二次 401 **且该用户全部 refresh 行被清**(DB 验证)——复用检测触发整族吊销 |
| C3 | 复用检测触发后 | 该用户所有设备/标签页下次 refresh 均 401,被迫重新登录 |
| C4 | 过期 refresh(改库 `expiresAt` 到过去)调 `/auth/refresh` | 401 |
| C5 | 伪造/篡改 refresh 字符串 | 401,不泄露任何用户存在性信息 |

## D. 竞态与多端

| # | 场景 | 通过条件 |
|---|------|---------|
| D1 | 同一浏览器开两个 tab,同时操作触发 refresh | 单飞生效：网络面板只见**一次** `/auth/refresh`，两 tab 都拿到新 access，互不踢下线 |
| D2 | 快速连发多个请求(首页多 SWR 并发)且 access 已过期 | 只起一次 refresh，全部请求重放成功 |
| D3 | refresh 进行中再发新请求 | 新请求等待同一 inflight Promise，不发起第二次 refresh |

## E. 回归(改动面波及)

| # | 场景 | 通过条件 |
|---|------|---------|
| E1 | 登录页已登录自动跳转 | 行为不变(启动 refresh 成功后按 redirect 跳) |
| E2 | 未登录访问受保护页 | AuthGuard 重定向 `/login?redirect=...` 不变 |
| E3 | chat 页 token 相关报错文案 | 原 `error.message.includes('401')` 提示路径在 refresh 也失败后仍正确引导重新登录 |
| E4 | 全功能冒烟 | 发现/食材/对话/收藏/我的 五页 + 一次完整对话(含工具调用)在改造后全部正常 |
