import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { RecipeModule } from './recipe/recipe.module';
import { IngredientModule } from './ingredient/ingredient.module';
import { OptionalJwtAuthGuard } from './auth/optional-jwt-auth.guard';
import { ChatModule } from './chat/chat.module';
import { FavoriteModule } from './favorite/favorite.module';
import { PreferenceModule } from './preference/preference.module';
import { ConversationModule } from './conversation/conversation.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    RecipeModule,
    IngredientModule,
    ChatModule,
    FavoriteModule,
    PreferenceModule,
    ConversationModule,
  ],
  providers: [
    // 全局可选认证：解析 Bearer 后挂 request.user；端点自身用 @UseGuards 决定是否强制
    { provide: APP_GUARD, useClass: OptionalJwtAuthGuard },
  ],
})
export class AppModule {}
