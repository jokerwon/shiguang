/**
 * 401 → 单飞 refresh 模块（ADR-0013 决策 4）。
 *
 * 模块级 inflight Promise 是**全局共享单例**：`request()`（lib/api.ts）与
 * chat transport 的 customFetch 必须共用这一份，否则 chat 请求和普通请求
 * 会各自起 refresh 互相把对方的 refresh token 作废（一次一换）。
 *
 * 原生 app 注：Web 走 httpOnly cookie（浏览器自动携带），原生端从 localStorage
 * 取 refresh token 放 body —— 服务端两种来源都认（body 优先）。
 */
import { API_BASE, TOKEN_KEY, REFRESH_TOKEN_KEY } from './constants'

/** 进行中的 refresh Promise；null 表示空闲。模块级共享，全前端唯一 */
let inflight: Promise<void> | null = null

export class RefreshFailedError extends Error {
  constructor() {
    super('refresh 失败，需要重新登录')
    this.name = 'RefreshFailedError'
  }
}

/**
 * 单飞 refresh：已有进行中的 refresh 则直接等它，否则自己发起。
 * 成功 → 新 access（与原生端的 refresh）写 localStorage；
 * 失败 → 抛 RefreshFailedError（本地清理由调用方/auth 层统一做）。
 */
export function refreshOnce(): Promise<void> {
  if (inflight) return inflight
  inflight = doRefresh().finally(() => {
    inflight = null
  })
  return inflight
}

async function doRefresh(): Promise<void> {
  // 原生端双轨：localStorage 里存了 refresh token 就带 body（服务端 body 优先）
  const storedRt =
    typeof window === 'undefined' ? null : localStorage.getItem(REFRESH_TOKEN_KEY)
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include', // Web 走 httpOnly cookie
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(storedRt ? { refreshToken: storedRt } : {}),
  })
  if (!res.ok) {
    throw new RefreshFailedError()
  }
  const data = (await res.json()) as {
    accessToken: string
    refreshToken: string
  }
  localStorage.setItem(TOKEN_KEY, data.accessToken)
  // 存给原生端用；Web 端真正的凭据在 httpOnly cookie 里
  localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken)
}
