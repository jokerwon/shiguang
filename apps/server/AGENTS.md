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
pnpm dev            # 开发模式 (watch)
pnpm start:debug    # 调试模式
pnpm build          # 生产构建 (nest build)
pnpm start          # 生产启动
pnpm lint           # ESLint + Prettier
pnpm format         # Prettier 格式化
pnpm test           # 单元测试 (jest)
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
pnpm seed:long-conversation -- --user <userId|email> # 长会话种子脚本（F3 验收前置，ADR-0012）
```

### 菜谱内容生产（ADR-0003）

```bash
pnpm ingredients:import                   # 发布审核食材资料 → Ingredient 表 + 归一菜谱关联（ADR-0018）
pnpm recipes:generate                     # AI 批量生成 → prisma/staging/recipes-staging.json
pnpm recipes:generate --batches 2         # 每个菜系生成 2 批（每批默认 8 道）
pnpm recipes:generate --only sichuan,home # 只生成指定菜系
```

生成结果**先入 staging 待审区，不直接入库**：脚本做字段/营养/去重校验（`src/recipe/recipe-draft.ts`），提示词把食材名限定在已发布选材白名单内（白名单外写法当场打印待处理）；人工抽检 staging JSON 后，`pnpm db:seed` 合并「`prisma/recipes-curated.ts` 人工精选 + staging」，菜谱行与原料关联同一事务写入（ADR-0019：`RecipeIngredient` 是唯一事实源，`Recipe` 不再有 ingredients 列）。seed 与 `ingredients:import` 共用 `normalize.ts` 的归一校验：未收录/未发布写法整批拒绝，同一身份的不同写法各保留一行。重复运行不产生重复关联。

### 长会话种子（Phase 3 验收前置，ADR-0012）

`pnpm seed:long-conversation -- --user <userId|email>` 直插 DB 构造一个 40+ 条消息的会话（话题：减脂餐 → 周末聚餐），随后**进程内直调** `src/chat/summary.ts` 纯函数预生成摘要并写回会话行——不走 HTTP、不烧多轮真实对话。幂等：重跑先删旧种子会话（固定 title 前缀）。缺模型配置（OPENAI_API_KEY/MODEL_NAME）则跳过摘要、仅造滑窗数据。

### Jev 候选重排序离线实验（Phase 10，与线上隔离）

```bash
pnpm experiment:snapshot                    # 从数据库导出冻结菜谱快照（一次性，写入 experiments/phase-10/snapshot.json）
pnpm experiment:run                         # 只跑完整候选与基线前 4（不调用 Jev）
pnpm experiment:run -- --execute            # 真实调用 Jev（付费，须另行授权）
pnpm experiment:run -- --execute --only dev-hot-rice-bowl
pnpm experiment:blind -- --run <results.json>          # 生成匿名 A/B 材料 + 分离揭盲映射
pnpm experiment:review -- --run <results.json> --blind <blind-material.json> --reveal <reveal.json> --reviews <reviews.json>
```

实验只模拟 AI 对话里菜谱搜索结果的排序，不改线上任何链路。纯逻辑在 `src/experiment/`（`scenarios.ts` 冻结场景、
`candidates.ts` 候选与基线、`jev.ts` 判断与排序、`evaluation.ts` 盲评与统计），CLI 在 `scripts/experiment.ts`；
候选构建直接调用在线 `runSearchRecipes`（`limit` 放大到全量），不复制第二套筛选或安全语义。
凭证只从服务端环境变量读取（`TYPESAFE_API_KEY` / `TYPESAFE_BASE_URL` / `TYPESAFE_DEFAULT_MODEL`），
`--execute` 才构造客户端；预算上界按 1 token/字符保守估算，SDK 重试关闭（`maxRetries: 0`），
超预算即暂停（不自动加预算、减候选或删证据）。模型版本固定 `jev-1.13.0`，代理环境用 `--model` 显式指定并记录。
运行工件在 `experiments/phase-10/`；用户盲评不能由代理代替，统计只消费真实运行记录与人工评审。

## 环境变量

`.env` 文件位于 `apps/server/`。必须包含：

- `DATABASE_URL` — 运行时连接串（PrismaService 经 adapter 使用），格式：`postgresql://user:password@host:port/dbname`
- `DIRECT_URL` — Prisma CLI 迁移连接串（`prisma.config.ts` 的 `datasource.url`）。本地与 `DATABASE_URL` 相同即可；迁移必须走直连或会话池，不能走事务池（PGbouncer 事务模式下 migrate 会挂起）
- `JWT_SECRET` — JWT 签名密钥，**必填**：缺失时后端拒绝启动，不再回退到硬编码默认值（`AuthModule` 经 `ConfigService` 读取）
- `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `MODEL_NAME` — OpenAI-compatible 端点，`/chat` 与 `recipes:generate` 共用

参见 `.env.example`。

**时区**：推荐算法的「晚间」「当天」取服务器本地时间（`RecommendationService`），部署要求 `TZ=Asia/Shanghai`，本地 dev 无需处理。

## 架构

### 模块结构

```
src/
  main.ts                     # 入口：CORS、ValidationPipe、ShutdownHooks
  app.module.ts               # 根模块：ConfigModule（.env 唯一运行时加载点）、PrismaModule、AuthModule 等

  prisma/
    prisma.module.ts          # @Global() 模块，导出 PrismaService
    prisma.service.ts         # 继承 PrismaClient + onModuleInit/Destroy

  auth/
    auth.module.ts            # 注册 JwtModule (15 分钟 access)，exports JwtModule + JwtAuthGuard
    refresh-token.ts          # refresh token 纯逻辑（ADR-0013）：签发/轮换/复用检测/吊销，显式注入 prisma
    auth.controller.ts        # POST /auth/login, POST /auth/register
    auth.service.ts           # 登录/注册逻辑，bcryptjs 密码哈希
    jwt-auth.guard.ts         # 手写 CanActivate，验签后把 { sub, email } 挂 request.user
    current-user.decorator.ts # @CurrentUser() 取 userId（sub）

  ingredient/
    ingredient.controller.ts  # GET /ingredients（身份优先搜索 + 单层分类）、GET /ingredients/identify（名称→身份）、GET /ingredients/:id、GET /ingredients/:id/recipes
    ingredient.service.ts     # 已发布资料读取（发布状态与资料来自数据库）；整串相等才算身份命中，子串只作显式候选
    normalize.ts              # 纯函数：原料写法 → 稳定身份、括号说明剥离、歧义检出、展示名还原（displayIngredientName）、发布链路共用的 resolveRecipeLinks
    publish-review.ts         # 纯函数：发布闸门（名称/审核简介/来源；过敏原关系需依据）

  recipe/
    recipe.controller.ts      # GET /recipes（分页筛选，可选认证以应用安全设置）、GET /recipes/personalized（需认证）、GET /recipes/:id
    recipe.service.ts         # 查询 + 响应组装；详情带 ingredientLinks 以携带原料稳定身份
    recipe.mapper.ts          # Prisma 枚举 ↔ 前端小写映射、toResponse（原料按 position 配身份）、中文标签（CUISINE_ZH/TAG_ZH）
    recipe-safety.service.ts  # 统一安全判断（ADR-0018）：身份/别名共用、过敏原关系独立、信息不足保守排除
    safety.ts                 # 纯函数：单个菜谱的安全判定与可解释原因
    recommendation.service.ts # 个性化推荐（ADR-0005/0017/0018）：首页与 AI search_recipes 共用的单一事实源
    recommendation.scoring.ts # 纯函数：时间/目标/轮换加权（3/11、3/11、5/11）；安全过滤在外层完成
    recipe-draft.ts           # AI 生成菜谱的校验纯函数（generate 脚本与 seed 共用）

  chat/
    chat.controller.ts        # POST /chat（需认证，流式，body { conversationId?, message }）
    chat.service.ts           # tool-loop + 持久化（ADR-0009/0010）：DB 取滑窗上下文，streamText + tools，onFinish 落库 + 溢出摘要触发（ADR-0012）
    summary.ts                # 会话摘要纯逻辑（ADR-0012）：消息序列化 + summarizeOverflow 增量拼接，依赖显式注入，种子脚本进程内直调
    prompts/                  # system/recipe/behavior/guardrails 静态段 + context-builder 动态段（含会话摘要注入）
    tools/                    # AI 工具（ADR-0009）：read-tools / write-tools（*-logic.ts 为纯逻辑，单测友好）+ index 工厂；write-tools 含 update_preferences 草稿工具（ADR-0012）

  conversation/               # 会话持久化（ADR-0010）：Conversation/Message CRUD + 滑窗上下文 + UIMessage↔DB mapper
  favorite/                   # GET /favorites、POST /favorites/:recipeId（无 body=toggle，{saved} body=幂等 set）
  preference/                 # GET/PUT /preferences（忌口/过敏原/健康目标）；exports PreferenceService 供 chat 只读工具复用
  experiment/                # Phase 10 离线实验纯逻辑（scenarios 冻结场景 / candidates 候选与基线 / jev 判断与排序 / evaluation 盲评与统计）；CLI 在 scripts/experiment.ts，不参与任何线上请求路径
