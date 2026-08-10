'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
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
import { fetchConversationMessages, ApiError } from '@/lib/api'
import { refreshConversations } from '@/lib/use-conversations'
import { useSWRConfig } from 'swr'

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

/**
 * 从路由 params 推导当前会话状态。
 * - slug 缺省 / ['new'] → 新会话态（conversationId = undefined）
 * - [id] → 已有会话（conversationId = id）
 */
function useRouteConversationId(): string | undefined {
  const params = useParams<{ slug?: string[] }>()
  const slug = params?.slug
  if (!slug || slug.length === 0 || slug[0] === 'new') return undefined
  return slug[0]
}

export default function ChatScreen() {
  const router = useRouter()
  const routeId = useRouteConversationId()
  const [field, setField] = React.useState('')
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  // 标记切换会话时的「正在加载历史」状态，避免 useChat 初始空消息闪现
  const [loadingHistory, setLoadingHistory] = React.useState(false)
  // 越权/不存在会话的提示：存出错的 routeId，routeId 变化后自动失效，无需 effect 主动清
  const [notFoundId, setNotFoundId] = React.useState<string | undefined>(undefined)
  // 历史消息 id 集合（ADR-0012 决策 2）：拉取历史时记录，历史消息的操作/确认卡片只读。
  // 用 state 不用 ref（React Compiler 禁止 render 期读 ref.current）；新流式消息 id 不在集合内 → 可交互。
  const [readOnlyIds, setReadOnlyIds] = React.useState<Set<string>>(new Set())
  const { mutate: globalMutate } = useSWRConfig()

  // ADR-0011：useChat 常量 id（'chat'），切换会话不切 id，流式不中断。
  // conversationId 从路由 routeId 读取。transport 依赖 routeId 重建：
  // URL 方案下 router.replace（首条消息响应头到达时触发）发生在流式请求已发出之后，
  // transport 引用变化不影响在飞请求，下次 sendMessage 才用新 transport，流式不中断。
  // （未用 ref 实时读取：本项目 React Compiler 禁止 render 期 ref.current 访问。）

  // 自定义 fetch：拦截响应头 x-conversation-id（新建会话时后端回传）
  // 首条消息后 router.replace 到真实 id（非 push，不污染历史）。
  const customFetch = React.useCallback(
    (input: RequestInfo | URL, init?: RequestInit) => {
      return fetch(input, init).then((res) => {
        const cid = res.headers.get('x-conversation-id')
        if (cid) {
          // 仅当当前仍是新会话态时 replace，避免重复跳转
          if (!routeId) {
            router.replace(`/chat/${cid}`)
          }
          refreshConversations()
        }
        return res
      })
    },
    [router, routeId],
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
        // ADR-0010：只发 conversationId + 最新一条用户消息，后端从 DB 组装历史。
        // ADR-0011：conversationId 从路由 routeId 读取（URL 是事实源）。
        prepareSendMessagesRequest: ({ messages }) => {
          const last = messages[messages.length - 1]
          return {
            body: {
              conversationId: routeId,
              message: last,
            },
          }
        },
      }),
    [customFetch, routeId],
  )

  const { messages, sendMessage, status, error, clearError, setMessages } = useChat({
    id: 'chat',
    transport,
  })

  const isStreaming = status === 'submitted' || status === 'streaming'

  // 流结束后兜底刷新 pantry/favorites/conversations（写工具可能改了数据 + 会话 updatedAt 变化，ADR-0009/0011 一致性）
  const prevStatus = React.useRef(status)
  React.useEffect(() => {
    if (prevStatus.current === 'streaming' && status === 'ready') {
      globalMutate('/pantry')
      globalMutate('/favorites')
      globalMutate('/conversations')
    }
    prevStatus.current = status
  }, [status, globalMutate])

  // ADR-0011：切换会话由路由驱动。routeId 变化 → 拉历史或清空。
  React.useEffect(() => {
    if (!routeId) {
      // 新会话态：清空消息（避免上一会话闪现）。
      // readOnlyIds 不同步清空：它只对「当前渲染的消息 id」生效，消息已清空则旧 id 天然惰性；
      // 新流式消息 id 不在集合内 → 可交互。避免在 effect 体同步 setState（react-hooks 规则）。
      setMessages([])
      return
    }
    let cancelled = false
    setLoadingHistory(true)
    // 先清空避免上一会话消息闪现
    setMessages([])
    fetchConversationMessages(routeId)
      .then((history) => {
        if (cancelled) return
        setMessages(history as UIMessage[])
        // 历史消息一律只读（刷新后撤销/确认入口锁定，ADR-0012 决策 2）
        setReadOnlyIds(new Set(history.map((m) => m.id)))
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 404) {
          // 越权/不存在：记录出错 id（显示条件据此判定，routeId 变化后自动失效）
          setNotFoundId(routeId)
          router.replace('/chat/new')
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false)
      })
    return () => {
      cancelled = true
    }
  }, [routeId, setMessages, router])

  const handleSend = (text: string) => {
    if (!text.trim() || isStreaming) return
    clearError()
    sendMessage({ text })
    setField('')
  }

  const handleSubmit = (message: PromptInputMessage) => {
    handleSend(message.text)
  }

  // 侧栏切换/新建/删除均经路由驱动（ADR-0011：URL 是事实源）
  const handleSelect = React.useCallback((id: string) => {
    router.push(`/chat/${id}`)
  }, [router])

  const handleNew = React.useCallback(() => {
    router.push('/chat/new')
    setSidebarOpen(false)
  }, [router])

  return (
    <div className="flex h-[calc(100dvh-2*var(--nav-h))] flex-col md:h-[calc(100dvh-var(--nav-h)-3.5rem)] md:flex-row md:gap-4 md:px-4 md:py-6">
      {/* 桌面侧栏 */}
      <aside className="hidden md:block md:w-64 md:shrink-0 md:overflow-hidden md:rounded-2xl md:border md:border-border">
        <ChatSidebar activeId={routeId ?? null} onSelect={handleSelect} onNew={handleNew} />
      </aside>

      {/* 移动端抽屉 */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[80%] border-r border-border bg-background">
            <ChatSidebar
              activeId={routeId ?? null}
              onSelect={handleSelect}
              onNew={handleNew}
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
            {routeId ? '当前会话' : '新对话'}
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

            {notFoundId && notFoundId === routeId && (
              <Message from="assistant">
                <MessageContent>
                  <MessageResponse>会话不存在，已为你新建对话。</MessageResponse>
                </MessageContent>
              </Message>
            )}

            {messages.map((m) => (
              <Message from={m.role === 'user' ? 'user' : 'assistant'} key={m.id}>
                <MessageContent>
                  {/* 按 parts 原序渲染：text part → markdown，tool part → 工具行/操作卡片（保留交错顺序） */}
                  {(m.parts as unknown as { type: string; text?: string }[]).map((p, i) => {
                    if (isToolPart(p)) {
                      return (
                        <ToolPartView
                          key={`${p.type}-${i}`}
                          part={p as unknown as ToolPart}
                          readOnly={readOnlyIds.has(m.id)}
                        />
                      )
                    }
                    if (p.type === 'text' && p.text) {
                      return <MessageResponse key={`text-${i}`}>{p.text}</MessageResponse>
                    }
                    return null
                  })}
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
