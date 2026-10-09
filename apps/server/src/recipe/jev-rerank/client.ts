// Jev 重排客户端：把单候选判断协议接到模型服务上，并负责限流、超时、预算与放量模式。
//
// 契约要点（ADR-0020 决策 4/5/8）：
// - 候选请求**并行**派发（并发上限 = 候选数），由全局令牌桶统一限速；串行 + 账号限速会让
//   候选数变成墙钟延迟，秒级超时必然失败。
// - 令牌桶不足**立即放弃**并回退基线，不排队——不把限速变成用户可见延迟。
// - 影子模式同步执行：付出与生效路径相同的延迟与费用，只是丢弃排序结果（`applied=false`）。
// - 任何异常、超时、不变量违规、缺候选都回退基线顺序，本方法**不抛错**。
import type { RequestOptions, SystemOneResult } from '@typesafe-ai/sdk';
import {
  buildQuestions,
  buildState,
  checkRerankInvariants,
  rerank,
  type CandidateJudgement,
  type Demand,
  type JevQuestions,
  type RecipeFactView,
} from './protocol';

/** 放量模式：关闭 / 影子（算但不生效）/ 生效 */
export type RerankMode = 'off' | 'shadow' | 'live';

export interface RerankRequest {
  userId: string;
  demand: Demand;
  /** 基线顺序的候选事实 */
  candidates: RecipeFactView[];
  /** 本次要返回给用户的条数：影子对比只看这个窗口（候选池远大于它） */
  limit: number;
}

export interface RerankOutcome {
  /** 完整候选 id 的置换；未生效时等于基线顺序 */
  order: string[];
  /** true = 调用方应采用 `order`；false = 保持基线（关闭/影子/回退） */
  applied: boolean;
  /** 未生效或降级原因，供观测与区分「服务故障」和「容量用尽」 */
  reason?: string;
  /** 本次候选池大小（用于观测与容量判断） */
  candidates: number;
  requests: number;
  durationMs: number;
  failures: number;
}

/** 工具层依赖的重排契约（重排只返回顺序与诊断，不接触筛选与安全） */
export interface RerankClient {
  rerank(req: RerankRequest): Promise<RerankOutcome>;
}

/** 单次判断的模型输出（已从 SDK 响应里取出排序需要的字段） */
export interface JudgeResult {
  adequacy: string;
  score: number | null;
  inputTokens: number;
  outputTokens: number;
  raw: unknown;
}

/** 判断端口：线上由 SDK 实现，测试注入假实现 */
export interface JudgePort {
  judge(
    state: string,
    questions: JevQuestions,
    timeoutMs: number,
  ): Promise<JudgeResult>;
}

/** 单次判断的尝试结果：失败不抛出，由调用方统一回退基线 */
export type JudgeAttempt =
  | {
      status: 'fulfilled';
      recipeId: string;
      value: JudgeResult & { elapsedMs: number };
    }
  | { status: 'rejected'; recipeId: string };

export interface JevRerankOptions {
  mode: RerankMode;
  /** 生效比例（0–100），仅 mode='live' 时有意义 */
  rolloutPercent?: number;
  /** 候选池上限 = 单次搜索最大调用数 */
  maxCandidates: number;
  /** 单次搜索的墙钟预算（毫秒），不覆盖令牌桶排队 */
  timeoutMs: number;
  /** 令牌桶补充速率（次/分钟） */
  rpm: number;
  /** 累计预算上限（US$）；0 或省略表示不限 */
  budgetUsd?: number;
  /** 估算用单价（US$/百万 token） */
  pricePerMTok: number;
  /** 观测回调：每次重排结束调用一次 */
  onOutcome?: (outcome: RerankOutcome, request: RerankRequest) => void;
  now?: () => number;
}

/** 按 userId 稳定分桶到 0–99（FNV-1a，与 `dailySeed` 同一风格） */
export function bucketOf(userId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 100;
}

