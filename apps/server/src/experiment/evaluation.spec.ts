// 匿名材料与结论统计回归：映射可对账、材料不泄露来源、胜/平/负与净胜口径、
// 缺失或无效评审不冒充完整、硬约束违规与边界失败直接判不通过。
import {
  buildBlindMaterial,
  renderBlindMarkdown,
  tally,
  NET_WINS_THRESHOLD,
  type ScenarioRun,
  type Review,
  type RevealMap,
} from './evaluation';
import type { RecipeFactView } from './candidates';

const fact = (id: string): RecipeFactView => ({
  id,
  name: `菜${id}`,
  desc: '简介',
  cuisine: '家常',
  tags: [],
  time: 20,
  kcal: 300,
  protein: 20,
  carb: 20,
  fat: 10,
  ingredients: [],
  steps: [],
});

function mainRun(id: string, over: Partial<ScenarioRun> = {}): ScenarioRun {
  const candidates = ['1', '2', '3', '4', '5'].map((n) => `${id}-${n}`);
  return {
    scenarioId: id,
    kind: 'main',
    request: `请求 ${id}`,
    candidates,
    facts: candidates.map(fact),
    baselineTop4: candidates.slice(0, 4),
    jevTop4: [...candidates].reverse().slice(0, 4),
    ...over,
  };
}

const edgeRun = (id: string, passed: boolean): ScenarioRun => ({
  scenarioId: id,
  kind: 'edge',
  request: '',
  candidates: [],
  facts: [],
  baselineTop4: [],
  edge: { expect: 'empty', passed, observed: {} },
});

const MAIN_IDS = Array.from({ length: 30 }, (_, i) => `main-${i + 1}`);

/** 按揭盲映射造出指定数量的胜/平/负评审 */
function reviewsFor(reveal: RevealMap, wins: number, ties: number): Review[] {
  return MAIN_IDS.map((id, i) => {
    if (i < wins) {
      return {
        scenarioId: id,
        verdict: reveal[id].A === 'jev' ? 'A' : 'B',
      };
    }
    if (i < wins + ties) return { scenarioId: id, verdict: 'tie' };
    return {
      scenarioId: id,
      verdict: reveal[id].A === 'jev' ? 'B' : 'A',
    };
  });
}

const mainRuns = () => MAIN_IDS.map((id) => mainRun(id));

describe('匿名材料', () => {
  it('每场景一侧基线一侧 Jev，材料不含分数或来源，映射可对账', () => {
    const runs = mainRuns();
    const { material, reveal } = buildBlindMaterial(runs);
    expect(material).toHaveLength(30);
    for (const entry of material) {
      expect(Object.keys(entry).sort()).toEqual([
        'A',
        'B',
        'request',
        'scenarioId',
      ]);
      expect(entry.A).toHaveLength(4);
      expect(entry.B).toHaveLength(4);
      const run = runs.find((r) => r.scenarioId === entry.scenarioId);
      const jevSide = reveal[entry.scenarioId].A === 'jev' ? 'A' : 'B';
      expect(entry[jevSide].map((f) => f.id)).toEqual(run.jevTop4);
      const baselineSide = jevSide === 'A' ? 'B' : 'A';
      expect(entry[baselineSide].map((f) => f.id)).toEqual(run.baselineTop4);
    }
    const markdown = renderBlindMarkdown(material);
    expect(markdown).toContain('请求');
    expect(markdown).not.toContain('Jev');
    expect(markdown).not.toContain('基线');
  });

  it('未完成 Jev 判断的场景不进入材料', () => {
    const runs = [mainRun('main-1'), mainRun('main-2', { jevTop4: undefined })];
    expect(buildBlindMaterial(runs).material).toHaveLength(1);
  });
});

