# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

食光 (Shiguang) 后端 API 服务——为前端 Next.js 应用提供 REST API。

## Monorepo 上下文

```
shiguang/
  apps/
    web/    ← Next.js 16 前端 (端口 3000)
    server/ ← 当前项目，NestJS 后端 (端口 3001)
  pnpm-workspace.yaml
```

包管理器：pnpm 10.15+。从仓库根目录或 `apps/server/` 执行命令均可，但 `package.json` 中的 scripts 在 `apps/server/` 目录下运行。

## 常用命令

```bash
pnpm start:dev      # 开发模式 (watch)
pnpm start:debug    # 调试模式
pnpm build          # 生产构建 (nest build)
pnpm start          # 生产启动
pnpm lint           # ESLint + Prettier
pnpm format         # Prettier 格式化
pnpm test           # 单元测试 (jest)
pnpm test:e2e       # E2E 测试
pnpm test:cov       # 测试覆盖率
```

### Prisma 相关

```bash
pnpm db:generate    # 生成 Prisma Client (输出到 generated/prisma/)
pnpm db:migrate     # 创建并应用迁移
pnpm db:deploy      # 生产环境部署迁移
pnpm db:reset       # 重置数据库
pnpm db:seed        # 填充种子数据 (tsx prisma/seed.ts)
pnpm db:studio      # 打开 Prisma Studio
pnpm db:status      # 检查迁移状态
```

## 环境变量

`.env` 文件位于 `apps/server/`。必须包含：

- `DATABASE_URL` — PostgreSQL 连接串，格式：`postgresql://user:password@host:port/dbname`
- `JWT_SECRET` — JWT 签名密钥（开发环境默认值：`shiguang-dev-secret`）

参见 `.env.example`。

## 架构

### 模块结构

```
src/
  main.ts                     # 入口：CORS、ValidationPipe、ShutdownHooks
  app.module.ts               # 根模块：ConfigModule、PrismaModule、AuthModule
  app.controller.ts / .service.ts  # 占位，暂无逻辑

  prisma/
    prisma.module.ts          # @Global() 模块，导出 PrismaService
    prisma.service.ts         # 继承 PrismaClient + onModuleInit/Destroy

  auth/
    auth.module.ts            # 注册 JwtModule (7天过期)
    auth.controller.ts        # POST /auth/login, POST /auth/register
    auth.service.ts           # 登录/注册逻辑，bcryptjs 密码哈希
    auth.dto.ts               # LoginDto / RegisterDto，class-validator 校验
```

### 数据库 — PostgreSQL + Prisma

Prisma Client 生成到 `generated/prisma/client/`（非默认路径）。`import { PrismaClient } from 'generated/prisma/client'` 导入。

使用 `@prisma/adapter-pg` 直接连接 PostgreSQL，不依赖连接池。

数据模型（`prisma/schema.prisma`）：
- **Recipe** — 菜谱（id, name, desc, cuisine, time, kcal, img, tags, ingredients, steps）。tags/ingredients/steps 为 JSON 字段。索引：cuisine, time
- **User** — 用户（id, email, passwordHash, displayName, avatarUrl, role）

种子数据（`prisma/seed.ts`）包含与前端 `apps/web/lib/recipes.ts` 一致的 12 道菜谱。使用 upsert（按 name）实现幂等。

### 认证

JWT 无状态认证。流程：
1. `POST /auth/register` — 创建用户，返回 `{ token, user }`
2. `POST /auth/login` — 验证邮箱+密码，返回 `{ token, user }`
3. JWT payload：`{ sub: userId, email }`，7 天有效期
4. 密码使用 bcryptjs (cost factor 12) 哈希

### 全局管道

`main.ts` 启用了 `ValidationPipe`：
- `whitelist: true` — 自动剥离 DTO 中未定义的字段
- `transform: true` — 自动转换类型

### CORS

允许 `http://localhost:3000`（前端开发服务器），支持 credentials。

## 关键技术决策

- **Prisma Client 自定义输出路径**：生成到 `generated/prisma/`，模块格式为 CJS（`moduleFormat: "cjs"`）。导入路径：`from 'generated/prisma/client'`
- **PrismaModule 为 @Global()**：无需在每个 feature module 中重复导入
- **PrismaService 构造函数中直接创建 pg adapter**：不需要 NestJS ConfigService，直接从 `process.env.DATABASE_URL` 读取
- **TypeScript 模块模式**：`module: "nodenext"`, `moduleResolution: "nodenext"`
- **构建工具**：基于 `@swc/core` 编译（速度快），非默认 tsc
