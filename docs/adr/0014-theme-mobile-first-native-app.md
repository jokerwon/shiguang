# ADR-0014: 主题 —— 原生 app 首发，移动主战场

- **状态**:已接受
- **日期**:2026-08-11
- **决策者**:Kai(经 grill 会话确认)

## 背景 (Context)

Phase 4 收齐后，应用具备：菜谱库（人工精选 + AI 生成）、服务端用户数据、个性化推荐、AI tool-calling 对话（含操作卡片/确认卡片、会话摘要）、双 token 认证。其中 **ADR-0013 认证双轨改造明确就是原生 app 的认证前置**——refresh token 走 body + Keychain 的落点已留好。下一阶段主线候选：原生 app、规划闭环、社交与 UGC。经 grill 会话拷问，选定 **原生 app 首发，平台战略定为移动主战场**。

移动主战场的驱动是「厨房/移动场景是主要使用入口」。这一主张不能靠「同功能的原生壳」立住——Web 已能覆盖功能面。移动端必须提供 Web 给不了的东西。grill 拷问的关键结论：**首发由离线可用（只读缓存）与原生体验（Keychain 常驻登录、性能、动效）立住主战场主张**；推送与 AI 对话等重量能力按可验证性后置（见决策）。

## 决策 (Decision)

**下一阶段主题：原生 app 首发。平台战略：移动主战场**——移动端成为主要使用入口，Web 维持现状（辅助入口）。首发验收走 iOS 模拟器手动走查（交付终点 = 模拟器可跑通），不做正式构建/上架链。

### 1. 技术栈与仓库形态

- **Expo / React Native**，新增 `apps/mobile`（与 Web 同为 TS + React，生态对齐，零领域逻辑重写）。
- 新增 **`packages/domain` 共享域层**（ADR-0015），`pnpm-workspace.yaml` 的 glob 扩为 `apps/*` + `packages/*`。
- **iOS 先行**（macOS 开发环境已就绪）；Android 后续由 Expo 低成本覆盖。

### 2. 首发功能子集（核心子集对齐，非全功能）

- 4 个 Tab：**发现**（个性化推荐 + 菜系探索 + 快手）/ **食材**（pantry）/ **收藏**（favorites）/ **我的**（偏好档案 + 登出）。
- **菜谱详情页 + 缺料购物清单快照**（ADR-0007 纯函数）。
- 登录/注册（邮箱 + 密码，沿用 ADR-0013 双 token）。
- **砍掉**：AI 对话（app 二期紧随，首发不预埋）、筛选页（发现页菜系探索兜底）、推送、小组件、生物识别。

### 3. 离线只读缓存（主战场主张的承重能力）

- 范围 = **浏览链**：个性化推荐（personalized）+ 菜谱详情（by id）+ 收藏列表。pantry/偏好/筛选列表不缓存。
- 语义：**每查询键持久化最近成功响应 + stale-while-revalidate**；无网不可写（写路径仍在线，无写队列），回网自动刷新。
- 离线与验收自洽：推送因模拟器验不全真链路而砍掉；**离线在模拟器上用 network toggle 可完整验证**——这正是它留在首发而推送挪走的原因。

### 4. 移动端认证（ADR-0013 的落地）

- refresh token 存 **Keychain**（expo-secure-store）；access token **仅内存**，冷启动静默 refresh 换新（暴露面最小）。
- 401 单飞 refresh 逻辑移植（Web `lib/refresh.ts` 的同款 pattern）。
- 原生无 cookie jar，refresh 全程走 body 双轨（ADR-0013 已铺好）。

### 5. 后端契约与 Web 定位

- **目标零后端改动**：核心子集纯消费现有端点；探索期若发现缺口（如缺料清单字段）再单独评估。
- **Web 维持现状**：本期不动（除 ADR-0015 的 import 迁移去重），不承诺冻结也不承诺新功能。

### 6. 对话二期（app 二期，紧随首发）

- 首发不预埋接口；二期自行铺 streaming/工具链路（移动端需评估 `expo/fetch` 的 WinterCG 流式读取）。
- 二期是推送 + 对话 + 可能的小组件/生物识别的候选，届时需真机验收。

## 理由 (Rationale)

- **移动主战场必须由原生能力立住**：Web 已覆盖功能面，复刻功能不是「主战场」的理由。离线与 Keychain 常驻登录是 Web 给不了的确定性体验，是首发的承重墙。
- **先薄后厚**：首发砍掉对话/推送，把「app 能不能立住」压到最小可验证集上；对话紧随，不牺牲移动端长期身份。
- **零后端改动**：核心子集完全落在既有 API 面内（ADR-0013 已铺好认证），阶段风险集中在移动端自身，不放大到后端。
- **模拟器验收**：首发能力（离线/浏览/认证）在模拟器全部可验；推送需要真机链路，故挪出首发——验收路径与功能范围互相咬合。

## 备选方案 (Alternatives Considered)

- **规划闭环**（一周食谱/购物清单持久化/烹饪记录）：在 Web 上继续加功能的方向，与「移动主战场」并列竞争；但 ADR-0013 已为原生 app 铺好认证，出 app 是当下的自然下一步，规划闭环可在此后任何阶段做。
- **PWA/Web 增强替代原生**：零新增代码，但 Keychain 语义、离线、推送（Web Push 可行但体验与 iOS 支持有限）都无法达到「移动主战场」的要求，否。
- **全功能对齐（首发含 AI 对话）**：范围最大、风险最高，且对话的移动端 streaming 链路未经验证，压在首发会拖垮交付节奏，否。
- **真原生 Swift 或 Flutter**：与 TS 栈零共享，领域逻辑要重写；Expo 与现有 React + TS 生态对齐，可共享类型与纯函数，否。

## 后果 (Consequences)

- **正面**：移动端成为主要入口，主战场主张由离线 + 原生体验立住；对话/推送有清晰二期落点；后端零改动，阶段风险收敛在移动端。
- **负面**：新增 `apps/mobile`（Expo + pnpm monorepo + Metro 配置是已知难点，需 `expo/metro-config` 处理共享包）；离线缓存层要专门设计（浏览链 + SWR 语义持久化，具体数据层选型留实现探索）；共享域层迁移会动 Web 的 import（ADR-0015）。
- **影响面**：新增 `apps/mobile` + `packages/domain`；`pnpm-workspace.yaml`（glob 扩到 packages/*）；Web `lib/recipes.ts` 等收编入共享包（ADR-0015）；根 `package.json`（可能加 mobile dev 脚本）。
- **Future Work**：对话二期（streaming 评估 `expo/fetch`）；推送（需 DeviceToken 表 + APNs provider + 真机验收）；Android 覆盖；小组件/生物识别（届时评估 prebuild）。

## 相关 ADR

- [ADR-0013](./0013-auth-refresh-token-rotation.md)（认证双轨，原生 app 的认证前置，本 ADR 的驱动）
- [ADR-0015](./0015-shared-domain-layer.md)（共享域层 packages/domain + Web 迁移）
- [ADR-0007](./0007-shopping-list-snapshot.md)（缺料购物清单，首发详情页复用其纯函数）
