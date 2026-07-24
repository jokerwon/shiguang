import { notFound } from 'next/navigation'
import { fetchRecipeById } from '@/lib/api'
import { RecipeDetail } from './recipe-detail'

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  try {
    const recipe = await fetchRecipeById(id)
    return <RecipeDetail recipe={recipe} />
  } catch (err) {
    if ((err as Error).message === '菜谱不存在') {
      notFound()
    }
    throw err
  }
}
