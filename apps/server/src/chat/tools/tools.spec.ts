/* eslint-disable @typescript-eslint/require-await */
// 工具单测（W1.9）：execute 纯逻辑——硬过滤生效、add/remove 幂等与去重、set_favorite 幂等。
// 零 DB 风格，注入 fake deps（参考 recommendation.scoring.spec.ts）。
// 直接测抽出的纯函数（runXxx），避免导入 ai（ESM，ts-jest 不转换 node_modules）。
import {
  runAddPantryItems,
  runRemovePantryItems,
  runSetFavorite,
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
});
