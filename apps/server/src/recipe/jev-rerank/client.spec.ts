/* eslint-disable @typescript-eslint/require-await -- 假判断端口同步返回，签名保持 Promise */
// Jev 重排客户端回归：模式、限流、超时、失败、候选上限与分桶。
// 只断言外部行为（applied/order/reason/调用次数），不断言内部实现。
import {
  JevRerankClient,
  TokenBucket,
  bucketOf,
  type JevRerankOptions,
  type JudgePort,
  type JudgeResult,
} from './client';
import { ADEQUACY_SUFFICIENT, type RecipeFactView } from './protocol';

const fact = (id: string): RecipeFactView => ({
  id,
  name: id,
  desc: '简介',
  cuisine: '家常',
  tags: [],
  time: 10,
  kcal: 100,
  protein: 5,
  carb: 5,
  fat: 5,
  ingredients: [],
  steps: [],
});

const ok = (score: number): JudgeResult => ({
  adequacy: ADEQUACY_SUFFICIENT,
  score,
  inputTokens: 10,
  outputTokens: 5,
  raw: null,
});

/** 假判断端口：按 state 里的菜名给分，并记录被调用的候选 */
function judgeFor(scores: Record<string, number>): {
  port: JudgePort;
  called: string[];
} {
  const called: string[] = [];
  return {
    called,
    port: {
      judge: async (state: string) => {
        const name = /名称：(.+)/.exec(state)?.[1] ?? '';
        called.push(name);
        return ok(scores[name] ?? 0);
      },
    },
  };
}

function build(
  judge: JudgePort,
  over: Partial<JevRerankOptions> = {},
): JevRerankClient {
  return new JevRerankClient(judge, {
    mode: 'live',
    rolloutPercent: 100,
    maxCandidates: 12,
    timeoutMs: 200,
    rpm: 90,
    pricePerMTok: 0.042,
    ...over,
  });
}

const demand = { primary: '省事' };
const req = (ids: string[], userId = 'u1') => ({
  userId,
  demand,
  candidates: ids.map(fact),
  limit: 6,
});

