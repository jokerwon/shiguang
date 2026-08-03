import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PantryService {
  constructor(private readonly prisma: PrismaService) {}

  /** 返回当前用户的食材名列表(API 契约:string[]) */
  async findAll(userId: string): Promise<string[]> {
    const items = await this.prisma.pantryItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return items.map((i) => i.name);
  }

  /** 整体替换当前用户的食材清单。入参规整(去重/trim/过滤空)后事务执行。 */
  async replace(userId: string, raw: unknown): Promise<string[]> {
    if (!Array.isArray(raw)) {
      throw new BadRequestException('食材列表必须是数组');
    }
    const cleaned = [
      ...new Set(
        raw.map((n) => (typeof n === 'string' ? n.trim() : '')).filter(Boolean),
      ),
    ];

    // 事务:先清空该用户全部食材,再批量建。保证原子性。
    await this.prisma.$transaction([
      this.prisma.pantryItem.deleteMany({ where: { userId } }),
      this.prisma.pantryItem.createMany({
        data: cleaned.map((name) => ({ userId, name })),
        skipDuplicates: true, // 双保险:即便上面没去重干净也不报错
      }),
    ]);

    return cleaned;
  }
}
