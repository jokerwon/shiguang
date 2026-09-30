'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RecipeCard } from '@/components/recipe-card'
import { readFilters, useFilters, type Filters } from '@/lib/use-filters'
import { useFavorites } from '@/lib/use-favorites'
import {
  CUISINE_LABELS,
  CUISINES,
  PREF_LABELS,
  PREFS,
  TIME_LABELS,
  TIMES,
  COMMON_SEASONING_NAMES,
} from '@shiguang/domain'
import { useIngredients, useRecipesFilter } from '@/lib/use-swr-recipes'
import type { RecipeQuery } from '@/lib/api'
import { cn } from '@/lib/utils'

export default function FilterScreen() {
  const { filters, setFilters } = useFilters()
  const searchParams = useSearchParams()
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

  // SWR 管理的数据获取
  const [activeQuery, setActiveQuery] = React.useState<RecipeQuery | null>(null)
  const {
    data: results,
    error,
    isValidating,
  } = useRecipesFilter(activeQuery)

  const tog = (k: 'cuisine' | 'pref', v: string) =>
    setApplied((prev) => {
      const arr = prev[k]
      return { ...prev, [k]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] }
    })
  const setTime = (t: string) => setApplied((prev) => ({ ...prev, time: t }))

  // 食材多选：身份 id 去重，别名不产生重复条件
  const toggleIngredient = (id: string) =>
    setApplied((prev) => ({
      ...prev,
      ingredients: prev.ingredients.includes(id)
        ? prev.ingredients.filter((x) => x !== id)
        : [...prev.ingredients, id],
    }))

  // 食材候选：按名称/别名搜索（通用调味品不在默认快捷区出现，但可搜索到）
  const [ingKeyword, setIngKeyword] = React.useState('')
  const { data: candidateData } = useIngredients(
    ingKeyword.trim()
      ? { keyword: ingKeyword.trim(), limit: 12 }
      : { limit: 12 },
  )
  const quickCandidates = React.useMemo(() => {
    const list = candidateData?.data ?? []
    return ingKeyword.trim()
      ? list
      : list.filter((i) => !COMMON_SEASONING_NAMES.includes(i.name))
  }, [candidateData, ingKeyword])
  const selectedIngredients = React.useMemo(
    () =>
      (candidateData?.data ?? []).filter((i) =>
        applied.ingredients.includes(i.id),
      ),
    [candidateData, applied.ingredients],
  )

  const buildQuery = (f: Filters): RecipeQuery => {
    const query: RecipeQuery = {}
    if (f.cuisine.length) query.cuisine = f.cuisine.join(',')
    if (f.pref.length) query.tags = f.pref.join(',')
    if (f.time === 'le15') query.maxTime = 15
    if (f.time === 'le30') query.maxTime = 30
    if (f.ingredients.length) query.ingredients = f.ingredients.join(',')
    return query
  }

  const apply = () => {
    setFilters(applied)
    setActiveQuery(buildQuery(applied))
  }

  // 首次进入时自动应用当前筛选条件。
  // 从食材资料入口进来（?ingredients=…）时只保留当前食材，清除旧菜系/标签/时间；
  // 安全设置始终生效，因此这里不清用户偏好。
  const didApply = React.useRef(false)
  React.useEffect(() => {
    if (didApply.current) return
    didApply.current = true
    const fromProfile = searchParams.getAll('ingredients').flatMap((v) => v.split(',')).filter(Boolean)
    const initial: Filters = fromProfile.length
      ? { cuisine: [], pref: [], time: 'any', ingredients: fromProfile }
      : readFilters()
    setApplied(initial)
    setLastSynced(initial)
    if (fromProfile.length) setFilters(initial)
    setActiveQuery(buildQuery(initial))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const recipes = results?.data ?? []
  const loading = isValidating

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
        <FilterGroup title="食材（需同时包含全部所选）">
          <input
            type="search"
            value={ingKeyword}
            onChange={(e) => setIngKeyword(e.target.value)}
            placeholder="搜索食材名称或叫法"
            aria-label="搜索食材名称或别名"
            className="h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {quickCandidates.map((i) => (
              <Chip
                key={i.id}
                on={applied.ingredients.includes(i.id)}
                onClick={() => toggleIngredient(i.id)}
              >
                {i.name}
              </Chip>
            ))}
          </div>
          {applied.ingredients.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              已选 {applied.ingredients.length} 种：
              {selectedIngredients.map((i) => i.name).join('、') || '加载中…'}
              　（结果需同时包含全部所选，可含其他食材）
            </p>
          )}
        </FilterGroup>
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
          <p>{error.message}</p>
        </div>
      )}

      {!error && results && results.excluded.count > 0 && (
        <div className="mx-4 mb-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          <p>
            另有 {results.excluded.count} 道菜谱因你的忌口或过敏设置被排除
            {results.excluded.hasUnknown ? '（含成分信息不足、无法判断的菜谱）' : ''}
            ：{results.excluded.reasons.join('；')}
          </p>
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
              onToggle={() => toggleSave(r.id)}
            />
          ))}
        </div>
      )}

      {!error && !loading && recipes.length === 0 && (
        <div className="px-4 pb-16 pt-6 text-center text-sm text-muted-foreground">
          <p>
            {results && results.excluded.count > 0
              ? '筛选条件与安全设置共同排除了全部结果；食材资料仍可查阅。'
              : '没有匹配的菜谱，试试放宽筛选条件。'}
          </p>
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
        'rounded-full border px-3.5 py-2 text-[13px] font-medium transition-[color,border-color,transform] active:scale-[0.96]',
        on
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-background hover:border-foreground',
      )}
    >
      {children}
    </button>
  )
}
