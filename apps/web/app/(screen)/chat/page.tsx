'use client'

import * as React from 'react'
import Link from 'next/link'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { PromptInput, type PromptInputMessage, PromptInputTextarea, PromptInputSubmit, PromptInputBody, PromptInputFooter } from '@/components/ai-elements/prompt-input'
import { Suggestions, Suggestion } from '@/components/ai-elements/suggestion'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { ToolPartView, type ToolPart } from '@/components/ai-elements/tool'
import { ChatSidebar } from '@/components/chat-sidebar'
import { API_BASE, getToken } from '@/lib/constants'
import { fetchConversationMessages } from '@/lib/api'
import { refreshConversations } from '@/lib/use-conversations'
import { useSWRConfig } from 'swr'

/** 从 UIMessage parts 中提取纯文本内容 */
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

/** 工具调用 part 类型（type 以 'tool-' 开头） */
function isToolPart(p: { type: string }): boolean {
  return p.type.startsWith('tool-')
}

export default function ChatScreen() {
  const [field, setField] = React.useState('')
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  // 标记切换会话时的「正在加载历史」状态，避免 useChat 初始空消息闪现
  const [loadingHistory, setLoadingHistory] = React.useState(false)
  const { mutate: globalMutate } = useSWRConfig()

  // 自定义 fetch：拦截响应头 x-conversation-id（新建会话时后端回传）
  const customFetch = React.useCallback(
    (input: RequestInfo | URL, init?: RequestInit) => {
      return fetch(input, init).then((res) => {
        const cid = res.headers.get('x-conversation-id')
        if (cid) {
          setActiveId((cur) => cur ?? cid)
          refreshConversations()
        }
        return res
      })
    },
    [],
  )

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: `${API_BASE}/chat`,
        fetch: customFetch,
        headers: () => {
          const token = getToken()
          const headers: Record<string, string> = {}
          if (token) headers.Authorization = `Bearer ${token}`
          return headers
        },
        // ADR-0010：只发 conversationId + 最新一条用户消息，后端从 DB 组装历史
        prepareSendMessagesRequest: ({ messages }) => {
          const last = messages[messages.length - 1]
          return {
            body: {
              conversationId: activeId ?? undefined,
              message: last,
            },
          }
        },
      }),
    [activeId, customFetch],
  )

  const { messages, sendMessage, status, error, clearError, setMessages } = useChat({
    id: activeId ?? 'new',
    transport,
  })

  const isStreaming = status === 'submitted' || status === 'streaming'

  // 流结束后兜底刷新 pantry/favorites（写工具可能改了数据，ADR-0009 一致性）
  const prevStatus = React.useRef(status)
  React.useEffect(() => {
    if (prevStatus.current === 'streaming' && status === 'ready') {
      globalMutate('/pantry')
      globalMutate('/favorites')
    }
    prevStatus.current = status
  }, [status, globalMutate])

  // 切换会话：拉历史消息并 setMessages 还原（含 tool parts）
  const selectConversation = React.useCallback(
    async (id: string) => {
      setActiveId(id)
      setLoadingHistory(true)
      try {
        const history = await fetchConversationMessages(id)
        setMessages(history as UIMessage[])
      } finally {
        setLoadingHistory(false)
      }
    },
    [setMessages],
  )

  // 新对话：清空当前消息
  const newConversation = React.useCallback(() => {
    setActiveId(null)
    setMessages([])
    setSidebarOpen(false)
  }, [setMessages])

  const handleSend = (text: string) => {
    if (!text.trim() || isStreaming) return
    clearError()
    sendMessage({ text })
    setField('')
  }

  const handleSubmit = (message: PromptInputMessage) => {
    handleSend(message.text)
  }

  return (
    <div className="flex h-[calc(100dvh-2*var(--nav-h))] flex-col md:h-[calc(100dvh-var(--nav-h)-3.5rem)] md:flex-row md:gap-4 md:px-4 md:py-6">
      {/* 桌面侧栏 */}
      <aside className="hidden md:block md:w-64 md:shrink-0 md:overflow-hidden md:rounded-2xl md:border md:border-border">
        <ChatSidebar activeId={activeId} onSelect={selectConversation} onNew={newConversation} />
      </aside>

      {/* 移动端抽屉 */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[80%] border-r border-border bg-background">
            <ChatSidebar
              activeId={activeId}
              onSelect={selectConversation}
              onNew={newConversation}
              onClose={() => setSidebarOpen(false)}
            />
          </aside>
        </div>
      )}

      <section className="flex min-h-0 flex-1 flex-col md:mx-auto md:w-full md:max-w-3xl md:overflow-hidden md:rounded-2xl md:border md:border-border md:bg-background md:shadow-sm">
        {/* 顶部栏：移动端菜单按钮 */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 md:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted/50"
            aria-label="会话列表"
          >
            ☰
          </button>
          <span className="text-sm text-muted-foreground">
            {activeId ? '当前会话' : '新对话'}
          </span>
        </div>

        <Conversation className="flex-1 min-h-0">
          <ConversationContent className="px-4 py-4">
            {/* 初始欢迎消息 */}
            {messages.length === 0 && !loadingHistory && (
              <Message from="assistant" key="init">
                <MessageContent>
                  <MessageResponse>{INITIAL_MESSAGE}</MessageResponse>
                </MessageContent>
              </Message>
            )}

            {loadingHistory && (
              <Message from="assistant">
                <MessageContent>
                  <Shimmer>加载历史…</Shimmer>
                </MessageContent>
              </Message>
            )}

            {messages.map((m) => (
              <Message from={m.role === 'user' ? 'user' : 'assistant'} key={m.id}>
                <MessageContent>
                  {/* text parts 渲染为 markdown；tool parts 渲染为工具行/操作卡片 */}
                  {(() => {
                    const parts = m.parts as unknown as { type: string; text?: string }[]
                    const text = getMessageText(parts.filter((p) => !isToolPart(p)))
                    const toolParts = parts.filter(isToolPart) as unknown as ToolPart[]
                    return (
                      <>
                        {text && <MessageResponse>{text}</MessageResponse>}
                        {toolParts.map((tp, i) => (
                          <ToolPartView key={`${tp.type}-${i}`} part={tp} />
                        ))}
                      </>
                    )
                  })()}
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

        {messages.length === 0 && (
          <Suggestions className="flex-wrap gap-2 px-4 pb-4">
            {QUICK_PROMPTS.map((p) => (
              <Suggestion key={p.label} suggestion={p.query} onClick={(s) => handleSend(s)} />
            ))}
          </Suggestions>
        )}

        <div className="border-t border-border bg-background px-4 py-4">
          {/* /chat 需认证（ADR-0006）：token 过期等发送失败在此提示 */}
          {error && (
            <p className="mb-3 text-[13px] text-muted-foreground">
              发送失败{error.message.includes('401') ? '，登录已过期，请' : '，请稍后重试（或'}
              <Link href="/login" className="font-medium text-foreground hover:underline">
                重新登录
              </Link>
              {error.message.includes('401') ? '。' : '）。'}
            </p>
          )}
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputBody>
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
            </PromptInputBody>

            <PromptInputFooter>
              <div />
              <PromptInputSubmit status={isStreaming ? 'submitted' : 'ready'} disabled={!field.trim() || isStreaming} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </section>
    </div>
  )
}
