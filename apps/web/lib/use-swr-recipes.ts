'use client';

import useSWR from 'swr';
import { ingredientsUrl, recipesUrl } from './api';
import type {
  IngredientListResult,
  PaginatedRecipes,
  RecipeQuery,
  RecommendedResponse,
} from './api';

/* ---- SWR Hooks ---- */


// 获取个性化首页推荐（需认证；token 在 localStorage，只能 client 端取）
export function usePersonalized() {
  return useSWR<RecommendedResponse>('/recipes/personalized');
}

// 按筛选条件获取菜谱（Filter 页面使用）；query 为 null 时不发起请求
export function useRecipesFilter(query: RecipeQuery | null) {
  return useSWR<PaginatedRecipes>(query ? recipesUrl(query) : null);
}

// 食材资料列表（名称/别名搜索 + 一层分类）；query 为 null 时不发起请求
export function useIngredients(
  query: { keyword?: string; category?: string; page?: number; limit?: number } | null,
) {
  return useSWR<IngredientListResult>(query ? ingredientsUrl(query) : null);
}


