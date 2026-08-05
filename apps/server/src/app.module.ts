import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { RecipeModule } from './recipe/recipe.module';
import { ChatModule } from './chat/chat.module';
import { PantryModule } from './pantry/pantry.module';
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
    ChatModule,
    PantryModule,
    FavoriteModule,
    PreferenceModule,
    ConversationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
