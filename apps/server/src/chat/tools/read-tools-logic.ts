// 只读工具的纯逻辑（W1.1）：从 tool() 包装中抽出，便于单测（无需导入 ai）。
// search_recipes 先过 blocked 硬过滤再排序（ADR-0006 安全红线），
// 复用 recommendation.scoring 的打分，单一事实源。返回精简字段控制 token。
import type { Recipe } from 'generated/prisma/client';
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

/** 与 `IngredientService` 同口径的归一：剥离尾部括号说明、去空白、转小写 */
function normalizeName(raw: string): string {
  return normalizeIngredientText(raw).trim().toLowerCase();
}

/**
 * `rankRecipes` 只做打分与截断：先对「安全后的候选」算出排序位次，再换到更窄的
 * 食材集合取结果。若直接对窄集合打分，轮换种子会在同一天内随筛选条件变形，
 * 同一道菜在不同条件下的相对顺序不稳定（ADR-0017 轮换语义）。
 */
function restrictRanked<T extends { id: string }>(
  ranked: T[],
  subset: T[],
): T[] {
  const allowed = new Set(subset.map((r) => r.id));
  return ranked.filter((r) => allowed.has(r.id));
}

/**
 * ingredients 参数 → 稳定身份：逐词调用 `IngredientService.identify`
 * （整串相等才命中，规范名与别名共用同一判定），命中多个身份只给候选。
 * 同一身份被多个名称命中只计一次；歧义或未收录的名称进 `unresolved`，
 * 调用方必须据此放弃本次筛选，不得静默丢掉该条件（ADR-0018 D1/F1）。
 */
