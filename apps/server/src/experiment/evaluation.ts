// Phase 10 离线实验：匿名 A/B 评审材料、揭盲映射与结论统计。
//
// 评审材料只呈现请求与两组前 4 道的相同菜谱事实，不显示分数、概率、解释或排序来源；
// 揭盲映射单独成文件，用户完成评审前不并入材料。统计只消费真实运行记录与人工评审：
// 边界与服务失败不混入胜/平/负，未完成时如实输出未完成。
import { dailySeed } from '../recipe/recommendation.scoring';
import type { RecipeFactView } from './candidates';
import { renderFacts, type CandidateJudgement } from './jev';
export type BlindSide = 'baseline' | 'jev';

/** 边界场景的实际观察结果 */
export interface EdgeObservation {
  expect: string;
  passed: boolean;
  observed: Record<string, string | number | boolean>;
}

/** 单个场景的运行记录（可复核；不含凭证与真实用户数据） */
export interface ScenarioRun {
  scenarioId: string;
  kind: 'main' | 'dev' | 'edge';
  request: string;
  /** 完整合格候选（基线顺序，未按旧分数截断） */
  candidates: string[];
  /** 模型与人工评审看到的同一份菜谱事实 */
  facts: RecipeFactView[];
  baselineTop4: string[];
  /** Jev 前 4；未执行或服务失败时缺省 */
  jevTop4?: string[];
  /** 条件无法执行时的说明 */
  error?: string;
  note?: string;
  edge?: EdgeObservation;
  jev?: {
    model: string;
    /** 每个候选的原始答案、概率分布与耗时（复核依据） */
    judgements: CandidateJudgement[];
    /** 服务失败（不计胜/平/负，不用基线冒充 Jev） */
    failures: string[];
    /** 排序不变量违规（硬约束违规直接判不通过） */
    violations: string[];
    /** 累计用量与费用估算（估算，不是账单） */
    usage: { requests: number; inputTokens: number; outputTokens: number };
    estimatedCostUsd: number;
    /** 是否由确定性控制触发（不得当作真实服务证据） */
    controlled?: boolean;
  };
}

export interface BlindEntry {
  scenarioId: string;
  request: string;
  A: RecipeFactView[];
  B: RecipeFactView[];
}

/** 揭盲映射：场景 → 哪一侧是基线、哪一侧是 Jev */
export type RevealMap = Record<string, { A: BlindSide; B: BlindSide }>;

/** 随机呈现的固定种子（冻结输入的一部分） */
export const BLIND_SEED = 20261008;

/** 30 个主场景全部完成且净胜（胜数减负数）达到该值才建议继续接入设计 */
export const NET_WINS_THRESHOLD = 6;

/**
 * 生成匿名 A/B 材料与分离的揭盲映射：只取已完成 Jev 判断的场景，
 * 每场景用固定种子决定哪一侧是基线，评审材料本身不含任何来源信息。
 */
export function buildBlindMaterial(
  runs: ScenarioRun[],
  seed = BLIND_SEED,
): { material: BlindEntry[]; reveal: RevealMap } {
  const material: BlindEntry[] = [];
  const reveal: RevealMap = {};
  for (const run of runs) {
    if (run.kind !== 'main' || !run.jevTop4?.length) continue;
    const factsById = new Map(run.facts.map((f) => [f.id, f] as const));
    const baselineOnA = dailySeed(run.scenarioId, String(seed)) % 2 === 0;
    const pick = (ids: string[]) =>
      ids.flatMap((id) => {
        const fact = factsById.get(id);
        return fact ? [fact] : [];
      });
    material.push({
      scenarioId: run.scenarioId,
      request: run.request,
      A: pick(baselineOnA ? run.baselineTop4 : run.jevTop4),
      B: pick(baselineOnA ? run.jevTop4 : run.baselineTop4),
    });
    reveal[run.scenarioId] = baselineOnA
      ? { A: 'baseline', B: 'jev' }
      : { A: 'jev', B: 'baseline' };
  }
  return { material, reveal };
}

/** 供用户逐场景记录的评审材料（可读文本） */
export function renderBlindMarkdown(material: BlindEntry[]): string {
  const lines: string[] = [
    '# Phase 10 匿名 A/B 评审材料',
    '',
    '两组各取 4 道；只显示请求与菜谱事实，不显示分数、解释或排序来源。',
    '请按需求满足程度记录 A 胜 / 平 / B 胜，难分高下记平。',
    '',
  ];
  material.forEach((entry, i) => {
    lines.push(`## ${i + 1}/${material.length} · ${entry.scenarioId}`, '');
    lines.push(`请求：「${entry.request}」`, '');
    for (const side of ['A', 'B'] as const) {
      lines.push(`### ${side}`, '');
      entry[side].forEach((fact, n) => {
        lines.push(`${n + 1}. ` + renderFacts(fact).split('\n').join('\n   '));
      });
      lines.push('');
    }
    lines.push('评审：A 胜 / 平 / B 胜 = ______', '');
  });
  return lines.join('\n');
}

export type Verdict = 'A' | 'B' | 'tie';

