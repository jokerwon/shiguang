import {
  BadRequestException,
  Body,
  Controller,
  InternalServerErrorException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { pipeUIMessageStreamToResponse, type UIMessage } from 'ai';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ChatService } from './chat.service';

// ADR-0006：上下文注入需要用户身份（偏好/pantry），/chat 从公开改为需认证
// ADR-0009/0010：body 改为 { conversationId?, message }，后端从 DB 组装历史
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly aiService: ChatService) {}

  @Post()
  async postChat(
    @CurrentUser() userId: string,
    @Body() body: { conversationId?: string; message?: UIMessage },
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    if (!body?.message) {
      throw new BadRequestException('Invalid JSON');
    }

    const { stream, conversationId } = await this.aiService.stream({
      conversationId: body.conversationId,
      message: body.message,
      userId,
    });

    // 新建会话的 id 通过响应头回传前端（前端 transport 用自定义 fetch 读取）
    res.setHeader('x-conversation-id', conversationId);
    try {
      await pipeUIMessageStreamToResponse({ response: res, stream });
    } catch (error) {
      throw new InternalServerErrorException(error);
    }
  }
}
