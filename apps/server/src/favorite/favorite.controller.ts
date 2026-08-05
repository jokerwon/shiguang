import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { FavoriteService } from './favorite.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('favorites')
@UseGuards(JwtAuthGuard)
export class FavoriteController {
  constructor(private readonly favorite: FavoriteService) {}

  @Get()
  findAll(@CurrentUser() userId: string): Promise<string[]> {
    return this.favorite.findAll(userId);
  }

  /**
   * 收藏操作:无 body 维持 toggle 语义(前端收藏按钮在用);
   * 带 `{ saved: boolean }` body 走幂等 set(ADR-0009 操作卡片 undo 需要)。
   */
  @Post(':recipeId')
  @HttpCode(200)
  async toggle(
    @CurrentUser() userId: string,
    @Param('recipeId') recipeId: string,
    @Body() body?: { saved?: boolean },
  ): Promise<string[]> {
    if (body && typeof body.saved === 'boolean') {
      return this.favorite.set(userId, recipeId, body.saved);
    }
    return this.favorite.toggle(userId, recipeId);
  }
}
