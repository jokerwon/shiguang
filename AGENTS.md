# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Codex, etc.) when working with code in this repository.

## 项目概述

食光 (Shiguang) — 菜谱推荐应用。pnpm workspace monorepo，包含 Web 前端、后端服务和移动端 app。

## Monorepo 结构

```
shiguang/
  apps/
    web/     → @shiguang/web (Next.js 16, 端口 3000)
    server/  → @shiguang/server (NestJS, 端口 3001)
    mobile/  → @shiguang/mobile (Expo/React Native, iOS 先行)
  packages/
    domain/  → @shiguang/domain (共享域层：类型/标签/纯函数)
  pnpm-workspace.yaml
```

包管理器：**pnpm 11.20+**。通过 `pnpm --filter <package>` 在根目录操作任意子包。

## 子项目文档

- **前端架构与开发细节** → `apps/web/AGENTS.md`
- **后端架构与开发细节** → `apps/server/AGENTS.md`
- **移动端架构与开发细节** → `apps/mobile/AGENTS.md`

请优先阅读对应子项目的 AGENTS.md（子项目的 CLAUDE.md 仅是指向它的指针），此处仅记录 monorepo 层面的通用信息。

## 文档索引

`docs/README.md` 是全库文档索引（含各文档状态：常驻/活跃/归档/缺失），修改或新增文档时同步更新。

## 文档结构

```
docs/
  README.md          # 全库索引（全局）
  glossary.md        # 术语表（全局）
  adr/               # 决策记录（只增不改）
  implementation/    # 每 Phase 实施清单
  acceptance/        # 每 Phase 验收清单
```

docs 根只放全局文档；每 Phase 的工件按类型归目录——实施清单进 `implementation/`、验收清单进 `acceptance/`，命名 `phase-N-*.md`。

## 迭代流程

每个需求迭代（Phase）按以下主干执行：

1. **探索**：用 CodeGraph/grep/读代码摸清相关模块现状，产出的事实供后续工件引用。
2. **ADR（触发式）**：涉及架构级取舍（选型、数据模型、安全边界、跨模块依赖方向）时先写 ADR 定稿设计，模板沿用 `docs/adr/` 现有篇章（Context / Decision / Rationale / Alternatives / Consequences）。
3. **实施清单**：在 `docs/implementation/` 新建 `phase-N-implementation.md`，含"关键前置发现"（必须来自第 1 步对真实代码的探索，不凭空写）+ 按工作流分组的任务表 + 每组的验收小节。
4. **实现**：编码 + 迁移（若有 schema 变更，见下"数据模型变更"）。
5. **验收**：走查 `docs/acceptance/` 对应清单并勾选；后端改动完成前必跑 `pnpm --filter @shiguang/server test` 与 `pnpm -r lint`。
6. **收尾**：审计常驻层文档与代码实际行为的一致性；同步 `docs/README.md` 索引。

## 数据模型变更

修改 `apps/server/prisma/schema.prisma` 时：

0. **destructive 变更**（砍列/改类型/删表）前先备份：`pg_dump "$DATABASE_URL" > /tmp/shiguang-pre-migrate.sql`；
1. 本地库执行 `pnpm --filter @shiguang/server db:migrate`（Prisma migrate dev）验证迁移；
2. `pnpm --filter @shiguang/server db:generate` 重新生成 Client；
3. 跑通后端测试后，在实施清单记录"迁移已验证"。

## 文档纪律

- **ADR 只增不改**：推翻旧决策写新 ADR 并在旧文加 supersede 指针，不改原文。ADR 与对应代码变更绑定同一 Phase（实现提交在 message 中引用 ADR 号）。
- **任务完成时**同步勾选 `docs/acceptance/` 对应验收清单。
- **常驻层文档禁用"本版/新增/最近"等相对时间措辞**——写当前事实，历史演变归 ADR。
- **字段级事实不复制进文档**，一律引用 `apps/server/prisma/schema.prisma` 等代码源。
- **新增/移动/删除文档后**，同步 `docs/README.md` 索引并检查指向旧路径的交叉链接。

## 根目录命令

```bash
pnpm dev # 同时启动前端 (3000) 和后端 (3001) 开发服务器
pnpm dev:mobile # 启动移动端 Expo dev server
pnpm --filter @shiguang/web dev # 仅启动前端
pnpm --filter @shiguang/server start:dev # 仅启动后端
pnpm --filter @shiguang/server db:generate # 生成 Prisma Client
pnpm build:domain # 构建共享域层 dist 产物（服务端消费）
pnpm recipes:generate # AI 批量生成菜谱 → staging 待审区（ADR-0003）
pnpm seed:long-conversation -- --user <userId|email> # 造 40+ 条长会话 + 预生成摘要（F3 验收前置，ADR-0012）
```

## 开发环境要求

- **Node.js** >= 20.0.0
- **pnpm** >= 11.20.0
- **PostgreSQL** — 后端数据库，需提前创建数据库并配置 `apps/server/.env` 中的 `DATABASE_URL` 与 `DIRECT_URL`

## 环境变量

- `apps/server/.env` — `DATABASE_URL`（运行时 PostgreSQL 连接串）、`DIRECT_URL`（Prisma CLI 迁移连接串，托管库须为会话池）、`JWT_SECRET`、`OPENAI_API_KEY` / `OPENAI_BASE_URL` / `MODEL_NAME`（AI 对话与菜谱生成共用）
- `apps/web/` — `NEXT_PUBLIC_API_URL` 指向后端（默认 `http://localhost:3001`）
