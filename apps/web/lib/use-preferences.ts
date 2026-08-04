'use client'

import * as React from 'react'
import useSWR from 'swr'
import {
  updatePreferences,
  type PreferenceInput,
  type PreferenceResponse,
} from './api'

const DEFAULT_PREFS: PreferenceResponse = {
  dislikedIngredients: [],
  allergens: [],
  healthGoal: 'BALANCED',
}

/**
 * 偏好档案（服务端持久化，ADR-0004/0005）。
 * 数据源 useSWR('/preferences')，乐观更新 + 失败回滚。
 * isEmpty：三字段全为默认值，用于首页软提示（ADR-0005 空档案降级）。
 */
export function usePreferences() {
  const { data, mutate, isLoading } =
    useSWR<PreferenceResponse>('/preferences')

  const update = React.useCallback(
    async (input: PreferenceInput) => {
      await mutate(updatePreferences(input), {
        optimisticData: { ...DEFAULT_PREFS, ...data, ...input },
        revalidate: false,
        rollbackOnError: true,
      })
    },
    [data, mutate],
  )

  const prefs = data ?? DEFAULT_PREFS
  const isEmpty =
    !data ||
    (prefs.dislikedIngredients.length === 0 &&
      prefs.allergens.length === 0 &&
      prefs.healthGoal === 'BALANCED')

  return { prefs, update, isLoading, isEmpty }
}
