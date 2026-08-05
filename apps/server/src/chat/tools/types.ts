// 工具依赖契约（W1.4）：定义工具集需要的 service 接口。
// 工具 execute 内通过闭包捕获 userId，service 通过依赖注入——
// 这样 createChatTools 是纯函数，单测可注入 fake service（参考 recommendation.scoring.spec.ts）。
import type { Recipe } from 'generated/prisma/client';

/** 只读工具 + 写工具需要的 service 能力 */
export interface ChatToolDeps {
  /** 加载用户信号（pantry/blocked/healthGoal），search_recipes 硬过滤用 */
  loadSignals: (userId: string) => Promise<{
    pantry: string[];
    blocked: string[];
    healthGoal: 'BALANCED' | 'FAT_LOSS' | 'MUSCLE_GAIN';
  }>;
  /** 全量菜谱（应用层排序，库量级 80-100 道） */
  findRecipes: () => Promise<Recipe[]>;
  /** 单道菜谱详情 */
  findRecipeById: (id: string) => Promise<Recipe | null>;
  /** pantry 当前列表 */
  pantryFindAll: (userId: string) => Promise<string[]>;
  /** pantry 整体替换（add/remove 工具基于此实现幂等） */
  pantryReplace: (userId: string, names: string[]) => Promise<string[]>;
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
