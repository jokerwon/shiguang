import {
  dailySeed,
  dateKeyOf,
  goalBonus,
  ingredientHit,
  isBlocked,
  pantryOverlap,
  scoreRecipe,
  seededJitter,
  timeFit,
  type ScorableRecipe,
  type UserSignals,
} from './recommendation.scoring';

const recipe = (over: Partial<ScorableRecipe> = {}): ScorableRecipe => ({
  id: 'r1',
  time: 20,
  kcal: 400,
  carb: 40,
  protein: 20,
  ingredients: [{ name: '鸡蛋' }, { name: '番茄' }, { name: '盐' }],
  ...over,
});

const signals = (over: Partial<UserSignals> = {}): UserSignals => ({
  pantry: [],
  blocked: [],
  healthGoal: 'BALANCED',
  ...over,
});

describe('dailySeed / seededJitter', () => {
  it('同输入恒同输出（当天内稳定）', () => {
    expect(dailySeed('u1', '2026-08-04')).toBe(dailySeed('u1', '2026-08-04'));
  });

  it('不同日期或不同用户结果不同（按天轮换）', () => {
    expect(dailySeed('u1', '2026-08-04')).not.toBe(dailySeed('u1', '2026-08-05'));
    expect(dailySeed('u1', '2026-08-04')).not.toBe(dailySeed('u2', '2026-08-04'));
  });

  it('jitter 落在 [0,1] 且稳定', () => {
    const seed = dailySeed('u1', '2026-08-04');
    const a = seededJitter(seed, 'r1');
    expect(a).toBe(seededJitter(seed, 'r1'));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(1);
  });
});

describe('dateKeyOf', () => {
  it('输出本地日期 YYYY-MM-DD', () => {
    expect(dateKeyOf(new Date(2026, 7, 4, 23, 59))).toBe('2026-08-04');
  });
});

describe('ingredientHit / isBlocked', () => {
  it('双向 includes 命中', () => {
    expect(ingredientHit('鸡蛋', '鸡蛋')).toBe(true);
    expect(ingredientHit('土鸡蛋', '鸡蛋')).toBe(true);
    expect(ingredientHit('鸡蛋', '土鸡蛋')).toBe(true);
    expect(ingredientHit('牛肉', '鸡蛋')).toBe(false);
  });

  it('空串不命中', () => {
    expect(ingredientHit('', '鸡蛋')).toBe(false);
    expect(ingredientHit('鸡蛋', '  ')).toBe(false);
  });

  it('含忌口食材被硬过滤', () => {
    expect(isBlocked(recipe().ingredients, ['鸡蛋'])).toBe(true);
    expect(isBlocked(recipe().ingredients, ['牛肉'])).toBe(false);
    expect(isBlocked(recipe().ingredients, [])).toBe(false);
  });
});

describe('pantryOverlap', () => {
  it('空 pantry 返回 0', () => {
    expect(pantryOverlap(recipe().ingredients, [])).toBe(0);
  });

  it('按命中占比计分', () => {
    expect(pantryOverlap(recipe().ingredients, ['鸡蛋', '番茄', '盐'])).toBe(1);
    expect(pantryOverlap(recipe().ingredients, ['鸡蛋'])).toBeCloseTo(1 / 3);
  });
});

describe('timeFit', () => {
  it('晚间 ≤30min 满分', () => {
    expect(timeFit(15, 19)).toBe(1);
    expect(timeFit(30, 17)).toBe(1);
  });

  it('晚间慢菜线性衰减至 0', () => {
    expect(timeFit(45, 19)).toBeCloseTo(0.5);
    expect(timeFit(60, 19)).toBe(0);
    expect(timeFit(90, 19)).toBe(0);
  });

  it('非晚间中性 0.5（不惩罚慢菜）', () => {
    expect(timeFit(90, 12)).toBe(0.5);
    expect(timeFit(10, 12)).toBe(0.5);
  });
});

describe('goalBonus', () => {
  it('BALANCED 恒 0.5', () => {
    expect(goalBonus(recipe(), 'BALANCED')).toBe(0.5);
  });

  it('FAT_LOSS 偏好低卡低碳', () => {
    const light = goalBonus({ kcal: 200, carb: 10, protein: 20 }, 'FAT_LOSS');
    const heavy = goalBonus({ kcal: 700, carb: 90, protein: 20 }, 'FAT_LOSS');
    expect(light).toBeGreaterThan(heavy);
  });

  it('MUSCLE_GAIN 偏好高蛋白', () => {
    const high = goalBonus({ kcal: 400, carb: 40, protein: 40 }, 'MUSCLE_GAIN');
    const low = goalBonus({ kcal: 400, carb: 40, protein: 10 }, 'MUSCLE_GAIN');
    expect(high).toBe(1);
    expect(high).toBeGreaterThan(low);
  });
});

describe('scoreRecipe', () => {
  const ctx = { hour: 19, dateKey: '2026-08-04' };

  it('pantry 全命中排序高于零命中', () => {
    const seed = dailySeed('u1', ctx.dateKey);
    const full = scoreRecipe(
      recipe(),
      signals({ pantry: ['鸡蛋', '番茄', '盐'] }),
      ctx,
      seed,
    );
    const none = scoreRecipe(recipe(), signals(), ctx, seed);
    expect(full).toBeGreaterThan(none);
  });

  it('同输入排序确定（可重复）', () => {
    const seed = dailySeed('u1', ctx.dateKey);
    const recipes = [
      recipe({ id: 'a' }),
      recipe({ id: 'b' }),
      recipe({ id: 'c' }),
    ];
    const rank = () =>
      recipes
        .map((r) => ({ id: r.id, s: scoreRecipe(r, signals(), ctx, seed) }))
        .sort((x, y) => y.s - x.s)
        .map((x) => x.id)
        .join(',');
    expect(rank()).toBe(rank());
  });
});
