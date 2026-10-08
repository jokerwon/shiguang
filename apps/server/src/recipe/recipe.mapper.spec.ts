// 菜谱响应中的原料映射（ADR-0019）：原料唯一事实源是关联行，
// 响应按 `position` 升序派生正文，同一身份的多行（花椒/花椒粉）都保留。
import type { Recipe } from 'generated/prisma/client';
import { toResponse } from './recipe.mapper';
import type { RecipeIngredientLinkRow } from './recipe-safety.service';

const link = (
  name: string,
  position: number,
  id: string,
  note: string | null = null,
  amount = '适量',
): RecipeIngredientLinkRow => ({
  name,
  amount,
  position,
  note,
  ingredient: {
    id,
    name,
    category: 'SEASONING' as const,
    aliases: [],
    allergens: [],
  },
});

const recipe = (ingredientLinks: RecipeIngredientLinkRow[]) =>
  ({
    id: 'r1',
    name: '测试菜',
    desc: '描述',
    cuisine: 'HOME',
    time: 10,
    kcal: 100,
    protein: 1,
    carb: 1,
    fat: 1,
    img: '',
    tags: [],
    steps: ['一步'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ingredientLinks,
  }) satisfies Recipe & { ingredientLinks?: RecipeIngredientLinkRow[] };

describe('菜谱响应的原料', () => {
  it('按 position 升序输出，用量与身份一同带出', () => {
    const resp = toResponse(
      recipe([
        link('熟芝麻', 2, 'id-sesame', null, '1汤匙'),
        link('花椒', 0, 'id-sichuan-pepper', null, '1茶匙'),
      ]),
    );

    expect(resp.ingredients).toEqual([
      { name: '花椒', amount: '1茶匙', ingredientId: 'id-sichuan-pepper' },
      { name: '熟芝麻', amount: '1汤匙', ingredientId: 'id-sesame' },
    ]);
  });

  it('同一身份的不同写法各保留一行，用量不互相覆盖', () => {
    const resp = toResponse(
      recipe([
        link('花椒', 0, 'id-sichuan-pepper', null, '1小撮'),
        link('花椒粉', 1, 'id-sichuan-pepper', null, '1茶匙'),
      ]),
    );

    expect(resp.ingredients).toEqual([
      { name: '花椒', amount: '1小撮', ingredientId: 'id-sichuan-pepper' },
      { name: '花椒粉', amount: '1茶匙', ingredientId: 'id-sichuan-pepper' },
    ]);
  });

  it('括号说明随原料带出', () => {
    const resp = toResponse(
      recipe([link('牛排', 0, 'id-beef', '西冷或眼肉', '1块')]),
    );

    expect(resp.ingredients[0]).toEqual({
      name: '牛排',
      amount: '1块',
      ingredientId: 'id-beef',
      note: '西冷或眼肉',
    });
  });

  it('没有关联行时原料为空数组，不报错也不编造', () => {
    expect(toResponse(recipe([])).ingredients).toEqual([]);
  });
});
