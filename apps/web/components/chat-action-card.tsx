'use client'

import * as React from 'react'
import { useSWRConfig } from 'swr'
import { replacePantry, setFavorite } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * 写工具结果的操作卡片（W2.5）：渲染「已添加/移除食材」「已收藏/取消收藏」，
 * 附「撤销」按钮——add↔remove、set_favorite↔反向 set。
 * 已撤销的卡片置灰防重复点击。撤销复用 replacePantry / setFavorite API，
 * 成功后 mutate 对应 SWR key 保证食材页/收藏页数据一致。
 */
interface ActionCardProps {
  toolName: string
  input?: Record<string, unknown>
  output?: unknown
}

export function ChatActionCard({ toolName, input, output }: ActionCardProps) {
  const { mutate } = useSWRConfig()
  const [undone, setUndone] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  const out = (output ?? {}) as Record<string, unknown>

  const handleUndo = async () => {
    if (undone || pending) return
    setPending(true)
    try {
      if (toolName === 'add_pantry_items') {
        const added = (out.added as string[]) ?? []
        const current = (out.pantry as string[]) ?? []
        const next = current.filter((n) => !added.includes(n))
        const result = await replacePantry(next)
        await mutate('/pantry', result, { revalidate: false })
      } else if (toolName === 'remove_pantry_items') {
        const removed = (out.removed as string[]) ?? []
        const current = (out.pantry as string[]) ?? []
        const next = [...current, ...removed]
        const result = await replacePantry(next)
        await mutate('/pantry', result, { revalidate: false })
      } else if (toolName === 'set_favorite') {
        const recipeId = (input?.recipeId as string) ?? ''
        const saved = (out.saved as boolean) ?? false
        const result = await setFavorite(recipeId, !saved)
        await mutate('/favorites', result, { revalidate: false })
      }
      setUndone(true)
    } finally {
      setPending(false)
    }
  }

  const { title, icon } = describeAction(toolName, input, out)

  return (
    <div
      className={cn(
        'my-1 flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2 text-[13px]',
        undone && 'opacity-50',
      )}
    >
      <span className="flex items-center gap-1.5">
        <span aria-hidden>{icon}</span>
        <span>
          {title}
          {undone && <span className="ml-1 text-muted-foreground">（已撤销）</span>}
        </span>
      </span>
      {!undone && (
        <button
          type="button"
          onClick={handleUndo}
          disabled={pending}
          className="shrink-0 font-medium text-primary hover:underline disabled:opacity-50"
        >
          {pending ? '撤销中…' : '撤销'}
        </button>
      )}
    </div>
  )
}

function describeAction(
  toolName: string,
  input: Record<string, unknown> | undefined,
  out: Record<string, unknown>,
): { title: string; icon: string } {
  if (toolName === 'add_pantry_items') {
    const added = (out.added as string[]) ?? []
    if (added.length === 0) return { title: '食材已存在，无需添加', icon: '✓' }
    return { title: `已添加 ${added.join('、')} 到食材清单`, icon: '🥘' }
  }
  if (toolName === 'remove_pantry_items') {
    const removed = (out.removed as string[]) ?? []
    if (removed.length === 0) return { title: '食材清单无变化', icon: '✓' }
    return { title: `已从食材清单移除 ${removed.join('、')}`, icon: '🗑️' }
  }
  if (toolName === 'set_favorite') {
    const saved = (out.saved as boolean) ?? false
    return saved
      ? { title: '已收藏该菜谱', icon: '⭐' }
      : { title: '已取消收藏', icon: '☆' }
  }
  return { title: '操作完成', icon: '✓' }
}
