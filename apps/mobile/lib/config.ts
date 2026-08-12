// API base 配置。
// 默认 iOS 模拟器（localhost 指向宿主机）；Android 模拟器/真机/生产用 EXPO_PUBLIC_API_BASE 覆盖。
export const API_BASE =
  (process.env.EXPO_PUBLIC_API_BASE as string | undefined) ?? 'http://localhost:3001';
