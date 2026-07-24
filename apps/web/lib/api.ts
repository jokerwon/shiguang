import type { Recipe } from './recipes';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/* ---- 共享 fetch 封装 ---- */

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('shiguang_token');
}

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
