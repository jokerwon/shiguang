import { notFound } from 'next/navigation'
import type { Recipe } from '@shiguang/domain'
import { fetchRecipeById } from '@/lib/api'
import { RecipeDetail } from './recipe-detail'

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let recipe: Recipe
  try {
    recipe = await fetchRecipeById(id)
  } catch (err) {
    if ((err as Error).message === '菜谱不存在') {
      notFound()
    }
    throw err
  }

  return <RecipeDetail recipe={recipe} />
}
