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
      const row = await prisma.ingredient.findUnique({
        where: { name: item.name },
        select: { id: true },
      });
      if (!row?.id) throw new Error(`食材「${item.name}」尚未发布`);
      idByName.set(item.name, row.id);
    }

    const rejected: string[] = [];
    const merged: string[] = [];
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
      for (const m of outcome.merged) {
        merged.push(
          `「${r.name}」的「${m.name}」与「${m.into}」指向同一食材身份，已合并为一条关联（被合并项的用量不写进关联表）`,
        );
      }
      linksByRecipe.set(r.name, outcome.links);
    }
    if (rejected.length) {
      throw new Error(
        `菜谱原料存在无法归一的写法，未写入任何数据：\n  ${rejected.join('\n  ')}`,
      );
    }
    if (merged.length) {
      console.warn(
        `⚠️ 同身份多写法合并 ${merged.length} 处：\n  ${merged.join('\n  ')}`,
      );
    }

    // 幂等：按 name upsert；update/create 同用校验过的 SeedRecipe，避免字段手抄漂移
    for (const r of recipes) {
      const recipe = await prisma.recipe.upsert({
        where: { name: r.name },
        update: r,
        create: r,
      });
      // 关联按菜谱重建（身份与用量/说明来自同一份正文，重复运行不产生重复行）
      const built = linksByRecipe.get(r.name) ?? [];
      await prisma.recipeIngredient.deleteMany({
        where: { recipeId: recipe.id },
      });
      if (built.length) {
        await prisma.recipeIngredient.createMany({
          data: built.map((link) => ({ ...link, recipeId: recipe.id })),
        });
      }
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
