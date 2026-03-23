import { streamText, UIMessage, convertToModelMessages, stepCountIs } from 'ai'
import { model } from '@/lib/ai/model'
import { tools } from '@/tools'
import { recommendDishPrompt } from '@/lib/ai/prompt'
import { parseIntents } from '@/lib/ai/intent-parser'
import { orchestrate } from '@/lib/ai/orchestrator'

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json()

  const modelMsgs = await convertToModelMessages(messages)
  const intents = await parseIntents(modelMsgs.slice(-1))
  console.log('intents', intents)

  const { actionResults, context } = await orchestrate(intents)

  console.log('actionResults', actionResults)
  console.log('context', context)

  const executedSummary = actionResults
    .filter((r) => r.status === 'ok' && r.message)
    .map((r) => `- ${r.message}`)
    .join('\n')

  const system = recommendDishPrompt({ timeOfDay: '晚上', stockSnapshot: context?.ingredients.join('、'), executedSummary })

  const result = streamText({
    model,
    tools,
    system,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
  })
  return result.toUIMessageStreamResponse()
}
