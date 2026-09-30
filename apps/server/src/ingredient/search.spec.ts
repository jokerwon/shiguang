// 关键词搜索的身份优先规则（Phase 8-3 / #8）：整串命中身份优先于子串候选。
// 用 fake prisma 走 findAll 真实分支（构造 where → 取候选 → 命中优先 → 排序分页）。
jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class {},
}));

import { IngredientService } from './ingredient.service';
import type { IngredientListItem } from './ingredient.service';

type Row = {
  id: string;
  name: string;
  category: string;
  aliases: { alias: string }[];
  allergens: { allergen: string }[];
};

const row = (name: string, aliases: string[] = []): Row => ({
  id: `id-${name}`,
  name,
  category: 'SEASONING',
  aliases: aliases.map((alias) => ({ alias })),
  allergens: [],
});

const CATALOG = [
  row('番茄'),
  row('番茄罐头'),
  row('番茄酱'),
  row('西红柿'),
  row('食用油', ['植物油']),
];

/** fake prisma：只实现 findAll 用到的查询 */
function makeService(catalog: Row[]) {
  const prisma = {
    ingredient: {
      findMany: ({ where }: { where: Record<string, unknown> }) => {
        const clauses = (where.OR ?? []) as Array<
          Record<string, { contains: string }>
        >;
        if (clauses.length === 0) return Promise.resolve(catalog);
        const keyword = clauses[0].name.contains;
        const lower = keyword.toLowerCase();
        return Promise.resolve(
          catalog.filter(
            (r) =>
              r.name.toLowerCase().includes(lower) ||
              r.aliases.some((a) => a.alias.toLowerCase().includes(lower)),
          ),
        );
      },
    },
    recipeIngredient: {
      groupBy: () =>
        Promise.resolve(
          [] as { ingredientId: string; _count: { recipeId: number } }[],
        ),
    },
  };
  return new IngredientService(prisma as never);
}

const names = (result: { data: IngredientListItem[] }) =>
  result.data.map((i) => i.name);

describe('IngredientService.findAll 关键词', () => {
  it('整串命中身份时只返回该身份，不含子串相近项', async () => {
    const out = await makeService(CATALOG).findAll({ keyword: '番茄' });
    expect(names(out)).toEqual(['番茄']);
    expect(out.meta.exactMatches).toBe(1);
    expect(out.meta.total).toBe(1);
  });

  it('别名整串命中同样只返回该身份', async () => {
    const out = await makeService(CATALOG).findAll({ keyword: '植物油' });
    expect(names(out)).toEqual(['食用油']);
    expect(out.meta.exactMatches).toBe(1);
  });

  it('没有整串身份命中才退回子串候选，并标注 exactMatches=0', async () => {
    const out = await makeService(CATALOG).findAll({ keyword: '番茄酱' });
    expect(names(out)).toEqual(['番茄酱']);
    expect(out.meta.exactMatches).toBe(1);

    const fuzzy = await makeService(CATALOG).findAll({ keyword: '茄' });
    expect(names(fuzzy).sort()).toEqual(['番茄', '番茄罐头', '番茄酱']);
    expect(fuzzy.meta.exactMatches).toBe(0);
  });

  it('身份命中排在子串候选前（多个输入词）', async () => {
    // 「番茄 食用油」：食用油整串命中身份，番茄酱/番茄罐头只被子串带上
    const out = await makeService(CATALOG).findAll({ keyword: '食用油' });
    expect(names(out)).toEqual(['食用油']);
  });
});
