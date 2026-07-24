'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RecipeCard } from '@/components/recipe-card'
import { useFilters, type Filters } from '@/lib/use-filters'
import { useFavorites } from '@/lib/use-favorites'
import { CUISINE_LABELS, CUISINES, PREF_LABELS, PREFS, TIME_LABELS, TIMES } from '@/lib/recipes'
import { fetchRecipes, type PaginatedRecipes } from '@/lib/api'
import { cn } from '@/lib/utils'

export default function FilterScreen() {
  const router = useRouter()
  const { filters, setFilters } = useFilters()
  const { saved, toggleSave } = useFavorites()
  const [applied, setApplied] = React.useState<Filters>(filters)
  const [lastSynced, setLastSynced] = React.useState<Filters>(filters)

  // 当外部 filters 变化（如从发现页跳入并预选菜系）时，重置本地草稿。
  if (
    filters !== lastSynced &&
    JSON.stringify(filters) !== JSON.stringify(lastSynced)
  ) {
    setApplied(filters)
    setLastSynced(filters)
  }

  const [results, setResults] = React.useState<PaginatedRecipes | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const tog = (k: 'cuisine' | 'pref', v: string) =>
    setApplied((prev) => {
      const arr = prev[k]
      return { ...prev, [k]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] }
    })
  const setTime = (t: string) => setApplied((prev) => ({ ...prev, time: t }))

  const apply = () => {
    setFilters(applied)
    setLoading(true)
    setError(null)

    const query: Record<string, string> = {}
    if (applied.cuisine.length) query.cuisine = applied.cuisine.join(',')
    if (applied.pref.length) query.tags = applied.pref.join(',')
    if (applied.time === 'le15') query.maxTime = '15'
    if (applied.time === 'le30') query.maxTime = '30'

    fetchRecipes(query)
      .then((res) => {
        setResults(res)
        setLoading(false)
      })
      .catch((err) => {
        setError((err as Error).message)
        setLoading(false)
      })
  }

  // 首次进入时自动应用当前筛选条件
  const didApply = React.useRef(false)
  React.useEffect(() => {
    if (!didApply.current) {
      didApply.current = true
      apply()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const recipes = results?.data ?? []

  return (
    <section className="animate-in fade-in slide-in-from-bottom-1.5 duration-200">
      <div className="px-4 pb-4 pt-6">
        <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
          偏好 · 菜系
        </span>
        <h2 className="mt-1 text-[clamp(22px,2.8vw,30px)] font-bold tracking-tight">
          按你的口味筛选
        </h2>
      </div>

      <div className="flex flex-col gap-6 p-4">
        <FilterGroup title="菜系">
          {CUISINES.map((c) => (
            <Chip
              key={c}
              on={applied.cuisine.includes(c)}
              onClick={() => tog('cuisine', c)}
            >
              {CUISINE_LABELS[c]}
            </Chip>
          ))}
        </FilterGroup>
        <FilterGroup title="饮食偏好 / 忌口">
          {PREFS.map((p) => (
            <Chip key={p} on={applied.pref.includes(p)} onClick={() => tog('pref', p)}>
              {PREF_LABELS[p]}
            </Chip>
          ))}
        </FilterGroup>
        <FilterGroup title="烹饪时间">
          {TIMES.map((t) => (
            <Chip key={t} on={applied.time === t} onClick={() => setTime(t)}>
              {TIME_LABELS[t]}
            </Chip>
          ))}
        </FilterGroup>
        <Button onClick={apply} className="w-full" disabled={loading}>
          {loading ? '筛选中...' : '应用筛选'}
        </Button>
      </div>

      <div className="flex items-baseline justify-between px-4 pt-4 pb-3">
        <h2 className="text-[19px] font-bold tracking-tight">筛选结果</h2>
        {results && (
          <span className="text-[13px] text-muted-foreground">
            {results.meta.total} 道
          </span>
        )}
      </div>

      {error && (
        <div className="px-4 pb-16 pt-6 text-center text-sm text-muted-foreground">
          <p>{error}</p>
        </div>
      )}

      {!error && loading && (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 size={32} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {!error && !loading && recipes.length > 0 && (
        <div className="grid grid-cols-2 gap-4 px-4 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
          {recipes.map((r) => (
            <RecipeCard
              key={r.id}
              r={r}
              saved={saved.has(r.id)}
              onOpen={() => router.push(`/recipe/${r.id}`)}
              onToggle={() => toggleSave(r.id)}
            />
          ))}
        </div>
      )}

      {!error && !loading && recipes.length === 0 && (
        <div className="px-4 pb-16 pt-6 text-center text-sm text-muted-foreground">
          <p>没有匹配的菜谱，试试放宽筛选条件。</p>
        </div>
      )}
    </section>
  )
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2.5 text-[15px] font-semibold">{title}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors',
        on
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-background hover:border-foreground',
      )}
    >
      {children}
    </button>
  )
}
