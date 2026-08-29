'use client'

import { Bookmark } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import Link from 'next/link'
import { CUISINE_LABELS, type Recipe } from '@/lib/recipes'
import { RecipeImage } from '@/components/recipe-image'
import { cn } from '@/lib/utils'

export function RecipeCard({ r, score, saved, onToggle }: { r: Recipe; score?: number; saved: boolean; onToggle: () => void }) {
  const name = r.name
  const motionOn = !useReducedMotion()

  return (
    <div
      className="group relative overflow-hidden rounded-lg border border-border bg-background transition-[transform,box-shadow] hover:shadow-[0_8px_24px_-12px_color-mix(in_oklch,var(--foreground)_30%,transparent)] motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.96]"
    >
      <div className="relative aspect-4/3 overflow-hidden bg-muted">
        <RecipeImage r={r} />
        {score ? <span className="absolute top-2 left-2 rounded-full bg-primary px-2 py-0.5 font-mono text-xs font-bold text-primary-foreground">{score}% 匹配</span> : null}
        <button
          type="button"
          onClick={onToggle}
          aria-label={saved ? `取消收藏：${name}` : `收藏：${name}`}
          aria-pressed={saved}
          className={cn(
            'absolute top-2 right-2 z-2 grid size-9 place-items-center rounded-full border-0 backdrop-blur-sm',
            'bg-[color-mix(in_oklch,var(--background)_85%,transparent)]',
            saved ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          <AnimatePresence initial={false}>
            <motion.span
              key={saved ? 'saved' : 'unsaved'}
              initial={motionOn ? { scale: 0.25, opacity: 0, filter: 'blur(4px)' } : { opacity: 0 }}
              animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
              exit={motionOn ? { scale: 0.25, opacity: 0, filter: 'blur(4px)' } : { opacity: 0 }}
              transition={motionOn ? { type: 'spring', duration: 0.3, bounce: 0 } : { duration: 0.15 }}
              className="absolute inset-0 grid place-items-center"
            >
              <Bookmark size={16} fill={saved ? 'currentColor' : 'none'} />
            </motion.span>
          </AnimatePresence>
        </button>
      </div>

      <div className="px-3.5 pb-3.5 pt-3">
        <h3 className="text-[15px] leading-tight font-bold tracking-tight">
          <Link href={`/recipe/${r.id}`} className="after:absolute after:inset-0">
            {name}
          </Link>
        </h3>
        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{CUISINE_LABELS[r.cuisine]}</span>
          <span className="size-0.75 rounded-full bg-border" />
          <span className="font-mono">{r.time}分钟</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {r.ingredients.slice(0, 3).map((i) => (
            <span key={i.name} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
              {i.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
