import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from 'generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { QueryRecipesDto } from './recipe.dto';
import type { Recipe as DomainRecipe } from '@shiguang/domain';
import { CUISINE_UP, TAG_UP, toResponse } from './recipe.mapper';
import { RecommendationService } from './recommendation.service';
import { RecipeSafetyService } from './recipe-safety.service';

export interface PaginatedResponse {
  data: DomainRecipe[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  /** 因安全设置排除的数量与原因（不返回菜谱本身；食材资料仍可查阅） */
  excluded: {
    count: number;
    reasons: string[];
    /** 是否包含「成分信息不足，无法判断」的排除 */
    hasUnknown: boolean;
  };
}

export interface RecommendedResponse {
  today: DomainRecipe[];
  quick: DomainRecipe[];
}

/** 菜谱查询需要带上的身份与过敏原关系（安全过滤与食材筛选共用） */
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
export class RecipeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recommendation: RecommendationService,
    private readonly safety: RecipeSafetyService,
  ) {}

  /* ========== 公共方法 ========== */

  /**
   * 列表筛选。食材条件（全部包含）与安全约束作用于同一候选集合：
   * 先取候选 → 逐个判断安全 → 再分页与计数，避免先分页后过滤造成虚高总数。
   */
  async findAll(
    query: QueryRecipesDto,
    userId?: string,
  ): Promise<PaginatedResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;
    const where = await this.buildWhere(query);

    const candidates = await this.prisma.recipe.findMany({
      where,
      include: ingredientLinkInclude,
      orderBy: { createdAt: 'desc' },
    });

    const { signals, allergens } = await this.safety.loadSignals(userId ?? '');
    const safe: typeof candidates = [];
    const exclusions: { reason: string; kind: 'blocked' | 'unknown' }[] = [];
    for (const recipe of candidates) {
      const verdict = this.safety.evaluate(recipe, signals, allergens);
      if (verdict.verdict === 'ok') safe.push(recipe);
      else exclusions.push({ reason: verdict.reason, kind: verdict.verdict });
    }

    const total = safe.length;
    const data = safe.slice((page - 1) * limit, (page - 1) * limit + limit);

    return {
      data: data.map((r) => toResponse(r)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      excluded: {
        count: exclusions.length,
        reasons: [...new Set(exclusions.map((e) => e.reason))].slice(0, 3),
        hasUnknown: exclusions.some((e) => e.kind === 'unknown'),
      },
    };
  }

  /**
   * 个性化首页（ADR-0005）：today 来自 RecommendationService
   * （硬过滤忌口/过敏原 + 时间/目标/轮换加权排序）；
   * quick 保留「15 分钟快手」逻辑，同样执行统一安全过滤（不允许成为旁路）。
   */
  async findPersonalized(userId: string): Promise<RecommendedResponse> {
    const [top, quickCandidates] = await Promise.all([
      this.recommendation.recommend(userId, 4),
      this.prisma.recipe.findMany({
        where: { time: { lte: 15 } },
        orderBy: { time: 'asc' },
        take: 12,
        include: ingredientLinkInclude,
      }),
    ]);

    const { signals, allergens } = await this.safety.loadSignals(userId);
    const quick = quickCandidates
      .filter(
        (r) => this.safety.evaluate(r, signals, allergens).verdict === 'ok',
      )
      .slice(0, 4);

    return {
      today: top.map((r) => toResponse(r)),
      quick: quick.map((r) => toResponse(r)),
    };
  }

  /** 食材资料中的「相关菜谱」：仅当前食材，安全设置照常生效 */
  async findByIngredient(
    userId: string,
    ingredientId: string,
  ): Promise<PaginatedResponse> {
    return this.findAll({ ingredients: ingredientId, limit: 12 }, userId);
  }

  async findById(id: string): Promise<DomainRecipe> {
    const recipe = await this.prisma.recipe.findUnique({ where: { id } });
    if (!recipe) {
      throw new NotFoundException('菜谱不存在');
    }
    return toResponse(recipe);
  }

  /* ========== 内部方法 ========== */

  private async buildWhere(
    query: QueryRecipesDto,
  ): Promise<Prisma.RecipeWhereInput> {
    const where: Prisma.RecipeWhereInput = {};

    // 菜系筛选
    if (query.cuisine) {
      const cuisines = query.cuisine
        .split(',')
        .map((c) => CUISINE_UP[c.trim().toLowerCase()])
        .filter(Boolean);
      if (cuisines.length > 0) {
        where.cuisine = { in: cuisines };
      }
    }

    // 标签筛选 (AND 语义)
    if (query.tags) {
      const tagEnums = query.tags
        .split(',')
        .map((t) => TAG_UP[t.trim().toLowerCase()])
        .filter(Boolean);
      if (tagEnums.length > 0) {
        where.tags = { hasEvery: tagEnums };
      }
    }

    // 时间上限
    if (query.maxTime) {
      where.time = { lte: query.maxTime };
    }

    // 关键词搜索
    if (query.keyword) {
      where.OR = [
        { name: { contains: query.keyword } },
        { desc: { contains: query.keyword } },
      ];
    }

    // 食材条件：全部包含，别名归一后去重；无效身份不静默退化成无条件查询
    if (query.ingredients) {
      const ids = [
        ...new Set(
          query.ingredients
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean),
        ),
      ];
      if (ids.length === 0) {
        throw new NotFoundException('未提供有效的食材身份');
      }
      const found = await this.prisma.ingredient.count({
        where: { id: { in: ids }, published: true },
      });
      if (found !== ids.length) {
        throw new NotFoundException('存在未发布或不存在的食材身份');
      }
      // 全部包含（ADR-0018）：每个所选身份各自一个 some 条件，取交集；
      // 用 in 会退化成「含任一」，多选越多结果越多，与语义相反。
      where.AND = ids.map((id) => ({
        ingredientLinks: { some: { ingredientId: id } },
      }));
    }

    return where;
  }
}
