// 菜谱实体 ↔ API 响应的映射，供 RecipeService 与 ChatService（AI 上下文注入）共用。
import type { Recipe, Cuisine, Tag } from 'generated/prisma/client';
import type { Recipe as DomainRecipe } from '@shiguang/domain';

/* ---- 枚举映射：Prisma 大写 → 前端小写（服务端私有，ADR-0015 边界） ---- */

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

// CUISINE_ZH / TAG_ZH 已迁移到 @shiguang/domain 的 CUISINE_LABELS / PREF_LABELS（ADR-0015 消除双份重复）

/** 将 Prisma 返回的 Recipe 转为前端可用的格式（返回共享域层 Recipe 类型） */
export function toResponse(recipe: Recipe): DomainRecipe {
  return {
    id: recipe.id,
    name: recipe.name,
    desc: recipe.desc,
    cuisine: CUISINE_DOWN[recipe.cuisine] ?? recipe.cuisine.toLowerCase(),
    time: recipe.time,
    kcal: recipe.kcal,
    protein: recipe.protein,
    carb: recipe.carb,
    fat: recipe.fat,
    img: recipe.img,
    tags: recipe.tags.map((t) => TAG_DOWN[t] ?? t.toLowerCase()),
    ingredients: recipe.ingredients as unknown as DomainRecipe['ingredients'],
    steps: recipe.steps as string[],
  };
}
