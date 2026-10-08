// 候选构建的行为回归：安全优先、完整候选不截断、硬条件生效、冻结输入可重放。
// 复用真实 RecipeSafetyService / IngredientService（只 fake 其 Prisma），
// 与线上同一条代码路径；不测试内部实现或源文本。
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
import type { RecipeWithIngredientLinks } from '../recipe/recipe-safety.service';
import {
  buildCandidates,
  parseSnapshot,
  type FrozenSnapshot,
} from './candidates';
import { FROZEN_NOW, type Scenario } from './scenarios';

type Link = RecipeWithIngredientLinks['ingredientLinks'][number];

const identity = (
  id: string,
  name: string,
  allergens: string[] = [],
  aliases: string[] = [],
): Link['ingredient'] => ({
  id,
  name,
  category: 'VEGETABLE',
  aliases: aliases.map((alias) => ({ alias })),
  allergens: allergens.map((allergen) => ({ allergen })),
});

const link = (
  name: string,
  ingredient: Link['ingredient'],
  position: number,
): Link => ({ name, amount: '适量', note: null, position, ingredient });

const recipe = (
  id: string,
  name: string,
  over: Partial<RecipeWithIngredientLinks> = {},
  ingredientLinks: Link[] = [],
): RecipeWithIngredientLinks => ({
  id,
  name,
  desc: `${name}的简介`,
  cuisine: 'HOME',
  time: 20,
  kcal: 300,
  protein: 20,
  carb: 20,
  fat: 10,
  img: '',
  tags: [],
  steps: ['做'],
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ingredientLinks,
  ...over,
});

const snapshotOf = (recipes: RecipeWithIngredientLinks[]): FrozenSnapshot => ({
  frozenAt: FROZEN_NOW.toISOString(),
  source: 'test',
  recipes,
});

const scenarioOf = (over: Partial<Scenario> = {}): Scenario => ({
  id: 'test',
  kind: 'main',
  request: '想吃点家常的',
  hard: { cuisine: 'home' },
  soft: { primary: '家常' },
  profile: {
    userId: 'phase10-user-00',
    dislikedIngredients: [],
    allergens: [],
    healthGoal: 'BALANCED',
  },
  ...over,
});

const TOFU = identity('i-tofu', '豆腐', [], ['嫩豆腐']);
const MILK = identity('i-milk', '牛奶', ['乳']);
const PLAIN = identity('i-plain', '黄瓜');
const ids = (out: { candidates: { id: string }[] }) =>
  out.candidates.map((c) => c.id);

describe('候选构建', () => {
  it('忌口命中即排除，安全优先于场景条件', async () => {
    const snapshot = snapshotOf([
      recipe('r1', '麻婆豆腐', {}, [link('嫩豆腐', TOFU, 0)]),
      recipe('r2', '西红柿炒蛋', {}, [link('黄瓜', PLAIN, 0)]),
    ]);
    const out = await buildCandidates(
      snapshot,
      scenarioOf({
        profile: { ...scenarioOf().profile, dislikedIngredients: ['豆腐'] },
      }),
      FROZEN_NOW,
    );
    expect(ids(out)).toEqual(['r2']);
  });

  it('有过敏设置时成分信息不足的菜谱保守排除', async () => {
    const snapshot = snapshotOf([
      recipe('r1', '含乳菜', {}, [link('牛奶', MILK, 0)]),
      recipe('r2', '成分未知菜', {}, [link('黄瓜', PLAIN, 0)]),
    ]);
    const out = await buildCandidates(
      snapshot,
      scenarioOf({ profile: { ...scenarioOf().profile, allergens: ['乳'] } }),
      FROZEN_NOW,
    );
    expect(ids(out)).toEqual([]);
    expect(out.note).toContain('安全设置被排除');
  });

  it('完整合格候选不按旧分数截断', async () => {
    const snapshot = snapshotOf(
      Array.from({ length: 6 }, (_, i) =>
        recipe(`r${i}`, `菜${i}`, {}, [link('黄瓜', PLAIN, 0)]),
      ),
    );
    const out = await buildCandidates(snapshot, scenarioOf(), FROZEN_NOW);
    expect(out.candidates).toHaveLength(6);
    expect(out.baselineTop4).toHaveLength(4);
  });

  it('硬条件（时长）由代码执行，模型无法放宽', async () => {
    const snapshot = snapshotOf([
      recipe('r1', '快菜', { time: 10 }, [link('黄瓜', PLAIN, 0)]),
      recipe('r2', '慢菜', { time: 90 }, [link('黄瓜', PLAIN, 0)]),
    ]);
    const out = await buildCandidates(
      snapshot,
      scenarioOf({ hard: { cuisine: 'home', maxTime: 30 } }),
      FROZEN_NOW,
    );
    expect(ids(out)).toEqual(['r1']);
  });

  it('空候选如实为空且不报错', async () => {
    const snapshot = snapshotOf([
      recipe('r1', '菜', {}, [link('黄瓜', PLAIN, 0)]),
    ]);
    const out = await buildCandidates(
      snapshot,
      scenarioOf({ hard: { keyword: '不存在的菜' } }),
      FROZEN_NOW,
    );
    expect(out.candidates).toEqual([]);
    expect(out.note).toBeTruthy();
  });

  it('同一冻结输入重放得到相同的完整候选与基线顺序', async () => {
    const snapshot = snapshotOf(
      Array.from({ length: 8 }, (_, i) =>
        recipe(`r${i}`, `菜${i}`, { kcal: 200 + i * 20 }, [
          link('黄瓜', PLAIN, 0),
        ]),
      ),
    );
    const a = await buildCandidates(snapshot, scenarioOf(), FROZEN_NOW);
    const b = await buildCandidates(snapshot, scenarioOf(), FROZEN_NOW);
    expect(ids(a)).toEqual(ids(b));
    expect(a.baselineTop4.map((c) => c.id)).toEqual(
      b.baselineTop4.map((c) => c.id),
    );
  });

  it('快照解析拒绝缺字段的输入', () => {
    expect(() => parseSnapshot('{"recipes":[{"id":"r1"}]}')).toThrow(
      /ingredientLinks/,
    );
    expect(() => parseSnapshot('{}')).toThrow(/recipes/);
  });
});
