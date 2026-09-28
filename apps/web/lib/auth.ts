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

async function authPost(
  path: 'login' | 'register',
  input: LoginInput | RegisterInput,
  fallback: string,
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/${path}`, {
    method: 'POST',
    credentials: 'include', // 收服务端种的 refresh cookie（ADR-0013）
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const data: unknown = await res.json().catch(() => null);
    const message =
      data && typeof data === 'object' && 'message' in data
        ? data.message
        : undefined;
    throw new Error(
      typeof message === 'string'
        ? message
        : Array.isArray(message) && typeof message[0] === 'string'
          ? message[0]
          : fallback,
    );
  }

  return res.json();
}

export function loginApi(input: LoginInput): Promise<AuthResponse> {
  return authPost('login', input, '登录失败，请稍后重试');
}

export function registerApi(input: RegisterInput): Promise<AuthResponse> {
  return authPost('register', input, '注册失败，请稍后重试');
}
