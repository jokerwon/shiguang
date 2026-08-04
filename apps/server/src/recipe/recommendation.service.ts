// 个性化推荐服务（ADR-0005）：首页 /recipes/personalized 与 AI 上下文注入（ADR-0006）
// 共用的单一事实源。只依赖 PrismaService（PrismaModule 全局），不 import
// Pantry/Preference 模块，保持零模块间耦合。
import { Injectable } from '@nestjs/common';
import type { Recipe } from 'generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  dailySeed,
  dateKeyOf,
  isBlocked,
  scoreRecipe,
  type ScorableRecipe,
  type ScoreContext,
  type UserSignals,
} from './recommendation.scoring';

@Injectable()
export class RecommendationService {
  constructor(private readonly prisma: PrismaService) {}

  /** 加载用户信号：pantry 食材 + 忌口/过敏原 + 健康目标 */
  async loadSignals(userId: string): Promise<UserSignals> {
    const [pantryItems, pref] = await Promise.all([
      this.prisma.pantryItem.findMany({
        where: { userId },
        select: { name: true },
      }),
      this.prisma.userPreference.findUnique({ where: { userId } }),
    ]);
    return {
      pantry: pantryItems.map((p) => p.name),
      blocked: [
        ...(pref?.dislikedIngredients ?? []),
        ...(pref?.allergens ?? []),
      ],
      healthGoal: pref?.healthGoal ?? 'BALANCED',
    };
  }

  /**
   * 个性化推荐：全量拉取 → 硬过滤（忌口/过敏原）→ 加权排序 → take(limit)。
   * 库量级 80-100 道，应用层排序无压力；库膨胀后再加 DB 预筛。
   */
  async recommend(userId: string, limit = 4): Promise<Recipe[]> {
    const [signals, recipes] = await Promise.all([
      this.loadSignals(userId),
      this.prisma.recipe.findMany(),
    ]);

    const now = new Date();
    const ctx: ScoreContext = {
      hour: now.getHours(),
      dateKey: dateKeyOf(now),
    };
    const seed = dailySeed(userId, ctx.dateKey);

    return recipes
      .filter(
        (r) =>
          !isBlocked(
            (r.ingredients as unknown as ScorableRecipe['ingredients']) ?? [],
            signals.blocked,
          ),
      )
      .map((r) => ({
        r,
        score: scoreRecipe(
          {
            id: r.id,
            time: r.time,
            kcal: r.kcal,
            carb: r.carb,
            protein: r.protein,
            ingredients:
              (r.ingredients as unknown as ScorableRecipe['ingredients']) ?? [],
          },
          signals,
          ctx,
          seed,
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ r }) => r);
  }
}
