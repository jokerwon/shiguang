/* eslint-disable @typescript-eslint/require-await */
// 工具单测（W1.9）：execute 纯逻辑——硬过滤生效、add/remove 幂等与去重、set_favorite 幂等。
// 零 DB 风格，注入 fake deps（参考 recommendation.scoring.spec.ts）。
// 直接测抽出的纯函数（runXxx），避免导入 ai（ESM，ts-jest 不转换 node_modules）。
import {
  runAddPantryItems,
  runRemovePantryItems,
  runSetFavorite,
  runUpdatePreferences,
} from './write-tools-logic';
import { runSearchRecipes, runGetRecipe } from './read-tools-logic';
import type { ChatToolDeps } from './types';
import type { Recipe } from 'generated/prisma/client';

/* ---- fake 工厂 ---- */

const recipe = (over: Partial<Recipe> = {}): Recipe => ({
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
});

/** 构造 fake deps，pantry/favorites 可初始化 */
function makeDeps(
  opts: {
    pantry?: string[];
    favorites?: string[];
    recipes?: Recipe[];
    blocked?: string[];
    pref?: {
      dislikedIngredients: string[];
      allergens: string[];
      healthGoal: 'BALANCED' | 'FAT_LOSS' | 'MUSCLE_GAIN';
    };
  } = {},
): { deps: ChatToolDeps; state: { pantry: string[]; favorites: string[] } } {
  const state = {
    pantry: [...(opts.pantry ?? [])],
    favorites: [...(opts.favorites ?? [])],
  };
  const recipes = opts.recipes ?? [recipe()];
  const deps: ChatToolDeps = {
    loadSignals: async () => ({
      pantry: state.pantry,
      blocked: opts.blocked ?? [],
      healthGoal: opts.pref?.healthGoal ?? 'BALANCED',
    }),
    findRecipes: async () => recipes,
    findRecipeById: async (id) => recipes.find((r) => r.id === id) ?? null,
    pantryFindAll: async () => [...state.pantry],
    pantryReplace: async (_uid, names) => {
      state.pantry = [...names];
      return [...state.pantry];
    },
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

  describe('add_pantry_items 幂等与去重', () => {
    it('已存在的跳过，返回实际新增', async () => {
      const { deps, state } = makeDeps({ pantry: ['鸡蛋'] });
      const result = await runAddPantryItems(deps, 'u1', [
        '鸡蛋',
        '牛腩',
        '牛腩',
        '  ',
      ]);
      expect(result.added).toEqual(['牛腩']);
      expect(state.pantry).toEqual(['鸡蛋', '牛腩']);
    });

    it('全部已存在时 added 为空，pantry 不变', async () => {
      const { deps, state } = makeDeps({ pantry: ['鸡蛋'] });
      const result = await runAddPantryItems(deps, 'u1', ['鸡蛋']);
      expect(result.added).toEqual([]);
      expect(state.pantry).toEqual(['鸡蛋']);
    });
  });

  describe('remove_pantry_items 幂等', () => {
    it('只移除存在的，不存在的忽略', async () => {
      const { deps, state } = makeDeps({ pantry: ['鸡蛋', '牛腩'] });
      const result = await runRemovePantryItems(deps, 'u1', ['牛腩', '不存在']);
      expect(result.removed).toEqual(['牛腩']);
      expect(state.pantry).toEqual(['鸡蛋']);
    });

    it('移除不存在的食材时 removed 为空，pantry 不变', async () => {
      const { deps, state } = makeDeps({ pantry: ['鸡蛋'] });
      const result = await runRemovePantryItems(deps, 'u1', ['牛腩']);
      expect(result.removed).toEqual([]);
      expect(state.pantry).toEqual(['鸡蛋']);
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
    it('返回操作集草稿，不触碰任何写 dep', async () => {
      const pref = {
        dislikedIngredients: [] as string[],
        allergens: [] as string[],
        healthGoal: 'BALANCED' as const,
      };
      const pantryReplace = jest.fn();
      const favoriteSet = jest.fn();
      const { deps } = makeDeps({ pref });
      deps.pantryReplace = pantryReplace;
      deps.favoriteSet = favoriteSet;

      const result = await runUpdatePreferences(deps, 'u1', {
        addDisliked: ['香菜'],
      });

      expect(result.draft.addDisliked).toEqual(['香菜']);
      expect(result.draft.setHealthGoal).toBeUndefined();
      // 零写副作用：结构上无偏好写能力，写 dep 也确未被调用
      expect(pantryReplace).not.toHaveBeenCalled();
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

  // W1.2：写工具空入参路径——空数组走零副作用早返回，不触发写 dep、不抛异常。
  // （缺省必填字段属 JSON Schema 层校验，由模型 provider 端在生成 tool call args
  // 时执行，不在 execute 运行时；ai SDK 的 jsonSchema() tool 不带运行时 validate，
  // 故该路径在纯函数测试层不可及，留待 D2 手动走查。）
  describe('写工具空入参零副作用', () => {
    it('add_pantry_items 空数组不触发 pantryReplace，返回空 added', async () => {
      const pantryReplace = jest.fn();
      const { deps, state } = makeDeps({ pantry: ['鸡蛋'] });
      deps.pantryReplace = pantryReplace;

      const result = await runAddPantryItems(deps, 'u1', []);
      expect(result.added).toEqual([]);
      expect(state.pantry).toEqual(['鸡蛋']);
      expect(pantryReplace).not.toHaveBeenCalled();
    });

    it('add_pantry_items 仅空白/空串归一为空，不触发写', async () => {
      const pantryReplace = jest.fn();
      const { deps } = makeDeps({ pantry: [] });
      deps.pantryReplace = pantryReplace;

      const result = await runAddPantryItems(deps, 'u1', ['  ', '']);
      expect(result.added).toEqual([]);
      expect(pantryReplace).not.toHaveBeenCalled();
    });

    it('remove_pantry_items 空数组不触发 pantryReplace', async () => {
      const pantryReplace = jest.fn();
      const { deps, state } = makeDeps({ pantry: ['鸡蛋'] });
      deps.pantryReplace = pantryReplace;

      const result = await runRemovePantryItems(deps, 'u1', []);
      expect(result.removed).toEqual([]);
      expect(state.pantry).toEqual(['鸡蛋']);
      expect(pantryReplace).not.toHaveBeenCalled();
    });
  });
});
