import { createIngredient, getIngredients } from '@/repositories/ingredient'
import { Prisma } from '@/generated/prisma/client'

export const ingredientService = {
  async createIngredient(data: Prisma.IngredientCreateInput) {
    return createIngredient(data)
  },

  async getIngredients() {
    return getIngredients()
  },
}
