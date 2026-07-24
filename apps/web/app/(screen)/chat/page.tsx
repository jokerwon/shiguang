'use client'

import * as React from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { PromptInput, type PromptInputMessage, PromptInputTextarea, PromptInputSubmit } from '@/components/ai-elements/prompt-input'
import { Suggestions, Suggestion } from '@/components/ai-elements/suggestion'
import { Shimmer } from '@/components/ai-elements/shimmer'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('shiguang_token')
}

/** 从 UIMessage.parts 中提取纯文本内容 */
function getMessageText(parts: { type: string; text?: string }[]): string {
  return parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
}

const QUICK_PROMPTS: { label: string; query: string }[] = [
  { label: '鸡蛋+西红柿', query: '冰箱里有鸡蛋和西红柿，能做什么？' },
  { label: '15分钟晚餐', query: '15分钟内能搞定的晚餐' },
  { label: '想吃日料', query: '今晚想吃日料' },
  { label: '素食高蛋白', query: '素食，高蛋白' },
]

const INITIAL_MESSAGE = '你好，我是食光 👋。告诉我手边有什么食材、想吃什么，或今晚有多少时间，我来帮你挑一道菜。'

export default function ChatScreen() {
  const [field, setField] = React.useState('')

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: `${API_BASE}/chat`,
      headers: () => {
        const token = getToken()
        const headers: Record<string, string> = {}
        if (token) headers.Authorization = `Bearer ${token}`
        return headers
      },
    }),
  })

  const isStreaming = status === 'submitted' || status === 'streaming'

  const handleSend = (text: string) => {
    if (!text.trim() || isStreaming) return
    sendMessage({ text })
    setField('')
  }

  const handleSubmit = (message: PromptInputMessage) => {
    handleSend(message.text)
  }

  return (
    <section className="flex h-[calc(100dvh-2*var(--nav-h))] flex-col md:mx-auto md:h-[calc(100dvh-var(--nav-h)-3.5rem)] md:max-w-3xl md:border-x md:border-border">
      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="px-4 py-4">
          {/* 初始欢迎消息 */}
          {messages.length === 0 && (
            <Message from="assistant" key="init">
              <MessageContent>
                <MessageResponse>{INITIAL_MESSAGE}</MessageResponse>
              </MessageContent>
            </Message>
          )}

          {messages.map((m) => (
            <Message from={m.role === 'user' ? 'user' : 'assistant'} key={m.id}>
              <MessageContent>
                <MessageResponse>{getMessageText(m.parts)}</MessageResponse>
              </MessageContent>
            </Message>
          ))}

          {isStreaming && (
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
            onClick={(s) => handleSend(s)}
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
                handleSend(field)
              }
            }}
            disabled={isStreaming}
          />
          <PromptInputSubmit
            status={isStreaming ? 'submitted' : 'ready'}
            disabled={!field.trim() || isStreaming}
          />
        </PromptInput>
      </div>
    </section>
  )
}
