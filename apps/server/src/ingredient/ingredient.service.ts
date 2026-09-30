// 食材资料读取（Phase 8-1 / ADR-0018）：已发布食材的列表、搜索与详情。
// 身份与别名共用归一规则；详情返回经审核的资料与参考来源，缺依据的段落不返回。
import { Injectable, NotFoundException } from '@nestjs/common';
import type { IngredientCategory } from 'generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hasEveryIngredient } from './normalize';

/** 详情中每条参考来源 */
export interface IngredientSourceView {
  label: string;
  url: string;
}

export interface IngredientListItem {
  id: string;
  name: string;
  category: IngredientCategory;
  aliases: string[];
  /** 关联的已发布菜谱数量；0 表示真实空结果 */
  recipeCount: number;
  /** 过敏原信息是否已核查（未核查不等于确认不含） */
  allergenInfoReviewed: boolean;
}

export interface IngredientDetail extends IngredientListItem {
  summary: string;
  selection: string | null;
  storage: string | null;
  preparation: string | null;
  sources: IngredientSourceView[];
  allergens: { allergen: string; source: string }[];
}

export interface IngredientListResult {
  data: IngredientListItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/** 稳定排序：同分类内按名称，分类顺序按固定表 */
const CATEGORY_ORDER: IngredientCategory[] = [
  'VEGETABLE',
  'MEAT',
  'POULTRY',
  'EGG',
  'SEAFOOD',
  'SOY',
  'GRAIN',
  'SEASONING',
  'OTHER',
];

/** 常见来源的展示名（可读，不暴露裸 URL 之外的信息） */
function sourceLabel(url: string): string {
  if (url.includes('fdc.nal.usda.gov')) return 'USDA FoodData Central';
  if (url.includes('cfsa.net.cn')) return '中国食品安全风险评估中心';
  if (url.includes('sppt.cfsa.net.cn')) return '食品安全国家标准公开平台';
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

const ingredientInclude = {
  aliases: { select: { alias: true } },
  allergens: { select: { allergen: true, source: true } },
} as const;

@Injectable()
export class IngredientService {
  constructor(private readonly prisma: PrismaService) {}

  /** 已发布食材列表：按名称/别名搜索 + 一层分类过滤 */
  async findAll(params: {
    keyword?: string;
    category?: IngredientCategory;
    page?: number;
    limit?: number;
  }): Promise<IngredientListResult> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 24;
    const keyword = params.keyword?.trim();

    const where = {
      published: true,
      ...(params.category ? { category: params.category } : {}),
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword, mode: 'insensitive' as const } },
              {
                aliases: {
                  some: {
                    alias: { contains: keyword, mode: 'insensitive' as const },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.ingredient.findMany({
        where,
        include: ingredientInclude,
        orderBy: [{ name: 'asc' }],
      }),
      this.prisma.ingredient.count({ where }),
    ]);

    const withCounts = await this.withRecipeCount(rows);
    withCounts.sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.category) -
          CATEGORY_ORDER.indexOf(b.category) ||
        a.name.localeCompare(b.name, 'zh'),
    );

    const start = (page - 1) * limit;
    return {
      data: withCounts.slice(start, start + limit),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /** 按稳定身份读取详情；不存在或未发布给出明确 404，不回退为另一个食材 */
  async findById(id: string): Promise<IngredientDetail> {
    const row = await this.prisma.ingredient.findFirst({
      where: { id, published: true },
      include: ingredientInclude,
    });
    if (!row) {
      throw new NotFoundException('食材资料不存在或尚未发布');
    }
    const [withCount] = await this.withRecipeCount([row]);
    return {
      ...withCount,
      summary: row.summary ?? '',
      selection: row.selection,
      storage: row.storage,
      preparation: row.preparation,
      sources: row.sources.map((url) => ({ label: sourceLabel(url), url })),
      allergens: row.allergens.map((a) => ({
        allergen: a.allergen,
        source: a.source,
      })),
    };
  }

  /** 食材关联的已发布菜谱 id（供既有筛选链路做全部包含过滤） */
  async recipeIdsFor(ingredientId: string): Promise<string[]> {
    const rows = await this.prisma.recipeIngredient.findMany({
      where: { ingredientId },
      select: { recipeId: true },
    });
    return rows.map((r) => r.recipeId);
  }

  /** 名称/别名搜索候选项（歧义不擅自映射，交给用户确认） */
  async resolveCandidates(terms: string[]): Promise<
    {
      id: string;
      name: string;
      matchedTerm: string;
    }[]
  > {
    const out: { id: string; name: string; matchedTerm: string }[] = [];
    for (const term of terms) {
      const trimmed = term.trim();
      if (!trimmed) continue;
      const rows = await this.prisma.ingredient.findMany({
        where: {
          published: true,
          OR: [
            { name: { equals: trimmed, mode: 'insensitive' } },
            {
              aliases: {
                some: { alias: { equals: trimmed, mode: 'insensitive' } },
              },
            },
          ],
        },
        select: { id: true, name: true },
      });
      for (const row of rows) {
        if (!out.some((o) => o.id === row.id)) {
          out.push({ id: row.id, name: row.name, matchedTerm: trimmed });
        }
      }
    }
    return out;
  }

  /** 候选菜谱是否同时包含全部所选身份（全部包含语义，供 AI 工具复用） */
  recipeIdsContainingAll(
    selectedIds: string[],
    recipeLinks: { recipeId: string; ingredientId: string }[],
  ): string[] {
    const byRecipe = new Map<string, Set<string>>();
    for (const link of recipeLinks) {
      const set = byRecipe.get(link.recipeId) ?? new Set<string>();
      set.add(link.ingredientId);
      byRecipe.set(link.recipeId, set);
    }
    return [...byRecipe.entries()]
      .filter(([, ids]) => hasEveryIngredient(ids, selectedIds))
      .map(([recipeId]) => recipeId);
  }

  private async withRecipeCount<T extends { id: string }>(
    rows: T[],
  ): Promise<(T & IngredientListItem)[]> {
    const counts = await this.prisma.recipeIngredient.groupBy({
      by: ['ingredientId'],
      where: { ingredientId: { in: rows.map((r) => r.id) } },
      _count: { recipeId: true },
    });
    const countById = new Map(
      counts.map((c) => [c.ingredientId, c._count.recipeId]),
    );
    return rows.map((row) => {
      const extra = row as T & {
        name: string;
        category: IngredientCategory;
        aliases: { alias: string }[];
        allergens: { allergen: string }[];
      };
      return {
        ...row,
        id: extra.id,
        name: extra.name,
        category: extra.category,
        aliases: extra.aliases.map((a) => a.alias),
        recipeCount: countById.get(extra.id) ?? 0,
        allergenInfoReviewed: extra.allergens.length > 0,
      };
    });
  }
}
