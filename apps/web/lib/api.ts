import type { Recipe } from './recipes';
import { API_BASE, getToken } from './constants';

/* ---- 共享 fetch 封装 ---- */

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as { message?: string | string[] }).message;
    throw new Error(
      msg ? (Array.isArray(msg) ? msg[0] : msg) : `请求失败 (${res.status})`,
    );
  }

  return res.json();
}

/* ---- 响应类型 ---- */

export interface PaginatedRecipes {
  data: Recipe[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface RecommendedResponse {
  today: Recipe[];
  quick: Recipe[];
}

/* ---- 查询参数 ---- */

export interface RecipeQuery {
  cuisine?: string;
  tags?: string;
  maxTime?: number;
  keyword?: string;
  page?: number;
  limit?: number;
}

/* ---- Recipe API 函数 ---- */

export function fetchRecipes(query: RecipeQuery = {}): Promise<PaginatedRecipes> {
  const params = new URLSearchParams();
  if (query.cuisine) params.set('cuisine', query.cuisine);
  if (query.tags) params.set('tags', query.tags);
  if (query.maxTime) params.set('maxTime', String(query.maxTime));
  if (query.keyword) params.set('keyword', query.keyword);
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));

  const qs = params.toString();
  return request<PaginatedRecipes>(`/recipes${qs ? `?${qs}` : ''}`);
}

export function fetchRecommended(): Promise<RecommendedResponse> {
  return request<RecommendedResponse>('/recipes/recommended');
}

export function fetchRecipeById(id: string): Promise<Recipe> {
  return request<Recipe>(`/recipes/${id}`);
}

/* ---- Pantry API ---- */

export function fetchPantry(): Promise<string[]> {
  return request<string[]>('/pantry');
}

/** 整体替换当前用户的食材清单 */
export function replacePantry(names: string[]): Promise<string[]> {
  return request<string[]>('/pantry', {
    method: 'PUT',
    body: JSON.stringify(names),
  });
}

/* ---- Favorites API ---- */

export function fetchFavorites(): Promise<string[]> {
  return request<string[]>('/favorites');
}

/** toggle 收藏,返回最新收藏 id 列表 */
export function toggleFavorite(recipeId: string): Promise<string[]> {
  return request<string[]>(`/favorites/${recipeId}`, { method: 'POST' });
}

/* ---- Preferences API ---- */

export type HealthGoal = 'BALANCED' | 'FAT_LOSS' | 'MUSCLE_GAIN';

export interface PreferenceInput {
  dislikedIngredients?: string[];
  allergens?: string[];
  healthGoal?: HealthGoal;
}

export interface PreferenceResponse {
  dislikedIngredients: string[];
  allergens: string[];
  healthGoal: HealthGoal;
}

export function fetchPreferences(): Promise<PreferenceResponse> {
  return request<PreferenceResponse>('/preferences');
}

export function updatePreferences(
  input: PreferenceInput,
): Promise<PreferenceResponse> {
  return request<PreferenceResponse>('/preferences', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}
