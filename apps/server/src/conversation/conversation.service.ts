// 会话持久化服务（ADR-0010）：会话 CRUD + 滑窗上下文组装。
// 所有按 id 操作的端点都校验 conversation.userId === userId，越权返回 404
// （不泄露存在性）。
import { Injectable, NotFoundException } from '@nestjs/common';
import type { UIMessage } from 'ai';
import { PrismaService } from '../prisma/prisma.service';
import {
  toUIMessage,
  fromUIMessage,
  type MessageRow,
} from './conversation.mapper';

/** 滑窗大小：每轮请求携带最近 N 条消息原文（ADR-0010 Phase 2） */
export const CONTEXT_WINDOW = 20;

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  /** 列出当前用户的会话（按 updatedAt 倒序，只返回列表所需字段） */
  async list(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId },
      select: { id: true, title: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** 取会话的全部消息（按 createdAt 升序），越权返回 404 */
  async listMessages(
    userId: string,
    conversationId: string,
  ): Promise<UIMessage[]> {
    await this.assertOwned(userId, conversationId);
    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => toUIMessage(r as MessageRow));
  }

  /** 取最近 N 条消息作为上下文（滑窗，ADR-0010），越权返回 404 */
  async recentMessages(
    userId: string,
    conversationId: string,
  ): Promise<UIMessage[]> {
    await this.assertOwned(userId, conversationId);
    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: CONTEXT_WINDOW,
    });
    // desc 取出后反转为升序，保证对话时序
    return rows.reverse().map((r) => toUIMessage(r as MessageRow));
  }

  /** 创建会话，title = 用户消息文本截断 ~20 字 */
  async create(
    userId: string,
    firstMessageText: string,
  ): Promise<{ id: string }> {
    const title = firstMessageText.trim().slice(0, 20) || '新对话';
    const conv = await this.prisma.conversation.create({
      data: { userId, title },
    });
    return { id: conv.id };
  }

  /** 落库一条消息（user 或 assistant），返回消息 id */
  async appendMessage(
    conversationId: string,
    message: UIMessage,
  ): Promise<void> {
    const cols = fromUIMessage(message);
    if (!cols) return; // 无可落库内容则跳过
    await this.prisma.message.create({
      data: {
        conversationId,
        id: message.id,
        role: cols.role,
        content: cols.content,
        toolCalls: cols.toolCalls as never,
      },
    });
  }

  /** touch conversation.updatedAt（每轮对话后调用，保证列表按最近活跃排序） */
  async touch(conversationId: string): Promise<void> {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  }

  /** 删除会话（级联删消息），越权返回 404 */
  async delete(userId: string, conversationId: string): Promise<void> {
    await this.assertOwned(userId, conversationId);
    await this.prisma.conversation.delete({ where: { id: conversationId } });
  }

  /** 校验会话归属：不存在或不属于该用户均抛 404（不泄露存在性） */
  private async assertOwned(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { userId: true },
    });
    if (!conv || conv.userId !== userId) {
      throw new NotFoundException('会话不存在');
    }
  }
}
