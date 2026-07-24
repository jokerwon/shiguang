'use client'

import { Bookmark } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { RecipeCard } from '@/components/recipe-card'
import { useFavorites } from '@/lib/use-favorites'
import { RECIPES } from '@/lib/recipes'

export default function FavoriteScreen() {
  const router = useRouter()
  const { saved, toggleSave } = useFavorites()
  const items = RECIPES.filter((r) => saved.has(r.id))

  return (
    <section className="pb-4 animate-in fade-in slide-in-from-bottom-1.5 duration-200">
      <div className="px-4 pb-4 pt-6">
        <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
          收藏夹
        </span>
        <h2 className="mt-1 text-[clamp(22px,2.8vw,30px)] font-bold tracking-tight">
          想做的菜
        </h2>
      </div>

      {!items.length ? (
        <div className="px-4 pt-10 pb-16 text-center text-muted-foreground">
          <Bookmark className="mx-auto mb-4 size-10 text-border" />
          <p>
            还没有收藏的菜谱。
            <br />
            看到喜欢的，点心形保存。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 px-4 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
          {items.map((r) => (
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
    </section>
  )
}
