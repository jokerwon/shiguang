import type {
  IngredientDetail,
  IngredientListItem,
  Recipe,
  IngredientSummary,
} from '@shiguang/domain';
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
  /** 因安全设置排除的数量与原因（未返回菜谱本身；食材资料仍可查阅） */
  excluded: {
    count: number;
    reasons: string[];
    /** 是否包含「成分信息不足，无法判断」的排除 */
    hasUnknown: boolean;
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
  /** 逗号分隔的食材身份 id：全部包含语义（ADR-0018） */
  ingredients?: string;
  page?: number;
  limit?: number;
}

/* ---- Recipe API 函数 ---- */

/** 构建 /recipes 查询串（fetchRecipes 与 SWR key 共用同一序列化） */
export function recipesUrl(query: RecipeQuery = {}): string {
  const params = new URLSearchParams();
  if (query.cuisine) params.set('cuisine', query.cuisine);
  if (query.tags) params.set('tags', query.tags);
  if (query.maxTime) params.set('maxTime', String(query.maxTime));
  if (query.keyword) params.set('keyword', query.keyword);
  if (query.ingredients) params.set('ingredients', query.ingredients);
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  const qs = params.toString();
  return `/recipes${qs ? `?${qs}` : ''}`;
}

export function fetchRecipes(query: RecipeQuery = {}): Promise<PaginatedRecipes> {
  return request<PaginatedRecipes>(recipesUrl(query));
}

export function fetchRecipeById(id: string): Promise<Recipe> {
  return request<Recipe>(`/recipes/${id}`);
}


/* ---- Ingredients API (ADR-0018) ---- */

export interface IngredientListResult {
  data: IngredientListItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    /** 关键词整串命中身份的数量（0 表示当前只有子串候选或没有结果） */
    exactMatches: number;
  };
}

/** 输入名称的身份解析结果（歧义给出候选，不擅自映射） */
export interface IngredientIdentifyResult {
  matched: IngredientSummary | null
  ambiguous: IngredientSummary[]
}

/** 食材列表查询串（列表页与 SWR key 共用同一序列化） */
export function ingredientsUrl(query: {
  keyword?: string;
  category?: string;
  page?: number;
  limit?: number;
} = {}): string {
  const params = new URLSearchParams();
  if (query.keyword) params.set('keyword', query.keyword);
  if (query.category) params.set('category', query.category);
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  const qs = params.toString();
  return `/ingredients${qs ? `?${qs}` : ''}`;
}

export function fetchIngredients(
  query: Parameters<typeof ingredientsUrl>[0] = {},
): Promise<IngredientListResult> {
  return request<IngredientListResult>(ingredientsUrl(query));
}

export function fetchIngredientById(id: string): Promise<IngredientDetail> {
  return request<IngredientDetail>(`/ingredients/${id}`);
}

/** 名称 → 稳定身份：整串相等才命中，多命中返回候选供确认 */
export function fetchIngredientIdentify(
  terms: string[],
): Promise<IngredientIdentifyResult> {
  const params = new URLSearchParams()
  for (const term of terms) params.append('terms', term)
  return request<IngredientIdentifyResult>(`/ingredients/identify?${params}`)
}

export type { IngredientSummary };

/* ---- Favorites API ---- */

export function fetchFavorites(): Promise<string[]> {
  return request<string[]>('/favorites');
}

/** toggle 收藏（无 saved）；传 saved 走幂等 set（ADR-0009 操作卡片 undo 需要），返回最新收藏 id 列表 */
export function setFavorite(recipeId: string, saved?: boolean): Promise<string[]> {
  return request<string[]>(`/favorites/${recipeId}`, {
    method: 'POST',
    body: saved === undefined ? undefined : JSON.stringify({ saved }),
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
