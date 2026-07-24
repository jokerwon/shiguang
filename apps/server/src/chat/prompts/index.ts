/**
 * prompts 模块统一导出
 *
 * 使用方式：
 *   import { buildSystemPrompt } from './prompts';
 *   const systemPrompt = buildSystemPrompt({ userName: '小明' });
 */
export { SYSTEM_PROMPT } from './system';
export { RECIPE_INSTRUCTIONS } from './recipe';
export { BEHAVIOR_PROMPT } from './behavior';
export { GUARDRAILS } from './guardrails';
export { buildSystemPrompt } from './context-builder';
export type { PromptContext } from './context-builder';
