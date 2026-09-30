// resolveRecipeLinks 回归（Phase 8-2 / #7）：「同身份多写法如实上报」是
// import 与 seed 共用的发布行为，静默回归会重新藏住合并（花椒粉缺口的由来）。
// 纯函数、零 DB，与 normalize.ts 的无框架依赖定位一致。
import {
  buildRawIndex,
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
  it('同身份多写法只保留第一条，被合并项如实报入 merged', () => {
    const out = resolve([
      { name: '花椒', amount: '1小撮' },
      { name: '花椒粉', amount: '1茶匙' },
    ]);
    expect(out.links).toHaveLength(1);
    expect(out.links[0]).toMatchObject({
      name: '花椒',
      ingredientId: 'id-huajiao',
    });
    expect(out.merged).toEqual([{ name: '花椒粉', into: '花椒' }]);
  });

  it('存在无法归一的写法时整体拒绝：links 为空，已识别的合并仍返回', () => {
    const out = resolve([
      { name: '花椒', amount: '1小撮' },
      { name: '花椒粉', amount: '1茶匙' },
      { name: '八角', amount: '2个' },
    ]);
    expect(out.links).toEqual([]);
    expect(out.rejected).toHaveLength(1);
    expect(out.rejected[0]).toContain('「测试菜」');
    expect(out.rejected[0]).toContain('八角');
    expect(out.merged).toEqual([{ name: '花椒粉', into: '花椒' }]);
  });

  it('保留的关联按正文顺序（position）输出', () => {
    const out = resolve([
      { name: '生菜', amount: '1把' },
      { name: '花椒', amount: '1小撮' },
    ]);
    expect(out.links.map((l) => l.name)).toEqual(['生菜', '花椒']);
    expect(out.merged).toEqual([]);
  });
});
