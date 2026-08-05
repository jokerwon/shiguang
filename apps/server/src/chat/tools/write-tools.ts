// 写工具的 tool() 包装（W1.2）。纯逻辑在 write-tools-logic.ts，便于单测。
import { jsonSchema, tool } from 'ai';
import {
  runAddPantryItems,
  runRemovePantryItems,
  runSetFavorite,
} from './write-tools-logic';
import type { ChatToolDeps } from './types';

export {
  runAddPantryItems,
  runRemovePantryItems,
  runSetFavorite,
} from './write-tools-logic';

export function createWriteTools(deps: ChatToolDeps, userId: string) {
  const add_pantry_items = tool({
    description:
      '向用户食材清单添加食材（幂等：已存在的跳过）。添加后用一句话复述结果。',
    inputSchema: jsonSchema<{ names: string[] }>({
      type: 'object',
      properties: {
        names: {
          type: 'array',
          items: { type: 'string' },
          description: '要添加的食材名（去重、忽略空值）',
        },
      },
      required: ['names'],
    }),
    execute: async ({ names }: { names: string[] }) =>
      runAddPantryItems(deps, userId, names),
  });

  const remove_pantry_items = tool({
    description:
      '从用户食材清单移除食材（幂等：不存在的忽略）。移除后用一句话复述结果。',
    inputSchema: jsonSchema<{ names: string[] }>({
      type: 'object',
      properties: {
        names: {
          type: 'array',
          items: { type: 'string' },
          description: '要移除的食材名',
        },
      },
      required: ['names'],
    }),
    execute: async ({ names }: { names: string[] }) =>
      runRemovePantryItems(deps, userId, names),
  });

  const set_favorite = tool({
    description:
      '收藏或取消收藏菜谱（幂等：目标状态已一致则不变）。saved=true 收藏，false 取消。操作后用一句话复述结果。',
    inputSchema: jsonSchema<{ recipeId: string; saved: boolean }>({
      type: 'object',
      properties: {
        recipeId: { type: 'string', description: '菜谱 id' },
        saved: { type: 'boolean', description: 'true=收藏，false=取消收藏' },
      },
      required: ['recipeId', 'saved'],
    }),
    execute: async ({
      recipeId,
      saved,
    }: {
      recipeId: string;
      saved: boolean;
    }) => runSetFavorite(deps, userId, recipeId, saved),
  });

  return { add_pantry_items, remove_pantry_items, set_favorite };
}
