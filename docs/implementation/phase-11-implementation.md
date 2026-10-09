# Phase 11 实施清单：Jev 候选重排序接入线上搜索

> 依据 [ADR-0020](../adr/0020-jev-rerank-online-integration.md)。Phase 10 的离线实验结论（净胜 13、`continue`）只覆盖「全量合格候选 + 人工固定软偏好」，本 Phase 把它接入线上搜索，并如实记录形态缺口带来的未验证项。
>
> 验收清单：[phase-11-checklist.md](../acceptance/phase-11-checklist.md)。
>
> **状态（2026-10-09）**：A–F 与 G1 已实施并验证；G2/G3/G4 **未执行**——它们分别需要付费真实调用、真实流量与人工盲评，见各组备注。**接入实现完成 ≠ 已放量**：`JEV_RERANK_MODE` 默认 `off`。

## 关键前置发现

以下均为 2026-10-09 对真实代码与已入库运行工件的核对结果，不是推断。

| # | 事实 | 来源 |
|---|------|------|
| F1 | 候选池 = `restrictRanked(ranked, filtered)`（全部合格候选，基线顺序），返回 = 池 `.slice(0, input.limit ?? 6)` | `apps/server/src/chat/tools/read-tools-logic.ts` |
| F2 | 工具 schema `limit` 上限 12、默认 6；`execute` 直接调 `runSearchRecipes(deps, userId, input)`，不注入时间 | `apps/server/src/chat/tools/read-tools.ts` |
| F3 | `rankRecipes(recipes, signals, ctx, seed, limit)` 是共享排序唯一入口，`ScorableRecipe` 只需 id/time/kcal/carb/protein | `apps/server/src/recipe/recommendation.scoring.ts` |
| F4 | 线上动态上下文只有用户名、忌口/过敏、健康目标、季节、会话摘要，**无软偏好字段** | `apps/server/src/chat/prompts/context-builder.ts` |
| F5 | 工具集按请求装配：`chat.service` → `createChatTools(this.toolDeps(), userId)` → 流式 tool-loop | `apps/server/src/chat/chat.service.ts` |
| F6 | Jev 实现（问题构造/`rerank`/`checkRerankInvariants`/`JEV_MODEL`）原在离线层，只被 `scripts/experiment.ts` 消费 | `apps/server/src/experiment/jev.ts` |
| F7 | `@typesafe-ai/sdk@0.6.0` 原在 `devDependencies`；实验脚本为 `experiment:snapshot/run/blind/review` | `apps/server/package.json` |
| F8 | 实验协议为 **1 候选 = 1 请求**，31/31 场景请求数等于候选数；实验场景候选 4–19 道（均值 13.4），26/31 场景 >6 道 | `experiments/phase-10/runs/2026-10-08_10-25-15/results.json` |
| F9 | **Jev top4 平均只有 2.13/4 落在基线 top6 内** → 只重排 `slice` 后的 6 道会截断约一半以上收益来源 | 同上，逐场景复核 |
| F10 | 账号级限速 100 RPM（实测 429）；均摊 1133 输入 / 78 输出 token；单次 p50 439ms / p95 605ms / 最大 20.9s | 同上 + Phase 10 实施清单 |
| F11 | `let filtered = recipes` 且所有筛选可选 → **无参查询时候选池 = 全库**。2026-10-09 对 live 库实测：某真实用户无筛选搜索的候选池 **62 道**（库 88 道经安全过滤后） | `read-tools-logic.ts` + 真实数据库冒烟 |
| F12 | 线上 `findRecipes()` 返回完整 Prisma `Recipe` + `ingredientLinks`（含 `desc`/`steps`/营养），足以构造与实验同一份事实视图 | `apps/server/src/chat/chat.service.ts` |

## A 提取生产模块

| # | 任务 | 完成判据 | 状态 |
|---|------|---------|------|
| A1 | 新建 `apps/server/src/recipe/jev-rerank/`：迁移 `JEV_MODEL`、`ADEQUACY_*`、`MATCH_RUBRIC`、`buildQuestions`、`buildState`、`renderFacts`、`rerank`、`checkRerankInvariants`、`RecipeFactView`、`toFactView` 与相关类型 | 迁移后 `src/experiment/jev.ts` 只做 re-export，无第二套实现 | [x] `protocol.ts` 承载全部协议；`experiment/jev.ts` 只剩 3 行注释 + 一条 re-export；事实视图映射（`toFactView`）也移入生产模块，`experiment/candidates.ts` 改为调用它 |
| A2 | 新增重排客户端：封装 `systemOne` 调用、令牌桶限流、总超时、预算累计与失败计数；凭证只从 env 读 | 单测覆盖超时、失败、未配置凭证三种回退 | [x] `client.ts` + `from-env.ts`；`client.spec.ts` 13 例、`from-env.spec.ts` 5 例 |
| A3 | `src/experiment/jev.spec.ts` 与评估脚本改为消费生产模块 | 现有 5 例 jev 回归不改断言即通过 | [x] 仅 `buildState` 调用点适配新签名（`{request, demand}`），断言未改；5 例通过 |

