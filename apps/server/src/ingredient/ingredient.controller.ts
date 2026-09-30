import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { IngredientService } from './ingredient.service';
import { QueryIngredientsDto } from './ingredient.dto';
import { RecipeService } from '../recipe/recipe.service';

@Controller('ingredients')
export class IngredientController {
  constructor(
    private readonly ingredients: IngredientService,
    private readonly recipes: RecipeService,
  ) {}

  /** 已发布食材列表：名称/别名搜索 + 单层分类过滤 */
  @Get()
  findAll(@Query() query: QueryIngredientsDto) {
    return this.ingredients.findAll(query);
  }

  /**
   * 食材详情（含经审核资料与参考来源）。
   * 注意：/recipes 路由必须在 :id 之前声明，避免被当作 id 匹配。
   */
  @Get(':id/recipes')
  @UseGuards(JwtAuthGuard)
  async relatedRecipes(@CurrentUser() userId: string, @Param('id') id: string) {
    await this.ingredients.findById(id);
    return this.recipes.findByIngredient(userId, id);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.ingredients.findById(id);
  }
}
