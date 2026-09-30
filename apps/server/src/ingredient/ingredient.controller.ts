import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { IngredientService } from './ingredient.service';
import { IdentifyIngredientsDto, QueryIngredientsDto } from './ingredient.dto';
import { RecipeService } from '../recipe/recipe.service';

@Controller('ingredients')
export class IngredientController {
  constructor(
    private readonly ingredients: IngredientService,
    private readonly recipes: RecipeService,
  ) {}

  /**
   * 已发布食材列表：名称/别名搜索 + 单层分类过滤。
   * 关键词整串命中身份时只返回这些身份，否则返回子串候选（meta.exactMatches 区分）。
   */
  @Get()
  findAll(@Query() query: QueryIngredientsDto) {
    return this.ingredients.findAll(query);
  }

  /**
   * 名称解析为稳定身份：整串相等才命中，命中多个身份返回候选供用户确认，
   * 不做子串猜测。必须在 :id 之前声明，避免被当作 id 匹配。
   */
  @Get('identify')
  identify(@Query() query: IdentifyIngredientsDto) {
    return this.ingredients.identify(query.terms);
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
