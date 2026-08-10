// 写工具的 tool() 包装（W1.2）。纯逻辑在 write-tools-logic.ts，便于单测。
import { jsonSchema, tool } from 'ai';
import {
  runAddPantryItems,
  runRemovePantryItems,
  runSetFavorite,
  runUpdatePreferences,
  type UpdatePreferenceInput,
} from './write-tools-logic';
import type { ChatToolDeps } from './types';

export {
  runAddPantryItems,
  runRemovePantryItems,
  runSetFavorite,
  runUpdatePreferences,
  type UpdatePreferenceInput,
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

  // update_preferences（ADR-0012）：只产出待确认草稿，execute 不接触任何写 service——
  // 「未确认不落库」由架构保证（E4 双保险），确认只认前端按钮。
  const update_preferences = tool({
    description:
      '准备用户偏好档案（忌口/过敏原/健康目标）的变更草稿。用户表达新的忌口、过敏原或健康目标时调用。' +
      '该工具只产出待确认草稿，不落库——用户需在前端点「确认」后才生效。' +
      '调用后回复「已为你准备偏好变更，请点确认卡片确认」，不得声称已保存/已记住。',
    inputSchema: jsonSchema<UpdatePreferenceInput>({
      type: 'object',
      properties: {
        addDisliked: {
          type: 'array',
          items: { type: 'string' },
          description: '新增忌口食材（如「我不吃香菜」→ ["香菜"]）',
        },
        removeDisliked: {
          type: 'array',
          items: { type: 'string' },
          description: '解除忌口食材',
        },
        addAllergens: {
          type: 'array',
          items: { type: 'string' },
          description: '新增过敏原（安全红线，最优先）',
        },
        removeAllergens: {
          type: 'array',
          items: { type: 'string' },
          description: '解除过敏原',
        },
        setHealthGoal: {
          type: 'string',
          enum: ['BALANCED', 'FAT_LOSS', 'MUSCLE_GAIN'],
          description:
            '设定健康目标（BALANCED 均衡 / FAT_LOSS 减脂 / MUSCLE_GAIN 增肌）',
        },
      },
      // 至少一项的约束在 execute 运行时校验（JSON Schema 对「任一可选字段」表达繁琐）
    }),
    execute: async (input: UpdatePreferenceInput) =>
      runUpdatePreferences(deps, userId, input),
  });

  return {
    add_pantry_items,
    remove_pantry_items,
    set_favorite,
    update_preferences,
  };
}
