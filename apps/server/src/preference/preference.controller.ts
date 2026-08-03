import {
  Controller,
  Get,
  Put,
  Body,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { PreferenceService } from './preference.service';
import { UpdatePreferenceDto } from './preference.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('preferences')
@UseGuards(JwtAuthGuard)
export class PreferenceController {
  constructor(private readonly preference: PreferenceService) {}

  @Get()
  find(@CurrentUser() userId: string) {
    return this.preference.find(userId);
  }

  @Put()
  @HttpCode(200)
  upsert(@CurrentUser() userId: string, @Body() dto: UpdatePreferenceDto) {
    return this.preference.upsert(userId, dto);
  }
}
