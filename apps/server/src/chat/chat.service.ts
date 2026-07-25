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

    // 本服务编译为 CJS：`require('langchain')` 加载 CJS 版 @langchain/core，
    // 而 ESM-only 的 @ai-sdk/langchain 内部 import 的是 ESM 版 @langchain/core。
    // 两份类实例导致其 AIMessageChunk.isInstance 恒为 false，chunk 被静默丢弃。
    // 因此先把 chunk 序列化为 plain object（适配器显式支持该形态）再传入。
    const stream = lgStream as AsyncIterable<[string, unknown]>;
    async function* serialized(): AsyncIterable<[string, unknown]> {
      for await (const [mode, data] of stream) {
        if (mode === 'messages' && Array.isArray(data)) {
          const [chunk, metadata] = data as [
            { toJSON?: () => unknown },
            unknown,
          ];
          yield [
            mode,
            [
              typeof chunk?.toJSON === 'function' ? chunk.toJSON() : chunk,
              metadata,
            ],
          ];
        } else {
          yield [mode, data];
        }
      }
    }

    return toUIMessageStream(serialized() as AsyncIterable<AIMessageChunk>);
  }
}