export interface Review {
  scenarioId: string;
  verdict: Verdict;
}

export interface Tally {
  /** 30 个主场景的真实调用与人工评审是否都完整有效 */
  complete: boolean;
  wins: number;
  ties: number;
  losses: number;
  netWins: number;
  missingRuns: string[];
  failedRuns: string[];
  missingReviews: string[];
  invalidReviews: string[];
  hardViolations: string[];
  /** 边界场景跑了但没通过（硬约束类，直接判不通过） */
  edgeFailures: string[];
  /** 边界场景尚未执行（属于前置缺失，输出未完成） */
  edgeNotRun: string[];
  exit: 'continue' | 'fail' | 'incomplete';
  reasons: string[];
}

/**
 * 统计：胜+平+负 = 主场景数（完整时 = 30），净胜 = 胜数 − 负数。
 * 边界场景与服务失败不混入统计；缺失、重复或未知场景的评审不冒充完整。
 */
export function tally(input: {
  mainScenarioIds: string[];
  edgeScenarioIds: string[];
  runs: ScenarioRun[];
  reveal: RevealMap;
  reviews: Review[];
  hardViolations: string[];
}): Tally {
  const runById = new Map(input.runs.map((r) => [r.scenarioId, r] as const));
  const missingRuns: string[] = [];
  const failedRuns: string[] = [];
  for (const id of input.mainScenarioIds) {
    const run = runById.get(id);
    if (!run) missingRuns.push(id);
    else if (run.jev?.failures.length) failedRuns.push(id);
    else if (!run.jevTop4?.length) missingRuns.push(id);
  }

  const reviewById = new Map<string, Review>();
  const invalidReviews: string[] = [];
  const mainIds = new Set(input.mainScenarioIds);
  for (const review of input.reviews) {
    if (!mainIds.has(review.scenarioId)) {
      invalidReviews.push(`评审指向非主场景：${review.scenarioId}`);
      continue;
    }
    if (reviewById.has(review.scenarioId)) {
      invalidReviews.push(`评审重复：${review.scenarioId}`);
      continue;
    }
    if (!['A', 'B', 'tie'].includes(review.verdict)) {
      invalidReviews.push(
        `评审取值非法：${review.scenarioId}=${review.verdict}`,
      );
      continue;
    }
    reviewById.set(review.scenarioId, review);
  }
  const missingReviews = input.mainScenarioIds.filter(
    (id) => !reviewById.has(id),
  );

  // 运行不可用（缺失或服务失败）的场景不进入胜/平/负：其结果不足以对账
  const unusable = new Set([...missingRuns, ...failedRuns]);
  let wins = 0;
  let ties = 0;
  let losses = 0;
  for (const [id, review] of reviewById) {
    if (unusable.has(id)) continue;
    const sides = input.reveal[id];
    if (!sides) {
      invalidReviews.push(`缺少揭盲映射：${id}`);
      continue;
    }
    if (review.verdict === 'tie') ties += 1;
    else if (sides[review.verdict] === 'jev') wins += 1;
    else losses += 1;
  }

  const edgeFailures: string[] = [];
  const edgeNotRun: string[] = [];
  for (const id of input.edgeScenarioIds) {
    const run = runById.get(id);
    if (!run?.edge || run.edge.observed.notRun) {
      edgeNotRun.push(`边界场景未执行：${id}`);
    } else if (!run.edge.passed) {
      edgeFailures.push(`边界场景未通过：${id}（期望 ${run.edge.expect}）`);
    }
  }

  const complete =
    missingRuns.length === 0 &&
    failedRuns.length === 0 &&
    missingReviews.length === 0 &&
    invalidReviews.length === 0;

  const netWins = wins - losses;
  const reasons: string[] = [];
  if (input.hardViolations.length) {
    reasons.push('硬约束违规，直接判不通过（不能由平均收益抵消）');
  } else if (edgeFailures.length) {
    reasons.push('边界检查未通过，判不通过');
  } else if (!complete || edgeNotRun.length) {
    reasons.push('主评估、人工评审或边界检查未完成，输出未完成及具体缺口');
  } else if (netWins >= NET_WINS_THRESHOLD) {
    reasons.push(
      `完整评估且净胜 ${netWins} >= ${NET_WINS_THRESHOLD}，建议继续接入设计（不自动上线）`,
    );
  } else {
    reasons.push(
      `完整评估但净胜 ${netWins} < ${NET_WINS_THRESHOLD}，如实判不通过`,
    );
  }

  let exit: Tally['exit'];
  if (input.hardViolations.length || edgeFailures.length) exit = 'fail';
  else if (!complete || edgeNotRun.length) exit = 'incomplete';
  else if (netWins >= NET_WINS_THRESHOLD) exit = 'continue';
  else exit = 'fail';

  return {
    complete,
    wins,
    ties,
    losses,
    netWins,
    missingRuns,
    failedRuns,
    missingReviews,
    invalidReviews,
    hardViolations: input.hardViolations,
    edgeFailures,
    edgeNotRun,
    exit,
    reasons,
  };
}
