// 统一安全过滤服务（Phase 8-1 / ADR-0018）：普通筛选、相关菜谱、首页推荐与 AI 搜索共用。
// 只注入 PrismaService（PrismaModule 全局），避免模块间循环依赖。
import { Injectable } from '@nestjs/common';
import type { IngredientCategory, Recipe } from 'generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { displayIngredientName } from '../ingredient/normalize';
import {
  evaluateRecipeSafety,
  type RecipeIngredientView,
  type UserSafetySignals,
} from './safety';

/** 带稳定身份的菜谱原料行（关联表 + 身份 + 过敏原关系，ADR-0019 唯一事实源） */
export interface RecipeIngredientLinkRow {
  /** 展示名（剥离括号说明后的主体名） */
  name: string;
  amount: string;
  /** 菜谱内下标：决定展示顺序，同一菜谱内唯一 */
  position: number;
  /** 括号内的必要说明（如「西冷或眼肉」） */
  note: string | null;
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

/** 关联行 → 安全视图：每条关联行一个身份视图，没有「按名称配对 + 兜底取第一条」的旁路 */
export function toIngredientViews(recipe: SafetyInput): RecipeIngredientView[] {
  return recipe.ingredientLinks.map((link) => ({
    rawName: displayIngredientName(link.name, link.note),
    identity: {
      ingredientId: link.ingredient.id,
      name: link.ingredient.name,
      aliases: link.ingredient.aliases.map((a) => a.alias),
      category: link.ingredient.category,
      allergens: link.ingredient.allergens.map((a) => a.allergen),
    },
  }));
}
