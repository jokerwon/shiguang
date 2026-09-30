// 统一安全判断（Phase 8-1 / ADR-0018）：身份与别名共用，过敏原关系独立。
//
// 规则（保守优先，宁可空结果也不放过无法判断的菜谱）：
// - 忌口/过敏原由用户设置（`UserPreference`）提供；未设置时不做安全排除。
// - 过敏判断同时看两类信号：
//   1) 菜谱原料的**稳定身份**及其别名是否命中用户忌口/过敏原；
//   2) 原料身份关联的**过敏原关系**是否命中用户过敏原（豆腐≠大豆，但豆腐含大豆）。
// - 用户设置了过敏原时，原料的过敏原信息**未核查**视为无法判断 → 排除，并给出信息不足原因。
//   没设置过敏原时不宣称「过敏安全」，只是不做该维度的排除。
//
// 本文件是纯函数，供 REST 筛选、首页推荐、相关菜谱与 AI 搜索共用，避免第二套安全语义。
import type { IngredientCategory } from 'generated/prisma/client';

/** 一个菜谱原料的稳定身份视图（数据库关联 + 过敏原关系） */
export interface IngredientSafetyView {
  /** 稳定身份 id */
  ingredientId: string;
  /** 身份规范名 */
  name: string;
  /** 别名 */
  aliases: string[];
  category: IngredientCategory;
  /** 已核查的过敏原；空数组表示「信息不足」，不是「确认不含」 */
  allergens: string[];
}

/** 菜谱的原料视图：正文写法与稳定身份成对出现 */
export interface RecipeIngredientView {
  /** 菜谱正文中的写法（含括号说明），用于展示与兼容既有自由文本 */
  rawName: string;
  /** 归一后的稳定身份；无关联时为 null（历史数据或未发布食材） */
  identity: IngredientSafetyView | null;
}

export interface UserSafetySignals {
  /** 未设置忌口与过敏原时为空数组 */
  blocked: string[];
  hasAllergenSettings: boolean;
}

const norm = (s: string) => s.trim().toLowerCase();

/** 写法命中：规范化后的双向 includes，与既有 RecommendationService 语义一致 */
function nameHit(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  return x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x));
}

/** 身份（含别名）是否命中某一设置项 */
function identityHits(identity: IngredientSafetyView, term: string): boolean {
  return (
    nameHit(identity.name, term) ||
    identity.aliases.some((alias) => nameHit(alias, term))
  );
}

/** 原料是否已核查过敏原信息（有稳定身份且已登记过敏原关系视为已核查；否则未知） */
function isAllergenInfoKnown(ingredient: RecipeIngredientView): boolean {
  return (
    ingredient.identity !== null && ingredient.identity.allergens.length > 0
  );
}

export type RecipeSafetyVerdict =
  | { verdict: 'ok' }
  | { verdict: 'blocked'; reason: string }
  | { verdict: 'unknown'; reason: string };

/**
 * 单个菜谱的安全判断。
 * `signals.blocked` 含忌口与过敏原；`allergens` 单独传入以便区分
 * 「命中过敏原」与「过敏信息不足」两种情况。
 */
export function evaluateRecipeSafety(
  ingredients: RecipeIngredientView[],
  signals: UserSafetySignals,
  allergens: string[],
): RecipeSafetyVerdict {
  const nameHitFor = (
    identity: IngredientSafetyView | null,
    rawName: string,
    term: string,
  ) => {
    if (identity) return identityHits(identity, term);
    // 无稳定身份：仅正文写法命中，命中即排除（不因归一缺失而放过已知冲突）
    return nameHit(rawName, term);
  };

  // 1. 忌口：正文写法或已确认身份命中即排除
  for (const ingredient of ingredients) {
    for (const term of signals.blocked) {
      if (nameHitFor(ingredient.identity, ingredient.rawName, term)) {
        return {
          verdict: 'blocked',
          reason: `菜谱含忌口食材「${ingredient.rawName}」`,
        };
      }
    }
  }

  if (allergens.length === 0) return { verdict: 'ok' };

  // 2. 过敏原：身份/别名命中 或 已核查的过敏原关系命中 → 排除
  for (const ingredient of ingredients) {
    for (const allergen of allergens) {
      const byName = nameHitFor(
        ingredient.identity,
        ingredient.rawName,
        allergen,
      );
      const byRelation =
        ingredient.identity?.allergens.some((a) => nameHit(a, allergen)) ??
        false;
      if (byName || byRelation) {
        return {
          verdict: 'blocked',
          reason: `菜谱含过敏原「${allergen}」（原料「${ingredient.rawName}」）`,
        };
      }
    }
  }

  // 3. 过敏信息不足：有过敏设置时，原料的过敏原信息未核查 → 无法判断，排除
  for (const ingredient of ingredients) {
    if (!isAllergenInfoKnown(ingredient)) {
      return {
        verdict: 'unknown',
        reason: `原料「${ingredient.rawName}」的成分信息不足，无法确认是否含过敏原`,
      };
    }
  }

  return { verdict: 'ok' };
}

/** 忌口/过敏原的比较用规范化（对外暴露给筛选与工具共享） */
export function matchesBlockedTerm(terms: string[], value: string): boolean {
  return terms.some((term) => nameHit(value, term));
}
