# 食光文档索引

> 状态约定：**常驻** = 必须永远保鲜；**活跃** = 当前 Phase 内迭代；**归档** = 只读，不再修改；**缺失** = 已知断链，诚实标注。

## 常驻层

| 文档 | 状态 | 说明 |
|------|------|------|
| [glossary.md](./glossary.md) | 常驻 | 领域术语表（Ubiquitous Language）。⚠️ 字段级事实以 `apps/server/prisma/schema.prisma` 为准，本表只定义概念语义 |
| 根 [AGENTS.md](../AGENTS.md) / [apps/web/AGENTS.md](../apps/web/AGENTS.md) / [apps/server/AGENTS.md](../apps/server/AGENTS.md) / [apps/mobile/AGENTS.md](../apps/mobile/AGENTS.md) | 常驻 | Agent 工作指令。各层 `AGENTS.md` 是唯一事实源；同层 `CLAUDE.md` 均为 `@AGENTS.md` 指针文件 |

## 决策层（ADR）

| 文档 | 状态 | 说明 |
|------|------|------|
| [adr/](./adr/README.md) | 归档（只增不改） | ADR-0001 ~ 0015，含 Phase 总览；被取代的决策用 supersede 指针，不改原文 |

## 实施层（按 Phase）

> **编号沿革（2026-08-05）**：旧编号中「地基=Phase 1、体验=Phase 2、AI 会动手=Phase 3、更懂你=Phase 4」，现统一为全局顺序：地基+体验合并为 **Phase 1**，AI 两阶段为 **Phase 2 / 3**。历史文档（ADR-0001~0007、phase-1-implementation.md）保留原文不改。

| Phase | 实施清单 | 验收清单 | 状态 |
|-------|---------|---------|------|
| 1 内容深度+个性化 | [implementation/phase-1-implementation.md](./implementation/phase-1-implementation.md)（仅覆盖地基部分；体验部分无文档，承认断链，追溯见 git history，勿补写） | [phase-1-checklist.md](./acceptance/phase-1-checklist.md)（后补的回归基线，依据真实代码回溯编写） | 已交付，实施文档归档 |
| 2 AI 会动手 | [implementation/phase-2-implementation.md](./implementation/phase-2-implementation.md) | [phase-2-3-checklist.md](./acceptance/phase-2-3-checklist.md) | 已交付——Conversation/Message 表 + 会话 CRUD、chat tool-loop、只读/写工具、操作卡片 undo、会话列表 |
| 2.1 会话重设计 | [implementation/phase-2-1-implementation.md](./implementation/phase-2-1-implementation.md) | [phase-2-3-checklist.md](./acceptance/phase-2-3-checklist.md)（补充 URL 归属场景） | 已交付——ADR-0011：会话状态归属(URL)+ Message 表重审（砍 content/toolCalls、加 seq） |
| 3 更懂你 | [implementation/phase-3-implementation.md](./implementation/phase-3-implementation.md) | [phase-2-3-checklist.md](./acceptance/phase-2-3-checklist.md)（E/F 节） | 已交付——`update_preferences` 草稿 + 确认卡片、历史消息只读、滑窗 + 会话摘要、长会话种子脚本（ADR-0012） |
| 3.5 自动化验证补齐 | [implementation/phase-3-5-implementation.md](./implementation/phase-3-5-implementation.md) | [phase-2-3-checklist.md](./acceptance/phase-2-3-checklist.md)（G 节） | 已交付——后端纯逻辑/service 测试补齐（preference upsert、seq 不变量、工具 schema 清洗）、迁移备份入流程、pre-existing lint 修复；前端 React 19 lint 留待后续 |
| 4 认证双轨 | [implementation/phase-4-implementation.md](./implementation/phase-4-implementation.md) | [phase-4-checklist.md](./acceptance/phase-4-checklist.md) | 已交付——短 access + 滑动 refresh、复用检测、cookie/body 双轨、删 User.role（ADR-0013，原生 app 认证前置）；验收全过（API 冒烟 + 浏览器手动走查） |
| 5 原生 app 首发 | [implementation/phase-5-implementation.md](./implementation/phase-5-implementation.md) | [phase-5-checklist.md](./acceptance/phase-5-checklist.md) | 已交付——Expo/React Native `apps/mobile`（iOS 先行）、`packages/domain` 共享域层、移动端认证（Keychain + 内存）、离线只读缓存（浏览链三键）、4 Tab + 详情 + 缺料清单 + 登录注册（ADR-0014 + ADR-0015） |

## 运行层

| 文档 | 状态 | 说明 |
|------|------|------|
| 部署 Runbook | **待写** | 进入真实部署前编写：部署步骤、环境变量/密钥清单（用途/获取/轮换）、故障处置。OPC 没有 on-call 轮值，这是写给状态最差的自己看的 |
