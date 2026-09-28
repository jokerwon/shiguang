# ADR-0016: 移除移动客户端 —— 砍掉 `apps/mobile`，平台战略回归 Web

- **状态**:已接受
- **日期**:2026-09-28
- **决策者**:Kai
- **取代**:**ADR-0014**（原生 app 首发 / 移动主战场）整体作废；**ADR-0015** 部分作废（「与移动端共用」这一动机消失，共享包本身保留）

## 背景 (Context)

ADR-0014 把平台战略定为「移动主战场」，并以 `apps/mobile`（Expo / React Native，iOS 先行）落地 Phase 5；ADR-0015 为此新增 `packages/domain` 共享域层。Phase 5 已交付：4 Tab（发现/食材/收藏/我的）+ 菜谱详情 + 缺料清单 + 登录注册、Keychain 认证、浏览链离线只读缓存。

现状盘点（本次移除前的事实）：

- `apps/mobile` 39 个跟踪文件；服务端零改动（ADR-0014 目标达成），Web 未消费任何移动端产物。
- `packages/domain` 的消费方**不止移动端**：Web（9 处 import）与服务端（`recipe.mapper.ts`、`read-tools-logic.ts`）都在用，中文标签双份重复已借此消除。
- 服务端 CORS 只放行 `http://localhost:3000`，移动端靠原生无 Origin 头绕过——即移动端从未需要过任何服务端专属接线。

结论：移动客户端是**独立可摘除**的一层，移除不触及 Web / 服务端 / 共享域层的任何行为。

## 决策 (Decision)

1. **删除 `apps/mobile` 全部代码**（Expo/RN 应用、iOS 工程、metro 配置、移动端 AGENTS.md）。
2. **保留 `packages/domain`**。它是 Web 与服务端的单一事实源（ADR-0015 决策 3 的收益独立于移动端成立），移除它等于把类型与中文标签复制回 Web/服务端两份，重新引入 ADR-0015 曾治好的漂移。`packages/*` workspace glob 保留。
3. **平台战略回归 Web 单客户端**。Web 为唯一客户端形态，不设「主战场 / 辅助入口」之分。
4. **服务端保留 refresh token 走 body 的双轨能力**（ADR-0013 决策：`extractRefreshToken` body 优先）。理由是零维护成本、通用 API 能力，不是专为原生端预留；不为了「没有原生端了」而删掉一条已测试通过的读写路径。
5. **移除的接线**：根 `package.json` 的 `dev:mobile` 脚本、锁文件中的 `apps/mobile` importer（连带 4258 行孤儿依赖解析）。根 `README.md` 只列 Web / 服务端，无需改动。

## 理由 (Rationale)

- **维护成本 vs 使用量**：原生端需持续跟进 Expo SDK / RN / iOS 工具链升级，且只有手动走查（无自动化测试）作为质量网；在手机上真实使用量未立住「主战场」主张时，这是一条只有成本没有收益的线。
- **移除面清晰**：零服务端耦合、零 Web 耦合，删目录 + 删接线即完成，不留半吊子状态（对比：若 ADR-0014 当初让移动端也消费改造后的服务端契约，移除成本会高一个量级——本次能干净摘除本身就说明分层是对的）。
- **共享域层不是移动端专属**：保留它有独立的正确性理由（消除双份标签漂移），与「还要不要移动端」解耦。

## 备选方案 (Alternatives Considered)

- **留着代码不维护（冻结 `apps/mobile`）**：零删除成本，但死代码会腐烂——依赖版本漂移、`pnpm install` 持续拉几百个 RN/Expo 包、文档与索引指向一个跑不起来的子项目。否，删除才诚实。
- **连 `packages/domain` 一起删，类型与标签塞回 Web/服务端各自本地**：少一个 workspace 包，但重新制造 Web ↔ 服务端中文标签双份重复（ADR-0015 背景里的既有漂移），且要改 web 9 文件 + server 3 文件。为省一个包付双份维护，否。
- **保留移动端但降级为「不验收、不升级」**：与冻结同病，且验收清单（phase-5-checklist）会长期挂着无法勾选的项目。否。
- **改写 ADR-0014 原文**：违反仓库「ADR 只增不改」纪律；用本 ADR + supersede 指针，历史决策的上下文（为什么当初选移动端）保持可追溯。否。

## 后果 (Consequences)

- **正面**：仓库只剩 Web + 服务端两个应用与一个共享包；依赖树砍掉全部 Expo/RN 包（锁文件删除 4258 行、新增 197 行）；文档与索引回到「写当前事实」的一致状态。
- **负面**：移动端特有的能力主张（离线只读缓存、Keychain 常驻登录、原生体验）一并作废；Phase 5 的 `apps/mobile` 实现只存在于 git 历史，若要复活需重新实现（ADR-0014 的设计结论仍可从历史 ADR 读出，不必重新探索）。
- **影响面**：`apps/mobile/**`（删）；`package.json`（删 `dev:mobile`）；`pnpm-lock.yaml`（删 importer，连带 4258 行孤儿依赖）；`AGENTS.md`、`docs/README.md`、`docs/glossary.md`、`docs/adr/README.md`（同步）；`docs/implementation/phase-5-implementation.md`、`docs/acceptance/phase-5-checklist.md`（标注已移除）。
- **不变量**：Web 与服务端的功能、接口、数据模型零改动；`packages/domain` 的导出契约零改动。

## 相关 ADR

- [ADR-0014](./0014-theme-mobile-first-native-app.md)（被本 ADR 取代：主题与平台战略作废）
- [ADR-0015](./0015-shared-domain-layer.md)（动机部分作废，共享包与「框架无关」边界继续有效）
- [ADR-0013](./0013-auth-refresh-token-rotation.md)（refresh 表 + cookie/body 双轨继续有效；「面向原生 app」的驱动描述已成历史）
