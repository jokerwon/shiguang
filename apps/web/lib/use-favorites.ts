'use client'

import * as React from 'react'

const STORAGE_KEY = 'shiguang:favorites'

function read(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function write(ids: Set<string>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  window.dispatchEvent(new CustomEvent('shiguang:favorites-change'))
}

/**
 * 跨页面共享的收藏状态（持久化到 localStorage）。
 * 发现页与收藏页通过同一份 storage 保持同步。
 */
export function useFavorites() {
  // 初始用空值，保证 SSR 与客户端首次 hydration 一致；
  // 真实数据在 effect 挂载后从 localStorage 读取，避免 hydration mismatch。
  const [saved, setSaved] = React.useState<Set<string>>(new Set())

  React.useEffect(() => {
    const sync = () => setSaved(read())
    sync()
    window.addEventListener('storage', sync)
    window.addEventListener('shiguang:favorites-change', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('shiguang:favorites-change', sync)
    }
  }, [])

  const toggleSave = React.useCallback((id: string) => {
    setSaved((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      write(next)
      return next
    })
  }, [])

  return { saved, toggleSave }
}
