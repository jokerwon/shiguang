import { IngredientDetailScreen } from './ingredient-detail'

export default async function IngredientPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <IngredientDetailScreen id={id} />
}
