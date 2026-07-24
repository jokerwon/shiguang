import { Injectable, NotFoundException } from '@nestjs/common';
import type { Recipe, Prisma } from 'generated/prisma/client';
import type { Cuisine, Tag } from 'generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { QueryRecipesDto } from './recipe.dto';

/* ---- 枚举映射：Prisma 大写 → 前端小写 ---- */

const CUISINE_DOWN: Record<string, string> = {
  HOME: 'home',
  WESTERN: 'western',
  JAPANESE: 'japanese',
  SICHUAN: 'sichuan',
  LIGHT: 'light',
};

const TAG_DOWN: Record<string, string> = {
  VEGETARIAN: 'vegetarian',
  HIGH_PROTEIN: 'high-protein',
  LOW_CAL: 'low-cal',
  LOW_CARB: 'low-carb',
  QUICK: 'quick',
  RICE_FRIENDLY: 'rice-friendly',
  COMFORTING: 'comforting',
};

/* ---- 反向映射：前端小写 → Prisma 大写（用于查询过滤） ---- */

const CUISINE_UP: Record<string, Cuisine> = {
  home: 'HOME',
  western: 'WESTERN',
  japanese: 'JAPANESE',
  sichuan: 'SICHUAN',
  light: 'LIGHT',
};

const TAG_UP: Record<string, Tag> = {
  vegetarian: 'VEGETARIAN',
  'high-protein': 'HIGH_PROTEIN',
  'low-cal': 'LOW_CAL',
  'low-carb': 'LOW_CARB',
  quick: 'QUICK',
  'rice-friendly': 'RICE_FRIENDLY',
  comforting: 'COMFORTING',
};

/* ---- 响应类型 ---- */

export interface RecipeResponse {
  id: string;
  name: string;
  desc: string;
  cuisine: string;
  time: number;
  kcal: number;
  img: string;
  tags: string[];
  ingredients: string[];
  steps: string[];
}

export interface PaginatedResponse {
  data: RecipeResponse[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface RecommendedResponse {
  today: RecipeResponse[];
  quick: RecipeResponse[];
}

/** 今日推荐菜谱名称列表 */
const TODAY_NAMES = ['番茄罗勒意面', '藜麦牛油果碗', '麻婆豆腐', '照烧鸡腿饭'];

@Injectable()
export class RecipeService {
  constructor(private readonly prisma: PrismaService) {}

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
      data: data.map((r) => this.toResponse(r)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findRecommended(): Promise<RecommendedResponse> {
    const todayRecipes = await this.prisma.recipe.findMany({
      where: { name: { in: TODAY_NAMES } },
    });

    // 按 TODAY_NAMES 顺序排列
    const today = TODAY_NAMES.map((name) =>
      todayRecipes.find((r) => r.name === name),
    )
      .filter((r): r is Recipe => r != null)
      .map((r) => this.toResponse(r));

    const quickRecipes = await this.prisma.recipe.findMany({
      where: { time: { lte: 15 } },
      orderBy: { time: 'asc' },
      take: 4,
    });

    return {
      today,
      quick: quickRecipes.map((r) => this.toResponse(r)),
    };
  }

  async findById(id: string): Promise<RecipeResponse> {
    const recipe = await this.prisma.recipe.findUnique({ where: { id } });
    if (!recipe) {
      throw new NotFoundException('菜谱不存在');
    }
    return this.toResponse(recipe);
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

  /** 将 Prisma 返回的 Recipe 转为前端可用的格式 */
  private toResponse(recipe: Recipe): RecipeResponse {
    return {
      id: recipe.id,
      name: recipe.name,
      desc: recipe.desc,
      cuisine: CUISINE_DOWN[recipe.cuisine],
      time: recipe.time,
      kcal: recipe.kcal,
      img: recipe.img,
      tags: recipe.tags.map((t) => TAG_DOWN[t]),
      ingredients: recipe.ingredients as string[],
      steps: recipe.steps as string[],
    };
  }
}
