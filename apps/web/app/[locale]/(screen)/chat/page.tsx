'use client'

import * as React from 'react'
import { Send } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type { Locale } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { Input } from '@/components/ui/input'
import { usePantry } from '@/lib/use-pantry'
import {
  CUISINES,
  matchRecipes,
  PREFS,
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

type CuisineKey = 'home' | 'western' | 'japanese' | 'sichuan' | 'light'
type PrefKey = 'vegetarian' | 'high-protein' | 'low-cal' | 'low-carb' | 'quick' | 'rice-friendly' | 'comforting'

const pick = (l: { zh: string; en: string }, locale: Locale) =>
  locale === 'en' ? l.en : l.zh

export default function ChatScreen() {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('Chat')
  const tc = useTranslations('Cuisine')
  const tp = useTranslations('Pref')

  const { pantry } = usePantry()
  const [msgs, setMsgs] = React.useState<Msg[]>([
    {
      who: 'bot',
      text: t('greeting'),
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

    // 检测用户提到的食材（zh 与 en 都匹配），归一到 zh canonical
    const mentioned = RECIPES.flatMap((r) => r.ingredients).filter((i) =>
      q.includes(i.zh.toLowerCase()) || q.includes(i.en.toLowerCase()),
    ).map((i) => i.zh)

    const reply = () => {
      if (mentioned.length) {
        const matches = RECIPES.map((r) => ({
          r,
          have: r.ingredients.filter((i) => mentioned.includes(i.zh)),
        }))
          .filter((x) => x.have.length)
          .sort((a, b) => b.have.length - a.have.length)
        botReply(
          t('replyMentioned', {
            ings: mentioned.map((zh) => {
              const f = RECIPES.flatMap((r) => r.ingredients).find((i) => i.zh === zh)
              return f ? pick(f, locale) : zh
            }).join(locale === 'en' ? ', ' : '、'),
          }),
          matches[0]?.r,
        )
        return
      }
      if (q.includes('15') || q.includes(tc('quick' as PrefKey).toLowerCase()) || q.includes('快')) {
        const pool = RECIPES.filter((x) => x.time <= 15)
        const r = pool[Math.floor(Math.random() * Math.min(3, pool.length))]
        botReply(t('replyQuick', { name: pick(r.name, locale) }), r)
        return
      }
      for (const c of CUISINES) {
        const label = tc(c as CuisineKey).toLowerCase()
        if (q.includes(label) || (c === 'japanese' && q.includes('日'))) {
          const r = RECIPES.filter((x) => x.cuisine === c)[0]
          botReply(t('replyCuisine', { cuisine: tc(c as CuisineKey) }), r)
          return
        }
      }
      if (PREFS.some((p) => q.includes(tp(p as PrefKey).toLowerCase()))) {
        const want = PREFS.find((p) => q.includes(tp(p as PrefKey).toLowerCase()))!
        const r = RECIPES.find((x) => x.tags.includes(want))!
        botReply(t('replyPref', { pref: tp(want as PrefKey) }), r)
        return
      }
      if (pantry.length) {
        botReply(t('replyPantry', { count: pantry.length }), foundIng[0]?.r)
        return
      }
      botReply(t('replyFallback'))
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

  const quickPrompts: { labelKey: 'quick1Label' | 'quick2Label' | 'quick3Label' | 'quick4Label'; queryKey: 'quick1Query' | 'quick2Query' | 'quick3Query' | 'quick4Query' }[] = [
    { labelKey: 'quick1Label', queryKey: 'quick1Query' },
    { labelKey: 'quick2Label', queryKey: 'quick2Query' },
    { labelKey: 'quick3Label', queryKey: 'quick3Query' },
    { labelKey: 'quick4Label', queryKey: 'quick4Query' },
  ]

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
              <div className="mb-1 font-mono text-[11px] text-muted-foreground">{t('botName')}</div>
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
                {m.who === 'me' ? t('me') : t('botName')}
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
                    <b className="block text-[13px]">{pick(m.recipe.name, locale)}</b>
                    <span className="block text-[11px] text-muted-foreground">
                      {t('recipeMeta', {
                        cuisine: tc(m.recipe.cuisine as CuisineKey),
                        time: m.recipe.time,
                        kcal: m.recipe.kcal,
                      })}
                    </span>
                  </span>
                </button>
              ) : null}
            </div>
          ),
        )}
      </div>

      <div className="flex flex-wrap gap-2 px-4 pb-4">
        {quickPrompts.map((p) => (
          <button
            key={p.labelKey}
            type="button"
            onClick={() => send(t(p.queryKey))}
            className="rounded-full border border-border bg-background px-3 py-2 text-[13px] hover:border-foreground"
          >
            {t(p.labelKey)}
          </button>
        ))}
      </div>

      <div className="flex gap-2 border-t border-border bg-background p-4">
        <Input
          placeholder={t('placeholder')}
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
          aria-label={t('sendAria')}
          disabled={!field.trim() || sending}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-foreground text-background disabled:opacity-45"
        >
          <Send size={20} />
        </button>
      </div>
    </section>
  )
}
