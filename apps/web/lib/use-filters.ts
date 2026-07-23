'use client'

import * as React from 'react'

export interface Filters {
  cuisine: string[]
  pref: string[]
  time: string
}

export const DEFAULT_FILTERS: Filters = { cuisine: [], pref: [], time: 'any' }

const STORAGE_KEY = 'shiguang:filters'

function read(): Filters {
  if (typeof window === 'undefined') return DEFAULT_FILTERS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULT_FILTERS, ...(JSON.parse(raw) as Partial<Filters>) } : DEFAULT_FILTERS
  } catch {
    return DEFAULT_FILTERS
  }
}

function write(f: Filters) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(f))
  window.dispatchEvent(new CustomEvent('shiguang:filters-change'))
}

/** 跨页面共享的筛选条件（菜系 / 偏好 / 时间）。 */
export function useFilters() {
  // 初始用空值，保证 SSR 与客户端首次 hydration 一致；
  // 真实数据在 effect 挂载后从 localStorage 读取，避免 hydration mismatch。
  const [filters, setFilters] = React.useState<Filters>(DEFAULT_FILTERS)

  React.useEffect(() => {
    const sync = () => setFilters(read())
    sync()
    window.addEventListener('storage', sync)
    window.addEventListener('shiguang:filters-change', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('shiguang:filters-change', sync)
    }
  }, [])

  const setFiltersSynced = React.useCallback(
    (next: Filters | ((prev: Filters) => Filters)) => {
      setFilters((prev) => {
        const value = typeof next === 'function' ? next(prev) : next
        write(value)
        return value
      })
    },
    [],
  )

  return { filters, setFilters: setFiltersSynced }
}
