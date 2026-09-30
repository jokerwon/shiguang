'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { RecipeCard } from '@/components/recipe-card'
import { useFavorites } from '@/lib/use-favorites'
import { INGREDIENT_CATEGORY_LABELS, type IngredientDetail } from '@shiguang/domain'
import type { PaginatedRecipes } from '@/lib/api'

interface Props {
  id: string
}

/**
 * 食材详情（ADR-0018）：经审核的资料与参考来源；缺依据的段落不渲染，
 * 不编造内容。图片沿用应用当前风格的占位图，不引入实物图。
 */
export function IngredientDetailScreen({ id }: Props) {
  const router = useRouter()
  const { saved, toggleSave } = useFavorites()
  const { data, error, isValidating } = useSWR<IngredientDetail>(
    `/ingredients/${id}`,
  )
  const related = useSWR<PaginatedRecipes>(
    data ? `/recipes?ingredients=${id}&limit=12` : null,
  )

  if (error) {
    return (
      <div className="px-4 pb-24 pt-6 text-center text-sm text-muted-foreground">
        <p>食材资料加载失败：{error.message}</p>
        <p className="mt-1 text-xs">资料不存在或尚未发布时也会看到这个提示。</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          返回
        </Button>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 size={28} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  const recipes = related.data?.data ?? []
  const excluded = related.data?.excluded

  return (
    <section className="animate-in fade-in slide-in-from-bottom-1.5 duration-200 pb-28">
      <div className="relative">
        <IngredientHero name={data.name} category={data.category} />
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="返回"
          className="absolute top-3 left-3 grid size-11 place-items-center rounded-full border border-border bg-[color-mix(in_oklch,var(--background)_85%,transparent)] backdrop-blur-sm md:top-4 md:left-4"
        >
          <ArrowLeft size={18} />
        </button>
      </div>

      <div className="md:mx-auto md:max-w-3xl md:px-4">
        <div className="p-4">
          <h1 className="text-[clamp(28px,4vw,42px)] leading-[1.1] font-bold tracking-tight">
            {data.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-muted-foreground">
            <span className="font-mono tracking-wider uppercase">
              {INGREDIENT_CATEGORY_LABELS[data.category] ?? data.category}
            </span>
            {data.aliases.length > 0 && <span>又叫 {data.aliases.join('、')}</span>}
          </div>

          <p className="mt-4 text-sm leading-relaxed">{data.summary}</p>

          <Section title="挑选" text={data.selection} />
          <Section title="保存" text={data.storage} />
          <Section title="处理" text={data.preparation} />

          <div className="mt-6">
            <h2 className="text-[15px] font-semibold">过敏原信息</h2>
            {data.allergens.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {data.allergens.map((a) => (
                  <li key={a.allergen} className="text-muted-foreground">
                    含<a className="text-foreground">{a.allergen}</a>
                    　
                    <a
                      href={a.source}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      依据
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                成分信息未核查。这不等于「确认不含过敏原」，有相关过敏设置时相关菜谱会被保守排除。
              </p>
            )}
          </div>

          {data.sources.length > 0 && (
            <div className="mt-6">
              <h2 className="text-[15px] font-semibold">参考来源</h2>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {data.sources.map((s) => (
                  <li key={s.url}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 underline"
                    >
                      {s.label}
                      <ExternalLink size={13} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-baseline justify-between px-4 pt-4 pb-3">
          <h2 className="text-[19px] font-bold tracking-tight">相关菜谱</h2>
          {related.data && (
            <Link
              href={`/filter?ingredients=${id}`}
              className="text-[13px] text-muted-foreground underline"
            >
              去筛选页查看（{related.data.meta.total} 道）
            </Link>
          )}
        </div>

        {related.error && (
          <p className="px-4 pb-10 text-center text-sm text-muted-foreground">
            相关菜谱加载失败：{related.error.message}
          </p>
        )}

        {!related.error && related.data && recipes.length > 0 && (
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

        {!related.error && related.data && recipes.length === 0 && (
          <div className="px-4 pb-10 text-center text-sm text-muted-foreground">
            <p>
              {excluded && excluded.count > 0
                ? '相关菜谱因你的忌口或过敏设置被排除：'
                : '目前没有使用这种食材的菜谱。'}
            </p>
            {excluded?.reasons.map((reason) => (
              <p key={reason} className="mt-1 text-xs">
                {reason}
              </p>
            ))}
            {excluded?.hasUnknown && (
              <p className="mt-1 text-xs">
                其中包含成分信息不足、无法判断的菜谱；补全资料前不会放宽条件。
              </p>
            )}
          </div>
        )}

        {isValidating && (
          <p className="px-4 pt-2 text-center text-xs text-muted-foreground">
            刷新中…
          </p>
        )}
      </div>
    </section>
  )
}

function Section({ title, text }: { title: string; text: string | null }) {
  if (!text) return null
  return (
    <div className="mt-4">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  )
}

/** 占位图：沿用应用当前风格（首字 + 分类配色），不使用实物图 */
function IngredientHero({
  name,
  category,
}: {
  name: string
  category: string
}) {
  const tone: Record<string, string> = {
    VEGETABLE: 'oklch(0.72 0.16 145)',
    MEAT: 'oklch(0.62 0.18 25)',
    POULTRY: 'oklch(0.7 0.14 65)',
    EGG: 'oklch(0.85 0.14 85)',
    SEAFOOD: 'oklch(0.68 0.12 220)',
    SOY: 'oklch(0.75 0.1 100)',
    GRAIN: 'oklch(0.72 0.12 70)',
    SEASONING: 'oklch(0.6 0.1 300)',
    OTHER: 'oklch(0.68 0.05 250)',
  }
  const color = tone[category] ?? tone.OTHER
  return (
    <div
      className="relative flex h-[46vh] max-h-[420px] w-full items-center justify-center overflow-hidden"
      style={{
        backgroundImage: `linear-gradient(135deg, color-mix(in oklch, ${color} 78%, white), color-mix(in oklch, ${color} 55%, black))`,
      }}
      aria-hidden="true"
    >
      <span className="text-[clamp(72px,14vw,150px)] leading-none font-bold text-white/90">
        {name.slice(0, 1)}
      </span>
      <span className="absolute bottom-3 right-4 font-mono text-[11px] tracking-widest text-white/80 uppercase">
        占位图 · 非实物
      </span>
    </div>
  )
}
