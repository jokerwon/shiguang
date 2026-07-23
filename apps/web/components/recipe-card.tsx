'use client'

import * as React from 'react'
import Image from 'next/image'
import { Bookmark } from 'lucide-react'
import type { Recipe } from '@/lib/recipes'
import { cn } from '@/lib/utils'

const PH_GRADIENT = 'linear-gradient(135deg, var(--primary-soft), color-mix(in oklch, var(--foreground) 6%, transparent))'

function RecipeImage({ r, className }: { r: Recipe; className?: string }) {
  const [err, setErr] = React.useState(false)
  if (!r.img || err) {
    return (
      <div className={cn('grid h-full w-full place-items-center font-mono text-xs text-muted-foreground', className)} style={{ backgroundImage: PH_GRADIENT }}>
        {r.name}
      </div>
    )
  }
  return <Image fill src={r.img} alt={r.name} sizes="(max-width: 640px) 50vw, 220px" loading="lazy" onError={() => setErr(true)} className={cn('h-full w-full object-cover', className)} />
}

export function RecipeCard({ r, score, saved, onOpen, onToggle }: { r: Recipe; score?: number; saved: boolean; onOpen: () => void; onToggle: () => void }) {
  return (
    <div
      className="group relative overflow-hidden rounded-lg border border-border bg-background transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_color-mix(in_oklch,var(--foreground)_30%,transparent)]"
      onClick={onOpen}
    >
      <div className="relative aspect-4/3 overflow-hidden bg-muted">
        <RecipeImage r={r} />
        {score ? <span className="absolute top-2 left-2 rounded-full bg-primary px-2 py-0.5 font-mono text-[11px] font-bold text-primary-foreground">{score}% 匹配</span> : null}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          aria-label={`${saved ? '取消收藏' : '收藏'}：${r.name}`}
          aria-pressed={saved}
          className={cn(
            'absolute top-2 right-2 z-2 grid size-9 place-items-center rounded-full border-0 backdrop-blur-sm',
            'bg-[color-mix(in_oklch,var(--background)_85%,transparent)]',
            saved ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          <Bookmark size={16} fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="px-3.5 pb-3.5 pt-3">
        <h3 className="text-[15px] leading-tight font-bold tracking-tight">{r.name}</h3>
        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{r.cuisine}</span>
          <span className="size-0.75 rounded-full bg-border" />
          <span className="font-mono">{r.time}分钟</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {r.ingredients.slice(0, 3).map((i) => (
            <span key={i} className="rounded-full border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
              {i}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
