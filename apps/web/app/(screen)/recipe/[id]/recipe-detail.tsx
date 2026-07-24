'use client'

import * as React from 'react'
import { ChevronLeft, Clock, Calendar, Bookmark } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { usePantry } from '@/lib/use-pantry'
import { useFavorites } from '@/lib/use-favorites'
import { CUISINE_LABELS, matchScore, type Recipe } from '@/lib/recipes'
import { cn } from '@/lib/utils'

export function RecipeDetail({ recipe }: { recipe: Recipe }) {
  const router = useRouter()
  const { pantry } = usePantry()
  const { saved, toggleSave } = useFavorites()
  const [tab, setTab] = React.useState<'steps' | 'ings'>('steps')
  const [imgErr, setImgErr] = React.useState(false)

  const r = recipe
  const m = matchScore(r, pantry)
  const isSaved = saved.has(r.id)
  const name = r.name

  return (
    <section className="animate-in fade-in slide-in-from-bottom-1.5 duration-200 pb-28">
      {/* hero */}
      <div className="relative">
        {r.img && !imgErr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={r.img}
            alt={name}
            onError={() => setImgErr(true)}
            className="aspect-4/3 w-full object-cover md:aspect-21/9"
          />
        ) : (
          <div className="grid aspect-4/3 w-full place-items-center bg-[linear-gradient(135deg,var(--primary-soft),color-mix(in_oklch,var(--foreground)_6%,transparent))] font-mono text-sm text-muted-foreground md:aspect-21/9">
            {name}
          </div>
        )}
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="返回"
          className="absolute top-3 left-3 grid size-11 place-items-center rounded-full border border-border bg-[color-mix(in_oklch,var(--background)_85%,transparent)] backdrop-blur-sm md:top-4 md:left-4"
        >
          <ChevronLeft size={18} />
        </button>
      </div>

      {/* body */}
      <div className="md:mx-auto md:max-w-3xl md:px-4">
        <div className="p-4">
          <h1 className="text-[clamp(30px,4.4vw,46px)] leading-[1.1] font-bold tracking-tight">
            {name}
          </h1>
          <div className="mt-3 flex gap-6 text-[13px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock size={15} />
              <span className="font-mono">{r.time}分钟</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar size={15} />
              <span className="font-mono">{r.kcal}kcal</span>
            </span>
            <span>{CUISINE_LABELS[r.cuisine]}</span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{r.desc}</p>

          {pantry.length > 0 && (
            <div className="mt-4 rounded-lg border border-border bg-muted p-4">
              <div className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
                {`食材匹配 · ${m.score}%`}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.ingredients.map((i) => {
                  const got = m.have.includes(i)
                  return (
                    <span
                      key={i}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs',
                        got
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-muted-foreground',
                      )}
                    >
                      {got ? '✓ ' : ''}
                      {i}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {/* tabs */}
          <div className="mt-6 flex gap-1 border-b border-border">
            {(
              [
                ['steps', '做法'],
                ['ings', '食材清单'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  '-mb-px border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors',
                  tab === key
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'steps' ? (
            <div className="pt-4">
              {r.steps.map((s, i) => (
                <div
                  key={i}
                  className="flex gap-4 border-b border-border py-3 last:border-b-0"
                >
                  <div className="grid size-6.5 shrink-0 place-items-center rounded-full bg-foreground font-mono text-[13px] font-bold text-background">
                    {i + 1}
                  </div>
                  <div className="pt-0.5 text-sm leading-relaxed">{s}</div>
                </div>
              ))}
            </div>
          ) : (
            <ul className="flex flex-col pt-4">
              {r.ingredients.map((i) => (
                <li
                  key={i}
                  className="flex justify-between border-b border-border py-2.5 text-sm last:border-b-0"
                >
                  <span>{i}</span>
                  <span className="font-mono text-muted-foreground">适量</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* fixed CTA */}
      <div className="fixed bottom-(--nav-h) left-1/2 z-10 flex w-full max-w-3xl -translate-x-1/2 gap-2.5 border-t border-border bg-[color-mix(in_oklch,var(--background)_92%,transparent)] p-4 backdrop-blur-md md:bottom-0">
        <Button
          variant="outline"
          className="flex-1"
          aria-pressed={isSaved}
          onClick={() => toggleSave(r.id)}
        >
          <Bookmark size={18} fill={isSaved ? 'currentColor' : 'none'} />
          {isSaved ? '已收藏' : '收藏'}
        </Button>
        <Button className="flex-2">开始烹饪</Button>
      </div>
    </section>
  )
}
