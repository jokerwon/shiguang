# ADR-0020: Jev 候选重排序接入线上搜索（候选池上限 + 模型生成软偏好 + 分阶段放量）

- **状态**：已接受（接入设计定稿；线上收益尚未验证，放量按门槛分阶段）
- **日期**：2026-10-09
- **Phase**：11
- **决策者**：Kai
- **关系**：消费 [Phase 10](../implementation/phase-10-implementation.md) 的离线实验结论（`continue`，净胜 13），不改动其场景、快照与结论。不改 [ADR-0005](./0005-personalized-recommendation.md) 的排序权重、[ADR-0017](./0017-remove-pantry-and-shopping-list.md) 的纯偏好排序、[ADR-0018](./0018-ingredient-catalog-and-filtering.md) 的安全边界与 [ADR-0019](./0019-recipe-ingredient-single-source.md) 的原料单一事实源。本 ADR 有意放宽 Phase 10「线上链路零改动」的实验隔离约束——接入即改动线上，故必须先有此决策。

## 背景 (Context)

Phase 10 离线实验对「完整合格候选」重排后，用户 30 场景盲评净胜 13（门槛 6），出口 `continue`＝建议继续接入设计。决策时点对真实代码核对的事实如下。

### 线上链路与两个形态缺口

- 线上 `search_recipes` 的返回是 `restrictRanked(ranked, filtered).slice(0, input.limit ?? 6)`（`src/chat/tools/read-tools-logic.ts:244`）：候选池 `restrictRanked(ranked, filtered)` 是**全部合格候选**（基线顺序），`slice` 只取前 `limit`；工具 schema 的 `limit` 上限为 **12**（`src/chat/tools/read-tools.ts:48-53`）。
- **缺口一（候选集）**：实验在候选池**全量**（4–19 道，均值 13.4；26/31 场景 >6 道）上重排。按已入库 `results.json` 复核，**Jev top4 平均只有 2.13/4 落在基线 top6 内**——若线上只重排 `slice` 后的 6 道，Jev 只能在固定 6 道内换序，约一半以上的收益来源被截断。
- **缺口二（软偏好来源）**：实验的 `soft.primary/secondary`（如「省事、步骤少、烹饪时间短」）是**人工固定**的（`src/experiment/scenarios.ts:47`）。线上 `buildSystemPrompt` 注入的动态上下文只有用户名、忌口/过敏、健康目标、季节与会话摘要（`src/chat/prompts/context-builder.ts:12-23`），**没有软偏好字段**；`search_recipes` 的入参只有结构化筛选条件（keyword/ingredients/cuisine/tags/maxTime/maxKcal/minProtein/limit）。软偏好只存在于用户消息文本里，由聊天模型理解——**线上必须由模型生成，其质量未经盲评验证**。

### 调用模型与依赖现状

- 实验协议：**1 候选 = 1 请求**（31/31 场景请求数等于候选数），串行发送并主动限流；均摊 1133 输入 / 78 输出 token；账号级限速 **100 RPM**（实测 429）。
- `@typesafe-ai/sdk@0.6.0` 当前在 `devDependencies`；Jev 调用与不变量检查在 `src/experiment/`（`jev.ts`），仅被离线脚本消费，不参与线上构建。
- 线上为流式 tool-loop：`chat.service` → `createChatTools` → `search_recipes.execute` → `runSearchRecipes`（`streamText` + `toUIMessageStream`）。重排发生在工具内，会进入模型可见的工具结果与整体响应时延。

### 既有约束

- 安全过滤与硬条件由代码先于模型执行，模型不得恢复被排除候选（ADR-0018 安全红线、Phase 10 不变量）。
- 服务端对第三方调用已有「如实报错、不静默降级为错误结果」的习惯；本 ADR 的回退是**回到基线排序**（正确结果），不是伪造结果。

## 决策 (Decision)

### 1. 接入位置与语义

- 在 `runSearchRecipes` 内部、`rankRecipes` 之后、`slice` 之前对**候选池**重排：`restrictRanked(ranked, filtered)` → Jev 重排 → `slice(0, limit)`。
- 重排**只改顺序**：不增删候选、不改变 `count`/`note`/`error`/`ingredients` 语义、不参与安全过滤、不改变 `rankRecipes` 的权重与轮换种子（`rankRecipes` 本身不改，共享排序保持单一事实源）。
- 重排的输入顺序即 `rankRecipes` 的输出顺序（基线顺序），用于同分与不可评价候选的稳定回退。

### 2. 候选池上限

- 新增 `JEV_RERANK_MAX_CANDIDATES`（默认 **12**，与工具 `limit` 上限一致）：仅对候选池**前 N 道**送模型重排，其余候选保持基线相对顺序追加在后。
- 上限是显式的容量/收益权衡旋钮，不是硬编码常量；调整需走放量门槛复核。

### 3. 软偏好来源

- 扩 `search_recipes` 的 `inputSchema`，新增**可选** `demand`：`{ primary: string; secondary?: string }`，由聊天模型按用户原话填写（主/次偏好及优先级），与实验 `soft` 字段语义一致。
- 工具描述明确：**填不出或用户未表达偏好就不要填**，宁可不重排也不猜。
- `demand` 缺失、为空或字段非法 → 本次不重排，返回基线顺序（不报错、不提示）。

