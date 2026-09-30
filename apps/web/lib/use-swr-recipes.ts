'use client';

import useSWR from 'swr';
import { recipesUrl } from './api';
import type {
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


