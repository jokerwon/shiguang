// 工具依赖契约（W1.4）：定义工具集需要的 service 接口。
// 工具 execute 内通过闭包捕获 userId，service 通过依赖注入——
// 这样 createChatTools 是纯函数，单测可注入 fake service（参考 recommendation.scoring.spec.ts）。
import type { Recipe } from 'generated/prisma/client';
import type { IngredientIdentityView } from '../../ingredient/ingredient.service';
import type {
  RecipeWithIngredientLinks,
  RecipeSafetyService,
} from '../../recipe/recipe-safety.service';

/** 只读工具 + 写工具需要的 service 能力 */
export interface ChatToolDeps {
  /**
   * 已发布食材身份表（`IngredientService.identifyIn` 的输入）：AI 工具把自由文本
   * 名称/别名归一为稳定身份，歧义时给出候选而不是擅自选一个（ADR-0018）。
   */
  ingredientIdentities: () => Promise<IngredientIdentityView[]>;
  /**
   * 全部包含语义（复用 `IngredientService.recipeIdsContainingAll`）：
   * 给定身份集合与菜谱关联，返回同时包含全部身份的菜谱 id。
   */
  recipeIdsContainingAll: (
    selectedIds: string[],
    links: { recipeId: string; ingredientId: string }[],
  ) => string[];
  /** 加载用户信号（blocked/healthGoal），排序权重用 */
  loadSignals: (userId: string) => Promise<{
    blocked: string[];
    healthGoal: 'BALANCED' | 'FAT_LOSS' | 'MUSCLE_GAIN';
  }>;
  /** 统一安全判断（身份/别名/过敏原关系/信息不足），与页面筛选同语义 */
  safety: RecipeSafetyService;
  /** 全量菜谱；带稳定身份关联时安全判断才能覆盖别名与过敏原关系 */
  findRecipes: () => Promise<(Recipe & Partial<RecipeWithIngredientLinks>)[]>;
  /** 单道菜谱详情 */
  findRecipeById: (id: string) => Promise<Recipe | null>;
  /** 收藏列表 */
  favoriteFindAll: (userId: string) => Promise<string[]>;
  /** 幂等 set 收藏（ADR-0009 写工具语义） */
  favoriteSet: (
    userId: string,
    recipeId: string,
    saved: boolean,
  ) => Promise<string[]>;
  /** 偏好档案 */
  preferenceFind: (userId: string) => Promise<{
    dislikedIngredients: string[];
    allergens: string[];
    healthGoal: 'BALANCED' | 'FAT_LOSS' | 'MUSCLE_GAIN';
  } | null>;
}

/** 精简菜谱字段（控制 tool result token） */
export interface RecipeSummary {
  id: string;
  name: string;
  cuisine: string;
  time: number;
  kcal: number;
  protein: number;
  tags: string[];
}
