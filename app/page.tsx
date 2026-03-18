'use client'

import { Fragment, useMemo, useState } from 'react'
import { Conversation, ConversationContent, ConversationEmptyState } from '@/components/ai-elements/conversation'
import { Message, MessageAction, MessageActions, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input'
// import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'
import { useChat } from '@ai-sdk/react'
import { CopyIcon, RefreshCcwIcon, UtensilsIcon, PackageIcon, CalendarDaysIcon, SparklesIcon } from 'lucide-react'
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '@/components/ai-elements/tool'

export default function Chat() {
  const [input, setInput] = useState('')
  const { messages, sendMessage, regenerate, status } = useChat()

  // 针对饮食管理的快捷建议
  const suggestions = [
    { text: '南京天气怎么样?', icon: UtensilsIcon },
    { text: '冰箱里有什么?', icon: PackageIcon },
    { text: '这周饮食记录', icon: CalendarDaysIcon },
    { text: '推荐一道菜', icon: SparklesIcon },
  ]

  const isSubmitDisabled = useMemo(() => !(input.trim() || status) || status === 'streaming', [input, status])

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion)
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
  }

  const handleSubmit = () => {
    if (input.trim()) {
      sendMessage({ text: input })
      setInput('')
    }
  }

  return (
    <div className="container mx-auto px-4 py-4 md:py-6 max-w-4xl page-enter flex flex-col h-[calc(100vh-5rem)] md:h-auto md:min-h-[calc(100vh-8rem)]">
      {/* 页面标题 */}
      <div className="mb-4 md:mb-6 text-center shrink-0">
        <div className="inline-block note-card px-4 md:px-6 py-2 md:py-3 rounded-2xl decorative-border">
          <h2 className="text-xl md:text-2xl font-serif font-semibold text-foreground">和食光聊聊你的饮食</h2>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">通过对话记录食材、查询库存、推荐菜品</p>
        </div>
      </div>

      <div className="relative flex flex-col flex-1 bg-card/50 backdrop-blur-sm rounded-2xl md:rounded-3xl border-2 border-border/50 note-card overflow-hidden">
        {/* 对话内容区域 - 可滚动 */}
        <div className="flex-1 overflow-y-auto">
          <Conversation>
            <ConversationContent className="size-full">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-4 md:p-8">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-primary/10 flex items-center justify-center mb-3 md:mb-4 ink-brush">
                    <span className="text-4xl md:text-5xl font-serif font-bold text-primary">食</span>
                  </div>
                  <ConversationEmptyState title="开始记录你的饮食生活" description="告诉我你今天吃了什么,或者想了解什么" />
                </div>
              ) : (
                <div className="space-y-3 md:space-y-4 p-3 md:p-4 pb-6">
                  {messages.map((message, messageIndex) => (
                    <Fragment key={message.id}>
                      {message.parts.map((part, i) => {
                        switch (part.type) {
                          case 'text':
                            const isLastMessage = messageIndex === messages.length - 1
                            return (
                              <div key={`${message.id}-${i}`} className="message-bubble">
                                <Message from={message.role}>
                                  <MessageContent>
                                    {/* <div
                                      className={`
                                      px-3 md:px-4 py-2 md:py-3 rounded-2xl max-w-[90%] md:max-w-[75%]
                                      ${message.role === 'user' ? 'bg-primary text-primary-foreground ml-auto' : 'bg-secondary/50 text-secondary-foreground'}
                                      font-serif leading-relaxed text-sm md:text-base
                                    `}
                                    > */}
                                    <MessageResponse>{part.text}</MessageResponse>
                                    {/* </div> */}
                                  </MessageContent>
                                </Message>
                                {message.role === 'assistant' && isLastMessage && (
                                  <div className="flex justify-start mt-2 ml-2">
                                    <MessageActions>
                                      <MessageAction onClick={() => regenerate()} label="重新生成">
                                        <RefreshCcwIcon className="size-3" />
                                      </MessageAction>
                                      <MessageAction onClick={() => navigator.clipboard.writeText(part.text)} label="复制">
                                        <CopyIcon className="size-3" />
                                      </MessageAction>
                                    </MessageActions>
                                  </div>
                                )}
                              </div>
                            )
                          case 'tool-weather':
                            return (
                              <Tool>
                                <ToolHeader type="tool-weather" state={part.state} />
                                <ToolContent>
                                  <ToolInput input={part.input || ''} />
                                  <ToolOutput output={<MessageResponse>{JSON.stringify(part.output)}</MessageResponse>} errorText={part.errorText} />
                                </ToolContent>
                              </Tool>
                            )
                          default:
                            return null
                        }
                      })}
                    </Fragment>
                  ))}
                </div>
              )}
            </ConversationContent>
          </Conversation>

          {/* 快捷建议 - 只在无消息时显示 */}
          {messages.length === 0 && (
            <div className="px-3 md:px-4 pb-3 md:pb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {suggestions.map((suggestion) => {
                  const Icon = suggestion.icon
                  return (
                    <button
                      key={suggestion.text}
                      onClick={() => handleSuggestionClick(suggestion.text)}
                      className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-1.5 md:py-2 rounded-lg md:rounded-xl bg-background/80 border border-border hover:bg-primary/5 hover:border-primary/30 transition-all group"
                    >
                      <Icon className="size-3.5 md:size-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      <span className="text-xs md:text-sm text-foreground group-hover:text-primary transition-colors">{suggestion.text}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* 输入区域 - 固定在底部 */}
        <div className="border-t border-border/50 bg-background/30 backdrop-blur-sm p-3 md:p-4 shrink-0">
          <PromptInput globalDrop multiple onSubmit={handleSubmit}>
            <PromptInputBody>
              <PromptInputTextarea onChange={handleTextChange} value={input} placeholder="聊聊你的饮食..." className="font-serif text-sm md:text-base" />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger />
                  <PromptInputActionMenuContent>
                    <PromptInputActionAddAttachments />
                  </PromptInputActionMenuContent>
                </PromptInputActionMenu>
              </PromptInputTools>
              <PromptInputSubmit disabled={isSubmitDisabled} status={status} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  )
}