/** 令牌桶：补充速率按分钟计，容量为单次搜索可突发量 */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly ratePerMin: number,
    private readonly capacity: number,
    private readonly now: () => number,
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  /** 一次性取走 n 个令牌；不足返回 false，调用方据此回退（不等待） */
  tryAcquire(n: number): boolean {
    const t = this.now();
    const elapsedMin = Math.max(0, t - this.last) / 60_000;
    this.tokens = Math.min(
      this.capacity,
      this.tokens + elapsedMin * this.ratePerMin,
    );
    this.last = t;
    if (this.tokens + 1e-9 < n) return false;
    this.tokens -= n;
    return true;
  }
}

const TIMED_OUT = Symbol('timed-out');

export class JevRerankClient implements RerankClient {
  private readonly bucket: TokenBucket;
  private readonly now: () => number;
  private spentUsd = 0;

  constructor(
    private readonly judge: JudgePort,
    private readonly options: JevRerankOptions,
  ) {
    this.now = options.now ?? (() => Date.now());
    this.bucket = new TokenBucket(options.rpm, options.maxCandidates, this.now);
  }

  /** 累计估算费用（US$），供观测与预算判断 */
  get estimatedCostUsd(): number {
    return this.spentUsd;
  }

  async rerank(req: RerankRequest): Promise<RerankOutcome> {
    const startedAt = this.now();
    const baseline = req.candidates.map((c) => c.id);
    const finish = (
      o: Omit<RerankOutcome, 'durationMs' | 'candidates'>,
    ): RerankOutcome => {
      const full = {
        ...o,
        candidates: baseline.length,
        durationMs: this.now() - startedAt,
      };
      // 观测失败不能影响重排结果：本方法对外承诺不抛错
      try {
        this.options.onOutcome?.(full, req);
      } catch {
        // 观测回调抛错只丢观测，不影响返回
      }
      return full;
    };
    const fallback = (reason: string, failures = 0) =>
      finish({
        order: baseline,
        applied: false,
        reason,
        requests: 0,
        failures,
      });

    if (this.options.mode === 'off') return fallback('disabled');
    if (baseline.length === 0) return fallback('no-candidates');
    const budgetUsd = this.options.budgetUsd ?? 0;
    if (
      this.options.mode === 'live' &&
      bucketOf(req.userId) >= (this.options.rolloutPercent ?? 0)
    ) {
      return fallback('rollout');
    }

    const limit = Math.min(baseline.length, this.options.maxCandidates);
    const picked = req.candidates.slice(0, limit);
    const rest = baseline.slice(limit);

    // 预算：派发前**预留整批**的保守上界，成功后再按实际用量结算。
    // 只做「派发前查一次已花费」会让并发搜索一起越过上限；只统计成功响应会漏掉
    // 超时/失败请求的实际计费。失败路径不结算，预留保留（偏保守，宁可早停）。
    const reserve = budgetUsd > 0 ? this.estimateUsd(picked, req.demand) : 0;
    if (budgetUsd > 0 && this.spentUsd + reserve > budgetUsd) {
      return fallback('budget');
    }
    this.spentUsd += reserve;

    if (!this.bucket.tryAcquire(picked.length)) {
      this.spentUsd -= reserve;
      return fallback('rate-limit');
    }

    const brief = { demand: req.demand };
    const questions = buildQuestions(req.demand);
    const timeoutMs = this.options.timeoutMs;
    const settle = await this.runAll(picked, brief, questions, timeoutMs);
    if (settle.timedOut) {
      return finish({
        order: baseline,
        applied: false,
        reason: 'timeout',
        requests: picked.length,
        failures: picked.length,
      });
    }

    const judgements: CandidateJudgement[] = [];
    let failures = 0;
    let actualUsd = 0;
    for (const r of settle.results) {
      if (r.status !== 'fulfilled') {
        failures += 1;
        continue;
      }
      actualUsd +=
        ((r.value.inputTokens + r.value.outputTokens) / 1_000_000) *
        this.options.pricePerMTok;
      judgements.push({
        recipeId: r.recipeId,
        adequacy: r.value.adequacy,
        score: r.value.score,
        elapsedMs: r.value.elapsedMs,
        raw: r.value.raw,
      });
    }

    // 判断不完整就不排序：半个候选集的排序无法与基线公平比较
    if (failures > 0) {
      return finish({
        order: baseline,
        applied: false,
        reason: 'failure',
        requests: picked.length,
        failures,
      });
    }

    // 结算：用实际用量替换预留。失败/超时/不变量违规的路径不结算，预留保留
    // （已发出的请求无法确认用量，宁可高估也不让预算悄悄越界）
    this.spentUsd += actualUsd - reserve;

    const pickedOrder = rerank(
      picked.map((c) => c.id),
      judgements,
    );
    const violations = checkRerankInvariants(
      picked.map((c) => c.id),
      judgements,
      pickedOrder,
    );
    if (violations.length > 0) {
      return finish({
        order: baseline,
        applied: false,
        reason: 'invariant',
        requests: picked.length,
        failures: 0,
      });
    }

    // 池外候选保持基线相对顺序，追加在后
    const order = [...pickedOrder, ...rest];
    const shadow = this.options.mode === 'shadow';
    return finish({
      order,
      applied: !shadow,
      ...(shadow ? { reason: 'shadow' } : {}),
      requests: picked.length,
      failures: 0,
    });
  }

