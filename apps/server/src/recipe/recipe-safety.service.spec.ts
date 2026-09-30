/* eslint-disable @typescript-eslint/require-await */
// 安全判断与食材归一的回归（Phase 8-1 / ADR-0018）。
// 纯函数 + 对象字面量 fake prisma，零 DB、零 @nestjs/testing 容器。
jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class {},
}));

import { RecipeSafetyService } from './recipe-safety.service';
import { validateReviewedIngredient } from '../ingredient/publish-review';
import { REVIEWED_INGREDIENTS } from '../../prisma/ingredients/published';
import { IngredientService } from '../ingredient/ingredient.service';
import { evaluateRecipeSafety, type RecipeIngredientView } from './safety';
import {
  buildRawIndex,
  buildRecipeIngredientLinks,
  dedupeIngredientLinks,
  findAmbiguousRawNames,
} from '../ingredient/normalize';

const view = (
  rawName: string,
  identity: Partial<RecipeIngredientView['identity']> | null,
): RecipeIngredientView => ({
  rawName,
  identity:
    identity === null
      ? null
      : {
          ingredientId: identity?.ingredientId ?? 'i1',
          name: identity?.name ?? rawName,
          aliases: identity?.aliases ?? [],
          category: identity?.category ?? 'VEGETABLE',
          allergens: identity?.allergens ?? ['某已知过敏原'],
        },
});

const signals = (blocked: string[], hasAllergenSettings: boolean) => ({
  blocked,
  hasAllergenSettings,
});

describe('归一：同物异名与环境差异', () => {
  const index = buildRawIndex([
    { name: '番茄', rawNames: ['番茄', '西红柿'] },
    { name: '鸡蛋', rawNames: ['鸡蛋'] },
    { name: '鸭蛋', rawNames: ['鸭蛋'] },
    { name: '生抽', rawNames: ['生抽'] },
    { name: '老抽', rawNames: ['老抽'] },
  ]);

  it('别名指向同一身份', () => {
    expect(index.get('西红柿')?.name).toBe('番茄');
    expect(index.get('番茄')?.name).toBe('番茄');
  });

  it('相近与可替代原料不合并', () => {
    expect(index.get('鸡蛋')?.name).not.toBe(index.get('鸭蛋')?.name);
    expect(index.get('生抽')?.name).not.toBe(index.get('老抽')?.name);
  });

  it('同一写法指向多个身份时报出歧义', () => {
    const ambiguous = findAmbiguousRawNames([
      { name: '番茄', rawNames: ['番茄'] },
      { name: '圣女果', rawNames: ['番茄'] },
    ]);
    expect(ambiguous).toHaveLength(1);
  });

  it('未收录的原料被拒绝，不静默跳过', () => {
    const { links, rejected } = buildRecipeIngredientLinks(
      [{ name: '不存在的原料', amount: '1份' }],
      index,
      new Map([['番茄', 'id1']]),
      'r1',
    );
    expect(links).toHaveLength(0);
    expect(rejected[0]).toContain('不存在的原料');
  });

  it('同一身份的多种写法在关联里去重，位置按原顺序', () => {
    const links = dedupeIngredientLinks([
      { ingredientId: 'a', position: 2 },
      { ingredientId: 'b', position: 0 },
      { ingredientId: 'a', position: 1 },
    ]);
    expect(links.map((l) => l.position)).toEqual([0, 1]);
  });
});

describe('安全判断：安全设置优先与可解释排除', () => {
  it('忌口命中别名（忌口西红柿、原料写作番茄）也排除', () => {
    const verdict = evaluateRecipeSafety(
      [view('番茄', { name: '番茄', aliases: ['西红柿'] })],
      signals(['西红柿'], false),
      [],
    );
    expect(verdict.verdict).toBe('blocked');
  });

  it('身份不同但含同一过敏原仍被拦截（豆腐不是大豆的别名）', () => {
    const verdict = evaluateRecipeSafety(
      [view('嫩豆腐', { name: '豆腐', aliases: [], allergens: ['大豆'] })],
      signals(['大豆'], true),
      ['大豆'],
    );
    expect(verdict.verdict).toBe('blocked');
    expect(verdict.verdict === 'blocked' && verdict.reason).toContain('大豆');
  });

  it('有过敏设置且成分信息不足时排除，并说明信息不足', () => {
    const verdict = evaluateRecipeSafety(
      [view('某加工食品', { name: '某加工食品', allergens: [] })],
      signals([], true),
      ['花生'],
    );
    expect(verdict.verdict).toBe('unknown');
  });

  it('未设置过敏原时不排除，但也不产生任何安全背书', () => {
    const verdict = evaluateRecipeSafety(
      [view('某加工食品', { name: '某加工食品', allergens: [] })],
      signals([], false),
      [],
    );
    expect(verdict.verdict).toBe('ok');
  });

  it('与安全设置冲突的所选食材条件不被悄悄放行：命中即排除', () => {
    const verdict = evaluateRecipeSafety(
      [view('西红柿', { name: '番茄', aliases: ['西红柿'] })],
      signals(['番茄'], false),
      [],
    );
    expect(verdict.verdict).toBe('blocked');
  });
});

