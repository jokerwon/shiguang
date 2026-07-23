'use client'

import { useEffect, useMemo, useState } from 'react'
import { Ham } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type { Locale } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { RecipeCard } from '@/components/recipe-card'
import { usePantry } from '@/lib/use-pantry'
import { useFavorites } from '@/lib/use-favorites'
import { matchRecipes, resolveIng, SUGGEST_INGS } from '@/lib/recipes'
import { useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

const pick = (l: { zh: string; en: string }, locale: Locale) =>
  locale === 'en' ? l.en : l.zh

export default function PantryScreen() {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('Pantry')
  const { pantry, addIng, removeAt, toggleSuggest, clear } = usePantry()
  const { saved, toggleSave } = useFavorites()
  const openDetail = (id: string) => router.push(`/recipe/${id}`)
  const [field, setField] = useState('')
  const [barW, setBarW] = useState(0)

  const results = useMemo(() => matchRecipes(pantry), [pantry])
  const avg = results.length ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length) : 0

  useEffect(() => {
    const t = setTimeout(() => setBarW(avg), 50)
    return () => clearTimeout(t)
  }, [avg])

  const submit = () => {
    addIng(resolveIng(field))
    setField('')
  }

  // 已添加食材（canonical zh）→ 展示文本
  const pantryView = pantry.map((zh) => {
    const found = SUGGEST_INGS.find((s) => s.zh === zh)
    return found ? pick(found, locale) : zh
  })

  return (
    <section className="pb-4 animate-in fade-in slide-in-from-bottom-1.5 duration-200">
      <div className="px-4 pb-4 pt-6">
        <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">{t('eyebrow')}</span>
        <h2 className="mt-1 text-[clamp(22px,2.8vw,30px)] font-bold tracking-tight">{t('title')}</h2>
      </div>

      <div className="space-y-6 p-4">
        {/* 输入 */}
        <div className="flex gap-2">
          <Input
            placeholder={t('inputPlaceholder')}
            value={field}
            onChange={(e) => setField(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
          />
          <Button onClick={submit} className="px-4">
            {t('add')}
          </Button>
        </div>

        {/* 我的食材 */}
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold">
            {t('mineTitle')}
            {pantry.length ? <span className="font-mono text-xs text-muted-foreground">{t('mineCount', { count: pantry.length })}</span> : null}
          </h3>
          <div className="flex flex-wrap gap-2">
            {pantry.length === 0 ? (
              <div className="w-full rounded-lg border border-dashed border-border p-3.5 text-center text-[13px] text-muted-foreground">{t('empty')}</div>
            ) : (
              pantry.map((i, idx) => (
                <button
                  key={`${i}-${idx}`}
                  type="button"
                  aria-label={t('removeAria', { name: pantryView[idx] })}
                  onClick={() => removeAt(idx)}
                  className={cn('inline-flex items-center gap-1.5 rounded-full border border-foreground bg-foreground px-3.5 py-2 text-[13px] font-medium text-background')}
                >
                  {pantryView[idx]}
                  <span aria-hidden className="opacity-50">
                    ✕
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* 常见食材 */}
        <div>
          <h3 className="mb-3 text-[15px] font-semibold text-muted-foreground">{t('suggestTitle')}</h3>
          <div className="flex flex-wrap gap-2">
            {SUGGEST_INGS.map((i) => {
              const on = pantry.includes(i.zh)
              return (
                <button
                  key={i.zh}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleSuggest(i.zh)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors',
                    on ? 'border-foreground bg-foreground text-background' : 'border-border bg-background hover:border-foreground',
                  )}
                >
                  {pick(i, locale)}
                </button>
              )
            })}
          </div>
        </div>

        {/* 匹配度横幅 */}
        {pantry.length > 0 && (
          <div className="rounded-lg border border-border bg-muted p-4">
            <div className="flex items-center justify-between">
              <b className="text-[15px]">{t('matchTitle')}</b>
              <span className="font-mono text-xs text-muted-foreground">
                {t('matchStat', { count: results.length, avg })}
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
              <i className="block h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${barW}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* 匹配结果 */}
      {pantry.length > 0 && (
        <>
          <div className="flex items-baseline justify-between px-4 pt-4 pb-3">
            <h2 className="text-[19px] font-bold tracking-tight">{t('resultTitle')}</h2>
            <button type="button" onClick={clear} className="text-[13px] text-muted-foreground hover:text-foreground">
              {t('clear')}
            </button>
          </div>
          {results.length === 0 ? (
            <div className="px-4 pb-10 pt-6 text-center text-muted-foreground">
              <Ham className="mx-auto mb-4 size-10 text-border" />
              <p>{t('resultEmpty')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 px-4 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
              {results.map(({ r, score }) => (
                <RecipeCard key={r.id} r={r} score={score} saved={saved.has(r.id)} onOpen={() => openDetail(r.id)} onToggle={() => toggleSave(r.id)} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
