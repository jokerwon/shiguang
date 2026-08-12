import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from 'generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { QueryRecipesDto } from './recipe.dto';
import type { Recipe as DomainRecipe } from '@shiguang/domain';
import { CUISINE_UP, TAG_UP, toResponse } from './recipe.mapper';
import { RecommendationService } from './recommendation.service';

export interface PaginatedResponse {
  data: DomainRecipe[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface RecommendedResponse {
  today: DomainRecipe[];
  quick: DomainRecipe[];
}

@Injectable()
export class RecipeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recommendation: RecommendationService,
  ) {}

  /* ========== 公共方法 ========== */

  async findAll(query: QueryRecipesDto): Promise<PaginatedResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;
    const where = this.buildWhere(query);

    const [data, total] = await Promise.all([
      this.prisma.recipe.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.recipe.count({ where }),
    ]);

    return {
      data: data.map((r) => toResponse(r)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 个性化首页（ADR-0005）：today 来自 RecommendationService
   * （硬过滤忌口/过敏原 + pantry/时间/目标/轮换加权排序）；
   * quick 保留「15 分钟快手」逻辑。
   */
  async findPersonalized(userId: string): Promise<RecommendedResponse> {
    const [top, quickRecipes] = await Promise.all([
      this.recommendation.recommend(userId, 4),
      this.prisma.recipe.findMany({
        where: { time: { lte: 15 } },
        orderBy: { time: 'asc' },
        take: 4,
      }),
    ]);

    return {
      today: top.map((r) => toResponse(r)),
      quick: quickRecipes.map((r) => toResponse(r)),
    };
  }

  async findById(id: string): Promise<DomainRecipe> {
    const recipe = await this.prisma.recipe.findUnique({ where: { id } });
    if (!recipe) {
      throw new NotFoundException('菜谱不存在');
    }
    return toResponse(recipe);
  }

  /* ========== 内部方法 ========== */

  private buildWhere(query: QueryRecipesDto): Prisma.RecipeWhereInput {
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

    return where;
  }
}
