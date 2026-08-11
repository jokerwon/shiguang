import type { Recipe } from './recipes';
import { API_BASE, getToken } from './constants';
import { refreshOnce } from './refresh';

/* ---- 共享 fetch 封装 ---- */

/** 带 HTTP status 的 API 错误（用于识别 401 等特定状态） */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * 401 拦截（ADR-0013 决策 4）：遇 401 先单飞 refresh 再重放原请求一次。
 * refresh 失败 → 登出事件广播（use-auth 监听跳登录页）+ 向上抛原 401。
 * 重放仍 401（或原请求本身就不带凭据）→ 直接抛，不递归。
 */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await doFetch(path, init);
  if (res.status !== 401) {
    return unwrap<T>(res);
  }
  try {
    await refreshOnce();
  } catch {
    window.dispatchEvent(new Event('shiguang:logout'));
    return unwrap<T>(res);
  }
  const replay = await doFetch(path, init);
  return unwrap<T>(replay);
}

async function doFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) },
  });
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
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/** 个性化首页响应（GET /recipes/personalized，需认证） */
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

/**
 * 幂等 set 收藏（ADR-0009 操作卡片 undo 需要）。
 * 带 `{ saved: boolean }` body 走幂等 set；无 body 维持 toggle 语义。
 */
export function setFavorite(recipeId: string, saved: boolean): Promise<string[]> {
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

/* ---- Conversations API (ADR-0010) ---- */

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

/** UIMessage（与后端 ai SDK v7 形态一致，宽松类型） */
export interface ChatUIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: { type: string; text?: string; [k: string]: unknown }[];
}

export function fetchConversations(): Promise<ConversationSummary[]> {
  return request<ConversationSummary[]>('/conversations');
}

export function fetchConversationMessages(
  id: string,
): Promise<ChatUIMessage[]> {
  return request<ChatUIMessage[]>(`/conversations/${id}/messages`);
}

export function deleteConversation(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/conversations/${id}`, {
    method: 'DELETE',
  });
}
