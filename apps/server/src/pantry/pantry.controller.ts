import {
  Controller,
  Get,
  Put,
  Body,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { PantryService } from './pantry.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('pantry')
@UseGuards(JwtAuthGuard)
export class PantryController {
  constructor(private readonly pantry: PantryService) {}

  @Get()
  findAll(@CurrentUser() userId: string): Promise<string[]> {
    return this.pantry.findAll(userId);
  }

  /** body 是裸 string[](整体替换),非 {names} 包装 */
  @Put()
  @HttpCode(200)
  replace(
    @CurrentUser() userId: string,
    @Body() names: unknown,
  ): Promise<string[]> {
    return this.pantry.replace(userId, names);
  }
}
