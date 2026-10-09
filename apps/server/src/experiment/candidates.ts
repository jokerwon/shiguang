/* eslint-disable @typescript-eslint/require-await -- 依赖由冻结快照同步构造，签名仍需保持 Promise */
// Phase 10 离线实验：冻结菜谱快照 → 完整合格候选 → 基线排序。
//
// 不复制筛选、安全或映射语义：候选构建直接调用在线 `runSearchRecipes`
// （食材全部包含 / 关键词 / 菜系 / 标签 / 营养 / 时长 → 统一安全过滤 → 基线排序），
// 只把 `limit` 放大到全量，确保拿到「未按旧分数提前截断」的完整合格候选。
// 依赖由冻结快照构造：不连数据库、不读真实用户、不调用聊天模型。
import type { PrismaService } from '../prisma/prisma.service';
import {
  IngredientService,
  type IngredientIdentityView,
} from '../ingredient/ingredient.service';
import {
  RecipeSafetyService,
  type RecipeWithIngredientLinks,
} from '../recipe/recipe-safety.service';
import type { Recipe as DomainRecipe } from '@shiguang/domain';
import { toResponse } from '../recipe/recipe.mapper';
import type { ChatToolDeps } from '../chat/tools/types';
import {
  runSearchRecipes,
  type SearchInput,
} from '../chat/tools/read-tools-logic';
import type { RecipeSummary } from '../chat/tools/types';
import { toFactView, type RecipeFactView } from '../recipe/jev-rerank/protocol';
import type { FictionalProfile, Scenario } from './scenarios';

/** 冻结快照：菜谱完整事实 + 原料稳定身份/别名/过敏原关系（ADR-0018/0019） */
export interface FrozenSnapshot {
  /** 快照生成时间（本地时间字符串） */
  frozenAt: string;
  /** 快照来源（数据库连接串以外的说明，不写凭证） */
  source: string;
  recipes: RecipeWithIngredientLinks[];
}

export function parseSnapshot(text: string): FrozenSnapshot {
  const parsed = JSON.parse(text) as FrozenSnapshot;
  if (!parsed || !Array.isArray(parsed.recipes)) {
    throw new Error('快照格式不正确：缺少 recipes 数组');
  }
  for (const r of parsed.recipes) {
    if (!r || typeof r.id !== 'string' || !Array.isArray(r.ingredientLinks)) {
      throw new Error('快照格式不正确：菜谱缺少 id 或 ingredientLinks');
    }
  }
  return parsed;
}

/** 快照里的原料稳定身份（名称/别名共用同一身份索引） */
function identitiesOf(
  recipes: RecipeWithIngredientLinks[],
): IngredientIdentityView[] {
  const byId = new Map<string, IngredientIdentityView>();
  for (const recipe of recipes) {
    for (const link of recipe.ingredientLinks ?? []) {
      const { id, name, category, aliases } = link.ingredient;
      if (!byId.has(id)) {
        byId.set(id, {
          id,
          name,
          category,
          aliases: aliases.map((a) => a.alias),
        });
      }
    }
  }
  return [...byId.values()];
}

/**
 * 由冻结快照 + 虚构偏好构造工具依赖：与线上同一条代码路径，
 * 安全判断与身份解析用真实 service（只 fake 其 Prisma），避免实验自证一套语义。
 */
export function buildDeps(
  snapshot: FrozenSnapshot,
  profile: FictionalProfile,
): ChatToolDeps {
  const identities = identitiesOf(snapshot.recipes);
  const ingredientService = new IngredientService({} as never);
  const safety = new RecipeSafetyService({
    userPreference: {
      findUnique: async () => ({
        dislikedIngredients: profile.dislikedIngredients,
        allergens: profile.allergens,
        healthGoal: profile.healthGoal,
      }),
    },
  } as unknown as PrismaService);
  const blocked = [...profile.dislikedIngredients, ...profile.allergens];

  return {
    loadSignals: async () => ({ blocked, healthGoal: profile.healthGoal }),
    safety,
    identifyIngredient: async (term) =>
      ingredientService.identifyIn(identities, term),
    recipeIdsContainingAll: (ids, links) =>
      ingredientService.recipeIdsContainingAll(ids, links),
    findRecipes: async () => snapshot.recipes,
    findRecipeById: async (id) =>
      snapshot.recipes.find((r) => r.id === id) ?? null,
    favoriteFindAll: async () => [],
    favoriteSet: async () => [],
    preferenceFind: async () => ({
      dislikedIngredients: profile.dislikedIngredients,
      allergens: profile.allergens,
      healthGoal: profile.healthGoal,
    }),
  };
}

/** 模型与人工评审看到的同一份菜谱事实（只含已有资料，不补写推测信息） */
export type { RecipeFactView };

/** 冻结快照的域层菜谱 → 事实视图（映射实现在生产模块，离线与线上共用一份） */
export function recipeFactView(recipe: DomainRecipe): RecipeFactView {
  return toFactView(recipe);
}

export function factsOf(
  snapshot: FrozenSnapshot,
  id: string,
): RecipeFactView | null {
  const recipe = snapshot.recipes.find((r) => r.id === id);
  return recipe ? recipeFactView(toResponse(recipe)) : null;
}

export interface ScenarioCandidates {
  /** 完整合格候选（安全过滤后），基线顺序，未按旧分数截断 */
  candidates: RecipeSummary[];
  /** 基线前 4 道 */
  baselineTop4: RecipeSummary[];
  /** 条件无法执行（未识别/歧义/空白食材）时的说明 */
  error?: string;
  /** 无结果时的可区分说明（安全排除 / 条件交集为空） */
  note?: string;
}

/** 单个场景 → 完整合格候选与基线结果（不调用任何模型） */
export async function buildCandidates(
  snapshot: FrozenSnapshot,
  scenario: Scenario,
  now: Date,
): Promise<ScenarioCandidates> {
  const deps = buildDeps(snapshot, scenario.profile);
  const input: SearchInput = {
    ...scenario.hard,
    // 全量返回：不按旧分数提前截断，两组共用同一完整合格候选集
    limit: snapshot.recipes.length,
  };
  const out = await runSearchRecipes(deps, scenario.profile.userId, input, now);
  return {
    candidates: out.recipes,
    baselineTop4: out.recipes.slice(0, 4),
    ...(out.error ? { error: out.error } : {}),
    ...(out.note ? { note: out.note } : {}),
  };
}
