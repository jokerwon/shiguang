import { API_BASE } from './constants';

interface LoginInput {
  email: string;
  password: string;
}

interface RegisterInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/** ADR-0013：login/register/refresh 同构响应；refreshToken 供原生端（Web 走 cookie） */
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export async function loginApi(input: LoginInput): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    credentials: 'include', // 收服务端种的 refresh cookie（ADR-0013）
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { message?: string | string[] }).message
        ? Array.isArray(data.message)
          ? data.message[0]
          : data.message
        : '登录失败，请稍后重试',
    );
  }

  return res.json();
}

export async function registerApi(input: RegisterInput): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { message?: string | string[] }).message
        ? Array.isArray(data.message)
          ? data.message[0]
          : data.message
        : '注册失败，请稍后重试',
    );
  }

  return res.json();
}
