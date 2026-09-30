// 菜谱原料写法 → 稳定身份 逐项核对表（Phase 8-2 / #7）
//
// 本表是**人工复核的输入**，不是「已复核」的声明：AI 从 live 数据库的
// `RecipeIngredient` 关联行生成，逐条列出正文写法归到了哪个身份。
// 维护者逐条确认后，在 `apps/server/prisma/ingredients/published.ts` 修正
// （别名归并、rawNames 增删），再重跑 `pnpm ingredients:import`。
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

interface Row {
  raw: string;
  identity: string;
  aliases: string[];
  category: string;
  note: string | null;
  amount: string;
  recipes: string[];
}

async function main() {
  const p = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const rows = await p.recipeIngredient.findMany({
    include: {
      ingredient: {
        select: {
          name: true,
          category: true,
          aliases: { select: { alias: true } },
        },
      },
      recipe: { select: { name: true } },
    },
    orderBy: [{ position: 'asc' }],
  });

  const byRaw = new Map<string, Row>();
  for (const r of rows) {
    const existing = byRaw.get(r.name);
    if (existing) {
      existing.recipes.push(r.recipe.name);
      continue;
    }
    byRaw.set(r.name, {
      raw: r.name,
      identity: r.ingredient.name,
      aliases: r.ingredient.aliases.map((a) => a.alias),
      category: r.ingredient.category,
      note: r.note,
      amount: r.amount,
      recipes: [r.recipe.name],
    });
  }

  const sorted = [...byRaw.values()].sort(
    (a, b) =>
      a.identity.localeCompare(b.identity, 'zh') ||
      a.raw.localeCompare(b.raw, 'zh'),
  );

  const lines: string[] = [];
  lines.push('# 菜谱原料写法 → 稳定身份 逐项核对表（Phase 8-2 / #7）');
  lines.push('');
  lines.push('> 本表由 live 数据库生成，是**待人工逐条确认**的复核输入：');
  lines.push(
    '> 勾选表示维护者已核对「这段写法确实属于这个身份、说明没有被误当作同时必备」。',
  );
  lines.push(
    '> 发现问题时改 `apps/server/prisma/ingredients/published.ts` 后重跑 `pnpm ingredients:import`，再重生成本表。',
  );
  lines.push('');
  lines.push(
    `- 关联行：${rows.length} 条，覆盖 ${new Set(rows.map((r) => r.recipe.name)).size} 道菜谱`,
  );
  lines.push(`- 写法种类：${sorted.length} 种`);
  const bracketed = sorted.filter((r) => r.note);
  lines.push(
    `- 括号说明写法：${bracketed.length} 种（${bracketed.map((r) => r.raw).join('、') || '无'}）`,
  );
  lines.push('');
  lines.push('## 核对表');
  lines.push('');
  lines.push(
    '| 已核对 | # | 正文写法 | 归到身份 | 身份分类 | 括号说明 | 用量示例 | 菜谱数 | 身份已登记别名 |',
  );
  lines.push(
    '| ------ | - | -------- | -------- | -------- | -------- | -------- | ------ | -------------- |',
  );
  sorted.forEach((r, i) => {
    lines.push(
      `| [ ] | ${i + 1} | ${r.raw} | ${r.identity} | ${r.category} | ${r.note ?? '—'} | ${r.amount} | ${r.recipes.length} | ${r.aliases.join('、') || '—'} |`,
    );
  });
  console.log(lines.join('\n'));

  // 同一身份的多种写法：合并语义的现状，需要维护者确认「合并 / 拆身份」
  const byIdentity = new Map<string, string[]>();
  for (const r of sorted) {
    byIdentity.set(r.identity, [...(byIdentity.get(r.identity) ?? []), r.raw]);
  }
  const multi = [...byIdentity.entries()].filter(([, raws]) => raws.length > 1);
  console.error('');
  console.error(`## 合并项复核（同一身份存在多种写法：${multi.length} 组）`);
  for (const [identity, raws] of multi) {
    console.error(`- ${identity} ← ${raws.join('、')}`);
  }

  await p.$disconnect();
}

void main();
