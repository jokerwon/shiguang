'use client'

import * as React from 'react'

export interface Filters {
  cuisine: string[]
  pref: string[]
  time: string
  /** 选中的食材身份 id（全部包含语义）；资料入口进入时只保留当前食材 */
  ingredients: string[]
}

export const DEFAULT_FILTERS: Filters = {
  cuisine: [],
  pref: [],
  time: 'any',
  ingredients: [],
}

const STORAGE_KEY = 'shiguang:filters'

function read(): Filters {
  if (typeof window === 'undefined') return DEFAULT_FILTERS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_FILTERS
    const parsed = JSON.parse(raw) as Partial<Filters>
    return {
      ...DEFAULT_FILTERS,
      ...parsed,
      ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
    }
  } catch {
    return DEFAULT_FILTERS
  }
}

function write(f: Filters) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(f))
  window.dispatchEvent(new CustomEvent('shiguang:filters-change'))
}

/** 读取当前已保存的临时筛选条件（供首帧同步使用，SSR 安全）。 */
export function readFilters(): Filters {
  return read()
}

/** 跨页面共享的筛选条件（菜系 / 偏好 / 时间 / 食材）。 */
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
