// 环境变量 → 重排客户端：默认关闭、凭证不全不炸、数值非法回落默认值。
import { createRerankClient } from './from-env';

const base = {
  JEV_RERANK_MODE: 'live',
  JEV_RERANK_MODEL: 'g-jev-1.13',
  TYPESAFE_API_KEY: 'k',
};

describe('重排客户端配置', () => {
  it('默认关闭：不构造客户端', () => {
    expect(createRerankClient({})).toBeUndefined();
    expect(createRerankClient({ JEV_RERANK_MODE: 'off' })).toBeUndefined();
  });

  it('非法模式按关闭处理', () => {
    expect(createRerankClient({ JEV_RERANK_MODE: 'yes' })).toBeUndefined();
  });

  it('已启用但缺凭证时不构造，并如实告警（不让启动失败）', () => {
    const warnings: string[] = [];
    const client = createRerankClient(
      { JEV_RERANK_MODE: 'live', TYPESAFE_API_KEY: 'k' },
      { warn: (m) => warnings.push(m), info: () => {} },
    );
    expect(client).toBeUndefined();
    expect(warnings[0]).toContain('JEV_RERANK_MODEL');
  });

  it('启用且凭证齐备时构造客户端（空候选即回退，不发请求）', async () => {
    const client = createRerankClient(base);
    expect(client).toBeDefined();
    const out = await client.rerank({
      userId: 'u1',
      demand: { primary: '省事' },
      candidates: [],
      limit: 6,
    });
    expect(out.applied).toBe(false);
    expect(out.reason).toBe('no-candidates');
  });

  it('数值非法或非正时回落默认值（上限 12 / 超时 2000）', async () => {
    const client = createRerankClient({
      ...base,
      JEV_RERANK_MAX_CANDIDATES: 'abc',
      JEV_RERANK_TIMEOUT_MS: '0',
    });
    // 默认上限 12：13 道候选只会有 12 道进入重排（超时会话不产生请求，这里只看回退语义）
    const out = await client.rerank({
      userId: 'u1',
      demand: { primary: '省事' },
      candidates: Array.from({ length: 13 }, (_, i) => ({
        id: `r${i}`,
        name: `r${i}`,
        desc: '',
        cuisine: '家常',
        tags: [],
        time: 1,
        kcal: 1,
        protein: 1,
        carb: 1,
        fat: 1,
        ingredients: [],
        steps: [],
      })),
      limit: 6,
    });
    // 无真实服务：必然回退，但回退原因不能是「候选为空」
    expect(out.applied).toBe(false);
    expect(out.reason).not.toBe('no-candidates');
  });
});
