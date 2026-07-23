'use client'

import * as React from 'react'

const STORAGE_KEY = 'shiguang:pantry'

function read(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function write(ings: string[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ings))
  window.dispatchEvent(new CustomEvent('shiguang:pantry-change'))
}

/**
 * 跨页面共享的食材清单（持久化到 localStorage）。
 * 食材页写入、详情页读取匹配度。
 */
export function usePantry() {
  // 初始用空值，保证 SSR 与客户端首次 hydration 一致；
  // 真实数据在 effect 挂载后从 localStorage 读取，避免 hydration mismatch。
  const [pantry, setPantry] = React.useState<string[]>([])

  React.useEffect(() => {
    const sync = () => setPantry(read())
    sync()
    window.addEventListener('storage', sync)
    window.addEventListener('shiguang:pantry-change', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('shiguang:pantry-change', sync)
    }
  }, [])

  const setPantrySynced = React.useCallback(
    (next: string[] | ((prev: string[]) => string[])) => {
      setPantry((prev) => {
        const value = typeof next === 'function' ? next(prev) : next
        write(value)
        return value
      })
    },
    [],
  )

  const addIng = React.useCallback(
    (ing: string) => {
      const v = ing.trim()
      if (!v) return
      setPantrySynced((prev) => (prev.includes(v) ? prev : [...prev, v]))
    },
    [setPantrySynced],
  )

  const removeAt = React.useCallback(
    (idx: number) => setPantrySynced((prev) => prev.filter((_, x) => x !== idx)),
    [setPantrySynced],
  )

  const toggleSuggest = React.useCallback(
    (ing: string) =>
      setPantrySynced((prev) =>
        prev.includes(ing) ? prev.filter((x) => x !== ing) : [...prev, ing],
      ),
    [setPantrySynced],
  )

  const clear = React.useCallback(() => setPantrySynced([]), [setPantrySynced])

  return { pantry, setPantry: setPantrySynced, addIng, removeAt, toggleSuggest, clear }
}