### 4. 协议

- 保持 Phase 10 已验证的**单候选、并列两问**协议（资料充分性 Choice + 四级匹配 Score），不引入批量提问：批量会引入候选间比较干扰，会使已有 30 场景证据失效。
- 只有「资料足够」才消费 Score；「资料不足」「无法确定」后置但保留；同分沿用基线顺序（与实验 `rerank` 语义一致）。

### 5. 降级、超时与开关

- 整段重排有总超时预算 `JEV_RERANK_TIMEOUT_MS`（默认 **1500**）：超时、异常、未配置凭证、预算超限、SDK 错误一律**回退基线顺序**，不抛错、不阻塞工具、不向用户暴露失败。
- 新增 `JEV_RERANK_ENABLED`（默认 **`false`**）：未开启时 `runSearchRecipes` 的返回与当前**逐字节一致**（离线回归保证）。
- 预算：沿用实验的保守估算与累计上限，超限即回退而非继续调用。

### 6. 数据边界

- 只发送：菜谱事实（名称/简介/菜系/标签/时长/营养/原料/步骤）与模型生成的 `demand` 文本。
- **不发送**：用户标识、原始聊天消息全文、偏好档案原文（忌口/过敏/健康目标）。
- `demand` 由模型概括，不含姓名、联系方式或用户未在本次需求中表达的个人信息。

### 7. 依赖方向

- `@typesafe-ai/sdk` 从 `devDependencies` 移到 `dependencies`（生产依赖，随部署安装；Node ≥20 已是项目要求）。
- 把 Jev 调用、问题构造、`rerank` 与 `checkRerankInvariants` 从 `src/experiment/` 提取为生产模块（`src/recipe/jev-rerank/`），**离线评估与线上接入复用同一模块**，不允许第二套实现。`src/experiment/` 继续只做场景、快照与评估统计。

### 8. 放量与可观测性

- 三阶段放量，按用户 id 稳定分桶：
  1. **影子**：计算重排并记录结果，**不改变返回顺序**。
  2. **灰度**：按 `JEV_RERANK_ROLLOUT_PERCENT` 生效。
  3. **全量**：默认比例 100。
- 每次搜索记录：候选池大小、实际调用数、重排耗时、降级原因、失败数，用于放量门槛判定。

## 理由 (Rationale)

- 在候选池（而非 `slice` 后）重排，是唯一能让实验收益在线上存活的位置；把上限做成旋钮而非硬编码，是因为「收益 vs 调用量」在线上形态下尚未量化（见后果）。
- 保持单候选协议 = 保持 Phase 10 全部证据有效；换协议等于重做实验，成本高于收益。
- 默认关闭 + 超时回退 + 基线回退，使第三方可用性、限速与费用问题**不影响**线上正确性：最坏情况退化为当前行为。
- 依赖方向明确（提取生产模块而非复制），避免实验与线上两套 Jev 实现分叉——这是 Phase 9 单事实源教训的同类应用。

## 备选方案 (Alternatives Considered)

- **只重排线上 `slice` 后的 top6**：改动最小、调用最少（6 次），但已复核约一半以上收益来源被截断，且无法证明线上收益；拒绝作为唯一形态，改为候选池上限可调。
- **批量提问（一次评 K 个候选）**：调用数可降为 1/K，但引入候选间比较干扰，Phase 10 协议结论不成立，需重做一轮盲评；本轮不采用。
- **把软偏好塞进 `rankRecipes` 的现有权重**：现有权重只表达时间/营养/健康目标，无法表达「省事」「下饭」这类文本偏好；拒绝。
- **不接入，仅保留离线实验**：开关默认关闭即等价于该选项，作为随时可退的兜底保留。
- **改用官方端点自建 prompt（不经 SDK）**：Phase 10 已定选型 `@typesafe-ai/sdk`，不重复选型。

## 后果 (Consequences)

- **线上收益未经盲评验证**（候选池 ≤12 + 模型生成 `demand` 与实验形态不同），因此**不得直接全量**；必须按下列事先固定的门槛放量：
  - **影子阶段**：≥200 次真实搜索、降级率 <5%、重排 p95 耗时 <1.5s、0 次因重排导致的工具错误。
  - **灰度阶段**：用户盲评或点击对比净胜 >0，且无安全/硬条件回归。
  - 门槛不满足 → 停在影子或关闭开关。
- **成本与容量**：每次搜索调用数 = min(候选池, 上限)，账号 RPM 100 是硬上限（12 候选时约 8 次搜索/分钟）；估算每千次搜索（12 候选）≈ US$0.6（估算，非账单，价格与计费条件未核实）。需并发限流与降级兜底。
- **新增第三方可用性依赖**：已用超时 + 基线回退 + 默认关闭隔离，线上正确性不依赖其可用性。
- `@typesafe-ai/sdk` 进入生产依赖，部署需安装。
- 若日后改批量协议，本 ADR 的单候选协议结论作废，必须重跑盲评。
- 文档同步：`docs/README.md` 索引、`docs/glossary.md` 术语、`docs/implementation/phase-11-implementation.md` 实施清单与对应验收清单。