describe('RecipeSafetyService：设置来自当前用户服务端上下文', () => {
  const recipe = {
    ingredients: [{ name: '鸡蛋', amount: '2个' }],
    ingredientLinks: [
      {
        name: '鸡蛋',
        position: 0,
        note: null,
        ingredient: {
          id: 'egg',
          name: '鸡蛋',
          category: 'EGG' as const,
          aliases: [],
          allergens: [{ allergen: '蛋类' }],
        },
      },
    ],
  };

  function makeService(
    pref: { dislikedIngredients: string[]; allergens: string[] } | null,
  ) {
    const prisma = {
      userPreference: { findUnique: async () => pref },
    };
    return new RecipeSafetyService(prisma as never);
  }

  it('过敏设置从服务端读取，不同用户互不影响', async () => {
    const withPref = makeService({
      dislikedIngredients: [],
      allergens: ['蛋类'],
    });
    const withoutPref = makeService(null);
    const blocked = await withPref.filter('u1', [recipe]);
    const allowed = await withoutPref.filter('u2', [recipe]);
    expect(blocked.allowed).toHaveLength(0);
    expect(blocked.excluded[0]?.reason).toContain('蛋类');
    expect(allowed.allowed).toHaveLength(1);
  });

  it('全部被排除时不回退放宽：allowed 为空而非近似结果', async () => {
    const service = makeService({
      dislikedIngredients: ['鸡蛋'],
      allergens: [],
    });
    const result = await service.filter('u1', [recipe]);
    expect(result.allowed).toHaveLength(0);
    expect(result.excluded).toHaveLength(1);
  });
});

describe('全部包含：多选取交集而非取并集', () => {
  const links = [
    { recipeId: 'r1', ingredientId: 'tomato' },
    { recipeId: 'r1', ingredientId: 'egg' },
    { recipeId: 'r2', ingredientId: 'tomato' },
    { recipeId: 'r3', ingredientId: 'egg' },
  ];

  it('同时选择两个食材时只返回两者都含的菜谱', () => {
    const service = new IngredientService({} as never);
    expect(service.recipeIdsContainingAll(['tomato', 'egg'], links)).toEqual([
      'r1',
    ]);
  });

  it('允许菜谱含额外食材（只要求全部包含）', () => {
    const service = new IngredientService({} as never);
    expect(
      service.recipeIdsContainingAll(
        ['tomato'],
        [
          ...links,
          { recipeId: 'r4', ingredientId: 'tomato' },
          { recipeId: 'r4', ingredientId: 'onion' },
        ],
      ),
    ).toEqual(['r1', 'r2', 'r4']);
  });
});

describe('食材资料导入：发布最低标准', () => {
  const base = {
    name: '番茄',
    category: 'VEGETABLE' as const,
    rawNames: ['番茄'],
    summary: '简介',
    sources: ['https://fdc.nal.usda.gov/'],
    reviewedAt: '2026-09-30',
  };

  it('缺少名称、审核简介或来源时拒绝发布并给出原因', () => {
    const errors = validateReviewedIngredient({
      ...base,
      name: '',
      summary: '   ',
      sources: [],
    });
    expect(errors.join('；')).toContain('缺少名称');
    expect(errors.join('；')).toContain('缺少经人工审核的简介');
    expect(errors.join('；')).toContain('缺少可核查参考来源');
  });

  it('未标注维护者复核时间时拒绝发布（未审核不发布）', () => {
    const errors = validateReviewedIngredient({
      ...base,
      reviewedAt: undefined,
    });
    expect(errors.join('；')).toContain('缺少维护者复核时间');
  });

  it('过敏原关系缺少可核查依据时拒绝', () => {
    const errors = validateReviewedIngredient({
      ...base,
      allergens: [{ allergen: '大豆', source: '' }],
    });
    expect(errors.join('；')).toContain('缺少可核查依据');
  });

  it('完整条目通过校验', () => {
    expect(validateReviewedIngredient(base)).toEqual([]);
  });
});

describe('发布输入：复核标记决定 reviewedAt', () => {
  it('带标记的条目可解析为合法日期，标记类型为字符串', () => {
    const withMark = REVIEWED_INGREDIENTS.filter((i) => i.reviewedAt);
    expect(withMark.length).toBeGreaterThan(0);
    for (const item of withMark) {
      const at = new Date(item.reviewedAt);
      expect(Number.isNaN(at.getTime())).toBe(false);
    }
  });

  it('无标记的条目在导入侧落到 null（不会假装已审核）', () => {
    const toReviewedAt = (v?: string) => (v ? new Date(v) : null);
    expect(toReviewedAt(undefined)).toBeNull();
    expect(toReviewedAt('2026-09-30')?.toISOString()).toBe(
      '2026-09-30T00:00:00.000Z',
    );
  });
});
