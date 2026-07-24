import { fetchRecipes } from '@/lib/api'
import { FavoriteClient } from './favorite-client'

export default async function FavoritePage() {
  const { data: recipes } = await fetchRecipes({ limit: 100 })

  return <FavoriteClient recipes={recipes} />
}