## B 工具契约

| # | 任务 | 完成判据 | 状态 |
|---|------|---------|------|
| B1 | `SearchInput` 增可选 `demand: { primary: string; secondary?: string }` | 类型导出，离线场景可直接复用该类型 | [x] 新增共享类型 `Demand`，`SearchInput.demand` 使用它 |
| B2 | 工具 schema 增 `demand` 字段与描述：由模型按用户原话填写主/次偏好；**填不出或用户未表达偏好就不要填** | schema 与描述落盘，人工复核措辞 | [x] 描述明写「填不出就不要填——缺失时不会重排，宁可不猜」与「不要写成筛选条件」 |
| B3 | 非法/空白 `demand` 归一为「缺失」 | 单测：`{}`、空白串、缺 primary 三种输入均不触发重排 | [x] `normalizeDemand` + 2 例 seam 测试（缺 demand、空白主偏好）；schema 层 `required: ['primary']` 与归一互为兜底 |

## C 接入 `runSearchRecipes`

| # | 任务 | 完成判据 | 状态 |
|---|------|---------|------|
| C1 | 在 `ranked` 之后、`slice` 之前插入重排：取候选池前 `JEV_RERANK_MAX_CANDIDATES` 道送重排，其余按基线顺序追加 | 顺序变化只发生在池内，集合与 `count` 不变 | [x] 上限在客户端执行（容量控制器只此一处）；`applyOrder` 只做置换、缺失 id 忽略、池内未出现的候选按基线补齐 |
| C2 | 开关关闭时返回与当前**逐字节一致** | 冻结重放回归：同一输入两次运行结果相同且与改动前快照一致 | [x] 关闭态离线重放 38/38 场景的候选集与基线前 4 与 Phase 10 工件**逐场景一致**（见下方运行记录） |
| C3 | 降级：超时/异常/未配置/预算超限/`demand` 缺失 → 基线顺序，不改 `note`/`error`/`ingredients` | 单测：注入必失败客户端，结果等于基线 | [x] 客户端侧：超时/失败/限流/预算/不变量 → 回退；搜索侧：`applied=false` 忽略 order、客户端抛错不冒泡（try/catch） |
| C4 | 安全与硬条件仍先于重排执行；重排不得恢复被排除候选 | 复用 Phase 10 `checkRerankInvariants`，违规数 0 | [x] 客户端对池内候选跑不变量检查，违规即回退；seam 测试覆盖「返回含被排除候选/重复 id 时结果不增不减不重复」与「重排不改变安全过滤结果」 |

## D 配置与依赖

| # | 任务 | 完成判据 | 状态 |
|---|------|---------|------|
| D1 | `@typesafe-ai/sdk` 从 `devDependencies` 移到 `dependencies` | `pnpm install` 后生产构建可用 | [x] 已移动，`pnpm install --no-frozen-lockfile` 同步 lockfile，`nest build` 通过 |
| D2 | 新增 env：`JEV_RERANK_MODE`（`off`/`shadow`/`live`，默认 `off`）、`JEV_RERANK_MODEL`（启用时必填）、`JEV_RERANK_MAX_CANDIDATES`（12）、`JEV_RERANK_TIMEOUT_MS`（2000）、`JEV_RERANK_ROLLOUT_PERCENT`（0）、`JEV_RERANK_RPM`（90）、`JEV_RERANK_BUDGET_USD`（0=不限）；凭证复用 `TYPESAFE_API_KEY`/`TYPESAFE_BASE_URL` | 缺省值使线上行为与当前一致 | [x] 缺省 `off` → 工厂返回 `undefined` → 搜索路径不构造事实视图、不发请求；启用但缺凭证时**告警并保持关闭**，不让启动失败 |
| D3 | `.env.example` 补条目（仅占位，不含真实值） | 人工复核，无密钥入库 | [x] 逐项注释默认值与用途；密钥项留空 |

**模型名不设默认**：代理路由名（`g-jev-1.13`）与官方版本名（`jev-1.13.0`）不同，代码里硬编码任何一个都会在另一套环境静默失败，因此启用时由环境显式提供。

