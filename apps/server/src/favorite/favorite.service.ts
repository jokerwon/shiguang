import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FavoriteService {
  constructor(private readonly prisma: PrismaService) {}

  /** 返回当前用户收藏的 recipeId 列表(API 契约:string[]) */
  async findAll(userId: string): Promise<string[]> {
    const items = await this.prisma.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((f) => f.recipeId);
  }

  /** toggle 收藏:存在则删,不存在则增。返回最新列表。 */
  async toggle(userId: string, recipeId: string): Promise<string[]> {
    const existing = await this.prisma.favorite.findUnique({
      where: { userId_recipeId: { userId, recipeId } },
    });
    if (existing) {
      await this.prisma.favorite.delete({ where: { id: existing.id } });
    } else {
      await this.createOrThrow(userId, recipeId);
    }
    return this.findAll(userId);
  }

  /**
   * 幂等 set(ADR-0009 写工具语义):目标状态已一致则直接返回当前列表;
   * 否则 create/delete。AI 写工具必须用此语义——toggle 对 AI 是危险的
   * (说「收藏」却翻转成取消)。
   */
  async set(
    userId: string,
    recipeId: string,
    saved: boolean,
  ): Promise<string[]> {
    const existing = await this.prisma.favorite.findUnique({
      where: { userId_recipeId: { userId, recipeId } },
    });
    if (saved) {
      if (!existing) await this.createOrThrow(userId, recipeId);
    } else if (existing) {
      await this.prisma.favorite.delete({ where: { id: existing.id } });
    }
    return this.findAll(userId);
  }

  /** create 并在 recipe 不存在时抛 404(外键约束失败) */
  private async createOrThrow(userId: string, recipeId: string): Promise<void> {
    try {
      await this.prisma.favorite.create({ data: { userId, recipeId } });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        (e.code === 'P2025' || e.code === 'P2003')
      ) {
        throw new NotFoundException('菜谱不存在');
      }
      throw e;
    }
  }
}
