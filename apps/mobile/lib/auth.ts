/**
 * 移动端认证模块（ADR-0014 决策 4）。
 * access 仅内存、refresh 存 Keychain（SecureStore）、user 快照存 AsyncStorage。
 * 冷启动恢复 + 401 单飞 refresh。
 */
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from './config';

/* ---- 存储键 ---- */
// SecureStore key 只允许 [A-Za-z0-9._-]（不含冒号），与 Web 端 localStorage 的 key 约定不同
const REFRESH_KEY = 'shiguang.rt';
const USER_KEY = 'shiguang:user';

/* ---- AuthUser ---- */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

/** refresh token 失效/被吊销（区别于网络错误——网络错误保留凭据，下次重试） */
export class TokenInvalidError extends Error {
  constructor(message = '登录已过期，请重新登录') {
    super(message);
    this.name = 'TokenInvalidError';
  }
}

/* ---- access token（仅内存） ---- */
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

function setAccessToken(token: string | null) {
  accessToken = token;
}

/* ---- refresh token（SecureStore / Keychain） ---- */
async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_KEY);
  } catch {
    return null;
  }
}

async function setRefreshToken(token: string) {
  await SecureStore.setItemAsync(REFRESH_KEY, token);
}

async function deleteRefreshToken() {
  await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {});
}

/* ---- user 快照（AsyncStorage，非敏感） ---- */
async function getUserSnapshot(): Promise<AuthUser | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

async function setUserSnapshot(user: AuthUser) {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

async function deleteUserSnapshot() {
  await AsyncStorage.removeItem(USER_KEY).catch(() => {});
}

/* ---- 登录/注册 ---- */
export async function loginApi(input: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = (data as { message?: string | string[] }).message;
    throw new Error(
      msg
        ? Array.isArray(msg)
          ? msg[0]
          : msg
        : '登录失败，请稍后重试',
    );
  }
  return res.json();
}

export async function registerApi(input: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = (data as { message?: string | string[] }).message;
    throw new Error(
      msg
        ? Array.isArray(msg)
          ? msg[0]
          : msg
        : '注册失败，请稍后重试',
    );
  }
  return res.json();
}

/* ---- 认证状态管理器 ---- */
type AuthListener = (user: AuthUser | null) => void;

class AuthManager {
  private _user: AuthUser | null = null;
  private _initialized = false;
  private _listeners = new Set<AuthListener>();

  get user(): AuthUser | null {
    return this._user;
  }

  get initialized(): boolean {
    return this._initialized;
  }

  subscribe(listener: AuthListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private notify() {
    this._listeners.forEach((l) => l(this._user));
  }

  /** 冷启动恢复：读 user 快照恢复 UI → 后台 refreshOnce 换新 access */
  async restore(): Promise<void> {
    const [user, rt] = await Promise.all([getUserSnapshot(), getRefreshToken()]);
    if (user) {
      this._user = user;
      this.notify();
    }
    if (rt) {
      try {
        await this.refreshOnce();
      } catch (err) {
        if (err instanceof TokenInvalidError) {
          // token 真正失效/被吊销 → 清本地，需要重新登录
          await this.clearLocal();
          this._user = null;
          this.notify();
        }
        // 网络错误等瞬时失败 → 保留凭据，保持登录态，下次请求重试 refresh
      }
    }
    this._initialized = true;
    this.notify();
  }

  /** 登录成功后持久化凭据 */
  async persist(data: AuthResponse): Promise<void> {
    setAccessToken(data.accessToken);
    await Promise.all([
      setRefreshToken(data.refreshToken),
      setUserSnapshot(data.user),
    ]);
    this._user = data.user;
    this.notify();
  }

  /** 登出：先调后端作废 refresh，再清本地 */
  async logout(): Promise<void> {
    const rt = await getRefreshToken();
    // 后端失败也照清本地（登出不能因网络卡死）
    fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    }).catch(() => {});
    await this.clearLocal();
    setAccessToken(null);
    this._user = null;
    this.notify();
  }

  private async clearLocal(): Promise<void> {
    await Promise.all([deleteRefreshToken(), deleteUserSnapshot()]);
  }

  /* ---- 401 单飞 refresh（ADR-0013 决策 4） ---- */
  private _inflight: Promise<void> | null = null;

  refreshOnce(): Promise<void> {
    if (this._inflight) return this._inflight;
    this._inflight = this.doRefresh().finally(() => {
      this._inflight = null;
    });
    return this._inflight;
  }

  private async doRefresh(): Promise<void> {
    const rt = await getRefreshToken();
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (res.status === 401 || res.status === 403) {
      // token 失效/复用检测触发 → 抛专门错误，调用方据此清凭据
      throw new TokenInvalidError();
    }
    if (!res.ok) {
      throw new Error(`refresh 失败 (${res.status})`);
    }
    const data = (await res.json()) as {
      accessToken: string;
      refreshToken: string;
    };
    setAccessToken(data.accessToken);
    await setRefreshToken(data.refreshToken);
  }
}

export const authManager = new AuthManager();
