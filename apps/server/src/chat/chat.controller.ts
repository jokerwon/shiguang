import {
  BadRequestException,
  Body,
  Controller,
  InternalServerErrorException,
  Post,
  Res,
} from '@nestjs/common';
import { pipeUIMessageStreamToResponse, UIMessage } from 'ai';
import type { Response } from 'express';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly aiService: ChatService) {}

  @Post()
  async postChat(
    @Body() body: { messages?: UIMessage[] },
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    if (!body?.messages || !Array.isArray(body.messages)) {
      throw new BadRequestException('Invalid JSON');
    }

    const stream = await this.aiService.stream(body.messages);
    try {
      await pipeUIMessageStreamToResponse({ response: res, stream });
    } catch (error) {
      throw new InternalServerErrorException(error);
    }
  }
}
