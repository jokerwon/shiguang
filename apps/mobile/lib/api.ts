/**
 * 移动端 API 客户端（ADR-0014 决策 4）。
 * 移植 Web api.ts 的 401 拦截 + refreshOnce 单飞模式。
 * 差异：access 从内存取、refresh 从 SecureStore 取放 body。
 */
import type { Recipe } from '@shiguang/domain';
import { API_BASE } from './config';
import { authManager, getAccessToken, TokenInvalidError } from './auth';

/* ---- 核心 request ---- */

/**
 * 401 拦截：遇 401 单飞 refresh 再重放一次。
 * refresh 失败 → 触发登出 + 向上抛原 401。
 */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await doFetch(path, init);
  if (res.status !== 401) {
    return unwrap<T>(res);
  }
  try {
    await authManager.refreshOnce();
  } catch (err) {
    // 仅 token 真正失效时触发登出；网络错误保留凭据，下次请求重试
    if (err instanceof TokenInvalidError) {
      await authManager.logout();
    }
    return unwrap<T>(res);
  }
  const replay = await doFetch(path, init);
  return unwrap<T>(replay);
}

async function doFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getAccessToken();
  const headers = new Headers({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const message =
      body && typeof body === 'object' && 'message' in body
        ? body.message
        : undefined;
    throw new Error(
      typeof message === 'string'
        ? message
        : Array.isArray(message) && typeof message[0] === 'string'
          ? message[0]
          : `请求失败 (${res.status})`,
    );
  }
  return res.json();
}

/* ---- 响应类型 ---- */

export interface PaginatedRecipes {
  data: Recipe[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface RecommendedResponse {
  today: Recipe[];
  quick: Recipe[];
}

/* ---- Recipe API ---- */

export interface RecipeQuery {
  cuisine?: string;
  limit?: number;
}

export function fetchRecipes(query: RecipeQuery = {}): Promise<PaginatedRecipes> {
  const params = new URLSearchParams();
  if (query.cuisine) params.set('cuisine', query.cuisine);
  if (query.limit) params.set('limit', String(query.limit));
  const qs = params.toString();
  return request<PaginatedRecipes>(`/recipes${qs ? `?${qs}` : ''}`);
}

export function fetchRecipeById(id: string): Promise<Recipe> {
  return request<Recipe>(`/recipes/${id}`);
}

export function fetchPersonalized(): Promise<RecommendedResponse> {
  return request<RecommendedResponse>('/recipes/personalized');
}

/* ---- Pantry API ---- */

export function fetchPantry(): Promise<string[]> {
  return request<string[]>('/pantry');
}

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
