// 根布局：认证状态门 + AuthProvider
import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { authManager, type AuthUser, loginApi, registerApi } from '../lib/auth';

/* ---- AuthContext ---- */

interface AuthContextValue {
  user: AuthUser | null;
  initialized: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/* ---- 路由守卫：根据认证状态自动跳转 ---- */

function useProtectedRoute(user: AuthUser | null, initialized: boolean) {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!initialized) return;
    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, initialized, segments]);
}

/* ---- Root Layout ---- */

export default function RootLayout() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const unsub = authManager.subscribe((u) => {
      setUser(u);
      if (authManager.initialized) setInitialized(true);
    });
    // 冷启动恢复（兜底：意外 reject 也必须置 initialized，避免永久白屏）
    authManager
      .restore()
      .then(() => setInitialized(true))
      .catch(() => setInitialized(true));
    return unsub;
  }, []);

  useProtectedRoute(user, initialized);

  const login = useCallback(async (email: string, password: string) => {
    const data = await loginApi({ email, password });
    await authManager.persist(data);
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const data = await registerApi({ email, password, displayName });
      await authManager.persist(data);
    },
    [],
  );

  const logout = useCallback(async () => {
    await authManager.logout();
  }, []);

  if (!initialized) {
    return null; // 启动闪屏由 Expo 处理
  }

  return (
    <AuthContext value={{ user, initialized, login, register, logout }}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen
          name="recipe/[id]"
          options={{ headerShown: true, title: '菜谱详情', presentation: 'card' }}
        />
      </Stack>
    </AuthContext>
  );
}
