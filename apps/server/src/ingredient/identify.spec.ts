// 纯逻辑回归：只注入身份视图，零 DB（与 recipe-safety.service.spec.ts 同一 fake 方式）。
jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class {},
}));

// 名称 → 身份解析（Phase 8-3 / #8）：整串相等才算身份命中，多命中给候选不擅自映射。
// 纯逻辑、零 DB：`identifyIn` 只依赖身份视图，列表的关键词过滤复用同一判定。
import { IngredientService } from './ingredient.service';
import type { IngredientIdentityView } from './ingredient.service';

const svc = new IngredientService(null as never);

const view = (
  id: string,
  name: string,
  aliases: string[] = [],
): IngredientIdentityView => ({ id, name, category: 'VEGETABLE', aliases });

const identities = [
  view('id-fanqie', '番茄', ['西红柿']),
  view('id-jidan', '鸡蛋'),
  view('id-yadan', '鸭蛋'),
  view('id-shengchou', '生抽'),
  view('id-laochou', '老抽'),
  view('id-you', '油'),
  view('id-shiyongyou', '食用油', ['植物油']),
  view('id-huangyou', '黄油'),
  view('id-jiangyou', '酱油'),
  view('id-siyoujiangyou', '寿司酱油'),
  view('id-huajiao', '花椒', ['花椒粉']),
  view('id-doufu', '豆腐', ['大豆']),
];

describe('IngredientService.identifyIn', () => {
  it('别名与规范名指向同一身份，不产生两条候选', () => {
    const byAlias = svc.identifyIn(identities, ['西红柿']);
    expect(byAlias.matched?.id).toBe('id-fanqie');
    expect(byAlias.matched?.name).toBe('番茄');
    expect(byAlias.ambiguous).toEqual([]);

    const byName = svc.identifyIn(identities, ['番茄']);
    expect(byName.matched?.id).toBe('id-fanqie');
    expect(byName.ambiguous).toEqual([]);
  });

  it('相近但不同的身份不互相映射：鸡蛋≠鸭蛋、生抽≠老抽', () => {
    expect(svc.identifyIn(identities, ['鸡蛋']).matched?.id).toBe('id-jidan');
    expect(svc.identifyIn(identities, ['鸭蛋']).matched?.id).toBe('id-yadan');
    expect(svc.identifyIn(identities, ['生抽']).matched?.id).toBe(
      'id-shengchou',
    );
    expect(svc.identifyIn(identities, ['老抽']).matched?.id).toBe('id-laochou');
  });

  it('子串不算身份命中，也不自动选中下位食材', () => {
    // 「酱油」是独立身份，不得展开成寿司酱油
    expect(svc.identifyIn(identities, ['酱油']).matched?.id).toBe(
      'id-jiangyou',
    );
    // 「大豆」不是豆腐的规范名，只是别名；不整串命中其他身份
    expect(svc.identifyIn(identities, ['豆']).matched).toBeNull();
    expect(svc.identifyIn(identities, ['豆']).ambiguous).toEqual([]);
    // 「食」无命中
    expect(svc.identifyIn(identities, ['食']).matched).toBeNull();
  });

  it('整串命中多个身份时给出候选，不擅自选一个', () => {
    // 两个身份共用同一整串写法（资料库当前无此数据，属未签字前的防御）
    const ambiguousSet = [...identities, view('id-oil', '油', ['食用油'])];
    const out = svc.identifyIn(ambiguousSet, ['油']);
    expect(out.matched).toBeNull();
    expect(out.ambiguous.map((c) => c.id).sort()).toEqual(['id-oil', 'id-you']);
  });

  it('唯一整串命中直接给出身份，相近写法不被卷进来', () => {
    // 「食用油」命中自己（别名植物油），不含「黄油」「酱油」这类子串相近项
    expect(svc.identifyIn(identities, ['食用油']).matched?.id).toBe(
      'id-shiyongyou',
    );
    expect(svc.identifyIn(identities, ['植物油']).matched?.id).toBe(
      'id-shiyongyou',
    );
    expect(svc.identifyIn(identities, ['黄油']).matched?.id).toBe(
      'id-huangyou',
    );
  });

  it('输入空白或纯标点不产生身份', () => {
    expect(svc.identifyIn(identities, ['  ', ''])).toEqual({
      matched: null,
      ambiguous: [],
    });
  });
});
