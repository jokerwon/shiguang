// 会话 CRUD 端点（ADR-0010）：全部挂 JwtAuthGuard，每个按 id 操作的端点
// 校验 conversation.userId === userId，越权返回 404（不泄露存在性）。
import { Controller, Delete, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ConversationService } from './conversation.service';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(private readonly conversations: ConversationService) {}

  /** 列出当前用户会话（按 updatedAt 倒序） */
  @Get()
  list(@CurrentUser() userId: string) {
    return this.conversations.list(userId);
  }

  /** 取会话全部消息（按 createdAt 升序），越权 404 */
  @Get(':id/messages')
  async messages(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.conversations.listMessages(userId, id);
  }

  /** 删除会话（级联删消息），越权 404 */
  @Delete(':id')
  async delete(@CurrentUser() userId: string, @Param('id') id: string) {
    await this.conversations.delete(userId, id);
    return { ok: true };
  }
}
