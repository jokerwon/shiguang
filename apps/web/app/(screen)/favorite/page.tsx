'use client'

import { Bookmark, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { RecipeCard } from '@/components/recipe-card'
import { useFavorites } from '@/lib/use-favorites'
import { useRecipes } from '@/lib/use-recipes'

export default function FavoriteScreen() {
  const router = useRouter()
  const { saved, toggleSave } = useFavorites()
  const { recipes, loading, error } = useRecipes()
  const items = recipes.filter((r) => saved.has(r.id))

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={32} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <button onClick={() => window.location.reload()} className="text-[13px] underline">
          重新加载
        </button>
      </div>
    )
  }

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
