import { Inject, Injectable } from '@nestjs/common';
import {
  convertToModelMessages,
  streamText,
  toUIMessageStream,
  type LanguageModel,
  type UIMessage,
} from 'ai';
import type { PromptContext } from './prompts';
import { buildSystemPrompt } from './prompts';

@Injectable()
export class ChatService {
  private systemPrompt: string;

  constructor(@Inject('CHAT_MODEL') private readonly model: LanguageModel) {
    this.systemPrompt = buildSystemPrompt();
  }

  /** 当用户上下文变化时（如登录/切换偏好），更新 system prompt */
  setPromptContext(context?: PromptContext) {
    this.systemPrompt = buildSystemPrompt(context);
  }

  async stream(messages: UIMessage[]) {
    const result = streamText({
      model: this.model,
      system: this.systemPrompt,
      messages: await convertToModelMessages(messages),
    });

    return toUIMessageStream({ stream: result.stream });
  }
}
