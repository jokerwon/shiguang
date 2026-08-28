'use client'

import * as React from 'react'
import Link from 'next/link'
import { Sparkles, X } from 'lucide-react'
import { usePreferences } from '@/lib/use-preferences'

const DISMISS_KEY = 'shiguang:prefs-hint-dismissed'

/**
 * 首页软提示（ADR-0005）：空偏好档案时显示的非阻断 banner。
 * 关闭状态存 localStorage，关闭后不再出现。
 */
export function PrefsHint() {
  const { isEmpty, isLoading } = usePreferences()
  // SSR-safe：服务端快照恒为 true（先隐藏），挂载后读 localStorage 真实值
  const [, forceRender] = React.useReducer((x: number) => x + 1, 0)
  const dismissed = React.useSyncExternalStore(
    () => () => {},
    () => localStorage.getItem(DISMISS_KEY) === '1',
    () => true,
  )

  if (isLoading || !isEmpty || dismissed) return null

  return (
    <div className="mx-4 mt-1 flex items-center gap-3 rounded-lg border border-border bg-muted px-4 py-3">
      <Sparkles size={16} strokeWidth={1.5} className="shrink-0 text-muted-foreground" />
      <p className="flex-1 text-[13px] text-muted-foreground">
        完善偏好，让推荐更准
        <Link href="/settings" className="ml-2 font-medium text-foreground hover:underline">
          去设置
        </Link>
      </p>
      <button
        type="button"
        aria-label="关闭提示"
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, '1')
          forceRender()
        }}
        className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
      >
        <X size={14} />
      </button>
    </div>
  )
}