## E 可观测性与影子模式

| # | 任务 | 完成判据 | 状态 |
|---|------|---------|------|
| E1 | 每次搜索记录：候选池大小、实际调用数、重排耗时、是否生效、降级原因、失败数 | 日志字段落盘，可被放量门槛脚本读取 | [x] 客户端 `onOutcome` 回调 → `chat.module` 注入 Nest `Logger('JevRerank')`，单行输出上述字段 |
| E2 | 影子模式：计算重排并记录「基线前 N vs 重排前 N」差异，**不改变返回顺序** | 影子开启时返回与关闭时逐字节一致 | [x] 影子同步执行、`applied=false`；回调额外收到 `request`，据此输出 `影子对比 前N｜基线：…｜重排：…`（N = 本次 `limit`）。**代价已写明**：影子付出与生效路径相同的延迟与费用，只是丢弃排序结果 |

## F 灰度分桶

| # | 任务 | 完成判据 | 状态 |
|---|------|---------|------|
| F1 | 按 `userId` 稳定分桶（复用既有 hash 习惯），比例 = `JEV_RERANK_ROLLOUT_PERCENT` | 同一用户多次搜索落同一桶；比例 0/100 为边界 | [x] `bucketOf` 用与 `dailySeed` 同款 FNV-1a，取模 100；测试覆盖稳定性与 0%（不生效）/100%（生效） |

## G 验证与放量前置

| # | 任务 | 完成判据 | 状态 |
|---|------|---------|------|
| G1 | 全量回归 + lint + 构建 | `pnpm --filter @shiguang/server test`、`pnpm -r lint`、`pnpm build` 全过 | [x] 19 套件 / 190 例通过（Phase 10 基线 17/163，新增 27 例）；`pnpm -r lint` 干净；`nest build` 通过 |
| G2 | 真实冒烟：开启开关后走一次真实 SSE 搜索，核对菜谱顺序与降级行为 | 真实请求与响应记录，非测试桩 | [ ] **未执行**——需付费授权（真实 Jev 调用 + 对话模型）。已完成的替代证据见下方「真实数据库冒烟」：走通真实 DB 与真实搜索链路，但重排客户端为桩 |
| G3 | 影子阶段门槛观测（≥200 次真实搜索、降级率 <5%、p95 重排 <1.5s、0 次工具错误） | 需真实流量，标记为放量前置；未达标不进灰度 | [ ] **未执行**——需真实流量 |
| G4 | 灰度阶段收益判定（盲评或点击对比净胜 >0，无安全/硬条件回归） | 需人工评审，代理不得代评 | [ ] **未执行**——需人工评审 |

## 运行记录（2026-10-09）

- **关闭态离线重放**：`pnpm experiment:run`（不带 `--execute`，0 次模型调用）产出 38 个场景；与 Phase 10 冻结工件 `runs/2026-10-08_10-25-15/results.json` 逐场景比对**候选集与基线前 4 全部一致（38/38，差异 0）**。临时运行目录比对后删除。
- **真实数据库冒烟**（一次性脚本，验证后删除）：直连 live 库，构造真实 `ChatToolDeps`（真实 `RecipeSafetyService`/`IngredientService`/`RecommendationService`），重排客户端为桩。结果：真实用户无筛选搜索候选池 **62 道**（印证 F11：池是全库而非实验场景的 4–19）；交给模型的事实视图菜系/标签已是中文（`家常`、`快手`/`高蛋白`），**无 `HOME`/`QUICK` 之类内部 key 泄漏**；`limit=6` 下重排顺序生效、返回 6 条。
- **服务启动**：`pnpm start` 完成 Nest 模块初始化（全部路由映射、`Nest application successfully started`），确认新增的可选 provider 不破坏依赖图。本机 3001 端口已有其他进程占用，故未在该端口完成监听。
- **未执行**：G2 的真实 SSE 全链路（需付费授权）、G3 真实流量门槛、G4 人工评审。

## 遗留与边界

- 线上形态（候选池 ≤12 + 模型生成 `demand`）的收益**未经盲评**，与 Phase 10 结论不可直接等同；这是本 Phase 的主要未验证项。
- **呈现层未验证**：搜索结果会经聊天模型复述，Jev 的排序偏好是否等价于用户最终所见，未经验证。
- 账号价格与计费条件仍未核实（Phase 10 A2/A3），成本一律为估算。
- 批量提问协议未采用；若日后采用，Phase 10 的单候选协议结论作废，须重跑盲评。
- 影子模式不是「零成本观测」：它与生效路径付出相同的延迟与费用。