export async function resolveIngredientTerms(
  deps: ChatToolDeps,
  terms: string[],
): Promise<IngredientResolution> {
  const identityIds = new Set<string>();
  const names: string[] = [];
  const unresolved: IngredientResolution['unresolved'] = [];
  const seenTerms = new Set<string>();

  for (const term of terms) {
    const raw = term.trim();
    const key = normalizeName(raw);
    if (!key || seenTerms.has(key)) continue;
    seenTerms.add(key);
    const { matched, ambiguous } = await deps.identifyIngredient(raw);
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

/** search_recipes 纯逻辑：食材全部包含 + 关键词/菜系/标签/营养筛选 → 安全过滤 → 排序 → 精简 */
export async function runSearchRecipes(
  deps: ChatToolDeps,
  userId: string,
  input: SearchInput,
): Promise<{
  count: number;
  recipes: RecipeSummary[];
  /** 解析出的食材身份（已命中的名称归一结果），供 AI 如实复述 */
  ingredients?: { names: string[] };
  /** 需求状态未表达：结果被安全设置排除，或条件交集为空 */
  note?: string;
  /** 条件无法执行：未识别/歧义/空白食材，本次未做筛选 */
  error?: string;
}> {
  const [signals, recipes] = await Promise.all([
    deps.loadSignals(userId),
    deps.findRecipes(),
  ]);
  let filtered = recipes;

  // 0. 食材全部包含（ADR-0018 / #11）：名称与别名先经 `IngredientService.identify`
  //    归一为稳定身份，再用与筛选页相同的关联判断取交集。放在安全过滤之前，
  //    这样被安全排除的数量与原因（忌口/过敏原/信息不足）才能与「无匹配」分开说。
  let ingredientNames: string[] = [];
  let ingredientTerms: string[] = [];
  if (input.ingredients?.length) {
    const resolved = await resolveIngredientTerms(deps, input.ingredients);
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
    // 全部是空白写法时没有任何可比对的身份：报错而不是放行全部菜谱
    if (resolved.identityIds.length === 0) {
      return {
        count: 0,
        recipes: [],
        error: 'ingredients 里没有有效的食材名称。请与用户确认明确名称后重试。',
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
    ingredientTerms = resolved.names;
  }

  // 1. 关键词
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

  // 2. 菜系
  if (input.cuisine) {
    filtered = filtered.filter(
      (r) => CUISINE_DOWN[r.cuisine] === input.cuisine,
    );
  }

  // 3. 标签
  if (input.tags?.length) {
    filtered = filtered.filter((r) =>
      input.tags.every((t) => r.tags.some((rt) => TAG_DOWN[rt] === t)),
    );
  }

  // 4. 营养/时长
  if (input.maxTime != null)
    filtered = filtered.filter((r) => r.time <= input.maxTime);
  if (input.maxKcal != null)
    filtered = filtered.filter((r) => r.kcal <= input.maxKcal);
  if (input.minProtein != null)
    filtered = filtered.filter((r) => r.protein >= input.minProtein);

  // 5. 统一安全过滤（ADR-0006/0018 安全红线）：与页面筛选、首页推荐同语义，
  //    身份与别名共用、过敏原关系独立、信息不足保守排除；保留排除原因供 AI 如实转述。
  const { signals: safetySignals, allergens } =
    await deps.safety.loadSignals(userId);
  const safe: typeof filtered = [];
  const exclusions: { reason: string; kind: 'blocked' | 'unknown' }[] = [];
  for (const recipe of filtered) {
    const verdict = deps.safety.evaluate(
      {
        ingredients: recipe.ingredients,
        ingredientLinks: recipe.ingredientLinks ?? [],
      },
      safetySignals,
      allergens,
    );
    if (verdict.verdict === 'ok') safe.push(recipe);
    else exclusions.push({ reason: verdict.reason, kind: verdict.verdict });
  }

  // 6. 复用打分排序（单一事实源）：对安全后的候选排序，再换到食材交集取结果，
  //    保证同一批候选的排序与筛选条件无关。
  const now = new Date();
  const ctx: ScoreContext = { hour: now.getHours(), dateKey: dateKeyOf(now) };
  const ranked = rankRecipes(
    safe,
    signals,
    ctx,
    dailySeed(userId, ctx.dateKey),
    safe.length,
  );
  const sorted = restrictRanked(ranked, filtered).slice(0, input.limit ?? 6);

  return {
    count: sorted.length,
    recipes: sorted.map(toSummary),
    ...(ingredientNames.length
      ? { ingredients: { names: ingredientNames } }
      : {}),
    note: buildNote(sorted.length, exclusions, ingredientTerms),
  };
}

/**
 * 零结果的说明：有结果时不解释。分三种情况，避免把安全排除说成「条件太严」——
 * 用户按说明放宽条件也拿不到菜（ADR-0018 C3/D6 要求错误、安全排除与真实无结果可区分）。
 */
function buildNote(
  count: number,
  exclusions: { reason: string; kind: 'blocked' | 'unknown' }[],
  ingredientNames: string[],
): string | undefined {
  if (count > 0) return undefined;
  const ingredientPart = ingredientNames.length
    ? `符合所选食材（${ingredientNames.join('、')}）的`
    : '';
  const reasons = [...new Set(exclusions.map((e) => e.reason))];
  const shown = reasons.slice(0, 2).join('；');
  const more = reasons.length > 2 ? `等 ${reasons.length} 条原因` : '';
  if (exclusions.length > 0) {
    const head = `有 ${exclusions.length} 道${ingredientPart}菜谱因安全设置被排除：${shown}${more}。`;
    const tail = exclusions.some((e) => e.kind === 'unknown')
      ? '其中部分原料的成分信息尚不完整，无法确认是否安全，我们不会拿它们凑数。'
      : '已按你的忌口/过敏设置优先排除。';
    return `${head}${tail}可查看食材资料页的说明，或调整安全设置后再试；放宽烹饪条件不会有帮助。`;
  }
  return ingredientNames.length
    ? `没有同时包含${ingredientNames.join('、')}的菜谱。可减少必须的食材，或换用其他食材。`
    : '没有匹配的菜谱。可尝试放宽条件（去掉标签、提高时长上限等）。';
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
