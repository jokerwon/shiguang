// 食光共享域层 —— 类型、展示标签、纯函数（ADR-0015）。
// 消费方：Web（Next 转译源码）、移动端（Metro 转译源码）、服务端（消费 dist 产物）。

export interface Ingredient {
  name: string;
  amount: string;
}

export interface Recipe {
  id: string;
  name: string;
  /** 菜系 key，对应 CUISINE_LABELS */
  cuisine: string;
  time: number;
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  img: string;
  /** 标签 key 数组，对应 PREF_LABELS */
  tags: string[];
  ingredients: Ingredient[];
  steps: string[];
  desc: string;
}

/* ---- key 枚举 ---- */

export const CUISINES = ['home', 'western', 'japanese', 'sichuan', 'light'] as const;
export const PREFS = [
  'vegetarian',
  'high-protein',
  'low-cal',
  'low-carb',
  'quick',
  'rice-friendly',
  'comforting',
] as const;
export const TIMES = ['le15', 'le30', 'any'] as const;

/* ---- 中文展示标签（Web + 服务端 AI prompt 共用，消除双份重复） ---- */

/** 菜系 key → 中文展示 */
export const CUISINE_LABELS: Record<string, string> = {
  home: '家常',
  western: '西餐',
  japanese: '日料',
  sichuan: '川菜',
  light: '轻食',
};

/** 偏好/标签 key → 中文展示 */
export const PREF_LABELS: Record<string, string> = {
  vegetarian: '素食',
  'high-protein': '高蛋白',
  'low-cal': '低卡',
  'low-carb': '低碳',
  quick: '快手',
  'rice-friendly': '下饭',
  comforting: '治愈系',
};

/** 烹饪时间 key → 中文展示 */
export const TIME_LABELS: Record<string, string> = {
  le15: '≤15分钟',
  le30: '≤30分钟',
  any: '不限',
};

/* ---- 食材建议（resolveIng 的 canonical 匹配源，随纯函数一起迁移） ---- */

/** 常见食材（点选添加到 pantry） */
export const SUGGEST_INGS: string[] = [
  '西红柿',
  '鸡蛋',
  '鸡肉',
  '豆腐',
  '土豆',
  '三文鱼',
  '意面',
  '牛油果',
];

/* ---- 纯函数 ---- */

export function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * 将用户输入的食材文本归一到 canonical。
 * 优先匹配 SUGGEST_INGS，匹配不到则原样返回。
 */
export function resolveIng(text: string): string {
  const t = norm(text);
  const hit = SUGGEST_INGS.find((s) => norm(s) === t);
  return hit ?? text.trim();
}

/** 食材命中：norm 后双向 includes（与服务端推荐算法的硬过滤同语义） */
export function hasIng(pantry: string[], name: string): boolean {
  return pantry.some(
    (p) => norm(name).includes(norm(p)) || norm(p).includes(norm(name)),
  );
}

export function matchScore(recipe: Recipe, pantry: string[]) {
  if (pantry.length === 0) return { score: 0, have: [] as string[] };
  const have = recipe.ingredients.filter((i) => hasIng(pantry, i.name)).map((i) => i.name);
  // 空 ingredients 守卫：0/0 = NaN 会污染排序与 UI（服务端虽校验 ≥3，共享函数被 web/mobile 直接消费）
  const score =
    recipe.ingredients.length === 0
      ? 0
      : Math.round((have.length / recipe.ingredients.length) * 100);
  return { score, have };
}

/** 缺料清单（ADR-0007）：pantry 中没有的食材，含用量。即时快照，不持久化 */
export function missingIngredients(recipe: Recipe, pantry: string[]): Ingredient[] {
  return recipe.ingredients.filter((i) => !hasIng(pantry, i.name));
}

export function matchRecipes(recipes: Recipe[], pantry: string[]) {
  return recipes
    .map((r) => ({ r, ...matchScore(r, pantry) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.r.time - b.r.time);
}
