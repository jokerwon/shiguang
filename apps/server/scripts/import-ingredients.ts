// 食材资料导入（Phase 8-1 / ADR-0018）：审核文件是发布输入，本命令把它写入数据库。
//
// 纪律：
// - 发布最低标准（名称、审核简介、可核查来源、审核时间）不满足 → 明确失败，不发布空壳。
// - 归一：菜谱自由文本原料名必须命中唯一的食材身份；未收录或指向多个身份 → 报错列出，
//   不静默猜测、不残缺发布。
// - 幂等：按规范名与别名 upsert，重复运行不产生重复身份；菜谱关联按 (recipeId, ingredientId) 重建。
// - 资料发布与过敏原信息完整性分开：没有过敏原关系行表示「信息未核查」，不等于确认不含。
//
// 用法：pnpm ingredients:import
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { REVIEWED_INGREDIENTS } from '../prisma/ingredients/published';
import {
  buildRawIndex,
  buildRecipeIngredientLinks,
  dedupeIngredientLinks,
  findAmbiguousRawNames,
} from '../src/ingredient/normalize';
import { validateReviewedIngredient } from '../src/ingredient/publish-review';

async function main() {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const prisma = new PrismaClient({ adapter: new PrismaPg(url) });

  try {
    // 1. 结构校验：任何一条不满足发布标准就整体失败，不做部分发布
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
    //    `reviewedAt` 来自条目自带的复核标记；没有标记就写 null，
    //    数据库行不会声称「已审核」（文档里的审核状态不是事实源）。
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

    const recipes = await prisma.recipe.findMany({
      select: { id: true, name: true, ingredients: true },
    });
    let links = 0;
    for (const recipe of recipes) {
      const raw = (recipe.ingredients ?? []) as { name: string; amount: string }[];
      const { links: rawLinks, rejected: bad } = buildRecipeIngredientLinks(
        raw,
        byRaw,
        idByName,
        recipe.id,
      );
      const built = dedupeIngredientLinks(rawLinks);
      if (bad.length) {
        throw new Error(
          `菜谱「${recipe.name}」存在无法归一的原料，未写入任何关联：\n  ${bad.join('\n  ')}`,
        );
      }
      await prisma.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });
      if (built.length) {
        await prisma.recipeIngredient.createMany({ data: built });
        links += built.length;
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
      console.warn(
        `⚠️ 以下 ${unreviewed.length} 条尚未标记复核，已按未复核发布：${unreviewed.join('、')}`,
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