describe('结论统计', () => {
  const base = (over: Partial<Parameters<typeof tally>[0]> = {}) => {
    const runs = [...mainRuns(), edgeRun('edge-1', true)];
    const { reveal } = buildBlindMaterial(runs);
    return {
      mainScenarioIds: MAIN_IDS,
      edgeScenarioIds: ['edge-1'],
      runs,
      reveal,
      reviews: reviewsFor(reveal, 20, 5),
      hardViolations: [],
      ...over,
    };
  };

  it('完整评审时胜+平+负=30，净胜=胜数-负数', () => {
    const result = tally(base());
    expect(result.complete).toBe(true);
    expect(result.wins + result.ties + result.losses).toBe(30);
    expect(result.netWins).toBe(20 - 5);
    expect(result.exit).toBe('continue');
  });

  it('完整但净胜低于门槛时如实判不通过', () => {
    const input = base();
    const result = tally({
      ...input,
      reviews: reviewsFor(input.reveal, NET_WINS_THRESHOLD - 1, 0),
    });
    expect(result.complete).toBe(true);
    expect(result.netWins).toBeLessThan(NET_WINS_THRESHOLD);
    expect(result.exit).toBe('fail');
  });

  it('缺评审、重复评审与未知场景评审都输出未完成', () => {
    const input = base();
    const missing = tally({ ...input, reviews: input.reviews.slice(0, 29) });
    expect(missing.exit).toBe('incomplete');
    expect(missing.missingReviews).toEqual(['main-30']);

    const duplicated = tally({
      ...input,
      reviews: [...input.reviews, input.reviews[0]],
    });
    expect(duplicated.exit).toBe('incomplete');
    expect(duplicated.invalidReviews.length).toBeGreaterThan(0);

    const unknown = tally({
      ...input,
      reviews: [
        ...input.reviews.slice(0, 29),
        { scenarioId: 'not-a-scenario', verdict: 'A' },
      ],
    });
    expect(unknown.exit).toBe('incomplete');
    expect(unknown.invalidReviews.length).toBeGreaterThan(0);
  });

  it('服务失败与缺失运行不混入胜/平/负，输出未完成', () => {
    const full = mainRuns();
    const { reveal } = buildBlindMaterial(full);
    const degraded = [...full];
    degraded[0] = mainRun('main-1', {
      jevTop4: undefined,
      jev: {
        model: 'm',
        judgements: [],
        failures: ['服务失败：超时'],
        violations: [],
        usage: { requests: 0, inputTokens: 0, outputTokens: 0 },
        estimatedCostUsd: 0,
      },
    });
    degraded[1] = mainRun('main-2', { jevTop4: undefined });
    const result = tally({
      mainScenarioIds: MAIN_IDS,
      edgeScenarioIds: ['edge-1'],
      runs: [...degraded, edgeRun('edge-1', true)],
      reveal,
      reviews: reviewsFor(reveal, 20, 5),
      hardViolations: [],
    });
    expect(result.exit).toBe('incomplete');
    expect(result.missingRuns).toEqual(['main-2']);
    expect(result.failedRuns).toEqual(['main-1']);
    expect(result.wins + result.ties + result.losses).toBe(28);
  });

  it('硬约束违规或边界失败直接判不通过，不被平均收益抵消', () => {
    const input = base();
    expect(
      tally({ ...input, hardViolations: ['排序结果含被排除候选：x'] }).exit,
    ).toBe('fail');
    const runs = [...mainRuns(), edgeRun('edge-1', false)];
    const { reveal } = buildBlindMaterial(runs);
    const failed = tally({
      ...input,
      runs,
      reveal,
      reviews: reviewsFor(reveal, 30, 0),
    });
    expect(failed.exit).toBe('fail');
    expect(failed.edgeFailures).toEqual([
      '边界场景未通过：edge-1（期望 empty）',
    ]);
  });

  it('边界场景未执行属于前置缺失，输出未完成', () => {
    const input = base();
    const result = tally({
      ...input,
      runs: mainRuns(),
      edgeScenarioIds: ['edge-1'],
    });
    expect(result.edgeNotRun).toEqual(['边界场景未执行：edge-1']);
    expect(result.edgeFailures).toEqual([]);
    expect(result.exit).toBe('incomplete');
  });

  it('空的 Jev 前 4 不算完成（空数组不得冒充结果）', () => {
    const runs = [mainRun('main-1', { jevTop4: [] })];
    expect(buildBlindMaterial(runs).material).toHaveLength(0);
    const { reveal } = buildBlindMaterial([mainRun('main-1')]);
    const result = tally({
      mainScenarioIds: ['main-1'],
      edgeScenarioIds: [],
      runs,
      reveal,
      reviews: [{ scenarioId: 'main-1', verdict: 'tie' }],
      hardViolations: [],
    });
    expect(result.missingRuns).toEqual(['main-1']);
    expect(result.exit).toBe('incomplete');
  });
});
