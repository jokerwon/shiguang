// Seed：把「人工精选 + AI 生成（staging 待审区）」的菜谱写入 Recipe 表。
// 运行：pnpm exec prisma db seed
// 数据源（ADR-0003）：
//   1. prisma/recipes-curated.ts —— 人工精选打底
//   2. prisma/staging/recipes-staging.json —— pnpm recipes:generate 的产物（可选，存在才合并）
import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { validateRecipeDraft } from '../src/recipe/recipe-draft';
import { REVIEWED_INGREDIENTS } from './ingredients/published';
import {
  buildRawIndex,
  resolveRecipeLinks,
  type RecipeIngredientLink,
} from '../src/ingredient/normalize';
import { CURATED_RECIPES, type SeedRecipe } from './recipes-curated';

const STAGING_PATH = join(__dirname, 'staging/recipes-staging.json');

function loadStagedRecipes(): SeedRecipe[] {
  if (!existsSync(STAGING_PATH)) return [];
  const staging = JSON.parse(readFileSync(STAGING_PATH, 'utf-8')) as {
    recipes?: unknown[];
  };
  const curatedNames = new Set(CURATED_RECIPES.map((r) => r.name));
  const accepted: SeedRecipe[] = [];
  for (const raw of staging.recipes ?? []) {
    // 防御性二次校验：staging 可能被人手改坏
    const result = validateRecipeDraft(raw);
    if (!result.ok) {
      const name = (raw as Record<string, unknown>)?.['name'];
      console.warn(
        `⚠️ staging 条目「${typeof name === 'string' ? name : '(未知)'}」校验失败，跳过：${result.errors.join('；')}`,
      );
      continue;
    }
    const draft = raw as SeedRecipe;
    if (curatedNames.has(draft.name)) {
      console.warn(`⚠️ staging 条目「${draft.name}」与人工精选重名，跳过`);
      continue;
    }
    accepted.push({ ...draft, img: '' });
  }
  return accepted;
}

async function main() {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const adapter = new PrismaPg(url);
  const prisma = new PrismaClient({ adapter });

  const recipes: SeedRecipe[] = [...CURATED_RECIPES, ...loadStagedRecipes()];

  // 食材身份归一（ADR-0018）：发布菜谱前先确认每条原料命中唯一已发布身份，
  // 并把关联一并写入——菜谱与身份来自同一份审核内容，不保留第二套事实源。
  // 未收录/未发布的写法一律拒绝整批导入，不静默跳过、不写半套关联。
  const byRaw = buildRawIndex(REVIEWED_INGREDIENTS);

  try {
    const idByName = new Map<string, string>();
    for (const item of REVIEWED_INGREDIENTS) {
      // 必须要求 published：仅「存在该行」不等于可发布，
      // 引用未发布身份的菜谱会下发一个点开即 404 的链接（findById 按 published 查）
      const row = await prisma.ingredient.findFirst({
        where: { name: item.name, published: true },
        select: { id: true },
      });
      if (!row?.id) throw new Error(`食材「${item.name}」尚未发布`);
      idByName.set(item.name, row.id);
    }

    const rejected: string[] = [];
    const linksByRecipe = new Map<string, RecipeIngredientLink[]>();
    for (const r of recipes) {
      const outcome = resolveRecipeLinks<RecipeIngredientLink>(
        { label: r.name, ingredients: r.ingredients },
        byRaw,
        idByName,
        (built, ingredientId) => ({ recipeId: '', ingredientId, ...built }),
      );
      if (outcome.rejected.length) {
        rejected.push(...outcome.rejected);
        continue;
      }
      linksByRecipe.set(r.name, outcome.links);
    }
    if (rejected.length) {
      throw new Error(
        `菜谱原料存在无法归一的写法，未写入任何数据：\n  ${rejected.join('\n  ')}`,
      );
    }

    // 幂等：按 name upsert；原料只写关联表（ADR-0019，唯一事实源），
    // 菜谱行与关联同一事务提交：分开写会在中断/失败时留下「有菜谱、无原料」。
    for (const r of recipes) {
      const built = linksByRecipe.get(r.name) ?? [];
      const { ingredients: _ingredients, ...row } = r;
      await prisma.$transaction(async (tx) => {
        const recipe = await tx.recipe.upsert({
          where: { name: r.name },
          update: row,
          create: row,
        });
        // 关联按菜谱重建（重复运行不产生重复行）
        await tx.recipeIngredient.deleteMany({
          where: { recipeId: recipe.id },
        });
        await tx.recipeIngredient.createMany({
          data: built.map((link) => ({ ...link, recipeId: recipe.id })),
        });
      });
    }
    console.log(
      `✅ Seeded ${recipes.length} recipes（人工精选 ${CURATED_RECIPES.length} + staging ${recipes.length - CURATED_RECIPES.length}），食材关联 ${[...linksByRecipe.values()].reduce((n, l) => n + l.length, 0)} 条`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
