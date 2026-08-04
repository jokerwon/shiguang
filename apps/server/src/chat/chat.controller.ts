import {
  BadRequestException,
  Body,
  Controller,
  InternalServerErrorException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { pipeUIMessageStreamToResponse, UIMessage } from 'ai';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ChatService } from './chat.service';

// ADR-0006：上下文注入需要用户身份（偏好/pantry/候选菜谱），/chat 从公开改为需认证
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly aiService: ChatService) {}

  @Post()
  async postChat(
    @CurrentUser() userId: string,
    @Body() body: { messages?: UIMessage[] },
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    if (!body?.messages || !Array.isArray(body.messages)) {
      throw new BadRequestException('Invalid JSON');
    }

    const stream = await this.aiService.stream(body.messages, userId);
    try {
      await pipeUIMessageStreamToResponse({ response: res, stream });
    } catch (error) {
      throw new InternalServerErrorException(error);
    }
  }
}
