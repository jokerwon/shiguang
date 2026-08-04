import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RecipeService } from './recipe.service';
import { QueryRecipesDto } from './recipe.dto';

@Controller('recipes')
export class RecipeController {
  constructor(private readonly recipe: RecipeService) {}

  @Get()
  findAll(@Query() query: QueryRecipesDto) {
    return this.recipe.findAll(query);
  }

  /**
   * 个性化首页（ADR-0005，需认证）。
   * 注意：此路由必须在 :id 之前声明，避免 "personalized" 被当作 id 匹配
   */
  @Get('personalized')
  @UseGuards(JwtAuthGuard)
  findPersonalized(@CurrentUser() userId: string) {
    return this.recipe.findPersonalized(userId);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.recipe.findById(id);
  }
}
