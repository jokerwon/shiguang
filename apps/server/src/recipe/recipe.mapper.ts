// 菜谱实体 ↔ API 响应的映射，供 RecipeService 与 ChatService（AI 上下文注入）共用。
import type { Recipe, Cuisine, Tag } from 'generated/prisma/client';

/* ---- 枚举映射：Prisma 大写 → 前端小写 ---- */

export const CUISINE_DOWN: Record<string, string> = {
  HOME: 'home',
  WESTERN: 'western',
  JAPANESE: 'japanese',
  SICHUAN: 'sichuan',
  LIGHT: 'light',
};

export const TAG_DOWN: Record<string, string> = {
  VEGETARIAN: 'vegetarian',
  HIGH_PROTEIN: 'high-protein',
  LOW_CAL: 'low-cal',
  LOW_CARB: 'low-carb',
  QUICK: 'quick',
  RICE_FRIENDLY: 'rice-friendly',
  COMFORTING: 'comforting',
};

/* ---- 反向映射：前端小写 → Prisma 大写（用于查询过滤） ---- */

export const CUISINE_UP: Record<string, Cuisine> = {
  home: 'HOME',
  western: 'WESTERN',
  japanese: 'JAPANESE',
  sichuan: 'SICHUAN',
  light: 'LIGHT',
};

export const TAG_UP: Record<string, Tag> = {
  vegetarian: 'VEGETARIAN',
  'high-protein': 'HIGH_PROTEIN',
  'low-cal': 'LOW_CAL',
  'low-carb': 'LOW_CARB',
  quick: 'QUICK',
  'rice-friendly': 'RICE_FRIENDLY',
  comforting: 'COMFORTING',
};

/* ---- 中文展示标签（AI prompt 渲染候选菜谱用，与前端 CUISINE_LABELS/PREF_LABELS 对齐） ---- */

export const CUISINE_ZH: Record<string, string> = {
  home: '家常',
  western: '西餐',
  japanese: '日料',
  sichuan: '川菜',
  light: '轻食',
};

export const TAG_ZH: Record<string, string> = {
  vegetarian: '素食',
  'high-protein': '高蛋白',
  'low-cal': '低卡',
  'low-carb': '低碳',
  quick: '快手',
  'rice-friendly': '下饭',
  comforting: '治愈系',
};

/* ---- 响应类型 ---- */

export interface RecipeIngredient {
  name: string;
  amount: string;
}

export interface RecipeResponse {
  id: string;
  name: string;
  desc: string;
  cuisine: string;
  time: number;
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  img: string;
  tags: string[];
  ingredients: RecipeIngredient[];
  steps: string[];
}

/** 将 Prisma 返回的 Recipe 转为前端可用的格式 */
export function toResponse(recipe: Recipe): RecipeResponse {
  return {
    id: recipe.id,
    name: recipe.name,
    desc: recipe.desc,
    cuisine: CUISINE_DOWN[recipe.cuisine],
    time: recipe.time,
    kcal: recipe.kcal,
    protein: recipe.protein,
    carb: recipe.carb,
    fat: recipe.fat,
    img: recipe.img,
    tags: recipe.tags.map((t) => TAG_DOWN[t]),
    ingredients: recipe.ingredients as unknown as RecipeIngredient[],
    steps: recipe.steps as string[],
  };
}
