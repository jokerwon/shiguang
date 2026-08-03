'use client'

import * as React from 'react'
import useSWR from 'swr'
import { replacePantry } from './api'

/**
 * 食材清单(服务端持久化,ADR-0004)。
 * 数据源 useSWR('/pantry'),写操作乐观更新 + 失败回滚。
 * 保持返回签名 { pantry, setPantry, addIng, removeAt, toggleSuggest, clear },
 * 消费方零改动(loading 期 pantry 为空,与空清单视觉一致)。
 */
export function usePantry() {
  const { data, mutate, isLoading } = useSWR<string[]>('/pantry')
  const pantry = data ?? []

  const setPantry = React.useCallback(
    async (next: string[] | ((prev: string[]) => string[])) => {
      const newVal = typeof next === 'function' ? next(data ?? []) : next
      // 乐观更新:先展示 newVal,请求成功用返回值替换,失败回滚到原 data
      await mutate(replacePantry(newVal), {
        optimisticData: newVal,
        revalidate: false,
        rollbackOnError: true,
      })
    },
    [data, mutate],
  )

  const addIng = React.useCallback(
    (ing: string) => {
      const v = ing.trim()
      if (!v) return
      const cur = data ?? []
      if (cur.includes(v)) return
      setPantry((prev) => [...prev, v])
    },
    [data, setPantry],
  )

  const removeAt = React.useCallback(
    (idx: number) => setPantry((prev) => prev.filter((_, x) => x !== idx)),
    [setPantry],
  )

  const toggleSuggest = React.useCallback(
    (ing: string) =>
      setPantry((prev) =>
        prev.includes(ing) ? prev.filter((x) => x !== ing) : [...prev, ing],
      ),
    [setPantry],
  )

  const clear = React.useCallback(() => setPantry([]), [setPantry])

  return { pantry, setPantry, addIng, removeAt, toggleSuggest, clear, isLoading }
}
