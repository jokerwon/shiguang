'use client'

import * as React from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { deleteConversation, type ConversationSummary } from './api'

/** 会话列表（SWR key '/conversations'，按 updatedAt 倒序） */
export function useConversations() {
  const { data, mutate, isLoading } = useSWR<ConversationSummary[]>(
    '/conversations',
  )

  const remove = React.useCallback(
    async (id: string) => {
      await deleteConversation(id)
      await mutate(
        (cur) => (cur ?? []).filter((c) => c.id !== id),
        { revalidate: false },
      )
    },
    [mutate],
  )

  return { conversations: data ?? [], remove, mutate, isLoading }
}

/** 刷新会话列表（新建/标题更新后调用） */
export function refreshConversations() {
  return globalMutate('/conversations')
}
