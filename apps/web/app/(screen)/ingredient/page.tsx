'use client'

import * as React from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useIngredients } from '@/lib/use-swr-recipes'
import { fetchIngredientIdentify } from '@/lib/api'
import {
  INGREDIENT_CATEGORIES,
  INGREDIENT_CATEGORY_LABELS,
  type IngredientSummary,
} from '@shiguang/domain'
import { cn } from '@/lib/utils'

type Resolution =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'identified'; ingredient: IngredientSummary }
  | { kind: 'ambiguous'; candidates: IngredientSummary[] }
  | { kind: 'unidentified' }
  | { kind: 'failed' }

/**
 * 食材浏览入口（ADR-0018）：一层平铺分类 + 名称/别名搜索。
 * 搜索先做身份解析（整串相等）：唯一命中直接打开资料，歧义列出候选由用户确认，
 * 没有身份命中才显示「相近候选」（资料页用另一行提示，不混进结果）。
 */
export default function IngredientScreen() {
  const [keyword, setKeyword] = React.useState('')
  const [submitted, setSubmitted] = React.useState('')
  const [category, setCategory] = React.useState<string | undefined>(undefined)
  const [resolution, setResolution] = React.useState<Resolution>({ kind: 'idle' })

  const query = React.useMemo(
    () => ({ keyword: submitted || undefined, category, limit: 60 }),
    [submitted, category],
  )
  const { data, error, isValidating } = useIngredients(query)
  const items = data?.data ?? []
  // 只在「有搜索词但只会子串命中」时提示相近候选；浏览全部/分类不算
  const fuzzy =
    submitted !== '' && data !== undefined && data.meta.exactMatches === 0
  // 只认最后一次搜索：先发的慢响应不得覆盖后发的结果
  const searchSeq = React.useRef(0)

  const search = async (term: string) => {
    setSubmitted(term)
    setCategory(undefined)
    const seq = ++searchSeq.current
    if (!term) {
      setResolution({ kind: 'idle' })
      return
    }
    setResolution({ kind: 'checking' })
    try {
      const { matched, ambiguous } = await fetchIngredientIdentify([term])
      if (seq !== searchSeq.current) return
      if (matched) {
        setResolution({ kind: 'identified', ingredient: matched })
      } else if (ambiguous.length > 0) {
        setResolution({ kind: 'ambiguous', candidates: ambiguous })
      } else {
        setResolution({ kind: 'unidentified' })
      }
    } catch {
      if (seq !== searchSeq.current) return
      // 解析失败 ≠ 没有身份命中：单独标记，不冒充「没有完全同名的食材」
      setResolution({ kind: 'failed' })
    }
  }

  const clearSearch = () => {
    setKeyword('')
    void search('')
  }

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
            void search(keyword.trim())
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

      {resolution.kind !== 'idle' && (
        <div className="px-4 pt-3 text-sm" aria-live="polite">
          {resolution.kind === 'checking' && (
            <p className="text-muted-foreground">正在确认食材…</p>
          )}

          {resolution.kind === 'identified' && (
            <p>
              名称「{submitted}」对应
              <Link
                href={`/ingredient/${resolution.ingredient.id}`}
                className="font-semibold underline"
              >
                {resolution.ingredient.name}
              </Link>
              {resolution.ingredient.aliases.length > 0 &&
                `（又叫 ${resolution.ingredient.aliases.join('、')}）`}
              ，打开资料查看。
            </p>
          )}

          {resolution.kind === 'ambiguous' && (
            <div>
              <p className="text-muted-foreground">
                「{submitted}」对应多种食材，请选择要查看的一种；系统不替你猜：
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {resolution.candidates.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/ingredient/${c.id}`}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[13px] hover:border-foreground"
                    >
                      {c.name}
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {INGREDIENT_CATEGORY_LABELS[c.category] ?? c.category}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {resolution.kind === 'unidentified' && (
            <p className="text-muted-foreground">
              没有与「{submitted}」完全同名的食材资料。
            </p>
          )}

          {resolution.kind === 'failed' && (
            <p className="text-muted-foreground">
              身份确认失败，无法判断「{submitted}」是否是库内食材；请稍后重试。
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 px-4">
        <CategoryChip on={category === undefined} onClick={() => setCategory(undefined)}>
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
        <h3 className="text-[19px] font-bold tracking-tight">
          {fuzzy ? '相近候选' : '食材'}
        </h3>
        {data && (
          <span className="text-[13px] text-muted-foreground">{data.meta.total} 种</span>
        )}
      </div>

      {fuzzy && (
        <p className="px-4 pb-2 text-xs text-muted-foreground">
          以下只是名称相近的食材，不是对「{submitted}」的精确身份结果。
        </p>
      )}

      {error && (
        <div className="px-4 pb-16 pt-6 text-center text-sm text-muted-foreground">
          <p>食材资料加载失败：{error.message}</p>
          <p className="mt-1 text-xs">请稍后重试，或检查网络连接。</p>
        </div>
      )}

      {!error && items.length === 0 && (
        <div className="px-4 pb-16 pt-6 text-center text-sm text-muted-foreground">
          <p>没有匹配的食材，换个名称或常见叫法试试。</p>
          {submitted && (
            <button
              type="button"
              onClick={clearSearch}
              className="mt-3 rounded-full border border-border px-3 py-1.5 text-xs hover:border-foreground"
            >
              清除搜索，浏览全部食材
            </button>
          )}
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
        <p className="px-4 pt-4 text-center text-xs text-muted-foreground">加载中…</p>
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
        'rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors',
        on
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-background hover:border-foreground',
      )}
    >
      {children}
    </button>
  )
}
