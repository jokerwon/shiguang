import { Module } from '@nestjs/common';
import { createOpenAI } from '@ai-sdk/openai';
import { AuthModule } from '../auth/auth.module';
import { RecipeModule } from '../recipe/recipe.module';
import { FavoriteModule } from '../favorite/favorite.module';
import { PreferenceModule } from '../preference/preference.module';
import { IngredientModule } from '../ingredient/ingredient.module';
import { ConversationModule } from '../conversation/conversation.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [
    AuthModule,
    RecipeModule, // RecommendationService（loadSignals 打分单一事实源）
    IngredientModule, // IngredientService（AI 工具按稳定身份做全部包含）
    FavoriteModule, // FavoriteService（写工具 set）
    PreferenceModule, // PreferenceService（只读工具）
    ConversationModule, // ConversationService（消息持久化）
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    {
      provide: 'CHAT_MODEL',
      useFactory: () =>
        createOpenAI({
          apiKey: process.env.OPENAI_API_KEY,
          baseURL: process.env.OPENAI_BASE_URL,
          // Chat Completions：兼容自定义 baseURL 的 OpenAI-compatible 端点
        }).chat(process.env.MODEL_NAME ?? ''),
    },
  ],
})
export class ChatModule {}
