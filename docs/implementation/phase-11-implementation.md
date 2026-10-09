# Phase 11 实施清单：Jev 候选重排序接入线上搜索

> 依据 [ADR-0020](../adr/0020-jev-rerank-online-integration.md)。Phase 10 的离线实验结论（净胜 13、`continue`）只覆盖「全量合格候选 + 人工固定软偏好」，本 Phase 把它接入线上搜索，并如实记录两个形态缺口带来的未验证项。
>
> **本清单是设计，不是已完成的实施**；勾选项须有真实运行/回归证据，未执行一律不勾。
> 验收清单：[phase-11-checklist.md](../acceptance/phase-11-checklist.md)（全部未勾选；接入实现完成 ≠ 已放量）。

## 关键前置发现

以下均为 2026-10-09 对真实代码与已入库运行工件的核对结果，不是推断。

| # | 事实 | 来源 |
|---|------|------|
| F1 | 候选池 = `restrictRanked(ranked, filtered)`（全部合格候选，基线顺序），返回 = 池 `.slice(0, input.limit ?? 6)` | `apps/server/src/chat/tools/read-tools-logic.ts:244` |
| F2 | 工具 schema `limit` 上限 12、默认 6；`execute` 直接调 `runSearchRecipes(deps, userId, input)`，不注入时间 | `apps/server/src/chat/tools/read-tools.ts:48-57` |
| F3 | `rankRecipes(recipes, signals, ctx, seed, limit)` 是共享排序唯一入口，`ScorableRecipe` 只需 id/time/kcal/carb/protein | `apps/server/src/recipe/recommendation.scoring.ts:39-51` |
| F4 | 线上动态上下文只有用户名、忌口/过敏、健康目标、季节、会话摘要，**无软偏好字段** | `apps/server/src/chat/prompts/context-builder.ts:12-23` |
| F5 | 工具集按请求装配：`chat.service` → `createChatTools(this.toolDeps(), userId)` → 流式 tool-loop | `apps/server/src/chat/chat.service.ts:111-114` |
| F6 | Jev 实现（问题构造/`rerank`/`checkRerankInvariants`/`JEV_MODEL`）当前在离线层，只被 `scripts/experiment.ts` 消费 | `apps/server/src/experiment/jev.ts` |
| F7 | `@typesafe-ai/sdk@0.6.0` 在 `devDependencies`；实验脚本为 `experiment:snapshot/run/blind/review` | `apps/server/package.json` |
| F8 | 实验协议为 **1 候选 = 1 请求**，31/31 场景请求数等于候选数；候选池 4–19 道（均值 13.4），26/31 场景 >6 道 | `experiments/phase-10/runs/2026-10-08_10-25-15/results.json` |
| F9 | **Jev top4 平均只有 2.13/4 落在基线 top6 内** → 只重排 `slice` 后的 6 道会截断约一半以上收益来源 | 同上，逐场景复核 |
| F10 | 账号级限速 100 RPM（实测 429）；均摊 1133 输入 / 78 输出 token | 同上 + Phase 10 实施清单 |

## A 提取生产模块

| # | 任务 | 完成判据 |
|---|------|---------|
| A1 | 新建 `apps/server/src/recipe/jev-rerank/`：从 `src/experiment/jev.ts` 迁移 `JEV_MODEL`、`ADEQUACY_*`、`MATCH_RUBRIC`、`buildQuestions`、`buildState`、`renderFacts`、`rerank`、`checkRerankInvariants` 与相关类型 | 迁移后 `src/experiment/jev.ts` 只做 re-export，无第二套实现 |
| A2 | 新增 `JevRerankClient`：封装 `systemOne` 调用、限流（RPM）、总超时、预算累计与失败计数；凭证只从 env 读 | 单测覆盖超时、非零失败、未配置凭证三种回退 |
| A3 | `src/experiment/jev.spec.ts` 与评估脚本改为消费生产模块 | 现有 5 例 jev 回归不改断言即通过 |

**验收**：`pnpm --filter @shiguang/server test` 全绿；`grep` 确认 Jev 调用只存在于 `src/recipe/jev-rerank/`（`src/experiment/` 仅 re-export）。

## B 工具契约

| # | 任务 | 完成判据 |
|---|------|---------|
| B1 | `SearchInput` 增可选 `demand: { primary: string; secondary?: string }`（语义同实验 `soft`） | 类型导出，离线场景可直接复用该类型 |
| B2 | `read-tools.ts` schema 增 `demand` 字段与描述：由模型按用户原话填写主/次偏好；**填不出或用户未表达偏好就不要填** | schema 与描述落盘，人工复核措辞 |
| B3 | 非法/空白 `demand` 归一为「缺失」 | 单测：`{}`、空白串、缺 primary 三种输入均不触发重排 |

