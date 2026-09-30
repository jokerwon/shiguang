import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RecipeController } from './recipe.controller';
import { RecipeService } from './recipe.service';
import { RecommendationService } from './recommendation.service';

@Module({
  imports: [AuthModule],
  controllers: [RecipeController],
  providers: [RecipeService, RecommendationService],
  // ChatModule 复用 RecommendationService。
  exports: [RecommendationService],
})
export class RecipeModule {}
