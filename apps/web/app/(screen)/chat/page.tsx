'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { usePantry } from '@/lib/use-pantry'
import {
  CUISINES,
  matchRecipes,
  RECIPES,
  type Recipe,
} from '@/lib/recipes'
import { cn } from '@/lib/utils'

type Msg =
  | { who: 'me' | 'bot'; text: string; recipe?: Recipe; id: string; typing?: false }
  | { who: 'bot'; typing: true; id: string }

function isTyping(m: Msg): m is Extract<Msg, { typing: true }> {
  return 'typing' in m && m.typing === true
}

export default function ChatScreen() {
  const router = useRouter()
  const { pantry } = usePantry()
  const [msgs, setMsgs] = React.useState<Msg[]>([
    {
      who: 'bot',
      text: '你好，我是食光 👋。告诉我手边有什么食材、想吃什么，或今晚有多少时间，我来帮你挑一道菜。',
      id: 'init',
    },
  ])
  const [field, setField] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const logRef = React.useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }
  React.useEffect(scrollToBottom, [msgs])

  const pushMsg = (who: 'me' | 'bot', text: string, recipe?: Recipe) =>
    setMsgs((m) => [...m, { who, text, recipe, id: crypto.randomUUID() }])

  const botReply = (text: string, recipe?: Recipe) =>
    setMsgs((m) => [
      ...m.filter((x) => !('typing' in x && x.typing)),
      { who: 'bot', text, recipe, id: crypto.randomUUID() },
    ])

  const agentRespond = (input: string) => {
    const q = input.toLowerCase()
    const foundIng = pantry.length > 0 ? matchRecipes(pantry) : []
    const mentioned = RECIPES.flatMap((r) => r.ingredients).filter((i) =>
      q.includes(i.toLowerCase()),
    )

    const reply = () => {
      if (mentioned.length) {
        const matches = RECIPES.map((r) => ({
          r,
          have: r.ingredients.filter((i) => mentioned.includes(i)),
        }))
          .filter((x) => x.have.length)
          .sort((a, b) => b.have.length - a.have.length)
        botReply(`检测到你提到的食材：${mentioned.join('、')}。这道最合适——`, matches[0]?.r)
        return
      }
      if (q.includes('15') || q.includes('快手') || q.includes('快')) {
        const pool = RECIPES.filter((x) => x.time <= 15)
        const r = pool[Math.floor(Math.random() * Math.min(3, pool.length))]
        botReply(`15 分钟内能搞定的，推荐这道——${r.name}。`, r)
        return
      }
      for (const c of CUISINES) {
        if (q.includes(c) || (c === '日料' && q.includes('日'))) {
          const r = RECIPES.filter((x) => x.cuisine === c)[0]
          botReply(`想吃${c}？来这道——`, r)
          return
        }
      }
      if (q.includes('素') || q.includes('高蛋白') || q.includes('低卡')) {
        const want = q.includes('素') ? '素食' : q.includes('高蛋白') ? '高蛋白' : '低卡'
        const r = RECIPES.find((x) => x.tags.includes(want))!
        botReply(`符合「${want}」的，这道不错——`, r)
        return
      }
      if (pantry.length) {
        botReply(
          `根据你已添加的 ${pantry.length} 种食材，匹配度最高的是——`,
          foundIng[0]?.r,
        )
        return
      }
      botReply(
        '告诉我你冰箱里有什么、想吃什么口味、或有多少时间，我给你挑一道。你也可以试试下面的快捷提问。',
      )
    }

    setMsgs((m) => [
      ...m.filter((x) => !('typing' in x && x.typing)),
      { who: 'bot', typing: true, id: 'typing' },
    ])
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

  return (
    <section className="flex h-[calc(100dvh-2*var(--nav-h))] flex-col md:mx-auto md:h-[calc(100dvh-var(--nav-h)-3.5rem)] md:max-w-3xl md:border-x md:border-border">
      <div
        ref={logRef}
        aria-live="polite"
        className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      >
        {msgs.map((m) =>
          isTyping(m) ? (
            <div className="msg bot self-start max-w-[84%] rounded-lg rounded-bl-sm border border-border bg-muted p-3" key={m.id}>
              <div className="mb-1 font-mono text-[11px] text-muted-foreground">食光</div>
              <div className="flex items-center gap-1">
                {[0, 0.2, 0.4].map((d) => (
                  <span
                    key={d}
                    className="size-1.5 animate-blink rounded-full bg-muted-foreground"
                    style={{ animationDelay: `${d}s` }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div
              className={cn(
                'msg max-w-[84%] rounded-lg p-3 text-sm leading-relaxed md:max-w-[72%]',
                m.who === 'me'
                  ? 'self-end rounded-br-sm bg-foreground text-background'
                  : 'self-start rounded-bl-sm border border-border bg-muted',
              )}
              key={m.id}
            >
              <div
                className={cn(
                  'mb-1 font-mono text-[11px]',
                  m.who === 'me'
                    ? 'text-[color-mix(in_oklch,var(--background)_60%,transparent)]'
                    : 'text-muted-foreground',
                )}
              >
                {m.who === 'me' ? '我' : '食光'}
              </div>
              {m.text}
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
                      {m.recipe.cuisine} · {m.recipe.time}分钟 · {m.recipe.kcal}kcal
                    </span>
                  </span>
                </button>
              ) : null}
            </div>
          ),
        )}
      </div>

      <div className="flex flex-wrap gap-2 px-4 pb-4">
        {[
          ['鸡蛋+西红柿', '冰箱里有鸡蛋和西红柿，能做什么？'],
          ['15分钟晚餐', '15分钟内能搞定的晚餐'],
          ['想吃日料', '今晚想吃日料'],
          ['素食高蛋白', '素食，高蛋白'],
        ].map(([label, q]) => (
          <button
            key={label}
            type="button"
            onClick={() => send(q)}
            className="rounded-full border border-border bg-background px-3 py-2 text-[13px] hover:border-foreground"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 border-t border-border bg-background p-4">
        <Input
          placeholder="告诉食光你想吃什么…"
          value={field}
          onChange={(e) => setField(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send()
          }}
          disabled={sending}
          className="rounded-full bg-muted"
        />
        <button
          type="button"
          onClick={() => send()}
          aria-label="发送"
          disabled={!field.trim() || sending}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-foreground text-background disabled:opacity-45"
        >
          <Send size={20} />
        </button>
      </div>
    </section>
  )
}
