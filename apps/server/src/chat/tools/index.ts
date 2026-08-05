// 工具集装配（W1.4）：createChatTools 工厂按请求组装工具集，闭包捕获 userId。
// 单测友好（纯函数注入 fake service）。
import { createReadTools } from './read-tools';
import { createWriteTools } from './write-tools';
import type { ChatToolDeps } from './types';

export function createChatTools(deps: ChatToolDeps, userId: string) {
  return {
    ...createReadTools(deps, userId),
    ...createWriteTools(deps, userId),
  };
}

export type ChatToolSet = ReturnType<typeof createChatTools>;
export type { ChatToolDeps, RecipeSummary } from './types';
