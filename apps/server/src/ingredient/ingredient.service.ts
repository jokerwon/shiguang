// 食材资料读取（Phase 8-1 / ADR-0018）：已发布食材的列表、搜索与详情。
// 名称与别名共用同一身份索引：整串相等才算身份命中，子串只作显式模糊候选。
// 详情返回经审核的资料与参考来源，缺依据的段落不返回。
import { Injectable, NotFoundException } from '@nestjs/common';
import type { IngredientCategory } from 'generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hasEveryIngredient, normalizeIngredientText } from './normalize';

/** 详情中每条参考来源 */
export interface IngredientSourceView {
  label: string;
  url: string;
}

/** 稳定身份视图（列表与详情共用） */
export interface IngredientIdentityView {
  id: string;
  name: string;
  category: IngredientCategory;
  aliases: string[];
}

export interface IngredientListItem extends IngredientIdentityView {
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
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    /** 关键词整串命中身份的数量（0 表示当前只有子串候选或没有结果） */
    exactMatches: number;
  };
}

/** 输入名称的身份解析结果：命中唯一身份才给身份，歧义列出候选供用户确认 */
export interface IngredientIdentifyResult {
  matched: IngredientIdentityView | null;
  /** 整串命中多个身份（如「油」）时的候选，按确定性顺序排列 */
  ambiguous: IngredientIdentityView[];
}

/** 身份解析形状：只含 id/名称/分类/别名 */
type IdentityRow = {
  id: string;
  name: string;
  category: IngredientCategory;
  aliases: { alias: string }[];
};

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

/** 关键词的 SQL 候选集：名称或别名的子串（整串身份命中在代码里判定） */
function keywordFilter(keyword: string) {
  return [
    { name: { contains: keyword, mode: 'insensitive' as const } },
    {
      aliases: {
        some: { alias: { contains: keyword, mode: 'insensitive' as const } },
      },
    },
  ];
}

/** 关键词拆分：空白或半/全角逗号、顿号分隔；每个词各自命中身份 */
function keywordTokens(keyword: string): string[] {
  return keyword
    .split(/[\s,，、]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** 本次输入整串命中的身份及排名：名称相等得 100，别名相等得 50，写法越长越靠前 */
function hitRanks(
  rows: { id: string; name: string; aliases: string[] }[],
  rawTerms: string[],
): Map<string, number> {
  const terms = new Set(
    rawTerms.map(normalizeFromTerm).filter((t) => t.length > 0),
  );
  const ranks = new Map<string, number>();
  for (const row of rows) {
    const name = normalizeFromTerm(row.name);
    const aliases = row.aliases.map(normalizeFromTerm);
    if (terms.has(name)) {
      ranks.set(row.id, 100 + name.length);
    } else {
      const alias = aliases.find((a) => terms.has(a));
      if (alias !== undefined) ranks.set(row.id, 50 + alias.length);
    }
  }
  return ranks;
}

/** 归一：剥离尾部括号说明后去空白转小写 */
function normalizeFromTerm(raw: string): string {
  return normalizeIngredientText(raw).trim().toLowerCase();
}

/** 去掉内部字段，给出对外身份视图 */
function toIdentity(row: IdentityRow): IngredientIdentityView {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    aliases: row.aliases.map((a) => a.alias),
  };
}

@Injectable()
export class IngredientService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 已发布食材列表：关键词整串命中身份（名称或别名）时只返回这些身份，
   * 没有任何整串命中才退回子串候选。避免「番茄」把番茄酱、番茄罐头混进同一结果。
   */
  async findAll(params: {
    keyword?: string;
    category?: IngredientCategory;
    page?: number;
    limit?: number;
  }): Promise<IngredientListResult> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 24;
    const keyword = params.keyword?.trim();

    const tokens = keyword ? keywordTokens(keyword) : [];
    const rows = await this.prisma.ingredient.findMany({
      where: {
        published: true,
        ...(params.category ? { category: params.category } : {}),
        // 每个词各取子串候选；是否构成身份命中在代码里按整串相等判定
        ...(tokens.length ? { OR: tokens.flatMap(keywordFilter) } : {}),
      },
      include: ingredientInclude,
    });

    const ranks = hitRanks(rows.map(toIdentity), tokens);
    const matched = keyword ? rows.filter((row) => ranks.has(row.id)) : rows;
    const visible = matched.length > 0 ? matched : rows;

    const sorted = await this.withRecipeCount(visible);
    sorted.sort(
      (a, b) =>
        (ranks.get(b.id) ?? 0) - (ranks.get(a.id) ?? 0) ||
        CATEGORY_ORDER.indexOf(a.category) -
          CATEGORY_ORDER.indexOf(b.category) ||
        a.name.localeCompare(b.name, 'zh'),
    );

    const start = (page - 1) * limit;
    return {
      data: sorted.slice(start, start + limit),
      meta: {
        total: sorted.length,
        page,
        limit,
        totalPages: Math.ceil(sorted.length / limit),
        exactMatches: keyword ? matched.length : 0,
      },
    };
  }

  /**
   * 身份解析：输入名称 → 稳定身份。整串相等才构成身份命中；
   * 命中多个身份时返回 `ambiguous`，由调用方呈现候选，不擅自选一个。
   * 无命中返回空结果，不做子串猜测（子串候选由列表页的模糊区呈现）。
   */
  async identify(terms: string[]): Promise<IngredientIdentifyResult> {
    const term = terms.find((t) => t.trim().length > 0)?.trim();
    if (!term) return { matched: null, ambiguous: [] };
    const rows = await this.prisma.ingredient.findMany({
      where: { published: true },
      // 身份解析只用 id/name/category/别名：不加载与解析无关的过敏原
      select: {
        id: true,
        name: true,
        category: true,
        aliases: { select: { alias: true } },
      },
      orderBy: { name: 'asc' },
    });
    return this.identifyIn(
      rows.map((row) => toIdentity(row)),
      term,
    );
  }

  /** 解析的纯逻辑部分：同一批身份可被列表页复用，避免重复查询 */
  identifyIn(
    identities: IngredientIdentityView[],
    term: string,
  ): IngredientIdentifyResult {
    const ranks = hitRanks(identities, [term]);
    const hits = identities
      .filter((i) => ranks.has(i.id))
      .sort((a, b) => (ranks.get(b.id) ?? 0) - (ranks.get(a.id) ?? 0));
    return hits.length === 1
      ? { matched: hits[0], ambiguous: [] }
      : { matched: null, ambiguous: hits };
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
