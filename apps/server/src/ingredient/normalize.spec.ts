// resolveRecipeLinks 回归（ADR-0019）：关联行是原料的唯一事实源，
// 同一身份的不同写法（花椒/花椒粉）各保留一行、用量不丢；无法归一的写法整体拒绝。
// 纯函数、零 DB，与 normalize.ts 的无框架依赖定位一致。
import {
  buildRawIndex,
  displayIngredientName,
  resolveRecipeLinks,
  type RecipeIngredientLink,
} from './normalize';

const entries = [
  { name: '花椒', rawNames: ['花椒', '花椒粉'] },
  { name: '生菜', rawNames: [] },
];
const rawIndex = buildRawIndex(entries);
const idByName = new Map([
  ['花椒', 'id-huajiao'],
  ['生菜', 'id-shengcai'],
]);

const resolve = (ingredients: { name: string; amount: string }[]) =>
  resolveRecipeLinks<RecipeIngredientLink>(
    { label: '测试菜', ingredients },
    rawIndex,
    idByName,
    (built, ingredientId) => ({ recipeId: 'r1', ingredientId, ...built }),
  );

describe('resolveRecipeLinks', () => {
  it('同身份多写法各保留一行，用量与位置都不丢', () => {
    const out = resolve([
      { name: '花椒', amount: '1小撮' },
      { name: '花椒粉', amount: '1茶匙' },
    ]);
    expect(out.links.map((l) => [l.name, l.amount, l.position])).toEqual([
      ['花椒', '1小撮', 0],
      ['花椒粉', '1茶匙', 1],
    ]);
    expect(out.links.every((l) => l.ingredientId === 'id-huajiao')).toBe(true);
  });

  it('存在无法归一的写法时整体拒绝，不残缺写入', () => {
    const out = resolve([
      { name: '花椒', amount: '1小撮' },
      { name: '八角', amount: '2个' },
    ]);
    expect(out.links).toEqual([]);
    expect(out.rejected).toHaveLength(1);
    expect(out.rejected[0]).toContain('「测试菜」');
    expect(out.rejected[0]).toContain('八角');
  });

  it('关联按正文顺序（position）输出，括号说明进 note', () => {
    const out = resolve([
      { name: '花椒（川椒）', amount: '1小撮' },
      { name: '生菜', amount: '1把' },
    ]);
    expect(out.links.map((l) => [l.name, l.note, l.position])).toEqual([
      ['花椒', '川椒', 0],
      ['生菜', null, 1],
    ]);
  });
});

describe('displayIngredientName', () => {
  it('有说明时补括号，说明已在展示名里时不重复', () => {
    expect(displayIngredientName('牛排', '西冷或眼肉')).toBe(
      '牛排（西冷或眼肉）',
    );
    expect(displayIngredientName('花椒', null)).toBe('花椒');
  });
});