**验收**：工具 schema 变更后既有 `index.spec.ts` 全过；新增 3 例归一测试。

## C 接入 `runSearchRecipes`

| # | 任务 | 完成判据 |
|---|------|---------|
| C1 | 在 `ranked` 之后、`slice` 之前插入重排：取候选池前 `JEV_RERANK_MAX_CANDIDATES` 道送重排，其余按基线顺序追加 | 顺序变化只发生在池内，集合与 `count` 不变 |
| C2 | 开关关闭时返回与当前**逐字节一致** | 冻结重放回归：同一输入两次运行结果相同且与改动前快照一致 |
| C3 | 降级：超时/异常/未配置/预算超限/`demand` 缺失 → 基线顺序，不改 `note`/`error`/`ingredients` | 单测：注入必失败客户端，结果等于基线 |
| C4 | 安全与硬条件仍先于重排执行；重排不得恢复被排除候选 | 复用 Phase 10 `checkRerankInvariants`，违规数 0 |

**验收**：候选池 4–19 道的冻结快照重放，集合不变、`count` 不变、不变量 0 违规；关闭开关时与改动前结果一致。

## D 配置与依赖

| # | 任务 | 完成判据 |
|---|------|---------|
| D1 | `@typesafe-ai/sdk` 从 `devDependencies` 移到 `dependencies` | `pnpm install` 后生产构建可用 |
| D2 | 新增 env：`JEV_RERANK_ENABLED`（默认 `false`）、`JEV_RERANK_MAX_CANDIDATES`（默认 12）、`JEV_RERANK_TIMEOUT_MS`（默认 1500）、`JEV_RERANK_ROLLOUT_PERCENT`（默认 0）；凭证复用 `TYPESAFE_API_KEY`/`TYPESAFE_BASE_URL`/`TYPESAFE_DEFAULT_MODEL` | 缺省值使线上行为与当前一致 |
| D3 | `.env.example` 补条目（仅占位，不含真实值） | 人工复核，无密钥入库 |

**验收**：`pnpm build` 通过；启动时未配置凭证不报错（开关默认关）。

## E 可观测性与影子模式

| # | 任务 | 完成判据 |
|---|------|---------|
| E1 | 每次搜索记录：候选池大小、实际调用数、重排耗时、降级原因、失败数 | 日志/指标字段落盘，可被放量门槛脚本读取 |
| E2 | 影子模式：计算重排并记录「基线前 6 vs 重排前 6」差异，**不改变返回顺序** | 影子开启时返回与关闭时逐字节一致 |

**验收**：影子模式实跑一次真实搜索，产出对比记录且返回未变。

## F 灰度分桶

| # | 任务 | 完成判据 |
|---|------|---------|
| F1 | 按 `userId` 稳定分桶（复用既有 hash 习惯），比例 = `JEV_RERANK_ROLLOUT_PERCENT` | 同一用户多次搜索落同一桶；比例 0/100 为边界 |

**验收**：单测覆盖 0%、100%、中间比例的稳定性与分布。

## G 验证与放量前置

| # | 任务 | 完成判据 |
|---|------|---------|
| G1 | 全量回归 + lint + 构建 | `pnpm --filter @shiguang/server test`、`pnpm -r lint`、`pnpm build` 全过 |
| G2 | 真实冒烟：开启开关后走一次真实 SSE 搜索，核对菜谱顺序与降级行为 | 真实请求与响应记录，非测试桩 |
| G3 | 影子阶段门槛观测（≥200 次真实搜索、降级率 <5%、p95 重排 <1.5s、0 次工具错误） | 需真实流量，标记为放量前置；未达标不进灰度 |
| G4 | 灰度阶段收益判定（盲评或点击对比净胜 >0，无安全/硬条件回归） | 需人工评审，代理不得代评 |

**验收**：G1/G2 完成后本 Phase 的**接入实现**才算交付；G3/G4 是放量门槛，未达成则停在影子或关闭开关——**接入实现完成 ≠ 已放量**。

## 遗留与边界

- 线上形态（候选池 ≤12 + 模型生成 `demand`）的收益**未经盲评**，与 Phase 10 结论不可直接等同；这是本 Phase 的主要未验证项。
- 账号价格与计费条件仍未核实（Phase 10 A2/A3），成本一律为估算。
- 批量提问协议未采用；若日后采用，Phase 10 的单候选协议结论作废，须重跑盲评。
