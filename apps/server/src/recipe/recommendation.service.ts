// 个性化推荐服务（ADR-0005）：首页与 AI 检索共用的单一事实源。
// 只依赖 PrismaService（PrismaModule 全局），保持零模块间耦合。
import { Injectable } from '@nestjs/common';
import type { Recipe } from 'generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  dailySeed,
  dateKeyOf,
  rankRecipes,
  type ScoreContext,
  type UserSignals,
} from './recommendation.scoring';
import {
  RecipeSafetyService,
  type RecipeWithIngredientLinks,
} from './recipe-safety.service';

/** 推荐候选需要带上稳定身份与过敏原关系，安全判断不能只看自由文本名称 */
const ingredientLinkInclude = {
  ingredientLinks: {
    include: {
      ingredient: {
        include: {
          aliases: { select: { alias: true } },
          allergens: { select: { allergen: true } },
        },
      },
    },
  },
} as const;

@Injectable()
export class RecommendationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly safety: RecipeSafetyService,
  ) {}

  /** 加载用户信号：忌口/过敏原 + 健康目标 */
  async loadSignals(userId: string): Promise<UserSignals> {
    const pref = await this.prisma.userPreference.findUnique({
      where: { userId },
    });
    return {
      blocked: [
        ...(pref?.dislikedIngredients ?? []),
        ...(pref?.allergens ?? []),
      ],
      healthGoal: pref?.healthGoal ?? 'BALANCED',
    };
  }

  /**
   * 个性化推荐：全量拉取 → 统一安全过滤（身份/别名/过敏原关系/信息不足）
   * → 加权排序 → take(limit)。
   * 库量级 80-100 道，应用层排序无压力；库膨胀后再加 DB 预筛。
   *
   * 安全判断与筛选页、食材相关菜谱、AI 搜索共用 RecipeSafetyService：
   * 只看自由文本名称的双向子串会漏掉别名与过敏原关系，也会放过信息不足的原料。
   */
  async recommend(userId: string, limit = 4): Promise<Recipe[]> {
    const [{ signals, allergens }, healthGoal, allRecipes] = await Promise.all([
      this.safety.loadSignals(userId),
      this.loadSignals(userId).then((s) => s.healthGoal),
      this.prisma.recipe.findMany({ include: ingredientLinkInclude }),
    ]);
    const candidates = allRecipes as unknown as RecipeWithIngredientLinks[];
    const safe = candidates.filter(
      (r) => this.safety.evaluate(r, signals, allergens).verdict === 'ok',
    );

    const now = new Date();
    const ctx: ScoreContext = {
      hour: now.getHours(),
      dateKey: dateKeyOf(now),
    };

    // 排序权重不变：仍用 recommendation.scoring 的三维加权（ADR-0005/0018）
    return rankRecipes(
      safe as unknown as (Recipe & { id: string })[],
      { ...signals, healthGoal },
      ctx,
      dailySeed(userId, ctx.dateKey),
      limit,
    );
  }
}
