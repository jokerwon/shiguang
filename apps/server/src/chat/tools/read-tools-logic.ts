// 只读工具的纯逻辑（W1.1）：从 tool() 包装中抽出，便于单测（无需导入 ai）。
// search_recipes 先过 blocked 硬过滤再排序（ADR-0006 安全红线），
// 复用 recommendation.scoring 的打分，单一事实源。返回精简字段控制 token。
import type { Recipe } from 'generated/prisma/client';
import type { IngredientIdentityView } from '../../ingredient/ingredient.service';
import { normalizeIngredientText } from '../../ingredient/normalize';
import {
  CUISINE_LABELS,
  PREF_LABELS,
  type Recipe as DomainRecipe,
} from '@shiguang/domain';
import { CUISINE_DOWN, TAG_DOWN, toResponse } from '../../recipe/recipe.mapper';
import {
  dateKeyOf,
  dailySeed,
  rankRecipes,
  type ScoreContext,
} from '../../recipe/recommendation.scoring';
import type { ChatToolDeps, RecipeSummary } from './types';

/** 将 Recipe 转为精简摘要（控制 tool result token） */
export function toSummary(r: Recipe): RecipeSummary {
  const resp = toResponse(r);
  return {
    id: resp.id,
    name: resp.name,
    cuisine: CUISINE_LABELS[resp.cuisine] ?? resp.cuisine,
    time: resp.time,
    kcal: resp.kcal,
    protein: resp.protein,
    tags: resp.tags.map((t) => PREF_LABELS[t] ?? t),
  };
}

/** ingredients 参数的解析结果：解析出的身份 + 必须原样回给用户的未识别名称 */
export interface IngredientResolution {
  /** 命中的稳定身份（同一身份被多个名称/别名命中时只计一次） */
  identityIds: string[];
  /** 命中的身份名，用于向用户复述「理解为哪些食材」 */
  names: string[];
  /**
   * 未识别（含歧义、未收录、未发布）的名称及候选：
   * 这些条件**必须**如实上报，不能静默丢弃后返回更宽的结果（ADR-0018 D1/F1）。
   */
  unresolved: { term: string; candidates: string[] }[];
}

/** 身份解析结果：命中多个身份时只给候选，由调用方决定如何呈现 */
interface IdentifyOutcome {
  matched: IngredientIdentityView | null;
  ambiguous: IngredientIdentityView[];
}

/** 与 `IngredientService` 同口径的归一：剥离尾部括号说明、去空白、转小写 */
function normalizeName(raw: string): string {
  return normalizeIngredientText(raw).trim().toLowerCase();
}

/** 整串相等才算命中（名称或别名）；命中多个身份只给候选，不擅自选一个 */
function identifyByName(
  identities: IngredientIdentityView[],
  term: string,
): IdentifyOutcome {
  const key = normalizeName(term);
  const hits = identities.filter(
    (i) =>
      normalizeName(i.name) === key ||
      i.aliases.some((a) => normalizeName(a) === key),
  );
  return hits.length === 1
    ? { matched: hits[0], ambiguous: [] }
    : { matched: null, ambiguous: hits };
}

/**
 * ingredients 参数 → 稳定身份：名称与别名共用同一份身份表（整串相等才算命中）。
 * 同一身份被多个名称命中只计一次；歧义或未收录的名称进 `unresolved`，
 * 调用方必须据此放弃本次筛选，不得静默丢掉该条件（ADR-0018 D1/F1）。
 */
export function resolveIngredientTerms(
  identities: IngredientIdentityView[],
  terms: string[],
): IngredientResolution {
  const identityIds = new Set<string>();
  const names: string[] = [];
  const unresolved: IngredientResolution['unresolved'] = [];
  const seenTerms = new Set<string>();

  for (const term of terms) {
    const raw = term.trim();
    const key = normalizeName(raw);
    if (!key || seenTerms.has(key)) continue;
    seenTerms.add(key);
    const { matched, ambiguous } = identifyByName(identities, raw);
    if (matched) {
      if (!identityIds.has(matched.id)) {
        identityIds.add(matched.id);
        names.push(matched.name);
      }
      continue;
    }
    unresolved.push({ term: raw, candidates: ambiguous.map((c) => c.name) });
  }

  return { identityIds: [...identityIds], names, unresolved };
}

