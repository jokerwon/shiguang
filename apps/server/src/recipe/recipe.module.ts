import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RecipeController } from './recipe.controller';
import { RecipeService } from './recipe.service';
import { RecommendationService } from './recommendation.service';

@Module({
  imports: [AuthModule],
  controllers: [RecipeController],
  providers: [RecipeService, RecommendationService],
  // ChatModule（AI 上下文注入，ADR-0006）复用 RecommendationService
  exports: [RecommendationService],
})
export class RecipeModule {}