  /**
   * 整批请求的保守上界估算（1 token/字符，与 Phase 10 预算口径一致）。
   * 只在预算开启时调用；宁可高估也不让并发搜索一起越过上限。
   */
  private estimateUsd(picked: RecipeFactView[], demand: Demand): number {
    const questionChars = JSON.stringify(buildQuestions(demand)).length;
    let chars = questionChars * picked.length;
    for (const c of picked) chars += buildState({ demand }, c).length;
    return (chars / 1_000_000) * this.options.pricePerMTok;
  }
  /** 并行派发 + 整段墙钟超时；超时不等待落后者（其在途请求会被放弃） */
  private async runAll(
    picked: RecipeFactView[],
    brief: { demand: Demand },
    questions: JevQuestions,
    timeoutMs: number,
  ): Promise<{ timedOut: boolean; results: JudgeAttempt[] }> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
    });
    const work = Promise.all(
      picked.map(async (c) => {
        const t0 = this.now();
        try {
          const value = await this.judge.judge(
            buildState(brief, c),
            questions,
            timeoutMs,
          );
          return {
            status: 'fulfilled' as const,
            recipeId: c.id,
            value: { ...value, elapsedMs: this.now() - t0 },
          };
        } catch {
          return { status: 'rejected' as const, recipeId: c.id };
        }
      }),
    );
    const raced = await Promise.race([work, timeout]);
    clearTimeout(timer);
    if (raced === TIMED_OUT) return { timedOut: true, results: [] };
    return { timedOut: false, results: raced };
  }
}

/** 用 SDK 实现判断端口：每次请求只含一个候选，并列两问 */
export class TypeSafeJudge implements JudgePort {
  constructor(
    private readonly client: {
      systemOne<const Q extends JevQuestions>(
        request: { state: string; questions: Q; model?: string },
        options?: RequestOptions,
      ): Promise<SystemOneResult<Q>>;
    },
    private readonly options: {
      model: string;
      retry?: RequestOptions['retry'];
    },
  ) {}

  async judge(
    state: string,
    questions: JevQuestions,
    timeoutMs: number,
  ): Promise<JudgeResult> {
    const result = await this.client.systemOne(
      { state, questions, model: this.options.model },
      {
        timeout: timeoutMs,
        ...(this.options.retry ? { retry: this.options.retry } : {}),
      },
    );
    return {
      adequacy: result.answers.adequacy.choice,
      score: result.answers.match.score,
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens,
      raw: {
        model: result.model,
        answers: result.answers,
        usage: result.usage,
      },
    };
  }
}
