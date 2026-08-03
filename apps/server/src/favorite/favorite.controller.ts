import {
  Controller,
  Get,
  Post,
  Param,
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

  @Post(':recipeId')
  @HttpCode(200)
  toggle(
    @CurrentUser() userId: string,
    @Param('recipeId') recipeId: string,
  ): Promise<string[]> {
    return this.favorite.toggle(userId, recipeId);
  }
}
