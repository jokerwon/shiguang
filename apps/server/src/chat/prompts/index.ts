/**
 * prompts 模块统一导出：唯一消费者是 ChatService。
 */
export { buildSystemPrompt } from './context-builder';
export type { PromptContext } from './context-builder';
