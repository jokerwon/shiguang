// Web 私有类型与共享域层的再导出。
// 类型、常量、纯函数已迁移到 @shiguang/domain（ADR-0015），此处 re-export 保持现有 import 路径不变。
export type {
  Ingredient,
  Recipe,
} from '@shiguang/domain';
export {
  CUISINES,
  PREFS,
  TIMES,
  CUISINE_LABELS,
  PREF_LABELS,
  TIME_LABELS,
  SUGGEST_INGS,
  norm,
  resolveIng,
  hasIng,
  matchScore,
  missingIngredients,
  matchRecipes,
} from '@shiguang/domain';

/** Web UI 编排类型（私有，不进入共享域层） */
export type ScreenId = 'home' | 'pantry' | 'chat' | 'saved' | 'filter' | 'detail';
