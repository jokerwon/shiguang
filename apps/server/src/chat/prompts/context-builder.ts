import { SYSTEM_PROMPT } from './system';
import { RECIPE_INSTRUCTIONS } from './recipe';
import { BEHAVIOR_PROMPT } from './behavior';
import { GUARDRAILS } from './guardrails';

/** 运行时注入的动态上下文 */
export interface PromptContext {
  /** 用户显示名称 */
  userName?: string;
  /** 用户偏好菜系 */
  preferredCuisine?: string;
  /** 用户忌口 / 过敏 */
  dietaryRestrictions?: string[];
  /** 当前季节（用于推荐时令菜） */
  season?: 'spring' | 'summer' | 'autumn' | 'winter';
}

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
    if (context.preferredCuisine) {
      dynamicParts.push(`用户偏好菜系：${context.preferredCuisine}`);
    }
    if (context.dietaryRestrictions?.length) {
      dynamicParts.push(
        `用户忌口/过敏：${context.dietaryRestrictions.join('、')}`,
      );
    }
    if (context.season) {
      const seasonLabels: Record<string, string> = {
        spring: '春季',
        summer: '夏季',
        autumn: '秋季',
        winter: '冬季',
      };
      dynamicParts.push(`当前季节：${seasonLabels[context.season]}`);
    }

    if (dynamicParts.length > 0) {
      parts.push(`## 当前上下文\n${dynamicParts.join('\n')}`);
    }
  }

  return parts.join('\n\n---\n\n');
}
