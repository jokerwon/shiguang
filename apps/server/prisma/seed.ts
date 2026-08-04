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
import {
  CURATED_RECIPES,
  type SeedRecipe,
} from './recipes-curated';

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
        `⚠️ staging 条目「${String(name ?? '(未知)')}」校验失败，跳过：${result.errors.join('；')}`,
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

  try {
    // 幂等：按 name upsert，避免重复 seed 堆叠
    // update 与 create 分支字段保持一致，确保老库数据被覆盖为新结构
    for (const r of recipes) {
      await prisma.recipe.upsert({
        where: { name: r.name },
        update: {
          desc: r.desc,
          cuisine: r.cuisine,
          time: r.time,
          kcal: r.kcal,
          protein: r.protein,
          carb: r.carb,
          fat: r.fat,
          img: r.img,
          tags: r.tags,
          ingredients: r.ingredients,
          steps: r.steps,
        },
        create: {
          name: r.name,
          desc: r.desc,
          cuisine: r.cuisine,
          time: r.time,
          kcal: r.kcal,
          protein: r.protein,
          carb: r.carb,
          fat: r.fat,
          img: r.img,
          tags: r.tags,
          ingredients: r.ingredients,
          steps: r.steps,
        },
      });
    }
    console.log(
      `✅ Seeded ${recipes.length} recipes（人工精选 ${CURATED_RECIPES.length} + staging ${recipes.length - CURATED_RECIPES.length}）`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
