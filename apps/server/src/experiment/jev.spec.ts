// 排序规则与不变量回归：可评价优先、Score 降序、无法评价后置、基线打平、候选不增删重复。
import {
  ADEQUACY_INSUFFICIENT,
  ADEQUACY_SUFFICIENT,
  buildState,
  checkRerankInvariants,
  rerank,
  type CandidateJudgement,
} from './jev';
import type { RecipeFactView } from './candidates';
import type { Scenario } from './scenarios';

const judge = (
  recipeId: string,
  adequacy: string,
  score: number | null,
): CandidateJudgement => ({
  recipeId,
  adequacy,
  score,
  elapsedMs: 1,
  raw: null,
});

const facts = (id: string, name: string): RecipeFactView => ({
  id,
  name,
  desc: '简介',
  cuisine: '家常',
  tags: ['家常'],
  time: 20,
  kcal: 300,
  protein: 20,
  carb: 20,
  fat: 10,
  ingredients: [{ name: '鸡蛋', amount: '2 个' }],
  steps: ['打蛋', '下锅'],
});

const scenario: Scenario = {
  id: 's1',
  kind: 'main',
  request: '今天很累，想吃点省事的',
  hard: {},
  soft: { primary: '省事', secondary: '下饭' },
  profile: {
    userId: 'phase10-user-00',
    dislikedIngredients: [],
    allergens: [],
    healthGoal: 'BALANCED',
  },
};

describe('Jev 排序', () => {
  const baseline = ['a', 'b', 'c', 'd'];

  it('可评价按 Score 降序，无法评价后置', () => {
    const judgements = [
      judge('a', ADEQUACY_SUFFICIENT, 1),
      judge('b', ADEQUACY_SUFFICIENT, 3),
      judge('c', ADEQUACY_SUFFICIENT, 2),
      judge('d', ADEQUACY_INSUFFICIENT, 3.9),
    ];
    expect(rerank(baseline, judgements)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('同分与同为无法评价都沿用基线顺序', () => {
    const judgements = [
      judge('b', ADEQUACY_SUFFICIENT, 2),
      judge('a', ADEQUACY_SUFFICIENT, 2),
      judge('d', ADEQUACY_INSUFFICIENT, null),
      judge('c', ADEQUACY_INSUFFICIENT, null),
    ];
    expect(rerank(baseline, judgements)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('全部无法评价时保持基线顺序', () => {
    const judgements = baseline.map((id) =>
      judge(id, ADEQUACY_INSUFFICIENT, null),
    );
    expect(rerank(baseline, judgements)).toEqual(baseline);
  });

  it('缺判断、重复判断、结果含被排除候选或丢失候选都算违规', () => {
    const ok = [
      judge('a', ADEQUACY_SUFFICIENT, 1),
      judge('b', ADEQUACY_SUFFICIENT, 2),
      judge('c', ADEQUACY_SUFFICIENT, 3),
      judge('d', ADEQUACY_SUFFICIENT, 4),
    ];
    const order = rerank(baseline, ok);
    expect(checkRerankInvariants(baseline, ok, order)).toEqual([]);
    expect(checkRerankInvariants(baseline, ok.slice(1), order)).not.toEqual([]);
    expect(
      checkRerankInvariants(
        baseline,
        [...ok, judge('a', ADEQUACY_SUFFICIENT, 1)],
        order,
      ),
    ).not.toEqual([]);
    expect(
      checkRerankInvariants(baseline, ok, ['a', 'b', 'c', 'excluded']),
    ).not.toEqual([]);
    expect(checkRerankInvariants(baseline, ok, ['a', 'b', 'c'])).not.toEqual(
      [],
    );
  });

  it('state 同时给出本次请求与候选事实', () => {
    const state = buildState(
      { request: scenario.request, demand: scenario.soft },
      facts('r1', '西红柿炒鸡蛋'),
    );
    expect(state).toContain('今天很累，想吃点省事的');
    expect(state).toContain('省事');
    expect(state).toContain('下饭');
    expect(state).toContain('西红柿炒鸡蛋');
    expect(state).toContain('打蛋');
  });
});