/** search_recipes 筛选条件 */
export interface SearchInput {
  keyword?: string;
  /**
   * 必须同时具备的食材（菜谱名称或别名，如「番茄」「西红柿」「鸡蛋」）。
   * 全部包含语义，与筛选页一致；自由文本关键词请用 keyword。
   */
  ingredients?: string[];
  cuisine?: string;
  tags?: string[];
  maxTime?: number;
  maxKcal?: number;
  minProtein?: number;
  limit?: number;
}

/** search_recipes 纯逻辑：关键词/菜系/标签/营养筛选 → 打分排序（含 blocked 硬过滤）→ 精简 */
export async function runSearchRecipes(
  deps: ChatToolDeps,
  userId: string,
  input: SearchInput,
): Promise<{
  count: number;
  recipes: RecipeSummary[];
  /** 解析出的食材身份（已命中的名称归一结果），供 AI 如实复述 */
  ingredients?: { names: string[] };
  /** 需求状态未表达：如所选食材被安全设置全部排除 */
  note?: string;
  /** 条件无法执行：未识别/歧义食材，本次未做筛选，结果不应被当作用户条件的答案 */
  error?: string;
}> {
  const [signals, recipes] = await Promise.all([
    deps.loadSignals(userId),
    deps.findRecipes(),
  ]);

  // 1. 统一安全过滤（ADR-0006/0018 安全红线）：与页面筛选、首页推荐同语义，
  //    身份与别名共用、过敏原关系独立、信息不足保守排除。
  const { signals: safetySignals, allergens } =
    await deps.safety.loadSignals(userId);
  let filtered = recipes.filter(
    (r) =>
      deps.safety.evaluate(
        {
          ingredients: r.ingredients,
          ingredientLinks: r.ingredientLinks ?? [],
        },
        safetySignals,
        allergens,
      ).verdict === 'ok',
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

  // 2.1 食材全部包含（ADR-0018 / #11）：名称与别名先归一为稳定身份，
  //     再用与筛选页相同的关联判断取交集；歧义或未收录的名称绝不静默丢弃。
  let ingredientNames: string[] = [];
  if (input.ingredients?.length) {
    const identities = await deps.ingredientIdentities();
    const resolved = resolveIngredientTerms(identities, input.ingredients);
    if (resolved.unresolved.length) {
      const detail = resolved.unresolved
        .map((u) =>
          u.candidates.length
            ? `「${u.term}」可能指：${u.candidates.join('、')}`
            : `「${u.term}」没有对应的已发布食材`,
        )
        .join('；');
      return {
        count: 0,
        recipes: [],
        error: `${detail}。请与用户确认明确名称后重试，不要用更宽的条件代替。`,
      };
    }
    const links = recipes.flatMap((r) =>
      (r.ingredientLinks ?? []).map((l) => ({
        recipeId: r.id,
        ingredientId: l.ingredient.id,
      })),
    );
    const allowed = new Set(
      deps.recipeIdsContainingAll(resolved.identityIds, links),
    );
    filtered = filtered.filter((r) => allowed.has(r.id));
    ingredientNames = resolved.names;
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
  const sorted = rankRecipes(
    filtered,
    signals,
    ctx,
    dailySeed(userId, ctx.dateKey),
    input.limit ?? 6,
  );

  return {
    count: sorted.length,
    recipes: sorted.map(toSummary),
    ...(ingredientNames.length
      ? { ingredients: { names: ingredientNames } }
      : {}),
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
  { found: false; message: string } | { found: true; recipe: DomainRecipe }
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
      cuisine: CUISINE_LABELS[resp.cuisine] ?? resp.cuisine,
      time: resp.time,
      kcal: resp.kcal,
      protein: resp.protein,
      carb: resp.carb,
      fat: resp.fat,
      tags: resp.tags.map((t) => PREF_LABELS[t] ?? t),
      ingredients: resp.ingredients,
      steps: resp.steps,
      img: resp.img,
    },
  };
}
