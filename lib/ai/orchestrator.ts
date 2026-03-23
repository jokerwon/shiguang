import { chatService } from '@/services/chat'
import { ingredientService } from '@/services/ingredient'
import { IntentPayload } from '@/types/intent'

export type ActionResult = {
  intent: IntentPayload['type']
  status: 'ok' | 'error'
  data?: unknown
  message?: string
}

// 执行单个意图对应的 service 调用
async function executeIntent(intent: IntentPayload): Promise<ActionResult> {
  try {
    switch (intent.type) {
      case 'ADD_INGREDIENT': {
        const ingredient = await ingredientService.createIngredient({
          name: intent.payload.name as string,
          quantity: intent.payload.quantity as number,
          unit: intent.payload.unit as string,
          expireAt: intent.payload.expireAt ? new Date(intent.payload.expireAt as string) : undefined,
        })
        return { intent: intent.type, status: 'ok', data: ingredient, message: `已添加食材：${intent.payload.name}` }
      }

      case 'CONSUME_INGREDIENT': {
        // TODO: 实现
      }

      case 'LOG_MEAL': {
        // TODO: 实现
      }

      case 'RECOMMEND_MEAL':
      case 'CHECK_STOCK':
      case 'QUERY_PREFERENCE':
      case 'CHITCHAT':
        // 这些意图只需要读取上下文，不产生副作用
        return { intent: intent.type, status: 'ok' }
    }
  } catch (err) {
    return {
      intent: intent.type,
      status: 'error',
      message: err instanceof Error ? err.message : '执行失败',
    }
  }
}

export async function orchestrate(intents: IntentPayload[]) {
  // 并行执行所有意图对应的副作用
  const actionResults = await Promise.all(intents.map(executeIntent))

  // 判断是否需要推荐/回答，决定是否要读取完整上下文
  const needsContext = intents.some((i) => ['RECOMMEND_MEAL', 'CHECK_STOCK', 'QUERY_PREFERENCE', 'CHITCHAT'].includes(i.type))

  const context = needsContext ? await chatService.buildContext() : null

  return { actionResults, context }
}
