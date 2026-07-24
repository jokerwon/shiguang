import { Controller, Get, Query, Param } from '@nestjs/common';
import { RecipeService } from './recipe.service';
import { QueryRecipesDto } from './recipe.dto';

@Controller('recipes')
export class RecipeController {
  constructor(private readonly recipe: RecipeService) {}

  @Get()
  findAll(@Query() query: QueryRecipesDto) {
    return this.recipe.findAll(query);
  }

  /** 注意：此路由必须在 :id 之前声明，避免 "recommended" 被当作 id 匹配 */
  @Get('recommended')
  findRecommended() {
    return this.recipe.findRecommended();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.recipe.findById(id);
  }
}
