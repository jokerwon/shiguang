// 工具依赖契约（W1.4）：定义工具集需要的 service 接口。
// 工具 execute 内通过闭包捕获 userId，service 通过依赖注入——
// 这样 createChatTools 是纯函数，单测可注入 fake service（参考 recommendation.scoring.spec.ts）。
import type { IngredientIdentifyResult } from '../../ingredient/ingredient.service';
import type {
  RecipeWithIngredientLinks,
  RecipeSafetyService,
} from '../../recipe/recipe-safety.service';
import type { RerankClient } from '../../recipe/jev-rerank/client';

/** 只读工具 + 写工具需要的 service 能力 */
export interface ChatToolDeps {
  /**
   * 身份解析（`IngredientService.identify`）：名称/别名整体解析为稳定身份，
   * 命中多个身份只给候选，不擅自选一个（ADR-0018）。
   * 工具侧逐词调用后自行区分命中/歧义/未收录，不另写一套名称匹配。
   */
  identifyIngredient: (term: string) => Promise<IngredientIdentifyResult>;
  /**
   * 全部包含语义（复用 `IngredientService.recipeIdsContainingAll`）：
   * 给定身份集合与菜谱关联，返回同时包含全部身份的菜谱 id。
   */
  recipeIdsContainingAll: (
    selectedIds: string[],
    links: { recipeId: string; ingredientId: string }[],
  ) => string[];
  /** 加载用户信号（blocked 供对话提示词、healthGoal 供排序权重） */
  loadSignals: (userId: string) => Promise<{
    blocked: string[];
    healthGoal: 'BALANCED' | 'FAT_LOSS' | 'MUSCLE_GAIN';
  }>;
  /** 统一安全判断（身份/别名/过敏原关系/信息不足），与页面筛选同语义 */
  safety: RecipeSafetyService;
  /** 全量菜谱；确定带稳定身份关联（ADR-0019：原料只此一份，安全与关键词都读它） */
  findRecipes: () => Promise<RecipeWithIngredientLinks[]>;
  /** 单道菜谱详情（同样带关联行，否则原料为空） */
  findRecipeById: (id: string) => Promise<RecipeWithIngredientLinks | null>;
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
  /**
   * 候选重排序客户端（ADR-0020）。缺失 = 未接入或未启用：搜索保持基线顺序。
   * 接入点在这里，离线评估与线上接入注入不同实现，不新增其他 seam。
   */
  rerank?: RerankClient;
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