describe('Jev 重排客户端', () => {
  it('关闭时不调用模型，顺序保持基线', async () => {
    const { port, called } = judgeFor({});
    const out = await build(port, { mode: 'off' }).rerank(req(['a', 'b']));
    expect(out.applied).toBe(false);
    expect(out.reason).toBe('disabled');
    expect(out.order).toEqual(['a', 'b']);
    expect(called).toEqual([]);
  });

  it('影子模式算出顺序但不生效，并把请求交给观测（可记录两组差异）', async () => {
    const { port } = judgeFor({ a: 1, b: 3 });
    const seen: { order: string[]; limit: number }[] = [];
    const out = await build(port, {
      mode: 'shadow',
      onOutcome: (o, r) => seen.push({ order: o.order, limit: r.limit }),
    }).rerank(req(['a', 'b']));
    expect(out.applied).toBe(false);
    expect(out.reason).toBe('shadow');
    expect(out.order).toEqual(['b', 'a']);
    // 影子阶段要记录「基线前 N vs 重排前 N」，所以回调必须拿得到 request
    expect(seen).toEqual([{ order: ['b', 'a'], limit: 6 }]);
  });

  it('生效模式按 Score 降序，同分沿用基线顺序', async () => {
    const { port } = judgeFor({ a: 2, b: 2, c: 3 });
    const out = await build(port).rerank(req(['a', 'b', 'c']));
    expect(out.applied).toBe(true);
    expect(out.order).toEqual(['c', 'a', 'b']);
  });

  it('灰度比例未命中时不调用模型', async () => {
    const { port, called } = judgeFor({ a: 1 });
    // rollout=0 → 任何分桶都不命中
    const out = await build(port, { rolloutPercent: 0 }).rerank(req(['a']));
    expect(out.reason).toBe('rollout');
    expect(out.applied).toBe(false);
    expect(called).toEqual([]);
  });

  it('候选池上限：只送前 N 道，其余保持基线相对顺序追加在后', async () => {
    const { port, called } = judgeFor({ a: 1, b: 5, c: 1, d: 1 });
    const out = await build(port, { maxCandidates: 2 }).rerank(
      req(['a', 'b', 'c', 'd']),
    );
    expect(called).toEqual(['a', 'b']);
    // 只有池内前 2 道被重排，池外的 c/d 顺序不变
    expect(out.order).toEqual(['b', 'a', 'c', 'd']);
    expect(out.requests).toBe(2);
  });

  it('令牌桶不足立即回退（不排队等待）', async () => {
    const { port, called } = judgeFor({ a: 1, b: 1 });
    const clock = 0;
    const client = build(port, {
      rpm: 1,
      maxCandidates: 2,
      now: () => clock,
    });
    await client.rerank(req(['a', 'b']));
    expect(called).toHaveLength(2);
    const second = await client.rerank(req(['a', 'b'], 'u2'));
    expect(second.reason).toBe('rate-limit');
    expect(second.applied).toBe(false);
    expect(called).toHaveLength(2); // 没有新增调用
  });

  it('超时回退基线顺序且不抛错', async () => {
    const port: JudgePort = { judge: () => new Promise<JudgeResult>(() => {}) };
    const out = await build(port, { timeoutMs: 20 }).rerank(req(['a', 'b']));
    expect(out.reason).toBe('timeout');
    expect(out.applied).toBe(false);
    expect(out.order).toEqual(['a', 'b']);
  });

  it('任一候选判断失败即整体回退（半个候选集不排序）', async () => {
    const port: JudgePort = {
      judge: async (state) => {
        if (state.includes('名称：b')) throw new Error('boom');
        return ok(1);
      },
    };
    const out = await build(port).rerank(req(['a', 'b']));
    expect(out.reason).toBe('failure');
    expect(out.failures).toBe(1);
    expect(out.order).toEqual(['a', 'b']);
  });

  it('空候选不调用模型', async () => {
    const { port, called } = judgeFor({});
    const out = await build(port).rerank(req([]));
    expect(out.reason).toBe('no-candidates');
    expect(called).toEqual([]);
  });

  it('预算按「派发前预留整批上界」把关：上界超限就不调用模型', async () => {
    const { port, called } = judgeFor({ a: 1 });
    const client = build(port, { pricePerMTok: 1_000_000, budgetUsd: 10 });
    const out = await client.rerank(req(['a']));
    expect(out.reason).toBe('budget');
    expect(out.applied).toBe(false);
    expect(called).toEqual([]);
    expect(client.estimatedCostUsd).toBe(0);
  });

  it('结算用实际用量替换预留（不是预留上界）', async () => {
    const { port } = judgeFor({ a: 1 });
    const client = build(port, {
      pricePerMTok: 1_000_000,
      budgetUsd: 1_000_000,
    });
    const out = await client.rerank(req(['a']));
    expect(out.applied).toBe(true);
    // 实际 10 输入 + 5 输出 token，而不是按字符数估的上界
    expect(client.estimatedCostUsd).toBeCloseTo(15, 5);
  });

  it('每次重排结束都回调观测结果', async () => {
    const { port } = judgeFor({ a: 1 });
    const seen: string[] = [];
    await build(port, {
      onOutcome: (o) => seen.push(`${o.applied}:${o.reason ?? 'ok'}`),
    }).rerank(req(['a']));
    expect(seen).toEqual(['true:ok']);
  });

  it('分桶对同一用户稳定且落在 0–99', () => {
    for (const id of ['u1', 'phase10-user-01', 'user-abc']) {
      expect(bucketOf(id)).toBe(bucketOf(id));
      expect(bucketOf(id)).toBeGreaterThanOrEqual(0);
      expect(bucketOf(id)).toBeLessThan(100);
    }
  });
});

describe('令牌桶', () => {
  it('容量内可突发，补充速率按分钟生效', () => {
    let clock = 0;
    const bucket = new TokenBucket(60, 2, () => clock);
    expect(bucket.tryAcquire(2)).toBe(true);
    expect(bucket.tryAcquire(1)).toBe(false);
    clock = 1_000; // 1 秒 → 补充 1 个令牌
    expect(bucket.tryAcquire(1)).toBe(true);
    clock = 60_000; // 补满容量上限 2
    expect(bucket.tryAcquire(2)).toBe(true);
  });
});
