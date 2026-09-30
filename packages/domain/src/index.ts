// 食光共享域层 —— 类型、展示标签、纯函数（ADR-0015）。
// 消费方：Web（Next 转译源码）、服务端（消费 dist 产物）。

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


/* ---- 纯函数 ---- */

export function norm(s: string): string {
  return s.trim().toLowerCase();
}
