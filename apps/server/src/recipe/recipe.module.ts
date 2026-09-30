import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IngredientModule } from '../ingredient/ingredient.module';
import { RecipeController } from './recipe.controller';
import { RecipeService } from './recipe.service';
import { RecipeSafetyService } from './recipe-safety.service';
import { RecommendationService } from './recommendation.service';

@Module({
  imports: [AuthModule, forwardRef(() => IngredientModule)],
  controllers: [RecipeController],
  providers: [RecipeService, RecommendationService, RecipeSafetyService],
  // ChatModule 复用 RecommendationService；IngredientModule 复用 RecipeService（相关菜谱）。
  exports: [RecommendationService, RecipeSafetyService, RecipeService],
})
export class RecipeModule {}
