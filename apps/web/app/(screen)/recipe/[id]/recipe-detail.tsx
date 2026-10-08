'use client'

import * as React from 'react'
import { ChevronLeft, Clock, Bookmark } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useFavorites } from '@/lib/use-favorites'
import { CUISINE_LABELS, type Recipe } from '@shiguang/domain'
import { RecipeImage } from '@/components/recipe-image'
import { cn } from '@/lib/utils'

export function RecipeDetail({ recipe }: { recipe: Recipe }) {
  const router = useRouter()
  const { saved, toggleSave } = useFavorites()
  const [tab, setTab] = React.useState<'steps' | 'ings'>('steps')

  const r = recipe
  const isSaved = saved.has(r.id)
  const name = r.name

  return (
    <section className="animate-in fade-in slide-in-from-bottom-1.5 duration-200 pb-28">
      {/* hero */}
      <div className="relative">
        <RecipeImage r={r} variant="hero" />
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
            <span>{CUISINE_LABELS[r.cuisine]}</span>
          </div>

          {/* 营养三要素（ADR-0002/0003：AI 估算值，需标注） */}
          <div className="mt-4">
            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  ['热量', r.kcal, 'kcal'],
                  ['蛋白质', r.protein, 'g'],
                  ['碳水', r.carb, 'g'],
                  ['脂肪', r.fat, 'g'],
                ] as const
              ).map(([label, value, unit]) => (
                <div key={label} className="rounded-lg border border-border bg-muted px-3 py-2.5 text-center">
                  <div className="font-mono text-[15px] font-bold">
                    {value}
                    <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">{unit}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-right text-xs text-muted-foreground">营养为估算值</p>
          </div>

          <p className="mt-3 text-sm text-muted-foreground">{r.desc}</p>


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
              {r.ingredients.map((i, idx) => (
                <li
                  key={idx}
                  className="flex justify-between border-b border-border py-2.5 text-sm last:border-b-0"
                >
                  {/* 身份由菜谱接口携带（ADR-0019：原料即关联行，必有 id），不做客户端名称匹配 */}
                  <Link href={`/ingredient/${i.ingredientId}`} className="underline">
                    {i.name}
                  </Link>
                  {/* note 是括号说明的原文，名称里没有时补括号 */}
                  <span className="font-mono text-muted-foreground">
                    {i.amount}
                    {i.note && !i.name.includes(i.note) ? `（${i.note}）` : ''}
                  </span>
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
      </div>
    </section>
  )
}
