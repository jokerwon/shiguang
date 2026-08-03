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
      try {
        await this.prisma.favorite.create({ data: { userId, recipeId } });
      } catch (e) {
        // recipe 不存在 → 外键约束失败(P2003,driver adapter 形态)
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          (e.code === 'P2025' || e.code === 'P2003')
        ) {
          throw new NotFoundException('菜谱不存在');
        }
        throw e;
      }
    }
    return this.findAll(userId);
  }
}
