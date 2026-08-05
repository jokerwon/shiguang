// 只读工具的纯逻辑（W1.1）：从 tool() 包装中抽出，便于单测（无需导入 ai）。
// search_recipes 先过 blocked 硬过滤再排序（ADR-0006 安全红线），
// 复用 recommendation.scoring 的打分，单一事实源。返回精简字段控制 token。
import type { Recipe } from 'generated/prisma/client';
import {
  CUISINE_DOWN,
  CUISINE_ZH,
  TAG_DOWN,
  TAG_ZH,
  toResponse,
} from '../../recipe/recipe.mapper';
import {
  dateKeyOf,
  dailySeed,
  isBlocked,
  scoreRecipe,
  type ScorableRecipe,
  type ScoreContext,
} from '../../recipe/recommendation.scoring';
import type { ChatToolDeps, RecipeSummary } from './types';

/** 将 Recipe 转为精简摘要（控制 tool result token） */
export function toSummary(r: Recipe): RecipeSummary {
  const resp = toResponse(r);
  return {
    id: resp.id,
    name: resp.name,
    cuisine: CUISINE_ZH[resp.cuisine] ?? resp.cuisine,
    time: resp.time,
    kcal: resp.kcal,
    protein: resp.protein,
    tags: resp.tags.map((t) => TAG_ZH[t] ?? t),
  };
}

/** search_recipes 筛选条件 */
export interface SearchInput {
  keyword?: string;
  cuisine?: string;
  tags?: string[];
  maxTime?: number;
  maxKcal?: number;
  minProtein?: number;
  limit?: number;
}

/** search_recipes 纯逻辑：硬过滤 → 筛选 → 打分排序 → 精简 */
export async function runSearchRecipes(
  deps: ChatToolDeps,
  userId: string,
  input: SearchInput,
): Promise<{
  count: number;
  recipes: RecipeSummary[];
  note?: string;
}> {
  const [signals, recipes] = await Promise.all([
    deps.loadSignals(userId),
    deps.findRecipes(),
  ]);

  // 1. 硬过滤：含忌口/过敏原的菜谱一律剔除（ADR-0006 安全红线）
  let filtered = recipes.filter(
    (r) =>
      !isBlocked(
        (r.ingredients as unknown as ScorableRecipe['ingredients']) ?? [],
        signals.blocked,
      ),
  );

  // 2. 关键词
  if (input.keyword) {
    const kw = input.keyword.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.name.toLowerCase().includes(kw) ||
        (r.ingredients as unknown as { name: string }[]).some((i) =>
          i.name.toLowerCase().includes(kw),
        ),
    );
  }

  // 3. 菜系
  if (input.cuisine) {
    filtered = filtered.filter(
      (r) => CUISINE_DOWN[r.cuisine] === input.cuisine,
    );
  }

  // 4. 标签
  if (input.tags?.length) {
    filtered = filtered.filter((r) =>
      input.tags.every((t) => r.tags.some((rt) => TAG_DOWN[rt] === t)),
    );
  }

  // 5. 营养/时长
  if (input.maxTime != null)
    filtered = filtered.filter((r) => r.time <= input.maxTime);
  if (input.maxKcal != null)
    filtered = filtered.filter((r) => r.kcal <= input.maxKcal);
  if (input.minProtein != null)
    filtered = filtered.filter((r) => r.protein >= input.minProtein);

  // 6. 复用打分排序（单一事实源）
  const now = new Date();
  const ctx: ScoreContext = { hour: now.getHours(), dateKey: dateKeyOf(now) };
  const seed = dailySeed(userId, ctx.dateKey);
  const limit = input.limit ?? 6;

  const sorted = filtered
    .map((r) => ({
      r,
      score: scoreRecipe(
        {
          id: r.id,
          time: r.time,
          kcal: r.kcal,
          carb: r.carb,
          protein: r.protein,
          ingredients:
            (r.ingredients as unknown as ScorableRecipe['ingredients']) ?? [],
        },
        signals,
        ctx,
        seed,
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ r }) => r);

  return {
    count: sorted.length,
    recipes: sorted.map(toSummary),
    note:
      sorted.length === 0
        ? '没有匹配的菜谱。可尝试放宽条件（去掉标签、提高时长上限等）。'
        : undefined,
  };
}

/** get_recipe 纯逻辑 */
export async function runGetRecipe(
  deps: ChatToolDeps,
  id: string,
): Promise<
  | { found: false; message: string }
  | {
      found: true;
      recipe: {
        id: string;
        name: string;
        desc: string;
        cuisine: string;
        time: number;
        kcal: number;
        protein: number;
        carb: number;
        fat: number;
        tags: string[];
        ingredients: { name: string; amount: string }[];
        steps: string[];
      };
    }
> {
  const r = await deps.findRecipeById(id);
  if (!r) return { found: false, message: '菜谱不存在' };
  const resp = toResponse(r);
  return {
    found: true,
    recipe: {
      id: resp.id,
      name: resp.name,
      desc: resp.desc,
      cuisine: CUISINE_ZH[resp.cuisine] ?? resp.cuisine,
      time: resp.time,
      kcal: resp.kcal,
      protein: resp.protein,
      carb: resp.carb,
      fat: resp.fat,
      tags: resp.tags.map((t) => TAG_ZH[t] ?? t),
      ingredients: resp.ingredients,
      steps: resp.steps,
    },
  };
}
