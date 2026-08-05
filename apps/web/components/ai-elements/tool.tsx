'use client'

import * as React from 'react'
import { Shimmer } from './shimmer'
import { ChatActionCard } from '@/components/chat-action-card'
import { cn } from '@/lib/utils'

/**
 * 单个工具调用 part 的渲染（W2.4）。
 * - 调用中（state 非 output-*）：显示 shimmer「正在…」
 * - 完成：折叠为一行摘要；若为写工具，渲染操作卡片（含 undo）
 */
export interface ToolPart {
  type: string
  toolCallId?: string
  state?: string
  input?: Record<string, unknown>
  output?: unknown
}

const TOOL_LABELS: Record<string, string> = {
  search_recipes: '搜索菜谱',
  get_recipe: '查看菜谱详情',
  get_pantry: '查看食材清单',
  get_favorites: '查看收藏',
  get_preferences: '查看偏好',
  add_pantry_items: '添加食材',
  remove_pantry_items: '移除食材',
  set_favorite: '收藏操作',
}

/** 写工具名集合（操作卡片渲染范围） */
const WRITE_TOOLS = new Set(['add_pantry_items', 'remove_pantry_items', 'set_favorite'])

export function ToolPartView({ part }: { part: ToolPart }) {
  const name = part.type.startsWith('tool-') ? part.type.slice(5) : part.type
  const label = TOOL_LABELS[name] ?? name
  const isRunning = !part.state || part.state === 'input-streaming' || part.state === 'input-available'
  const isError = part.state === 'output-error'

  // 写工具完成态 → 操作卡片
  if (!isRunning && !isError && WRITE_TOOLS.has(name)) {
    return (
      <ChatActionCard
        toolName={name}
        input={part.input}
        output={part.output}
      />
    )
  }

  // 只读工具 / 调用中 / 错误：折叠行
  return (
    <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
      <span className={cn('inline-block size-1.5 rounded-full', isError ? 'bg-destructive' : 'bg-primary/60')} />
      {isRunning ? (
        <Shimmer>{label}中…</Shimmer>
      ) : isError ? (
        <span>{label}失败</span>
      ) : (
        <span>{label}完成</span>
      )}
    </div>
  )
}
