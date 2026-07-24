'use client';

import useSWR from 'swr';
import type {
  RecipeQuery,
  PaginatedRecipes,
  RecommendedResponse,
} from './api';
import type { Recipe } from './recipes';

/* ---- key 构建 ---- */

function buildRecipesKey(query: RecipeQuery): string {
  const params = new URLSearchParams();
  if (query.cuisine) params.set('cuisine', query.cuisine);
  if (query.tags) params.set('tags', query.tags);
  if (query.maxTime) params.set('maxTime', String(query.maxTime));
  if (query.keyword) params.set('keyword', query.keyword);
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  const qs = params.toString();
  return `/recipes${qs ? `?${qs}` : ''}`;
}

/* ---- SWR Hooks ---- */

// 获取全量菜谱（limit=100），供 Pantry / Chat 使用
export function useRecipesQuery() {
  const key = buildRecipesKey({ limit: 100 });
  return useSWR<PaginatedRecipes>(key);
}

// 获取推荐菜谱
export function useRecommended() {
  return useSWR<RecommendedResponse>('/recipes/recommended');
}

// 按筛选条件获取菜谱（Filter 页面使用）
// query 为 null 时不发起请求
export function useRecipesFilter(query: RecipeQuery | null) {
  const key = query ? buildRecipesKey(query) : null;
  return useSWR<PaginatedRecipes>(key);
}

// 获取单个菜谱（客户端用）
export function useRecipeById(id: string | undefined) {
  const key = id ? `/recipes/${id}` : null;
  return useSWR<Recipe>(key);
}

/* ---- 兼容旧接口的 helper ---- */

// 兼容旧的 useRecipes() 接口：{ recipes: Recipe[], loading, error }
export function useAllRecipes() {
  const swr = useRecipesQuery();
  return {
    recipes: swr.data?.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error,
    mutate: swr.mutate,
  };
}
