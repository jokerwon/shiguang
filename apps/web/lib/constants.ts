// 全局共享常量与工具 — 避免在多个文件中重复定义

/** 后端 API 基础地址 */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

/** localStorage 中存储认证 token / 用户信息的键名 */
export const TOKEN_KEY = 'shiguang:token'
export const USER_KEY = 'shiguang:user'

/** 从 localStorage 读取认证 token（SSR 安全） */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}
