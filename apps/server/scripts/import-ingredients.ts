// 食材资料导入（Phase 8-1 / ADR-0018）：审核文件是发布输入，本命令把它写入数据库。
//
// 纪律：
// - 发布最低标准（名称、审核简介、可核查来源、审核时间）不满足 → 明确失败，不发布空壳。
// - 归一：菜谱自由文本原料名必须命中唯一的食材身份；未收录或指向多个身份 → 报错列出，
//   不静默猜测、不残缺发布。
// - 幂等：按规范名与别名 upsert，重复运行不产生重复身份；菜谱关联按 (recipeId, ingredientId) 重建。
// - 离场清理：不在审核文件里的身份按离场处理（改名/拆分不留残留），仍被菜谱引用的报出而不删。
// - 资料发布与过敏原信息完整性分开：没有过敏原关系行表示「信息未核查」，不等于确认不含。
//
// 用法：pnpm ingredients:import
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { REVIEWED_INGREDIENTS } from '../prisma/ingredients/published';
import {
  buildRawIndex,
  displayIngredientName,
  findAmbiguousRawNames,
  resolveRecipeLinks,
  type RecipeIngredientLink,
} from '../src/ingredient/normalize';
import { validateReviewedIngredient } from '../src/ingredient/publish-review';

async function main() {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const prisma = new PrismaClient({ adapter: new PrismaPg(url) });

  try {
    // 1. 结构校验：任何一条不满足发布标准就整体失败，不做部分发布。
    //    复核标记同属发布前置：没有 `reviewedAt` 的条目一律不发布
    //    （ADR-0018「未审核时不发布」），留给维护者复核后再标记。
    const rejected: string[] = [];
    for (const item of REVIEWED_INGREDIENTS) {
      const errors = validateReviewedIngredient(item);
      if (errors.length) rejected.push(`「${item.name}」：${errors.join('；')}`);
    }
    if (rejected.length) {
      throw new Error(`资料未通过发布校验，未写入任何数据：\n  ${rejected.join('\n  ')}`);
    }

    // 2. 归一表：任何指向多个身份的原料写法都拒绝，避免静默错关联
    const byRaw = buildRawIndex(REVIEWED_INGREDIENTS);
    const ambiguous = findAmbiguousRawNames(REVIEWED_INGREDIENTS);
    if (ambiguous.length) {
      throw new Error(`归一存在歧义，未写入任何数据：\n  ${ambiguous.join('\n  ')}`);
    }

    // 3. 幂等发布：按规范名 upsert，别名整体重建（别名不承载菜谱关联，改叫法不影响关联）。
    //    `reviewedAt` 来自条目自带的复核标记（上面已断言存在）。
    const unreviewed: string[] = [];
    for (const item of REVIEWED_INGREDIENTS) {
      const data = {
        category: item.category,
        summary: item.summary,
        selection: item.selection ?? null,
        storage: item.storage ?? null,
        preparation: item.preparation ?? null,
        sources: item.sources,
        reviewedAt: item.reviewedAt ? new Date(item.reviewedAt) : null,
        published: true,
      };
      if (!item.reviewedAt) unreviewed.push(item.name);
      const ingredient = await prisma.ingredient.upsert({
        where: { name: item.name },
        update: data,
        create: { name: item.name, ...data },
      });
      await prisma.ingredientAlias.deleteMany({
        where: { ingredientId: ingredient.id },
      });
      const aliases = item.aliases ?? [];
      if (aliases.length) {
        await prisma.ingredientAlias.createMany({
          data: aliases.map((alias) => ({ ingredientId: ingredient.id, alias })),
        });
      }
      await prisma.ingredientAllergen.deleteMany({
        where: { ingredientId: ingredient.id },
      });
      const allergens = item.allergens ?? [];
      if (allergens.length) {
        await prisma.ingredientAllergen.createMany({
          data: allergens.map((a) => ({
            ingredientId: ingredient.id,
            allergen: a.allergen,
            source: a.source,
          })),
        });
      }
    }

    // 4. 存量菜谱归一：全部已发布菜谱的每条原料都必须命中身份，否则失败
    const idByName = new Map<string, string>();
    for (const item of REVIEWED_INGREDIENTS) {
      const row = await prisma.ingredient.findUnique({
        where: { name: item.name },
        select: { id: true },
      });
      if (!row) throw new Error(`食材「${item.name}」写入后未找到`);
      idByName.set(item.name, row.id);
    }

    // 原料现在只有关联表一份（ADR-0019）：重新归一以现存关联行的展示名为输入，
    // 与 seed 写的内容同源，重复运行不依赖已下线的正文 JSON 列。
    const recipes = await prisma.recipe.findMany({
      select: {
        id: true,
        name: true,
        ingredientLinks: {
          select: { name: true, amount: true, note: true, position: true },
          orderBy: { position: 'asc' },
        },
      },
    });
    let links = 0;
    for (const recipe of recipes) {
      const outcome = resolveRecipeLinks<RecipeIngredientLink>(
        {
          label: recipe.name,
          ingredients: recipe.ingredientLinks.map((l) => ({
            name: displayIngredientName(l.name, l.note),
            amount: l.amount,
          })),
        },
        byRaw,
        idByName,
        (built, ingredientId) => ({ recipeId: recipe.id, ingredientId, ...built }),
      );
      if (outcome.rejected.length) {
        throw new Error(
          `菜谱存在无法归一的原料，未写入任何关联：\n  ${outcome.rejected.join('\n  ')}`,
        );
      }
      // 关联的整体重建放进同一事务：deleteMany 与 createMany 分开提交，
      // 中断后会留下「有菜谱、无原料」的半套状态（与 seed 的既有口径一致）。
      await prisma.$transaction(async (tx) => {
        await tx.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });
        if (outcome.links.length) {
          await tx.recipeIngredient.createMany({ data: outcome.links });
        }
      });
      links += outcome.links.length;
    }

    // 5. 离场清理：published.ts 是身份的唯一事实源，改名/拆分后不在文件里的
    //    身份不继续以「已发布」残留。仍被菜谱引用的身份受 Restrict 保护，
    //    删除失败会如实报出，不静默保留也不静默强删。
    const fileNames = new Set(REVIEWED_INGREDIENTS.map((i) => i.name));
    const stale = (await prisma.ingredient.findMany({ select: { id: true, name: true } }))
      .filter((i) => !fileNames.has(i.name));
    if (stale.length) {
      const removed: string[] = [];
      const blocked: string[] = [];
      for (const s of stale) {
        try {
          await prisma.ingredient.delete({ where: { id: s.id } });
          removed.push(s.name);
        } catch (e) {
          // P2003 = 外键约束（仍被 RecipeIngredient 引用）；其他错误原样抛出，
          // 避免连接中断之类被误报成「仍被菜谱引用」。
          if (!(e instanceof Error && 'code' in e && e.code === 'P2003')) throw e;
          blocked.push(s.name);
        }
      }
      if (removed.length) {
        console.warn(`🗑️ 已清理离场身份 ${removed.length} 条：${removed.join('、')}`);
      }
      if (blocked.length) {
        console.warn(`⚠️ 离场身份仍被菜谱引用，未删除：${blocked.join('、')}`);
      }
    }
    const published = await prisma.ingredient.count({
      where: { published: true },
    });
    const reviewed = published - (await prisma.ingredient.count({
      where: { published: true, reviewedAt: null },
    }));
    console.log(
      `✅ 已发布食材 ${published} 条（逐条复核 ${reviewed} 条，未复核 ${published - reviewed} 条），覆盖菜谱 ${recipes.length} 道、原料关联 ${links} 条`,
    );
    if (unreviewed.length) {
      // 上面的闸门已拦住无标记条目；保留兜底，避免将来放宽校验时静默发布
      console.warn(
        `⚠️ 以下 ${unreviewed.length} 条缺少复核标记却已写入：${unreviewed.join('、')}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
