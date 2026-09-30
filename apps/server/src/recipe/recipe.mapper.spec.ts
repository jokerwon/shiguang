// 菜谱响应中的原料身份映射（Phase 8-2 / #7）。
//
// 重点不是「能取到 id」，而是**每一条正文原料都配到正确身份**：
// 关联行的 `position` 是正文下标，同一身份的多种写法合并后 position 会出现空洞
// （如「夫妻肺片」的花椒/花椒粉），按下标查表必须逐项命中，不能整体前移。
import type { Recipe } from 'generated/prisma/client';
import { toResponse } from './recipe.mapper';
import type { RecipeIngredientLinkRow } from './recipe-safety.service';

const link = (
  name: string,
  position: number,
  id: string,
  note: string | null = null,
) => ({
  name,
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

const recipe = (ingredients: { name: string; amount: string }[]) =>
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
    ingredients,
    steps: ['一步'],
    createdAt: new Date(),
    updatedAt: new Date(),
  }) satisfies Recipe & { ingredientLinks?: RecipeIngredientLinkRow[] };

describe('菜谱响应的原料身份', () => {
  it('position 有空洞时仍逐项对上身份，不整体前移', () => {
    const resp = toResponse({
      ...recipe([
        { name: '花椒', amount: '1茶匙' },
        { name: '花椒粉', amount: '1茶匙' },
        { name: '熟芝麻', amount: '1汤匙' },
      ]),
      ingredientLinks: [
        link('花椒', 0, 'id-sichuan-pepper'),
        // 位置 1 的「花椒粉」被合并进同一身份，没有独立关联行
        link('熟芝麻', 2, 'id-sesame'),
      ],
    });

    expect(resp.ingredients.map((i) => i.ingredientId)).toEqual([
      'id-sichuan-pepper',
      undefined,
      'id-sesame',
    ]);
  });

  it('带括号说明的原料保留说明，身份取主体名', () => {
    const resp = toResponse({
      ...recipe([{ name: '牛排（西冷或眼肉）', amount: '1块' }]),
      ingredientLinks: [link('牛排', 0, 'id-beef', '西冷或眼肉')],
    });

    expect(resp.ingredients[0]).toEqual({
      name: '牛排（西冷或眼肉）',
      amount: '1块',
      ingredientId: 'id-beef',
      note: '西冷或眼肉',
    });
  });

  it('未关联身份的原料不带 id，不猜测名称对应的身份', () => {
    const resp = toResponse({
      ...recipe([{ name: '未知原料', amount: '适量' }]),
      ingredientLinks: [],
    });

    expect(resp.ingredients[0]).toEqual({
      name: '未知原料',
      amount: '适量',
    });
  });

  it('缺少关联列时不报错，原料保持原样', () => {
    const resp = toResponse(recipe([{ name: '番茄', amount: '1个' }]));

    expect(resp.ingredients).toEqual([{ name: '番茄', amount: '1个' }]);
  });
});
