import { SYSTEM_PROMPT } from './system';
import { RECIPE_INSTRUCTIONS } from './recipe';
import { BEHAVIOR_PROMPT } from './behavior';
import { GUARDRAILS } from './guardrails';

/** 候选菜谱（推荐算法产出的真实菜谱，ADR-0006） */
export interface CandidateRecipe {
  name: string;
  /** 中文菜系名 */
  cuisine: string;
  time: number;
  kcal: number;
  protein: number;
  /** 中文标签 */
  tags: string[];
}

/** 运行时注入的动态上下文（每次请求重新构建，不落 service 单例） */
export interface PromptContext {
  /** 用户显示名称 */
  userName?: string;
  /** 忌口食材 ∪ 过敏原（硬约束） */
  dietaryRestrictions?: string[];
  /** 健康目标 */
  healthGoal?: 'BALANCED' | 'FAT_LOSS' | 'MUSCLE_GAIN';
  /** pantry 现有食材 */
  pantryIngredients?: string[];
  /** 当前季节（用于推荐时令菜） */
  season?: 'spring' | 'summer' | 'autumn' | 'winter';
  /** 候选菜谱（个性化推荐 top N） */
  candidates?: CandidateRecipe[];
}

const SEASON_LABELS: Record<string, string> = {
  spring: '春季',
  summer: '夏季',
  autumn: '秋季',
  winter: '冬季',
};

const HEALTH_GOAL_LABELS: Record<string, string> = {
  BALANCED: '均衡',
  FAT_LOSS: '减脂（优先低卡低碳）',
  MUSCLE_GAIN: '增肌（优先高蛋白）',
};

/** 组装顺序：身份 → 领域知识 → 交互行为 → 安全护栏 → 动态上下文 */
export function buildSystemPrompt(context?: PromptContext): string {
  const parts: string[] = [
    SYSTEM_PROMPT,
    RECIPE_INSTRUCTIONS,
    BEHAVIOR_PROMPT,
    GUARDRAILS,
  ];

  if (context) {
    const dynamicParts: string[] = [];

    if (context.userName) {
      dynamicParts.push(`当前用户：${context.userName}`);
    }
    if (context.dietaryRestrictions?.length) {
      dynamicParts.push(
        `用户忌口/过敏（绝对不要推荐含这些食材的菜）：${context.dietaryRestrictions.join('、')}`,
      );
    }
    if (context.healthGoal) {
      dynamicParts.push(
        `健康目标：${HEALTH_GOAL_LABELS[context.healthGoal] ?? context.healthGoal}`,
      );
    }
    if (context.pantryIngredients?.length) {
      dynamicParts.push(`现有食材：${context.pantryIngredients.join('、')}`);
    }
    if (context.season) {
      dynamicParts.push(`当前季节：${SEASON_LABELS[context.season]}`);
    }

    if (dynamicParts.length > 0) {
      parts.push(`## 当前上下文\n${dynamicParts.join('\n')}`);
    }

    if (context.candidates?.length) {
      const lines = context.candidates.map(
        (c) =>
          `- ${c.name}（${c.cuisine} · ${c.time}分钟 · ${c.kcal}kcal · 蛋白质${c.protein}g${c.tags.length ? ` · ${c.tags.join('/')}` : ''}）`,
      );
      parts.push(
        `## 候选菜谱（菜谱库中与本用户最匹配的真实菜谱）\n${lines.join('\n')}\n\n你只能从「候选菜谱」中推荐具体菜谱，禁止编造清单之外的菜名；若候选都不适合用户需求，如实说明，并基于现有食材给通用烹饪建议。`,
      );
    }
  }

  return parts.join('\n\n---\n\n');
}
