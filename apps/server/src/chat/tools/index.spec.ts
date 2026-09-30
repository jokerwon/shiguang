/* eslint-disable @typescript-eslint/require-await */
// 工具单测（W1.9）：execute 纯逻辑——硬过滤生效、set_favorite 幂等。
// 零 DB 风格，注入 fake deps（参考 recommendation.scoring.spec.ts）。
// 直接测抽出的纯函数（runXxx），避免导入 ai（ESM，ts-jest 不转换 node_modules）。
// 安全判断调用真实 RecipeSafetyService（纯逻辑），只 fake 它的 PrismaService——
// 避免测试自证一套与线上不同的安全语义。
jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class {},
}));
import { runSetFavorite, runUpdatePreferences } from './write-tools-logic';
import { runSearchRecipes, runGetRecipe } from './read-tools-logic';
import type { ChatToolDeps } from './types';
import { RecipeSafetyService } from '../../recipe/recipe-safety.service';
import type { Recipe } from 'generated/prisma/client';

/* ---- fake 工厂 ---- */

/** 原料写法与稳定身份一一对应（正式查询由 RecipeIngredient 关联提供） */
const linksFor = (ingredients: { name: string }[], over: Partial<Recipe>) => {
  const identity = (over as { identities?: Record<string, string[]> })
    .identities;
  return ingredients.map((i) => {
    const names = identity?.[i.name] ?? [i.name];
    return {
      name: i.name,
      ingredient: {
        id: `id-${names[0]}`,
        name: names[0],
        category: 'VEGETABLE' as const,
        aliases: names.slice(1).map((alias) => ({ alias })),
        allergens: (
          (over as { allergenMap?: Record<string, string[]> }).allergenMap?.[
            names[0]
          ] ?? []
        ).map((allergen) => ({ allergen })),
      },
    };
  });
};

const recipe = (
  over: Partial<Recipe> = {},
): Recipe & {
  ingredientLinks: ReturnType<typeof linksFor>;
} => ({
  id: 'r1',
  name: '番茄炒蛋',
  desc: '家常菜',
  cuisine: 'HOME',
  time: 15,
  kcal: 300,
  protein: 12,
  carb: 10,
  fat: 18,
  img: '',
  tags: ['QUICK'],
  ingredients: [{ name: '番茄' }, { name: '鸡蛋' }],
  steps: ['炒'],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
  ingredientLinks: linksFor(
    (over.ingredients as { name: string }[] | undefined) ?? [
      { name: '番茄' },
      { name: '鸡蛋' },
    ],
    over,
  ),
});

/** 构造 fake deps，favorites 可初始化 */
function makeDeps(
  opts: {
    favorites?: string[];
    recipes?: Recipe[];
    blocked?: string[];
    allergens?: string[];
    pref?: {
      dislikedIngredients: string[];
      allergens: string[];
      healthGoal: 'BALANCED' | 'FAT_LOSS' | 'MUSCLE_GAIN';
    };
  } = {},
): { deps: ChatToolDeps; state: { favorites: string[] } } {
  const state = {
    favorites: [...(opts.favorites ?? [])],
  };
  const recipes = opts.recipes ?? [recipe()];
  // 安全判断用真实 service（纯函数 + fake prisma），避免测试自证一套假语义。
  // blocked = 忌口（身份/别名命中即排除）；allergens = 过敏原（额外引入信息不足排除）。
  const safety = new RecipeSafetyService({
    userPreference: {
      findUnique: async () => ({
        dislikedIngredients: opts.blocked ?? [],
        allergens: opts.allergens ?? [],
        healthGoal: opts.pref?.healthGoal ?? 'BALANCED',
      }),
    },
  } as never);

  const deps: ChatToolDeps = {
    loadSignals: async () => ({
      blocked: opts.blocked ?? [],
      healthGoal: opts.pref?.healthGoal ?? 'BALANCED',
    }),
    safety,
    findRecipes: async () => recipes,
    findRecipeById: async (id) => recipes.find((r) => r.id === id) ?? null,
    favoriteFindAll: async () => [...state.favorites],
    favoriteSet: async (_uid, recipeId, saved) => {
      const exists = state.favorites.includes(recipeId);
      if (saved && !exists) state.favorites.push(recipeId);
      if (!saved && exists)
        state.favorites = state.favorites.filter((f) => f !== recipeId);
      return [...state.favorites];
    },
    preferenceFind: async () =>
      opts.pref
        ? {
            dislikedIngredients: opts.pref.dislikedIngredients,
            allergens: opts.pref.allergens,
            healthGoal: opts.pref.healthGoal,
          }
        : null,
  };
  return { deps, state };
}

