# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Codex, etc.) when working with code in this repository.

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

包管理器：pnpm 11.20+。从仓库根目录或 `apps/server/` 执行命令均可，但 `package.json` 中的 scripts 在 `apps/server/` 目录下运行。

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
    chat.controller.ts        # POST /chat（需认证，流式，body { conversationId?, message }）
    chat.service.ts           # tool-loop + 持久化（ADR-0009/0010）：DB 取滑窗上下文，streamText + tools，onFinish 落库
    prompts/                  # system/recipe/behavior/guardrails 静态段 + context-builder 动态段
    tools/                    # AI 工具（ADR-0009）：read-tools / write-tools（*-logic.ts 为纯逻辑，单测友好）+ index 工厂

  conversation/               # 会话持久化（ADR-0010）：Conversation/Message CRUD + 滑窗上下文 + UIMessage↔DB mapper
  pantry/                     # GET/PUT /pantry（整体替换，string[]）；exports PantryService 供 chat 写工具复用
  favorite/                   # GET /favorites、POST /favorites/:recipeId（无 body=toggle，{saved} body=幂等 set）
  preference/                 # GET/PUT /preferences（忌口/过敏原/健康目标）；exports PreferenceService 供 chat 只读工具复用
```

### AI 对话（ADR-0006/0009/0010）

- **注入演进（ADR-0009）**：保留偏好/pantry/季节/用户名注入；候选菜谱注入已移除，改为 `search_recipes` 工具按需查询。`ChatService` 不再调 `recommend(userId, 8)`，但仍用 `loadSignals` 取 blocked/pantry/healthGoal（注入与硬过滤共用）。
- **tool-loop**：`streamText({ tools, stopWhen: stepCountIs(5) })`，工具经 `createChatTools(deps, userId)` 工厂闭包捕获 userId。`search_recipes` 先过 `blocked` 硬过滤再打分排序（复用 `recommendation.scoring`，单一事实源）。
- **写工具幂等**：`add_pantry_items`/`remove_pantry_items` 基于 `findAll + replace` 组合实现去重幂等；`set_favorite` 用幂等 set 语义（`FavoriteService.set`，toggle 对 AI 危险）。
- **持久化（ADR-0010/0011）**：body 只带 `conversationId? + message`，后端从 DB 取最近 20 条组装上下文（不信客户端全量，按 `seq desc` 滑窗）。无 conversationId 则创建会话（title = 首条消息截断 ~20 字），id 经响应头 `x-conversation-id` 回传前端。`toUIMessageStream` 的 `onFinish` 落库 assistant 消息（含 tool parts）；`appendMessage` 由应用层算 `seq = max(seq)+1`，配 `@@unique` 冲突重试。
- 单测：`recommendation.scoring.spec.ts`、`recipe-draft.spec.ts`、`conversation.mapper.spec.ts`、`chat/tools/tools.spec.ts`（纯函数，零 DB）。

### 个性化推荐（ADR-0005/0006）

- `RecommendationService` 只注入 PrismaService（PrismaModule 全局），**不 import Pantry/Preference 模块**，零模块间耦合
- 算法：硬过滤（忌口 ∪ 过敏原，与前端 matchScore 同语义的双向 includes）→ 加权排序（pantry 匹配 0.45 + 时间适配 0.15 + 健康目标 0.15 + 新鲜度轮换 0.25）；轮换种子 = FNV-1a(userId + 当天日期)，无状态、当天稳定按天轮换
- **依赖方向**：ChatModule → RecipeModule / PantryModule / FavoriteModule / PreferenceModule / ConversationModule（单向，无循环）。推荐打分仍是首页与 `search_recipes` 工具的单一事实源。

### 数据库 — PostgreSQL + Prisma

Prisma Client 生成到 `generated/prisma/client/`（非默认路径）。`import { PrismaClient } from 'generated/prisma/client'` 导入。

使用 `@prisma/adapter-pg` 直接连接 PostgreSQL，不依赖连接池。

数据模型（`prisma/schema.prisma`）：
- **Recipe** — 菜谱（id, name, desc, cuisine, time, kcal, protein/carb/fat, img, tags, ingredients, steps）。ingredients 为 Json（`{name, amount}[]`），steps 为 Json（string[]）。索引：cuisine, time
- **User** — 用户（id, email, passwordHash, displayName, avatarUrl, role）
- **PantryItem** — 食材清单（userId + name 唯一）
- **Favorite** — 收藏（userId + recipeId 唯一）
- **UserPreference** — 偏好档案（userId 唯一；dislikedIngredients/allergens/healthGoal）
- **Conversation** — 会话（ADR-0010；userId, title, updatedAt）。索引：userId + updatedAt
- **Message** — 消息（ADR-0010/0011；conversationId, seq 消息级序号(会话内 1 起单调递增,应用层 max+1,@@unique([conversationId,seq])), role string(user|assistant 实际两类,tool 信息在 assistant.parts 内), parts Json 原始 UIMessage parts 数组(保序,还原唯一来源)）。索引：conversationId + seq（唯一 + 普通）。content/toolCalls 列已砍（ADR-0011 死重量）

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
