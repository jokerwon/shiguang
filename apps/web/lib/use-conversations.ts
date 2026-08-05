'use client'

import * as React from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { deleteConversation, type ConversationSummary } from './api'

/** 会话列表（SWR key '/conversations'，按 updatedAt 倒序） */
export function useConversations() {
  const { data, mutate, isLoading } = useSWR<ConversationSummary[]>(
    '/conversations',
  )

  // ADR-0011：删除失败时回滚乐观删除并向上抛出，调用方据 Promise reject 做用户提示。
  const remove = React.useCallback(
    async (id: string) => {
      // 乐观删除：先从缓存移除
      await mutate(
        (cur) => (cur ?? []).filter((c) => c.id !== id),
        { revalidate: false },
      )
      try {
        await deleteConversation(id)
      } catch (e) {
        // 失败回滚：恢复被删除的条目（重新拉取列表最稳妥）
        await mutate()
        throw e
      }
      // 成功：保持乐观删除，后台静默 revalidate 兜底
      void mutate()
    },
    [mutate],
  )

  return { conversations: data ?? [], remove, mutate, isLoading }
}

/** 刷新会话列表（新建/标题更新后调用） */
export function refreshConversations() {
  return globalMutate('/conversations')
}
