// 统一安全过滤服务（Phase 8-1 / ADR-0018）：普通筛选、相关菜谱、首页推荐与 AI 搜索共用。
// 只注入 PrismaService（PrismaModule 全局），避免模块间循环依赖。
import { Injectable } from '@nestjs/common';
import type { IngredientCategory, Recipe } from 'generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  evaluateRecipeSafety,
  type RecipeIngredientView,
  type UserSafetySignals,
} from './safety';

/** 带稳定身份的菜谱原料行（关联表 + 身份 + 过敏原关系） */
export interface RecipeIngredientLinkRow {
  name: string;
  ingredient: {
    id: string;
    name: string;
    category: IngredientCategory;
    aliases: { alias: string }[];
    allergens: { allergen: string }[];
  };
}

/** 菜谱整行 + 稳定身份关联：筛选、推荐排序与 AI 工具共用这一形状 */
export type RecipeWithIngredientLinks = Recipe & {
  ingredientLinks: RecipeIngredientLinkRow[];
};

/** 安全判断所需的最小输入（正式查询与单测 fake 都满足它） */
export interface SafetyInput {
  ingredients: unknown;
  ingredientLinks: RecipeIngredientLinkRow[];
}

export interface SafetyFilterResult<T> {
  /** 通过安全判断的条目 */
  allowed: T[];
  /** 因安全设置排除的条目及原因（身份命中/过敏原命中/信息不足可区分） */
  excluded: { item: T; reason: string; kind: 'blocked' | 'unknown' }[];
  signals: UserSafetySignals;
}

@Injectable()
export class RecipeSafetyService {
  constructor(private readonly prisma: PrismaService) {}

  /** 直接给出安全判断（AI 搜索等已在内存里持有菜谱时使用） */
  evaluate(
    recipe: SafetyInput,
    signals: UserSafetySignals,
    allergens: string[],
  ) {
    return evaluateRecipeSafety(toIngredientViews(recipe), signals, allergens);
  }

  /** 用户设置：忌口 ∪ 过敏原 + 是否设置了过敏原（未设置不宣称过敏安全） */
  async loadSignals(userId: string): Promise<{
    signals: UserSafetySignals;
    allergens: string[];
  }> {
    const pref = userId
      ? await this.prisma.userPreference.findUnique({ where: { userId } })
      : null;
    const allergens = pref?.allergens ?? [];
    return {
      signals: {
        blocked: [...(pref?.dislikedIngredients ?? []), ...allergens],
        hasAllergenSettings: allergens.length > 0,
      },
      allergens,
    };
  }

  /** 按安全设置过滤一批菜谱，保留可解释的排除原因 */
  async filter<T extends SafetyInput>(
    userId: string,
    recipes: T[],
  ): Promise<SafetyFilterResult<T>> {
    const { signals, allergens } = await this.loadSignals(userId);
    const allowed: T[] = [];
    const excluded: SafetyFilterResult<T>['excluded'] = [];
    for (const recipe of recipes) {
      const verdict = this.evaluate(recipe, signals, allergens);
      if (verdict.verdict === 'ok') {
        allowed.push(recipe);
      } else {
        excluded.push({
          item: recipe,
          reason: verdict.reason,
          kind: verdict.verdict,
        });
      }
    }
    return { allowed, excluded, signals };
  }
}

/** 菜谱原料正文与稳定身份成对展开：正文里出现的每条原料都要有一条身份视图 */
export function toIngredientViews(recipe: SafetyInput): RecipeIngredientView[] {
  const links = recipe.ingredientLinks;
  return (recipe.ingredients as { name: string; amount: string }[]).map(
    (raw) => {
      const link = links.find((l) => l.name === raw.name) ?? links[0];
      return {
        rawName: raw.name,
        identity: link
          ? {
              ingredientId: link.ingredient.id,
              name: link.ingredient.name,
              aliases: link.ingredient.aliases.map((a) => a.alias),
              category: link.ingredient.category,
              allergens: link.ingredient.allergens.map((a) => a.allergen),
            }
          : null,
      };
    },
  );
}
