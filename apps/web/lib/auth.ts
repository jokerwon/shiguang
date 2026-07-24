const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

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
  role: string;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

export async function loginApi(input: LoginInput): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
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