describe('chat tools', () => {
  describe('search_recipes 硬过滤', () => {
    it('含过敏原的菜谱被剔除（安全红线）', async () => {
      const r1 = recipe({
        id: 'r1',
        name: '番茄炒蛋',
        ingredients: [{ name: '番茄' }, { name: '鸡蛋' }],
      });
      const r2 = recipe({
        id: 'r2',
        name: '花生鸡丁',
        ingredients: [{ name: '花生' }, { name: '鸡胸' }],
      });
      const { deps } = makeDeps({ recipes: [r1, r2], blocked: ['花生'] });
      const result = await runSearchRecipes(deps, 'u1', { limit: 10 });
      const ids = result.recipes.map((r) => r.id);
      expect(ids).toContain('r1');
      expect(ids).not.toContain('r2');
    });

    it('别名命中忌口仍被剔除（忌口西红柿、原料写作番茄）', async () => {
      const r1 = recipe({
        id: 'r1',
        ingredients: [{ name: '番茄' }, { name: '鸡蛋' }],
        identities: { 番茄: ['番茄', '西红柿'] },
      } as Partial<Recipe>);
      const { deps } = makeDeps({ recipes: [r1], blocked: ['西红柿'] });
      const result = await runSearchRecipes(deps, 'u1', { limit: 10 });
      expect(result.recipes.map((r) => r.id)).toEqual([]);
    });

    it('过敏原关系命中即剔除（大豆过敏、原料为豆腐）', async () => {
      const r1 = recipe({
        id: 'r1',
        ingredients: [{ name: '嫩豆腐' }, { name: '鸡蛋' }],
        allergenMap: { 嫩豆腐: ['大豆'] },
      } as Partial<Recipe>);
      const { deps } = makeDeps({
        recipes: [r1],
        allergens: ['大豆'],
      });
      const result = await runSearchRecipes(deps, 'u1', { limit: 10 });
      expect(result.recipes.map((r) => r.id)).toEqual([]);
    });

    it('有过敏设置且信息不足时剔除', async () => {
      const r1 = recipe({
        id: 'r1',
        ingredients: [{ name: '魔芋丝' }, { name: '鸡蛋' }],
      });
      const { deps } = makeDeps({ recipes: [r1], allergens: ['花生'] });
      const result = await runSearchRecipes(deps, 'u1', { limit: 10 });
      expect(result.recipes.map((r) => r.id)).toEqual([]);
    });

    it('关键词筛选生效', async () => {
      const r1 = recipe({
        id: 'r1',
        name: '番茄炒蛋',
        ingredients: [{ name: '番茄' }, { name: '鸡蛋' }],
      });
      const r2 = recipe({
        id: 'r2',
        name: '宫保鸡丁',
        ingredients: [{ name: '鸡胸' }, { name: '花生' }],
      });
      const { deps } = makeDeps({ recipes: [r1, r2] });
      const result = await runSearchRecipes(deps, 'u1', { keyword: '番茄' });
      expect(result.recipes.map((r) => r.id)).toEqual(['r1']);
    });

    it('无匹配时返回 note', async () => {
      const { deps } = makeDeps({ recipes: [recipe()] });
      const result = await runSearchRecipes(deps, 'u1', {
        keyword: '不存在的菜',
      });
      expect(result.count).toBe(0);
      expect(result.note).toBeDefined();
    });
  });

  describe('get_recipe', () => {
    it('存在时返回详情', async () => {
      const { deps } = makeDeps({ recipes: [recipe({ id: 'r1' })] });
      const result = await runGetRecipe(deps, 'r1');
      expect(result.found).toBe(true);
    });
    it('不存在时 found=false', async () => {
      const { deps } = makeDeps({ recipes: [] });
      const result = await runGetRecipe(deps, 'rX');
      expect(result.found).toBe(false);
    });
  });
  describe('set_favorite 幂等', () => {
    it('已收藏时 saved=true 不产生翻转', async () => {
      const { deps, state } = makeDeps({ favorites: ['r1'] });
      const result = await runSetFavorite(deps, 'u1', 'r1', true);
      expect(result.saved).toBe(true);
      expect(state.favorites).toEqual(['r1']);
    });

    it('未收藏时 saved=true 收藏', async () => {
      const { deps, state } = makeDeps({ favorites: [] });
      await runSetFavorite(deps, 'u1', 'r1', true);
      expect(state.favorites).toEqual(['r1']);
    });

    it('已收藏时 saved=false 取消', async () => {
      const { deps, state } = makeDeps({ favorites: ['r1'] });
      await runSetFavorite(deps, 'u1', 'r1', false);
      expect(state.favorites).toEqual([]);
    });

    it('未收藏时 saved=false 不报错、不变', async () => {
      const { deps, state } = makeDeps({ favorites: [] });
      const result = await runSetFavorite(deps, 'u1', 'r1', false);
      expect(result.saved).toBe(false);
      expect(state.favorites).toEqual([]);
    });
  });

  describe('update_preferences 草稿零副作用（E4 红线）', () => {
    it('返回操作集草稿，不触碰收藏写入', async () => {
      const pref = {
        dislikedIngredients: [] as string[],
        allergens: [] as string[],
        healthGoal: 'BALANCED' as const,
      };
      const favoriteSet = jest.fn();
      const { deps } = makeDeps({ pref });
      deps.favoriteSet = favoriteSet;

      const result = await runUpdatePreferences(deps, 'u1', {
        addDisliked: ['香菜'],
      });

      expect(result.draft.addDisliked).toEqual(['香菜']);
      expect(result.draft.setHealthGoal).toBeUndefined();
      expect(favoriteSet).not.toHaveBeenCalled();
    });

    it('add 幂等：已在忌口的重复 add 被忽略；全部归一为空返回 note', async () => {
      const { deps } = makeDeps({
        pref: {
          dislikedIngredients: ['香菜'],
          allergens: [],
          healthGoal: 'BALANCED',
        },
      });
      const result = await runUpdatePreferences(deps, 'u1', {
        addDisliked: ['香菜'],
        removeDisliked: ['不存在'],
      });
      expect(result.draft).toEqual({});
      expect(result.note).toBeDefined();
    });

    it('remove 归一化：只移除当前存在的项', async () => {
      const { deps } = makeDeps({
        pref: {
          dislikedIngredients: ['香菜', '茼蒿'],
          allergens: [],
          healthGoal: 'BALANCED',
        },
      });
      const result = await runUpdatePreferences(deps, 'u1', {
        removeDisliked: ['香菜', '不存在'],
      });
      expect(result.draft.removeDisliked).toEqual(['香菜']);
    });

    it('全字段缺省时拒绝（抛错，AI 端以工具错误如实呈现）', async () => {
      const { deps } = makeDeps({});
      await expect(runUpdatePreferences(deps, 'u1', {})).rejects.toThrow(
        '未指定任何偏好变更',
      );
    });

    it('healthGoal 覆盖 + 过敏原增删并存于草稿', async () => {
      const { deps } = makeDeps({
        pref: {
          dislikedIngredients: [],
          allergens: ['花生'],
          healthGoal: 'BALANCED',
        },
      });
      const result = await runUpdatePreferences(deps, 'u1', {
        setHealthGoal: 'FAT_LOSS',
        addAllergens: ['虾'],
        removeAllergens: ['花生'],
      });
      expect(result.draft.setHealthGoal).toBe('FAT_LOSS');
      expect(result.draft.addAllergens).toEqual(['虾']);
      expect(result.draft.removeAllergens).toEqual(['花生']);
    });

    // W1.1③：数组含空串/纯空白 → 归一化清洗后行为正确（uniqueClean trim + 过滤）
    it('add 数组含空串与纯空白被清洗，去重后落草稿', async () => {
      const { deps } = makeDeps({
        pref: {
          dislikedIngredients: [],
          allergens: [],
          healthGoal: 'BALANCED',
        },
      });
      const result = await runUpdatePreferences(deps, 'u1', {
        addDisliked: ['香菜', '  ', '', '茼蒿', '香菜'],
      });
      // 空串/空白被过滤、重复被去重、两侧空白被 trim
      expect(result.draft.addDisliked).toEqual(['香菜', '茼蒿']);
    });

    it('输入仅空白与空串时归一化后全空 → 出 note（不入草稿）', async () => {
      const { deps } = makeDeps({
        pref: {
          dislikedIngredients: [],
          allergens: [],
          healthGoal: 'BALANCED',
        },
      });
      // 唯一非空字段是 addDisliked，但其内容归一化后为空 → hasAny 判真，
      // addOps 归一后为空 → 草稿无键 → note。验证清洗不污染「全空」判定。
      const result = await runUpdatePreferences(deps, 'u1', {
        addDisliked: ['  ', ''],
      });
      expect(result.draft).toEqual({});
      expect(result.note).toBeDefined();
    });
  });
});
