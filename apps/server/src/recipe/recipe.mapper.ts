// 菜谱实体 ↔ API 响应的映射，供 RecipeService 与 ChatService（AI 上下文注入）共用。
import type { Recipe, Cuisine, Tag } from 'generated/prisma/client';
import type { Recipe as DomainRecipe } from '@shiguang/domain';
import type { RecipeIngredientLinkRow } from './recipe-safety.service';

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

/**
 * 将 Prisma 返回的 Recipe 转为前端可用的格式（返回共享域层 Recipe 类型）。
 * 原料的稳定身份来自 `RecipeIngredient` 关联：调用方必须带 `ingredientLinks`
 * （含 `ingredient`）读取。这里不做按名称的二次猜测（ADR-0018）。
 * 未关联身份的原料（如同一身份的第二种写法被合并掉的那一项）保持无 id，
 * 前端只做「有 id 才可跳转」的降级展示——这属于内容侧待复核项，不在前端猜。
 */
export function toResponse(
  recipe: Recipe & { ingredientLinks?: RecipeIngredientLinkRow[] },
): DomainRecipe {
  const raw = (recipe.ingredients as { name: string; amount: string }[]) ?? [];
  // 关联行的 `position` 是正文数组下标（normalize.ts 建立关联时写入），
  // 必须按它配对：同一身份的多种写法合并后 position 会出现空洞，
  // 用数组顺序会整体错位（如「夫妻肺片」的 花椒粉 被合并后，后续原料全部前移）。
  const linkByPosition = new Map(
    (recipe.ingredientLinks ?? []).map((l) => [l.position, l]),
  );

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
    ingredients: raw.map((item, i) => {
      const link = linkByPosition.get(i);
      if (!link) return item;
      return {
        name: item.name,
        amount: item.amount,
        ingredientId: link.ingredient.id,
        ...(link.note ? { note: link.note } : {}),
      };
    }),
    steps: recipe.steps as string[],
  };
}
