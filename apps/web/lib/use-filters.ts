'use client'

import * as React from 'react'

export interface Filters {
  cuisine: string[]
  pref: string[]
  time: string
}

export const DEFAULT_FILTERS: Filters = { cuisine: [], pref: [], time: '不限' }

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
  const [filters, setFilters] = React.useState<Filters>(() => read())

  React.useEffect(() => {
    const sync = () => setFilters(read())
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
