import { streamText, UIMessage, convertToModelMessages, stepCountIs } from 'ai'
import { model } from '@/lib/ai/model'
import { tools } from '@/tools'
import { chatService } from '@/services/chat'
import { recommendDishPrompt } from '@/lib/ai/prompt'

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json()

  const ctx = await chatService.buildContext()
  const system = recommendDishPrompt({ timeOfDay: '晚上', stockSnapshot: ctx.ingredients.join('、') })

  const result = streamText({
    model,
    tools,
    system,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
  })
  return result.toUIMessageStreamResponse()
}
