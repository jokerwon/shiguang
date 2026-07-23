'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, User, ChevronRight } from 'lucide-react'
import { CUISINES, RECIPES } from '@/lib/recipes'
import { useFavorites } from '@/lib/use-favorites'
import { useFilters } from '@/lib/use-filters'
import { RecipeCard } from '@/components/recipe-card'

export default function DiscoveryScreen() {
  const router = useRouter()
  const { saved, toggleSave } = useFavorites()
  const { setFilters } = useFilters()

  const today = [RECIPES[0], RECIPES[3], RECIPES[8], RECIPES[6]]
  const quick = RECIPES.filter((r) => r.time <= 15).slice(0, 4)
  const openDetail = (id: string) => router.push(`/recipe/${id}`)

  const filterByCuisine = (c: string) => {
    setFilters({ cuisine: [c], pref: [], time: '不限' })
    router.push('/filter')
  }

  return (
    <section className="animate-in fade-in slide-in-from-bottom-1.5 duration-200">
      {/* 问候区 */}
      <div className="gap-y-2 p-4 md:grid md:grid-cols-[1.1fr_0.9fr] md:gap-x-10 md:px-0 md:pt-10">
        <div>
          <h1 className="text-[26px] leading-[1.15] font-bold tracking-tight md:text-[clamp(28px,3.2vw,40px)]">
            今天想做点什么？
          </h1>
          <p className="mt-1.5 text-[17px] text-muted-foreground md:mt-0">
            告诉我手边有什么，我来给你挑一道。
          </p>
          <Link
            href="/pantry"
            aria-label="搜索菜名，或按食材匹配"
            className="mt-4 flex w-full items-center gap-2.5 rounded-lg border border-border bg-muted px-3.5 py-3 text-left text-[15px] transition-colors hover:border-foreground md:max-w-md"
          >
            <Search size={18} className="text-muted-foreground" />
            <span className="text-muted-foreground">搜索菜名，或按食材匹配…</span>
          </Link>
        </div>

        <Link
          href="/chat"
          className="mt-4 flex w-full items-center gap-4 rounded-lg bg-foreground p-4 text-background transition-colors hover:bg-[color-mix(in_oklch,var(--foreground)_88%,var(--muted-foreground))] md:mt-0 md:self-center"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
            <User size={22} />
          </span>
          <span className="flex-1">
            <b className="text-[15px]">和食光 Agent 聊聊</b>
            <span className="mt-0.5 block text-xs opacity-70">
              “冰箱里有鸡蛋和西红柿” → 立刻出方案
            </span>
          </span>
          <ChevronRight size={20} className="opacity-60" />
        </Link>
      </div>

      {/* 今日推荐 */}
      <RowTitle title="今日推荐">
        <Link href="/filter" className="text-[13px] text-muted-foreground hover:text-foreground">
          筛选
        </Link>
      </RowTitle>
      <RecipeGrid>
        {today.map((r) => (
          <RecipeCard
            key={r.id}
            r={r}
            saved={saved.has(r.id)}
            onOpen={() => openDetail(r.id)}
            onToggle={() => toggleSave(r.id)}
          />
        ))}
      </RecipeGrid>

      {/* 按菜系探索 */}
      <RowTitle title="按菜系探索" />
      <div className="flex gap-2 overflow-x-auto px-4 pb-2 md:flex-wrap md:overflow-visible">
        {CUISINES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => filterByCuisine(c)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-2 text-[13px] font-medium transition-colors hover:border-foreground"
          >
            {c}
          </button>
        ))}
      </div>

      {/* 15 分钟快手 */}
      <RowTitle title="15 分钟快手">
        <Link href="/filter" className="text-[13px] text-muted-foreground hover:text-foreground">
          更多
        </Link>
      </RowTitle>
      <RecipeGrid>
        {quick.map((r) => (
          <RecipeCard
            key={r.id}
            r={r}
            saved={saved.has(r.id)}
            onOpen={() => openDetail(r.id)}
            onToggle={() => toggleSave(r.id)}
          />
        ))}
      </RecipeGrid>
    </section>
  )
}

function RowTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between px-4 pt-4 pb-3">
      <h2 className="text-[19px] font-bold tracking-tight">{title}</h2>
      {children}
    </div>
  )
}

function RecipeGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-4 px-4 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
      {children}
    </div>
  )
}
