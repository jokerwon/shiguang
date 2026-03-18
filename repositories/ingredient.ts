import { prisma } from '@/lib/db/client'
import type { Prisma } from '@/generated/prisma/client'

export const createIngredient = async (data: Prisma.IngredientCreateInput) => {
  return prisma.ingredient.create({ data })
}

export const getIngredients = async () => {
  return prisma.ingredient.findMany()
}
