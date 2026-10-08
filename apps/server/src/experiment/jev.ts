// Phase 10 离线实验：Jev 单候选判断（Choice + Score）与排序规则。
//
// 纯逻辑，不含 SDK 调用：问题与等级说明、state 组装、可评价优先/Score 降序/无法评价后置/
// 基线打平的排序，以及「候选不增删重复」的不变量检查。SDK 调用在 scripts/experiment.ts。
import type { ChoiceQuestion, ScoreQuestion } from '@typesafe-ai/sdk';
import type { RecipeFactView } from './candidates';
import type { Scenario } from './scenarios';

/** 固定模型版本：不使用 `jev-latest` 之类的移动别名 */
export const JEV_MODEL = 'jev-1.13.0';

/** 资料充分性（Choice）的三个选项；只有「足够」才消费 Score */
export const ADEQUACY_SUFFICIENT = '资料足够评价主要偏好';
export const ADEQUACY_INSUFFICIENT = '资料不足';
export const ADEQUACY_UNCERTAIN = '无法确定';

/** 整体匹配（Score）四级有序标准：每级自包含，不依赖编号、相邻等级或问题 ID */
export const MATCH_RUBRIC = [
  '不匹配：已有事实明确支持这道菜谱与本次主要偏好冲突。',
  '部分匹配：已有事实支持满足部分偏好，但主要偏好仍有明显不足，且不属于与主要偏好明确冲突的情形。',
  '较匹配：已有事实支持满足主要偏好，但次要偏好有明确不足。',
  '高度匹配：已有事实支持满足主要及次要偏好，且没有明显冲突。',
] as const;

/** 每次请求只包含一个候选，并列提出两个互不读取答案的问题 */
export function buildQuestions(soft: Scenario['soft']): {
  adequacy: ChoiceQuestion;
  match: ScoreQuestion;
} {
  const scope = soft.secondary
    ? `主要偏好：${soft.primary}；次要偏好：${soft.secondary}。`
    : `主要偏好：${soft.primary}；本次没有次要偏好，不要求满足不存在的次要条件。`;
  return {
    adequacy: {
      type: 'choice',
      instructions: `这道候选菜谱的已有资料，是否足以评价本次主要偏好（${soft.primary}）？只能依据 state 中给出的资料判断。${scope}`,
      criteria: {
        [ADEQUACY_SUFFICIENT]:
          '名称、简介、菜系、标签、时长、营养、原料与步骤足以判断主要偏好是否被满足，或是否与主要偏好明确冲突。',
        [ADEQUACY_INSUFFICIENT]:
          '资料缺少判断主要偏好所需的关键信息（如口感、软烂程度、具体做法），无法据此判断。',
        [ADEQUACY_UNCERTAIN]: '资料存在歧义或相互矛盾，无法得出明确结论。',
      },
    },
    match: {
      type: 'score',
      instructions:
        '依据本次需求的主要与次要偏好，这道候选菜谱的整体匹配程度如何？四个等级各自独立成立，不依赖等级编号或相邻等级；只依据 state 中的已有事实，不要推测资料里没有的信息。',
      criteria: MATCH_RUBRIC,
    },
  };
}

/** 菜谱事实的文本呈现：模型 state 与人工评审材料共用同一份字段与顺序 */
export function renderFacts(facts: RecipeFactView): string {
  const ingredients = facts.ingredients
    .map((i) => `${i.name} ${i.amount}${i.note ? `（${i.note}）` : ''}`)
    .join('；');
  const steps = facts.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return [
    `名称：${facts.name}`,
    `简介：${facts.desc}`,
    `菜系：${facts.cuisine}｜标签：${facts.tags.length ? facts.tags.join('、') : '无'}`,
    `时长：${facts.time} 分钟｜营养：${facts.kcal} kcal，蛋白 ${facts.protein} g，碳水 ${facts.carb} g，脂肪 ${facts.fat} g`,
    `原料：${ingredients}`,
    `步骤：\n${steps}`,
  ].join('\n');
}

/** 单候选 state：本次需求 + 人工固定的偏好优先级 + 该候选的已有事实 */
export function buildState(scenario: Scenario, facts: RecipeFactView): string {
  return [
    '本次需求（人工固定，未经模型提取）：',
    `「${scenario.request}」`,
    '',
    '评价依据的偏好（按优先级）：',
    `主要偏好：${scenario.soft.primary}`,
    `次要偏好：${scenario.soft.secondary ?? '无'}`,
    '',
    '说明：本次候选已由代码执行硬条件与安全过滤，以下事实是唯一可用依据；',
    '不得推测资料中没有的口感、难度、食材或其他信息。',
    '',
    '候选菜谱：',
    renderFacts(facts),
  ].join('\n');
}

/** 单个候选的模型判断（原始答案与概率分布一并保留供复核） */
export interface CandidateJudgement {
  recipeId: string;
  /** 资料充分性 Choice 的选项文本 */
  adequacy: string;
  score: number | null;
  /** 本次请求耗时（毫秒） */
  elapsedMs: number;
  /** 原始响应（答案、概率分布、模型版本、用量） */
  raw: unknown;
}

/**
 * 排序规则：可评价候选按 Score 降序、同分沿用基线顺序；无法评价候选后置但仍保留，
 * 同为无法评价时沿用基线顺序。不增加、删除或重复候选。
 */
export function rerank(
  baselineOrder: string[],
  judgements: CandidateJudgement[],
): string[] {
  const rank = new Map(baselineOrder.map((id, i) => [id, i] as const));
  const evaluable: CandidateJudgement[] = [];
  const unknown: CandidateJudgement[] = [];
  for (const j of judgements) {
    if (!rank.has(j.recipeId)) continue;
    if (j.adequacy === ADEQUACY_SUFFICIENT && typeof j.score === 'number') {
      evaluable.push(j);
    } else {
      unknown.push(j);
    }
  }
  const byBaseline = (a: CandidateJudgement, b: CandidateJudgement) =>
    (rank.get(a.recipeId) ?? 0) - (rank.get(b.recipeId) ?? 0);
  evaluable.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || byBaseline(a, b));
  unknown.sort(byBaseline);
  return [...evaluable, ...unknown].map((j) => j.recipeId);
}

/**
 * 重排不变量：每个候选恰好一个判断、结果与完整合格候选集逐一对应、
 * 不含被排除候选、不增加/删除/重复。返回违规说明（空数组表示通过）。
 */
export function checkRerankInvariants(
  baselineOrder: string[],
  judgements: CandidateJudgement[],
  order: string[],
): string[] {
  const violations: string[] = [];
  const allowed = new Set(baselineOrder);
  const judged = new Set<string>();
  for (const j of judgements) {
    if (!allowed.has(j.recipeId)) {
      violations.push(`判断包含不在合格候选中的菜谱：${j.recipeId}`);
      continue;
    }
    if (judged.has(j.recipeId)) {
      violations.push(`同一候选被重复判断：${j.recipeId}`);
      continue;
    }
    judged.add(j.recipeId);
  }
  for (const id of baselineOrder) {
    if (!judged.has(id)) violations.push(`候选缺少判断：${id}`);
  }
  const seen = new Set<string>();
  for (const id of order) {
    if (seen.has(id)) violations.push(`排序结果重复候选：${id}`);
    else if (!allowed.has(id)) violations.push(`排序结果含被排除候选：${id}`);
    seen.add(id);
  }
  for (const id of baselineOrder) {
    if (!seen.has(id)) violations.push(`排序结果丢失候选：${id}`);
  }
  return violations;
}
