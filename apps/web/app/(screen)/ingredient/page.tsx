'use client'

import * as React from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useIngredients } from '@/lib/use-swr-recipes'
import {
  INGREDIENT_CATEGORIES,
  INGREDIENT_CATEGORY_LABELS,
} from '@shiguang/domain'
import { cn } from '@/lib/utils'

/**
 * 食材浏览入口（ADR-0018）：一层平铺分类 + 名称/别名搜索。
 * 资料入口不依赖菜谱存在；无相关菜谱的食材仍可查阅。
 */
export default function IngredientScreen() {
  const [keyword, setKeyword] = React.useState('')
  const [submitted, setSubmitted] = React.useState('')
  const [category, setCategory] = React.useState<string | undefined>(undefined)

  const query = React.useMemo(
    () => ({ keyword: submitted || undefined, category, limit: 60 }),
    [submitted, category],
  )
  const { data, error, isValidating } = useIngredients(query)
  const items = data?.data ?? []

  return (
    <section className="animate-in fade-in slide-in-from-bottom-1.5 duration-200">
      <div className="px-4 pb-4 pt-6">
        <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
          食材资料
        </span>
        <h2 className="mt-1 text-[clamp(22px,2.8vw,30px)] font-bold tracking-tight">
          认识食材，再决定做什么
        </h2>
      </div>

      <div className="px-4">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            setSubmitted(keyword.trim())
          }}
          className="flex items-center gap-2"
        >
          <Search size={16} className="shrink-0 text-muted-foreground" />
          <Input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="按名称或常见叫法搜索，如 番茄 / 西红柿"
            aria-label="搜索食材名称或别名"
            className="h-10"
          />
        </form>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 px-4">
        <CategoryChip
          on={category === undefined}
          onClick={() => setCategory(undefined)}
        >
          全部
        </CategoryChip>
        {INGREDIENT_CATEGORIES.map((c) => (
          <CategoryChip
            key={c}
            on={category === c}
            onClick={() => setCategory(category === c ? undefined : c)}
          >
            {INGREDIENT_CATEGORY_LABELS[c]}
          </CategoryChip>
        ))}
      </div>

      <div className="flex items-baseline justify-between px-4 pt-5 pb-3">
        <h3 className="text-[19px] font-bold tracking-tight">食材</h3>
        {data && (
          <span className="text-[13px] text-muted-foreground">
            {data.meta.total} 种
          </span>
        )}
      </div>

      {error && (
        <div className="px-4 pb-16 pt-6 text-center text-sm text-muted-foreground">
          <p>食材资料加载失败：{error.message}</p>
          <p className="mt-1 text-xs">请稍后重试，或检查网络连接。</p>
        </div>
      )}

      {!error && items.length === 0 && (
        <div className="px-4 pb-16 pt-6 text-center text-sm text-muted-foreground">
          <p>没有匹配的食材，换个名称或常见叫法试试。</p>
        </div>
      )}

      {!error && items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
          {items.map((i) => (
            <li key={i.id}>
              <Link
                href={`/ingredient/${i.id}`}
                className="flex h-full flex-col rounded-xl border border-border p-3 transition-colors hover:border-foreground"
              >
                <span className="text-[15px] font-semibold">{i.name}</span>
                <span className="mt-0.5 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                  {INGREDIENT_CATEGORY_LABELS[i.category] ?? i.category}
                </span>
                {i.aliases.length > 0 && (
                  <span className="mt-2 text-xs text-muted-foreground">
                    又叫 {i.aliases.join('、')}
                  </span>
                )}
                <span className="mt-auto pt-2 text-[11px] text-muted-foreground">
                  {i.allergenInfoReviewed ? '过敏原已核查' : '过敏原信息未核查'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {isValidating && !error && (
        <p className="px-4 pt-4 text-center text-xs text-muted-foreground">
          加载中…
        </p>
      )}
    </section>
  )
}

function CategoryChip({
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
        'rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-[color,border-color,transform] active:scale-[0.96]',
        on
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-background hover:border-foreground',
      )}
    >
      {children}
    </button>
  )
}
