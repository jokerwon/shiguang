import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { OpenAIChatModelId } from '@ai-sdk/openai/internal';
import { AuthModule } from '../auth/auth.module';
import { RecipeModule } from '../recipe/recipe.module';
import { PantryModule } from '../pantry/pantry.module';
import { FavoriteModule } from '../favorite/favorite.module';
import { PreferenceModule } from '../preference/preference.module';
import { ConversationModule } from '../conversation/conversation.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [
    AuthModule,
    RecipeModule, // RecommendationService（loadSignals 打分单一事实源）
    PantryModule, // PantryService（写工具 replace）
    FavoriteModule, // FavoriteService（写工具 set）
    PreferenceModule, // PreferenceService（只读工具）
    ConversationModule, // ConversationService（消息持久化）
  ],
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
