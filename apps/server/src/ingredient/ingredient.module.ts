import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { forwardRef } from '@nestjs/common';
import { RecipeModule } from '../recipe/recipe.module';
import { IngredientController } from './ingredient.controller';
import { IngredientService } from './ingredient.service';

@Module({
  // 与 RecipeModule 互相引用（菜谱查询需要食材身份，食材详情需要相关菜谱）
  imports: [AuthModule, forwardRef(() => RecipeModule)],
  controllers: [IngredientController],
  providers: [IngredientService],
  // RecipeModule 复用 IngredientService 做全部包含过滤。
  exports: [IngredientService],
})
export class IngredientModule {}
