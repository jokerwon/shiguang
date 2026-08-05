'use client'

import * as React from 'react'
import { useConversations } from '@/lib/use-conversations'
import { cn } from '@/lib/utils'

/** 相对时间（「刚刚 / N分钟前 / N天前」） */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min}分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}小时前`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}天前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

interface SidebarProps {
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  /** 移动端关闭抽屉 */
  onClose?: () => void
}

export function ChatSidebar({ activeId, onSelect, onNew, onClose }: SidebarProps) {
  const { conversations, remove, isLoading } = useConversations()

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="p-3">
        <button
          type="button"
          onClick={onNew}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
        >
          ＋ 新对话
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {isLoading && conversations.length === 0 && (
          <p className="px-2 py-4 text-[13px] text-muted-foreground">加载中…</p>
        )}
        {!isLoading && conversations.length === 0 && (
          <p className="px-2 py-4 text-[13px] text-muted-foreground">还没有对话</p>
        )}

        <ul className="flex flex-col gap-0.5">
          {conversations.map((c) => (
            <li key={c.id}>
              <div
                className={cn(
                  'group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm',
                  c.id === activeId
                    ? 'bg-primary/10 text-foreground'
                    : 'text-muted-foreground hover:bg-muted/40',
                )}
                onClick={() => {
                  onSelect(c.id)
                  onClose?.()
                }}
              >
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground/70">
                  {relativeTime(c.updatedAt)}
                </span>
                <button
                  type="button"
                  aria-label="删除会话"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm('删除该会话？所有消息将一并删除，不可恢复。')) {
                      remove(c.id)
                      if (c.id === activeId) onNew()
                    }
                  }}
                  className="shrink-0 text-muted-foreground/50 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