```

### AI 对话（ADR-0006/0009/0010）

- **注入演进（ADR-0009/0017/0018/0019）**：保留偏好上下文；候选菜谱由 `search_recipes` 工具按需查询；库存上下文与库存工具已移除。`search_recipes` 的参数化流程：食材条件（`ingredients`，名称/别名逐词经 `IngredientService.identify` 归一为稳定身份，复用 `recipeIdsContainingAll` 做全部包含）→ 关键词（菜名与关联行展示名）/菜系/标签/营养 → 统一安全过滤（保留排除条数与原因）→ 打分排序。歧义/未收录/空白食材返回 `error` 且不做筛选；安全排除与真实无结果给出可区分的 `note`（#11 / Phase 8-7）。
- **tool-loop**：`streamText({ tools, stopWhen: stepCountIs(5) })`，工具经 `createChatTools(deps, userId)` 工厂闭包捕获 userId。按原料检索使用菜谱自身的 `RecipeIngredient` 关联行，不读取用户库存。
- **写工具幂等**：`set_favorite` 用幂等 set 语义（`FavoriteService.set`，toggle 对 AI 危险）。库存写工具已由 ADR-0017 删除。
- **偏好草稿（ADR-0012）**：`update_preferences` 工具**结构上不落库**——`execute` 只产出「操作集草稿」（`addDisliked`/`removeDisliked`/`addAllergens`/`removeAllergens`/`setHealthGoal`），读当前偏好仅作快照，不接触任何写 service；E4 红线（「你看着办直接改」不得绕过确认）由架构保证，确认只认前端按钮。prompt 规范禁止声称「已保存/已记住」。
- **持久化（ADR-0010/0011）**：body 只带 `conversationId? + message`，后端从 DB 取最近 20 条组装上下文（不信客户端全量，按 `seq desc` 滑窗）。无 conversationId 则创建会话（title = 首条消息截断 ~20 字），id 经响应头 `x-conversation-id` 回传前端。`toUIMessageStream` 的 `onFinish` 落库 assistant 消息（含 tool parts）；`appendMessage` 由应用层算 `seq = max(seq)+1`，配 `@@unique` 冲突重试。
- **会话摘要（ADR-0012）**：`onFinish` 落库后 fire-and-forget 检查溢出区（`seq ≤ maxSeq−滑窗` 且 `seq > summaryUpToSeq`），攒够 `SUMMARY_TRIGGER_THRESHOLD` 条调 `summary.ts` 增量拼接（压缩 旧摘要 + 新溢出），写回 `Conversation.summary`/`summaryUpToSeq`；LLM 失败仅记日志、保持旧摘要，降级 = 纯滑窗。`buildSystemPrompt` 注入「会话摘要」段。
- 单测：`recommendation.scoring.spec.ts`、`recipe-draft.spec.ts`、`conversation.mapper.spec.ts`、`chat/tools/index.spec.ts`、`chat/summary.spec.ts`（纯函数，零 DB）。另有 `preference/preference.service.spec.ts`、`conversation/conversation.service.spec.ts`——service 层用对象字面量 fake prisma（`jest.mock` 拦截 `PrismaService` 避免加载真实 PrismaClient），验证 ADR-0012 部分更新语义与 ADR-0011 seq 不变量/`@@unique` 冲突重试，仍零 DB、零 `@nestjs/testing` 容器（起始脚手架 e2e 套件已删）。

### 个性化推荐（ADR-0005/0006）

- `RecommendationService` 只注入 PrismaService（PrismaModule 全局），硬过滤读取 UserPreference；不 import 已移除的 Pantry 模块。
- 算法：硬过滤（忌口 ∪ 过敏原）→ 时间适配 3/11 + 健康目标 3/11 + 新鲜度轮换 5/11；轮换种子 = FNV-1a(userId + 当天日期)，无状态、当天稳定按天轮换（ADR-0017）。
- **依赖方向**：ChatModule → RecipeModule / IngredientModule / FavoriteModule / PreferenceModule / ConversationModule（单向，无循环）。推荐打分仍是首页与 `search_recipes` 工具的单一事实源。

### 数据库 — PostgreSQL + Prisma

Prisma Client 生成到 `generated/prisma/client/`（非默认路径）。`import { PrismaClient } from 'generated/prisma/client'` 导入。

使用 `@prisma/adapter-pg` 直接连接 PostgreSQL，不依赖连接池。

数据模型（`prisma/schema.prisma`）：
- **Recipe** — 菜谱（id, name, desc, cuisine, time, kcal, protein/carb/fat, img, tags, steps）。steps 为 Json（string[]）。原料不在本表（ADR-0019）。索引：cuisine, time
- **Ingredient / IngredientAlias / IngredientAllergen / RecipeIngredient** — 食材稳定身份、同物异名别名、过敏原关系与菜谱原料（ADR-0018/0019）。`RecipeIngredient` 是菜谱原料的唯一事实源：主键 `(recipeId, position)`（position 决定展示顺序，同一道菜可为同一身份保留多行，如「花椒」与「花椒粉」）；字段 name(展示名，已剥离括号说明) / amount / note(括号说明) / ingredientId。发布状态由 `Ingredient.published` 承载，审核资料文件是发布输入，`pnpm ingredients:import` 是唯一发布通道。过敏原关系无记录 = 信息未核查，不等于确认不含
- **User** — 用户（id, email, passwordHash, displayName, avatarUrl）
- **RefreshToken** — refresh token 轮换登记（ADR-0013；id, userId, tokenHash 唯一(bcrypt 哈希不落明文), expiresAt, createdAt；级联 FK；userId 索引）。一次一换，30 天滑动过期
- **（已移除）PantryItem** — Phase 7 删除库存实体与表；菜谱原料（`RecipeIngredient`）是菜谱内容，不是库存。
- **Favorite** — 收藏（userId + recipeId 唯一）
- **UserPreference** — 偏好档案（userId 唯一；dislikedIngredients/allergens/healthGoal）
- **Conversation** — 会话（ADR-0010/0012；userId, title, summary, summaryUpToSeq, updatedAt。summary 为滑窗外消息的压缩摘要，summaryUpToSeq 为摘要已覆盖到的消息 seq）。索引：userId + updatedAt
- **Message** — 消息（ADR-0010/0011；conversationId, seq 消息级序号(会话内 1 起单调递增,应用层 max+1,@@unique([conversationId,seq])), role string(user|assistant 实际两类,tool 信息在 assistant.parts 内), parts Json 原始 UIMessage parts 数组(保序,还原唯一来源)）。索引：conversationId + seq（唯一 + 普通）。content/toolCalls 列已砍（ADR-0011 死重量）

种子数据：`prisma/recipes-curated.ts`（人工精选）+ `prisma/staging/recipes-staging.json`（AI 生成待审区，存在才合并），按 name upsert 幂等。

### 认证（ADR-0013：双 token）

双 token 认证，access 短命 + refresh 滑动轮换：
1. `POST /auth/register` / `POST /auth/login` — 创建/验证用户，返回 `{ accessToken, refreshToken, user }`，并种 `shiguang_rt` httpOnly cookie（`Path=/auth`，30 天）
2. **access token**：JWT，payload `{ sub, email, type: 'access' }`，**15 分钟**过期（`auth.module.ts` 的 `expiresIn: '15m'`）。`JwtAuthGuard` 验签后断言 `type === 'access'` 防混淆
3. **refresh token**：opaque 随机串（非 JWT），DB 只存 bcrypt 哈希（`RefreshToken` 表），**30 天滑动过期**——每次 refresh 作废旧行发新行，新行 `expiresAt = now + 30d`
4. `POST /auth/refresh`（无 guard）— 凭 refresh token 认证（body 优先、cookie 兜底），成功返回新对 + 种新 cookie；**复用检测**：已作废 token 再提交 → 该用户全部 refresh 行整族吊销
5. `POST /auth/logout`（无 guard）— 按 refresh token 定位删行 + 清 cookie；幂等
6. 纯逻辑在 `auth/refresh-token.ts`（`issueRefreshToken`/`rotateRefreshToken`/`revokeRefreshToken`，显式依赖注入，单测友好）；`AuthService` 持有进程内 tombstone 登记供复用检测
7. 密码使用 bcryptjs (cost factor 12) 哈希

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
- **构建工具**：Nest 默认 tsc 构建（`nest build`）
