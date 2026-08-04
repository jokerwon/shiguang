// 个性化推荐打分（ADR-0005）：纯函数，可单测。
// 硬过滤（isBlocked）+ 三维加权排序：
//   pantry 匹配度 0.45 / 时间适配 0.15 / 健康目标 0.15 / 新鲜度轮换 0.25
// 所有信号确定性：同用户同天同库 → 同结果；dateKey 变化 → 轮换生效。

export type HealthGoalKey = 'BALANCED' | 'FAT_LOSS' | 'MUSCLE_GAIN';

export interface UserSignals {
  /** pantry 现有食材名 */
  pantry: string[];
  /** 忌口食材 ∪ 过敏原（硬过滤） */
  blocked: string[];
  healthGoal: HealthGoalKey;
}

export interface ScoreContext {
  /** 服务器本地小时（0-23） */
  hour: number;
  /** 服务器本地日期 YYYY-MM-DD */
  dateKey: string;
}

export interface ScorableRecipe {
  id: string;
  time: number;
  kcal: number;
  carb: number;
  protein: number;
  ingredients: { name: string }[];
}

/** 本地日期 → YYYY-MM-DD（部署要求 TZ=Asia/Shanghai） */
export function dateKeyOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** FNV-1a 字符串 hash：同输入恒同输出 */
export function dailySeed(userId: string, dateKey: string): number {
  let h = 0x811c9dc5;
  const s = `${userId}:${dateKey}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * 食材命中：与前端 matchScore 同语义（norm 后双向 includes）。
 * 已知限制：「鸡蛋」会命中「鸡蛋干」——行为统一优先于精确。
 */
export function ingredientHit(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  return x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x));
}

/** 硬过滤：含任一忌口/过敏原食材 */
export function isBlocked(
  ingredients: { name: string }[],
  blocked: string[],
): boolean {
  return ingredients.some((i) => blocked.some((b) => ingredientHit(i.name, b)));
}

/** pantry 匹配度：命中食材占比，0..1 */
export function pantryOverlap(
  ingredients: { name: string }[],
  pantry: string[],
): number {
  if (ingredients.length === 0 || pantry.length === 0) return 0;
  const hit = ingredients.filter((i) =>
    pantry.some((p) => ingredientHit(i.name, p)),
  ).length;
  return hit / ingredients.length;
}

/** 时间适配：晚间（≥17 点）优先 ≤30min 的快菜；非晚间中性 0.5 */
export function timeFit(timeMin: number, hour: number): number {
  if (hour < 17) return 0.5;
  if (timeMin <= 30) return 1;
  return Math.max(0, (60 - timeMin) / 30);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 健康目标映射营养三要素：减脂 → 低卡低碳；增肌 → 高蛋白 */
export function goalBonus(
  r: { kcal: number; carb: number; protein: number },
  goal: HealthGoalKey,
): number {
  switch (goal) {
    case 'FAT_LOSS':
      return clamp01((1 - r.kcal / 800) * 0.6 + (1 - r.carb / 100) * 0.4);
    case 'MUSCLE_GAIN':
      return clamp01(Math.min(r.protein / 40, 1));
    default:
      return 0.5;
  }
}

/** 新鲜度轮换：同 userId+dateKey+recipeId 恒同值，0..1 */
export function seededJitter(seed: number, recipeId: string): number {
  let h = seed;
  for (let i = 0; i < recipeId.length; i++) {
    h ^= recipeId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export function scoreRecipe(
  r: ScorableRecipe,
  s: UserSignals,
  c: ScoreContext,
  seed: number,
): number {
  return (
    0.45 * pantryOverlap(r.ingredients, s.pantry) +
    0.15 * timeFit(r.time, c.hour) +
    0.15 * goalBonus(r, s.healthGoal) +
    0.25 * seededJitter(seed, r.id)
  );
}
