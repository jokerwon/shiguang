// 只读工具的 tool() 包装（W1.1）。纯逻辑在 read-tools-logic.ts，便于单测。
import { jsonSchema, tool } from 'ai';
import {
  runSearchRecipes,
  runGetRecipe,
  type SearchInput,
} from './read-tools-logic';
import type { ChatToolDeps } from './types';

export function createReadTools(deps: ChatToolDeps, userId: string) {
  const search_recipes = tool({
    description:
      '搜索菜谱库。推荐具体菜谱前必须先调用此工具查库，禁止编造库中没有的菜。若用户要求同时具备多种食材（如番茄和鸡蛋），用 ingredients 参数表达全部包含；只用 keyword 会把条件退化成自由文本匹配。',
    inputSchema: jsonSchema<SearchInput>({
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '菜名或食材关键词' },
        ingredients: {
          type: 'array',
          items: { type: 'string' },
          description:
            '必须同时具备的食材（菜谱名称或别名，如「番茄」「西红柿」「鸡蛋」；调味料与加工食品同样适用，如「盐」「食用油」「豆腐」）。全部包含语义：返回的每道菜都含全部所选食材，允许还有其他原料。名称按已发布食材身份解析；无法唯一确定时工具返回 error，须把候选告知用户并请其确认后再试。只做自由文本匹配请用 keyword。',
        },
        cuisine: {
          type: 'string',
          description: '菜系（前端小写：home/western/japanese/sichuan/light）',
          enum: ['home', 'western', 'japanese', 'sichuan', 'light'],
        },
        tags: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'vegetarian',
              'high-protein',
              'low-cal',
              'low-carb',
              'quick',
              'rice-friendly',
              'comforting',
            ],
          },
          description: '标签筛选（前端小写）',
        },
        maxTime: { type: 'integer', description: '最大制作时长（分钟）' },
        maxKcal: { type: 'integer', description: '最大热量（kcal）' },
        minProtein: { type: 'integer', description: '最低蛋白（g）' },
        limit: {
          type: 'integer',
          description: '返回数量上限，默认 6',
          minimum: 1,
          maximum: 12,
        },
      },
    }),
    execute: async (input: SearchInput) =>
      runSearchRecipes(deps, userId, input),
  });

  const get_recipe = tool({
    description: '按 id 获取单道菜谱的完整详情（含食材、步骤、营养）。',
    inputSchema: jsonSchema<{ id: string }>({
      type: 'object',
      properties: { id: { type: 'string', description: '菜谱 id' } },
      required: ['id'],
    }),
    execute: async ({ id }: { id: string }) => runGetRecipe(deps, id),
  });
  const get_favorites = tool({
    description: '获取当前用户收藏的菜谱 id 列表。',
    inputSchema: jsonSchema<Record<string, never>>({ type: 'object' }),
    execute: async () => ({ favorites: await deps.favoriteFindAll(userId) }),
  });

  const get_preferences = tool({
    description: '获取当前用户的偏好档案（忌口食材、过敏原、健康目标）。',
    inputSchema: jsonSchema<Record<string, never>>({ type: 'object' }),
    execute: async () => {
      const pref = await deps.preferenceFind(userId);
      return {
        dislikedIngredients: pref?.dislikedIngredients ?? [],
        allergens: pref?.allergens ?? [],
        healthGoal: pref?.healthGoal ?? 'BALANCED',
      };
    },
  });

  return {
    search_recipes,
    get_recipe,
    get_favorites,
    get_preferences,
  };
}
