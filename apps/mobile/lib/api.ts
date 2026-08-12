/**
 * 移动端 API 客户端（ADR-0014 决策 4）。
 * 移植 Web api.ts 的 401 拦截 + refreshOnce 单飞模式。
 * 差异：access 从内存取、refresh 从 SecureStore 取放 body。
 */
import type { Recipe } from '@shiguang/domain';
import { API_BASE } from './config';
import { authManager, getAccessToken, TokenInvalidError } from './auth';

/* ---- 错误类型 ---- */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

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
  // 合并调用方 headers：安全支持 Headers 实例与普通对象，避免覆盖 Authorization/Content-Type
  const caller = init?.headers;
  if (caller) {
    if (caller instanceof Headers) {
      caller.forEach((value, key) => headers.set(key, value));
    } else {
      Object.entries(caller).forEach(([key, value]) => {
        headers.set(key, String(value));
      });
    }
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as { message?: string | string[] }).message;
    throw new ApiError(
      msg ? (Array.isArray(msg) ? msg[0] : msg) : `请求失败 (${res.status})`,
      res.status,
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
  tags?: string;
  maxTime?: number;
  keyword?: string;
  page?: number;
  limit?: number;
}

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

export function setFavorite(
  recipeId: string,
  saved: boolean,
): Promise<string[]> {
  return request<string[]>(`/favorites/${recipeId}`, {
    method: 'POST',
    body: JSON.stringify({ saved }),
  });
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
