import { Redirect } from 'expo-router';
import { useAuth } from './_layout';

export default function Index() {
  const { user } = useAuth();
  // 未登录 → 返回 null，由根布局 useProtectedRoute 守卫跳登录页，
  // 避免未经认证先进入 (tabs) 触发一串 401 请求。
  if (!user) return null;
  return <Redirect href="/(tabs)" />;
}
