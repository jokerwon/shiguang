# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

食光 (Shiguang) — 菜谱推荐 Web 应用。pnpm workspace monorepo，包含前端和后端两个子项目。

## Monorepo 结构

```
shiguang/
  apps/
    web/     → @shiguang/web (Next.js 16, 端口 3000)
    server/  → @shiguang/server (NestJS, 端口 3001)
  pnpm-workspace.yaml
```

包管理器：**pnpm 10.15+**。通过 `pnpm --filter <package>` 在根目录操作任意子包。

## 子项目文档

- **前端架构与开发细节** → `apps/web/CLAUDE.md`
- **后端架构与开发细节** → `apps/server/CLAUDE.md`

请优先阅读对应子项目的 CLAUDE.md，此处仅记录 monorepo 层面的通用信息。

## 根目录命令

```bash
pnpm dev                        # 启动前端开发服务器 (等同于 --filter @shiguang/web dev)
pnpm --filter @shiguang/server start:dev   # 启动后端开发服务器
pnpm --filter @shiguang/server db:generate # 生成 Prisma Client
```

注意：根目录 `pnpm dev` 只启动前端。开发时需要分别在两个终端启动 `web` 和 `server`。

## 开发环境要求

- **Node.js** >= 20.0.0
- **pnpm** >= 10.15.0
- **PostgreSQL** — 后端数据库，需提前创建数据库并配置 `apps/server/.env` 中的 `DATABASE_URL`

## 环境变量

- `apps/server/.env` — `DATABASE_URL`（PostgreSQL 连接串）、`JWT_SECRET`
- `apps/web/` — `NEXT_PUBLIC_API_URL` 指向后端（默认 `http://localhost:3001`）
