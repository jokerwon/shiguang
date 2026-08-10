import { SYSTEM_PROMPT } from './system';
import { RECIPE_INSTRUCTIONS } from './recipe';
import { BEHAVIOR_PROMPT } from './behavior';
import { GUARDRAILS } from './guardrails';

/**
 * 运行时注入的动态上下文（每次请求重新构建，不落 service 单例）。
 *
 * ADR-0009 注入演进：候选菜谱注入已移除，改为 search_recipes 工具按需查询。
 * 保留偏好/pantry/季节/用户名注入（便宜、每轮都需要，是推荐与安全的基准上下文）。
 */
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
  /** 会话摘要（滑窗之外消息的压缩，ADR-0012） */
  conversationSummary?: string;
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
    if (context.conversationSummary) {
      dynamicParts.push(`会话摘要：${context.conversationSummary}`);
    }

    if (dynamicParts.length > 0) {
      parts.push(`## 当前上下文\n${dynamicParts.join('\n')}`);
    }
  }

  return parts.join('\n\n---\n\n');
}
