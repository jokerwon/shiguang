'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';
import { loginApi, registerApi, type AuthUser, type AuthResponse } from '@/lib/auth';
import { API_BASE, TOKEN_KEY, USER_KEY, REFRESH_TOKEN_KEY } from '@/lib/constants';
import { refreshOnce, RefreshFailedError } from '@/lib/refresh';

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

/** 清本地会话（不触碰后端） */
function clearLocal() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // 启动恢复（ADR-0013 前置发现 8）：lazy init 在客户端首帧即从 localStorage 恢复
  // user/token 快照（UI 不闪登出）。SSR 下 window 未定义 → null。
  // loading 保持 true 直到 effect 放行——SSR 与客户端首帧都渲染 spinner，无水合不一致。
  const [initial] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(USER_KEY);
      const savedToken = localStorage.getItem(TOKEN_KEY);
      if (raw && savedToken) {
        return { user: JSON.parse(raw) as AuthUser, token: savedToken };
      }
    } catch {
      // ignore
    }
    return null;
  });
  const [user, setUser] = useState<AuthUser | null>(initial?.user ?? null);
  const [token, setToken] = useState<string | null>(initial?.token ?? null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { mutate } = useSWRConfig();

  // 后台静默 refresh（ADR-0013 决策 4）：快照已上屏，access 很可能已过期 → 换新 access。
  // 有会话痕迹才 refresh；失败 → 真登出（清本地，AuthGuard 因 user=null 重定向，
  // 不主动 push，避免在 /login 等公开页上多一次跳转）。
  // setLoading(false) 必须在 effect 里做：SSR 渲染 spinner，客户端首帧须一致，水合后再放行。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 水合安全必需的 mounted-flag（SSR 与客户端首帧一致）
    setLoading(false);

    const hasSession =
      initial !== null || localStorage.getItem(REFRESH_TOKEN_KEY) !== null;
    if (!hasSession) return;

    refreshOnce()
      .then(() => {
        setToken(localStorage.getItem(TOKEN_KEY));
      })
      .catch((err) => {
        if (err instanceof RefreshFailedError) {
          clearLocal();
          setUser(null);
          setToken(null);
        }
      });
  }, [initial]);

  // 401 拦截链的终点（lib/api.ts refresh 失败时广播）：强制登出
  useEffect(() => {
    const onForceLogout = () => {
      clearLocal();
      setToken(null);
      setUser(null);
      mutate(() => true, undefined, { revalidate: false });
      router.push('/login');
    };
    window.addEventListener('shiguang:logout', onForceLogout);
    return () => window.removeEventListener('shiguang:logout', onForceLogout);
  }, [router, mutate]);

  const persist = useCallback((data: AuthResponse) => {
    localStorage.setItem(TOKEN_KEY, data.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken); // 原生端凭据容器
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setToken(data.accessToken);
    setUser(data.user);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await loginApi({ email, password });
      persist(data);
      // 登录后清空所有 SWR 缓存，迫使以新用户身份重新获取
      mutate(() => true, undefined, { revalidate: false });
    },
    [persist, mutate],
  );

  const register = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const data = await registerApi({ email, password, displayName });
      persist(data);
    },
    [persist],
  );

  // 登出（ADR-0013 决策 5）：先调后端作废 refresh 行，再清本地。
  // 后端失败也照清本地 —— 登出不能因网络卡死。
  const logout = useCallback(() => {
    const rt = localStorage.getItem(REFRESH_TOKEN_KEY);
    fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rt ? { refreshToken: rt } : {}),
    }).catch(() => {
      // 网络失败不影响本地登出
    });
    clearLocal();
    setToken(null);
    setUser(null);
    // 登出时清空所有 SWR 缓存
    mutate(() => true, undefined, { revalidate: false });
    router.push('/login');
  }, [router, mutate]);

  return (
    <AuthContext value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return ctx;
}
