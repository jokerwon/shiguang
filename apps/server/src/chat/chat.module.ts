import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { OpenAIChatModelId } from '@ai-sdk/openai/internal';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  controllers: [ChatController],
  providers: [
    ChatService,
    {
      provide: 'CHAT_MODEL',
      useFactory: (configService: ConfigService) => {
        const openai = createOpenAI({
          apiKey: configService.get<string>('OPENAI_API_KEY'),
          baseURL: configService.get<string>('OPENAI_BASE_URL'),
        });
        // Chat Completions：兼容自定义 baseURL 的 OpenAI-compatible 端点
        return openai.chat(
          configService.get<OpenAIChatModelId>('MODEL_NAME') ?? '',
        );
      },
      inject: [ConfigService],
    },
  ],
})
export class ChatModule {}
