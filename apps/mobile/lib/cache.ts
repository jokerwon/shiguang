/**
 * 离线只读缓存层（ADR-0014 决策 3）。
 * 浏览链三键：personalized / recipe detail / favorites 组合。
 * AsyncStorage key-value 持久化最近成功响应 + stale-while-revalidate。
 * 无网不可写（写路径直连在线，无写队列），回网自动刷新。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

/* ---- 缓存键 ---- */
const CACHE_PREFIX = 'shiguang:cache:';
const CACHE_KEY_PERSONALIZED = `${CACHE_PREFIX}personalized`;
const CACHE_KEY_FAVORITES_RECIPES = `${CACHE_PREFIX}favorites:recipes`;
const CACHE_KEY_FAVORITES_IDS = `${CACHE_PREFIX}favorites:ids`;
function cacheKeyRecipe(id: string) {
  return `${CACHE_PREFIX}recipe:${id}`;
}

/* ---- 网络状态 ---- */
let isOnline = true;

// 动态导入 netinfo 以避免启动阻塞和编译依赖
function initNetInfo() {
  try {
    const NetInfo = require('@react-native-community/netinfo');
    NetInfo.fetch()
      .then((state: { isConnected: boolean | null }) => {
        isOnline = state.isConnected ?? true;
      })
      .catch(() => {
        // netinfo 查询失败 → 保持默认在线，避免 unhandled rejection
      });
    NetInfo.addEventListener((state: { isConnected: boolean | null }) => {
      isOnline = state.isConnected ?? true;
    });
  } catch {
    // netinfo 不可用时默认在线
  }
}

initNetInfo();

export function isNetworkOnline(): boolean {
  return isOnline;
}

/* ---- 底层读写 ---- */

async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeCache(key: string, data: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch {
    // 存储失败静默忽略
  }
}

/* ---- SWR 风格的 fetch with cache ---- */

interface SWROptions<T> {
  fetcher: () => Promise<T>;
  cacheKey: string;
  /** 无网时是否返回缓存（默认 true） */
  fallbackToCache?: boolean;
}

interface SWRResult<T> {
  data: T | null;
  error: Error | null;
  isStale: boolean;
}

/**
 * stale-while-revalidate：
 * 1. 先读缓存
 * 2. 在线且有缓存 → 立即返回 stale 数据，后台静默刷新（UI 不被网络阻塞）
 * 3. 在线无缓存 → 等待网络请求，成功则写缓存
 * 4. 离线 → 仅返回缓存
 */
export async function fetchWithCache<T>(opts: SWROptions<T>): Promise<SWRResult<T>> {
  const cached = await readCache<T>(opts.cacheKey);

  if (!isOnline) {
    if (cached && opts.fallbackToCache !== false) {
      return { data: cached, error: null, isStale: true };
    }
    return { data: null, error: new Error('离线不可用'), isStale: false };
  }

  // 有缓存 → 立即返回，后台 revalidate
  if (cached) {
    opts
      .fetcher()
      .then((fresh) => writeCache(opts.cacheKey, fresh))
      .catch(() => {
        // 后台刷新失败 → 保留 stale 缓存
      });
    return { data: cached, error: null, isStale: true };
  }

  // 无缓存 → 必须等网络
  try {
    const fresh = await opts.fetcher();
    await writeCache(opts.cacheKey, fresh);
    return { data: fresh, error: null, isStale: false };
  } catch (error) {
    return { data: null, error: error as Error, isStale: false };
  }
}

/* ---- 导出缓存键常量供外部使用 ---- */
export const CacheKeys = {
  personalized: CACHE_KEY_PERSONALIZED,
  favoritesRecipes: CACHE_KEY_FAVORITES_RECIPES,
  favoritesIds: CACHE_KEY_FAVORITES_IDS,
  recipe: cacheKeyRecipe,
};
