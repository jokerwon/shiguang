'use client'

import * as React from 'react'
import { useSWRConfig } from 'swr'
import { setFavorite } from '@/lib/api'
import { cn } from '@/lib/utils'

/** 收藏操作的结果卡片，可撤销。 */
interface ActionCardProps {
  input?: Record<string, unknown>
  output?: unknown
  readOnly?: boolean
}

export function ChatActionCard({ input, output, readOnly }: ActionCardProps) {
  const { mutate } = useSWRConfig()
  const [undone, setUndone] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  const out = (output ?? {}) as Record<string, unknown>

  const handleUndo = async () => {
    if (undone || pending || readOnly) return
    setPending(true)
    try {
      const recipeId = (input?.recipeId as string) ?? ''
      const saved = (out.saved as boolean) ?? false
      const result = await setFavorite(recipeId, !saved)
      await mutate('/favorites', result, { revalidate: false })
      setUndone(true)
    } finally {
      setPending(false)
    }
  }

  const { title, icon } = describeAction(out)

  return (
    <div
      className={cn(
        'my-1 flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2 text-[13px]',
        (undone || readOnly) && 'opacity-50',
      )}
    >
      <span className="flex items-center gap-1.5">
        <span aria-hidden>{icon}</span>
        <span>
          {title}
          {undone && <span className="ml-1 text-muted-foreground">（已撤销）</span>}
        </span>
      </span>
      {readOnly ? (
        <span className="shrink-0 text-muted-foreground">历史操作已锁定</span>
      ) : (
        !undone && (
          <button
            type="button"
            onClick={handleUndo}
            disabled={pending}
            className="shrink-0 font-medium text-accent-foreground hover:underline disabled:opacity-50"
          >
            {pending ? '撤销中…' : '撤销'}
          </button>
        )
      )}
    </div>
  )
}

function describeAction(out: Record<string, unknown>): { title: string; icon: string } {
  const saved = (out.saved as boolean) ?? false
  return saved
    ? { title: '已收藏该菜谱', icon: '⭐' }
    : { title: '已取消收藏', icon: '☆' }
}
