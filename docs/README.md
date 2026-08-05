# 食光文档索引

> 状态约定：**常驻** = 必须永远保鲜；**活跃** = 当前 Phase 内迭代；**归档** = 只读，不再修改；**缺失** = 已知断链，诚实标注。

## 常驻层

| 文档 | 状态 | 说明 |
|------|------|------|
| [glossary.md](./glossary.md) | 常驻 | 领域术语表（Ubiquitous Language）。⚠️ 字段级事实以 `apps/server/prisma/schema.prisma` 为准，本表只定义概念语义 |
| 根 [AGENTS.md](../AGENTS.md) / [apps/web/AGENTS.md](../apps/web/AGENTS.md) / [apps/server/AGENTS.md](../apps/server/AGENTS.md) | 常驻 | Agent 工作指令。各层 `AGENTS.md` 是唯一事实源；同层 `CLAUDE.md` 均为 `@AGENTS.md` 指针文件 |

## 决策层（ADR）

| 文档 | 状态 | 说明 |
|------|------|------|
| [adr/](./adr/README.md) | 归档（只增不改） | ADR-0001 ~ 0010，含 Phase 总览；被取代的决策用 supersede 指针，不改原文 |

## 实施层（按 Phase）

> **编号沿革（2026-08-05）**：旧编号中「地基=Phase 1、体验=Phase 2、AI 会动手=Phase 3、更懂你=Phase 4」，现统一为全局顺序：地基+体验合并为 **Phase 1**，AI 两阶段为 **Phase 2 / 3**。历史文档（ADR-0001~0007、phase-1-implementation.md）保留原文不改。

| Phase | 实施清单 | 验收清单 | 状态 |
|-------|---------|---------|------|
| 1 内容深度+个性化 | [implementation/phase-1-implementation.md](./implementation/phase-1-implementation.md)（仅覆盖地基部分；体验部分无文档，承认断链，追溯见 git history，勿补写） | [phase-1-checklist.md](./acceptance/phase-1-checklist.md)（后补的回归基线，依据真实代码回溯编写） | 已交付，实施文档归档 |
| 2 AI 会动手 | [implementation/phase-2-implementation.md](./implementation/phase-2-implementation.md) | [phase-2-3-checklist.md](./acceptance/phase-2-3-checklist.md) | **未开工**——ADR/实施清单/验收已备,代码未动(schema 无 Conversation 表、src 无 conversation 模块与 chat/tools 目录) |
| 3 更懂你 | **待写**——须待 Phase 2 代码落地后编写，"关键前置发现"只能来自对真实代码的探索，提前写是虚构 | 已备（与 Phase 2 共用同一份清单的 E/F 节） | 未开工 |

## 运行层

| 文档 | 状态 | 说明 |
|------|------|------|
| 部署 Runbook | **待写** | 进入真实部署前编写：部署步骤、环境变量/密钥清单（用途/获取/轮换）、故障处置。OPC 没有 on-call 轮值，这是写给状态最差的自己看的 |
