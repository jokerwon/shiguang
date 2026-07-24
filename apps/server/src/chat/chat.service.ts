import { Inject, Injectable } from '@nestjs/common';
import { AIMessageChunk, createAgent } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';
import { UIMessage } from 'ai';
import { toBaseMessages, toUIMessageStream } from '@ai-sdk/langchain';
import type { PromptContext } from './prompts';
import { buildSystemPrompt } from './prompts';

@Injectable()
export class ChatService {
  private agent: ReturnType<typeof createAgent>;

  constructor(@Inject('CHAT_MODEL') private readonly model: ChatOpenAI) {
    this.agent = this.createAgent();
  }

  /** 当用户上下文变化时（如登录/切换偏好），重建 agent */
  rebuildAgent(context?: PromptContext) {
    this.agent = this.createAgent(context);
  }

  private createAgent(context?: PromptContext) {
    return createAgent({
      model: this.model,
      systemPrompt: buildSystemPrompt(context),
    });
  }

  async stream(messages: UIMessage[]) {
    const lcMessages = await toBaseMessages(messages);

    const lgStream = await this.agent.stream(
      { messages: lcMessages },
      {
        streamMode: ['messages', 'values'],
        recursionLimit: 30,
      },
    );

    return toUIMessageStream(lgStream as AsyncIterable<AIMessageChunk>);
  }
}
