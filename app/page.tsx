'use client'

import { Conversation, ConversationContent, ConversationEmptyState } from '@/components/ai-elements/conversation'
import { Message, MessageAction, MessageActions, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input'
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'
import { useChat } from '@ai-sdk/react'
import { CopyIcon, GlobeIcon, MessageSquare, RefreshCcwIcon } from 'lucide-react'
import { Fragment, useCallback, useMemo, useState } from 'react'

export default function Chat() {
  const [input, setInput] = useState('')
  const [useWebSearch, setUseWebSearch] = useState<boolean>(false)
  const { messages, sendMessage, regenerate, status } = useChat()
  const suggestions = ['What is the weather like today?', 'What is the capital of France?', 'What is the square root of 16?']

  const isSubmitDisabled = useMemo(() => !(input.trim() || status) || status === 'streaming', [input, status])

  const toggleWebSearch = useCallback(() => {
    setUseWebSearch((prev) => !prev)
  }, [])

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
    <div className="relative flex size-full flex-col divide-y overflow-hidden">
      <Conversation>
        <ConversationContent className="size-full">
          {messages.length === 0 ? (
            <ConversationEmptyState icon={<MessageSquare className="size-12" />} title="Start a conversation" description="Type a message below to begin chatting" />
          ) : (
            messages.map((message, messageIndex) => (
              <Fragment key={message.id}>
                {message.parts.map((part, i) => {
                  switch (part.type) {
                    case 'text':
                      const isLastMessage = messageIndex === messages.length - 1
                      return (
                        <Fragment key={`${message.id}-${i}`}>
                          <Message from={message.role}>
                            <MessageContent>
                              <MessageResponse>{part.text}</MessageResponse>
                            </MessageContent>
                          </Message>
                          {message.role === 'assistant' && isLastMessage && (
                            <MessageActions>
                              <MessageAction onClick={() => regenerate()} label="Retry">
                                <RefreshCcwIcon className="size-3" />
                              </MessageAction>
                              <MessageAction onClick={() => navigator.clipboard.writeText(part.text)} label="Copy">
                                <CopyIcon className="size-3" />
                              </MessageAction>
                            </MessageActions>
                          )}
                        </Fragment>
                      )
                    default:
                      return null
                  }
                })}
              </Fragment>
            ))
          )}
        </ConversationContent>
      </Conversation>
      <div className="grid shrink-0 gap-4 pt-4">
        <Suggestions className="px-4">
          {suggestions.map((suggestion) => (
            <SuggestionItem key={suggestion} onClick={handleSuggestionClick} suggestion={suggestion} />
          ))}
        </Suggestions>
        <div className="w-full px-4 pb-4">
          <PromptInput globalDrop multiple onSubmit={handleSubmit}>
            <PromptInputBody>
              <PromptInputTextarea onChange={handleTextChange} value={input} />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger />
                  <PromptInputActionMenuContent>
                    <PromptInputActionAddAttachments />
                  </PromptInputActionMenuContent>
                </PromptInputActionMenu>
                <PromptInputButton onClick={toggleWebSearch} variant={useWebSearch ? 'default' : 'ghost'}>
                  <GlobeIcon size={16} />
                  <span>Search</span>
                </PromptInputButton>
              </PromptInputTools>
              <PromptInputSubmit disabled={isSubmitDisabled} status={status} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  )
}

const SuggestionItem = ({ suggestion, onClick }: { suggestion: string; onClick: (suggestion: string) => void }) => {
  const handleClick = useCallback(() => {
    onClick(suggestion)
  }, [onClick, suggestion])

  return <Suggestion onClick={handleClick} suggestion={suggestion} />
}
