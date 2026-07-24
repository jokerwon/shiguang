'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { PromptInput, type PromptInputMessage, PromptInputTextarea, PromptInputSubmit } from '@/components/ai-elements/prompt-input'
import { Suggestions, Suggestion } from '@/components/ai-elements/suggestion'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { usePantry } from '@/lib/use-pantry'
import { useAllRecipes } from '@/lib/use-swr-recipes'
import {
  CUISINE_LABELS,
  CUISINES,
  matchRecipes,
  PREF_LABELS,
  PREFS,
  type Recipe,
} from '@/lib/recipes'

type Msg = { who: 'me' | 'bot'; text: string; recipe?: Recipe; id: string }

const QUICK_PROMPTS: { label: string; query: string }[] = [
  { label: '鸡蛋+西红柿', query: '冰箱里有鸡蛋和西红柿，能做什么？' },
  { label: '15分钟晚餐', query: '15分钟内能搞定的晚餐' },
  { label: '想吃日料', query: '今晚想吃日料' },
  { label: '素食高蛋白', query: '素食，高蛋白' },
]

export default function ChatScreen() {
  const router = useRouter()

  const { pantry } = usePantry()
  const { recipes } = useAllRecipes()
  const [msgs, setMsgs] = React.useState<Msg[]>([
    {
      who: 'bot',
      text: '你好，我是食光 👋。告诉我手边有什么食材、想吃什么，或今晚有多少时间，我来帮你挑一道菜。',
      id: 'init',
    },
  ])
  const [field, setField] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [isBotTyping, setIsBotTyping] = React.useState(false)

  const pushMsg = (who: 'me' | 'bot', text: string, recipe?: Recipe) =>
    setMsgs((m) => [...m, { who, text, recipe, id: crypto.randomUUID() }])

  const botReply = (text: string, recipe?: Recipe) => {
    setIsBotTyping(false)
    pushMsg('bot', text, recipe)
  }

  const agentRespond = (input: string) => {
    const q = input.toLowerCase()
    const foundIng = pantry.length > 0 ? matchRecipes(recipes, pantry) : []

    // 检测用户提到的食材，归一到 canonical
    const mentioned = recipes.flatMap((r) => r.ingredients).filter((i) =>
      q.includes(i.toLowerCase()),
    )

    const reply = () => {
      if (mentioned.length) {
        const matches = recipes.map((r) => ({
          r,
          have: r.ingredients.filter((i) => mentioned.includes(i)),
        }))
          .filter((x) => x.have.length)
          .sort((a, b) => b.have.length - a.have.length)
        botReply(
          `检测到你提到的食材：${mentioned.join('、')}。这道最合适——`,
          matches[0]?.r,
        )
        return
      }
      if (q.includes('15') || q.includes('快')) {
        const pool = recipes.filter((x) => x.time <= 15)
        const r = pool[Math.floor(Math.random() * Math.min(3, pool.length))]
        botReply(`15 分钟内能搞定的，推荐这道——${r.name}。`, r)
        return
      }
      for (const c of CUISINES) {
        const label = CUISINE_LABELS[c]
        if (q.includes(label.toLowerCase()) || (c === 'japanese' && q.includes('日'))) {
          const r = recipes.filter((x) => x.cuisine === c)[0]
          botReply(`想吃${label}？来这道——`, r)
          return
        }
      }
      if (PREFS.some((p) => q.includes(PREF_LABELS[p].toLowerCase()))) {
        const want = PREFS.find((p) => q.includes(PREF_LABELS[p].toLowerCase()))!
        const r = recipes.find((x) => x.tags.includes(want))!
        botReply(`符合「${PREF_LABELS[want]}」的，这道不错——`, r)
        return
      }
      if (pantry.length) {
        botReply(`根据你已添加的 ${pantry.length} 种食材，匹配度最高的是——`, foundIng[0]?.r)
        return
      }
      botReply('告诉我你冰箱里有什么、想吃什么口味、或有多少时间，我给你挑一道。你也可以试试下面的快捷提问。')
    }

    setIsBotTyping(true)
    setTimeout(reply, 700)
  }

  const send = (v?: string) => {
    const text = (v ?? field).trim()
    if (!text) return
    pushMsg('me', text)
    setField('')
    setSending(true)
    agentRespond(text)
    setTimeout(() => setSending(false), 700)
  }

  const handleSubmit = (message: PromptInputMessage) => {
    send(message.text)
  }

  return (
    <section className="flex h-[calc(100dvh-2*var(--nav-h))] flex-col md:mx-auto md:h-[calc(100dvh-var(--nav-h)-3.5rem)] md:max-w-3xl md:border-x md:border-border">
      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="px-4 py-4">
          {msgs.map((m) => (
            <Message from={m.who === 'me' ? 'user' : 'assistant'} key={m.id}>
              <MessageContent>
                <MessageResponse>{m.text}</MessageResponse>
                {m.recipe ? (
                  <button
                    type="button"
                    onClick={() => router.push(`/recipe/${m.recipe!.id}`)}
                    className="mt-2.5 flex w-full items-center gap-2.5 rounded-lg border border-border bg-background p-2 text-left transition-colors hover:border-foreground"
                  >
                    {m.recipe.img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.recipe.img}
                        alt=""
                        className="size-12 shrink-0 rounded-md object-cover"
                        onError={(e) => {
                          ;(e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <span className="size-12 shrink-0 rounded-md bg-muted" />
                    )}
                    <span className="min-w-0">
                      <b className="block text-[13px]">{m.recipe.name}</b>
                      <span className="block text-[11px] text-muted-foreground">
                        {`${CUISINE_LABELS[m.recipe.cuisine]} · ${m.recipe.time}分钟 · ${m.recipe.kcal}kcal`}
                      </span>
                    </span>
                  </button>
                ) : null}
              </MessageContent>
            </Message>
          ))}

          {isBotTyping && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer>思考中…</Shimmer>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <Suggestions className="flex-wrap gap-2 px-4 pb-4">
        {QUICK_PROMPTS.map((p) => (
          <Suggestion
            key={p.label}
            suggestion={p.query}
            onClick={(s) => send(s)}
          />
        ))}
      </Suggestions>

      <div className="border-t border-border bg-background px-4 py-4">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea
            value={field}
            placeholder="告诉食光你想吃什么…"
            onChange={(e) => setField(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            disabled={sending}
          />
          <PromptInputSubmit
            status={sending ? 'submitted' : 'ready'}
            disabled={!field.trim() || sending}
          />
        </PromptInput>
      </div>
    </section>
  )
}
