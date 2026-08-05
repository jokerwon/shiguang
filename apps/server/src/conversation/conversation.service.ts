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

  /** 取会话的全部消息（按 seq 升序），越权返回 404 */
  async listMessages(
    userId: string,
    conversationId: string,
  ): Promise<UIMessage[]> {
    await this.assertOwned(userId, conversationId);
    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { seq: 'asc' },
    });
    return rows.map((r) => toUIMessage(r as MessageRow));
  }

  /** 取最近 N 条消息作为上下文（滑窗，ADR-0010/0011：按 seq desc），越权返回 404 */
  async recentMessages(
    userId: string,
    conversationId: string,
  ): Promise<UIMessage[]> {
    await this.assertOwned(userId, conversationId);
    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { seq: 'desc' },
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
    // ADR-0011：seq = max(seq)+1，配 @@unique 冲突重试。
    // URL 拥有 + 单标签视图下并发写同会话概率极低，重试 1-2 次兜底即可。
    const MAX_RETRY = 3;
    for (let attempt = 0; ; attempt++) {
      const seq = await this.nextSeq(conversationId);
      try {
        await this.prisma.message.create({
          data: {
            conversationId,
            id: message.id,
            seq,
            role: cols.role,
            parts: cols.parts as never,
          },
        });
        return;
      } catch (e) {
        if (attempt < MAX_RETRY - 1 && this.isUniqueViolation(e)) {
          continue; // seq 冲突，重算重试
        }
        throw e;
      }
    }
  }

  /** 计算会话内下一条消息的 seq（= max(seq)+1，空会话从 1 起） */
  private async nextSeq(conversationId: string): Promise<number> {
    const last = await this.prisma.message.aggregate({
      where: { conversationId },
      _max: { seq: true },
    });
    return (last._max.seq ?? 0) + 1;
  }

  /** Prisma 唯一约束冲突判定（code P2002） */
  private isUniqueViolation(e: unknown): boolean {
    return (
      typeof e === 'object' &&
      e !== null &&
      'code' in e &&
      (e as { code: string }).code === 'P2002'
    );
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
