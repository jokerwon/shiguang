'use client'

import * as React from 'react'
import useSWR from 'swr'
import { toggleFavorite } from './api'

/**
 * 收藏状态(服务端持久化,ADR-0004)。
 * 数据源 useSWR('/favorites'),返回 recipeId 列表。
 * 保持返回签名 { saved: Set<string>, toggleSave },
 * saved 由返回的 id 数组构造,消费方 saved.has(r.id) 零改动。
 */
export function useFavorites() {
  const { data, mutate, isLoading } = useSWR<string[]>('/favorites')
  const saved = React.useMemo(() => new Set<string>(data ?? []), [data])

  const toggleSave = React.useCallback(
    async (id: string) => {
      const cur = data ?? []
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
      // 乐观更新:先展示 next,请求成功用返回值替换,失败回滚
      await mutate(toggleFavorite(id), {
        optimisticData: next,
        revalidate: false,
        rollbackOnError: true,
      })
    },
    [data, mutate],
  )

  return { saved, toggleSave, isLoading }
}
