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

### 菜谱内容生产（ADR-0003）

```bash
pnpm recipes:generate                     # AI 批量生成 → prisma/staging/recipes-staging.json
pnpm recipes:generate --batches 2         # 每个菜系生成 2 批（每批默认 8 道）
pnpm recipes:generate --only sichuan,home # 只生成指定菜系
```

生成结果**先入 staging 待审区，不直接入库**：脚本做字段/营养/去重校验（`src/recipe/recipe-draft.ts`），人工抽检 staging JSON 后，`pnpm db:seed` 合并「`prisma/recipes-curated.ts` 人工精选 + staging」upsert 入库（seed 时再过一遍校验兜底）。

## 环境变量

`.env` 文件位于 `apps/server/`。必须包含：

- `DATABASE_URL` — PostgreSQL 连接串，格式：`postgresql://user:password@host:port/dbname`
- `JWT_SECRET` — JWT 签名密钥（开发环境默认值：`shiguang-dev-secret`）
- `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `MODEL_NAME` — OpenAI-compatible 端点，`/chat` 与 `recipes:generate` 共用

参见 `.env.example`。

**时区**：推荐算法的「晚间」「当天」取服务器本地时间（`RecommendationService`），部署要求 `TZ=Asia/Shanghai`，本地 dev 无需处理。

## 架构

### 模块结构

```
src/
  main.ts                     # 入口：CORS、ValidationPipe、ShutdownHooks
  app.module.ts               # 根模块：ConfigModule、PrismaModule、AuthModule 等
  app.controller.ts / .service.ts  # 占位，暂无逻辑

  prisma/
    prisma.module.ts          # @Global() 模块，导出 PrismaService
    prisma.service.ts         # 继承 PrismaClient + onModuleInit/Destroy

  auth/
    auth.module.ts            # 注册 JwtModule (7天过期)，exports JwtModule + JwtAuthGuard
    auth.controller.ts        # POST /auth/login, POST /auth/register
    auth.service.ts           # 登录/注册逻辑，bcryptjs 密码哈希
    jwt-auth.guard.ts         # 手写 CanActivate，验签后把 { sub, email } 挂 request.user
    current-user.decorator.ts # @CurrentUser() 取 userId（sub）

  recipe/
    recipe.controller.ts      # GET /recipes（分页筛选）、GET /recipes/personalized（需认证）、GET /recipes/:id
    recipe.service.ts         # 查询 + 响应组装
    recipe.mapper.ts          # Prisma 枚举 ↔ 前端小写映射、toResponse、中文标签（CUISINE_ZH/TAG_ZH）
    recommendation.service.ts # 个性化推荐（ADR-0005）：首页与 AI 注入共用的单一事实源
    recommendation.scoring.ts # 打纯正函数：硬过滤 + pantry/时间/目标/轮换加权（0.45/0.15/0.15/0.25）
    recipe-draft.ts           # AI 生成菜谱的校验纯函数（generate 脚本与 seed 共用）

  chat/
    chat.controller.ts        # POST /chat（需认证，流式）
    chat.service.ts           # 请求级构建 system prompt（上下文注入，ADR-0006）
    prompts/                  # system/recipe/behavior/guardrails 静态段 + context-builder 动态段

  pantry/                     # GET/PUT /pantry（整体替换，string[]）
  favorite/                   # GET /favorites、POST /favorites/:recipeId（toggle）
  preference/                 # GET/PUT /preferences（忌口/过敏原/健康目标）
```

### 个性化推荐（ADR-0005/0006）

- `RecommendationService` 只注入 PrismaService（PrismaModule 全局），**不 import Pantry/Preference 模块**，零模块间耦合
- 算法：硬过滤（忌口 ∪ 过敏原，与前端 matchScore 同语义的双向 includes）→ 加权排序（pantry 匹配 0.45 + 时间适配 0.15 + 健康目标 0.15 + 新鲜度轮换 0.25）；轮换种子 = FNV-1a(userId + 当天日期)，无状态、当天稳定按天轮换
- **依赖方向**：ChatModule → RecipeModule（单向，无循环）。`/chat` 每次请求用 `recommend(userId, 8)` 的候选注入 system prompt，AI 只能推荐候选清单内的真实菜谱
- 单测：`recommendation.scoring.spec.ts`、`recipe-draft.spec.ts`（纯函数，零 DB）

### 数据库 — PostgreSQL + Prisma

Prisma Client 生成到 `generated/prisma/client/`（非默认路径）。`import { PrismaClient } from 'generated/prisma/client'` 导入。

使用 `@prisma/adapter-pg` 直接连接 PostgreSQL，不依赖连接池。

数据模型（`prisma/schema.prisma`）：
- **Recipe** — 菜谱（id, name, desc, cuisine, time, kcal, protein/carb/fat, img, tags, ingredients, steps）。ingredients 为 Json（`{name, amount}[]`），steps 为 Json（string[]）。索引：cuisine, time
- **User** — 用户（id, email, passwordHash, displayName, avatarUrl, role）
- **PantryItem** — 食材清单（userId + name 唯一）
- **Favorite** — 收藏（userId + recipeId 唯一）
- **UserPreference** — 偏好档案（userId 唯一；dislikedIngredients/allergens/healthGoal）

种子数据：`prisma/recipes-curated.ts`（人工精选）+ `prisma/staging/recipes-staging.json`（AI 生成待审区，存在才合并），按 name upsert 幂等。

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
