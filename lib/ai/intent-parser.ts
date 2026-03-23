import { generateText, ModelMessage, Output } from 'ai'
import { z } from 'zod'
import { model } from './model'
import { intentParserPrompt } from './prompt'

export const IntentSchema = z.array(
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('ADD_INGREDIENT').describe('意图类型'),
      confidence: z.number().min(0).max(1).describe('置信度'),
      payload: z
        .object({
          name: z.string(),
          quantity: z.number().optional(),
          unit: z.string().optional(),
          expireAt: z.string().optional(),
        })
        .describe('意图参数'),
    }),
    z.object({
      type: z.literal('CONSUME_INGREDIENT').describe('意图类型'),
      confidence: z.number().min(0).max(1).describe('置信度'),
      payload: z
        .object({
          names: z.array(z.string()),
        })
        .describe('意图参数'),
    }),
    z.object({
      type: z.literal('LOG_MEAL').describe('意图类型'),
      confidence: z.number().min(0).max(1).describe('置信度'),
      payload: z
        .object({
          mealName: z.string(),
          ingredients: z
            .array(
              z.object({
                name: z.string(),
                quantity: z.number().optional(),
                unit: z.string().optional(),
              }),
            )
            .optional(),
        })
        .describe('意图参数'),
    }),
    z.object({
      type: z.literal('RECOMMEND_MEAL').describe('意图类型'),
      confidence: z.number().min(0).max(1).describe('置信度'),
      payload: z
        .object({
          mealType: z.enum(['早餐', '午餐', '晚餐', '宵夜']).optional(),
        })
        .describe('意图参数'),
    }),
    z.object({
      type: z.literal('CHECK_STOCK').describe('意图类型'),
      confidence: z.number().min(0).max(1).describe('置信度'),
      payload: z
        .object({
          ingredientName: z.string().optional(),
        })
        .describe('意图参数'),
    }),
    z.object({
      type: z.literal('QUERY_PREFERENCE').describe('意图类型'),
      confidence: z.number().min(0).max(1).describe('置信度'),
      payload: z.null().describe('意图参数'),
    }),
    z.object({
      type: z.literal('CHITCHAT').describe('意图类型'),
      confidence: z.number().min(0).max(1).describe('置信度'),
      payload: z.null().describe('意图参数'),
    }),
  ]),
)

export async function parseIntents(userInput: string | ModelMessage[]): Promise<z.infer<typeof IntentSchema>> {
  const { output } = await generateText({
    model: model,
    output: Output.object({
      schema: IntentSchema,
    }),
    temperature: 0,
    system: intentParserPrompt.trim(),
    prompt: userInput,
  })

  return output
}
