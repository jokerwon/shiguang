import { getIngredients } from '@/repositories/ingredient'

export const chatService = {
  // 组装注入 system prompt 的上下文快照
  async buildContext() {
    const [ingredients] = await Promise.all([getIngredients()])

    return {
      ingredients: ingredients.map((i) => `${i.name}${i.quantity ? ` ${i.quantity}${i.unit ?? ''}` : ''}`),
    }
  },
}
