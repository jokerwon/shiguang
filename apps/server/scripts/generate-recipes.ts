// AI 批量生成菜谱 → staging 待审区（ADR-0003）。
// 用法：pnpm recipes:generate [--per-batch 8] [--batches 1] [--only sichuan,home]
// 环境变量（apps/server/.env）：OPENAI_API_KEY / OPENAI_BASE_URL / MODEL_NAME
//
// 生成结果不直接入库：写入 prisma/staging/recipes-staging.json，
// 人工抽检 + db:seed 时的防御性二次校验后才导入 Recipe 表。
import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { CURATED_RECIPES } from '../prisma/recipes-curated';
import {
  validateRecipeDraft,
  type RecipeDraft,
} from '../src/recipe/recipe-draft';

const STAGING_PATH = join(
  process.cwd(),
  'prisma/staging/recipes-staging.json',
);

const CUISINES = ['HOME', 'WESTERN', 'JAPANESE', 'SICHUAN', 'LIGHT'] as const;
type CuisineKey = (typeof CUISINES)[number];

const CUISINE_LABEL: Record<CuisineKey, string> = {
  HOME: '家常',
  WESTERN: '西式',
  JAPANESE: '日式',
  SICHUAN: '川味',
  LIGHT: '轻食',
};

const TAGS = [
  'VEGETARIAN',
  'HIGH_PROTEIN',
  'LOW_CAL',
  'LOW_CARB',
  'QUICK',
  'RICE_FRIENDLY',
  'COMFORTING',
];

interface StagingFile {
  generatedAt: string | null;
  model: string | null;
  recipes: RecipeDraft[];
  rejected: { name: string; errors: string[] }[];
}

function loadStaging(): StagingFile {
  if (!existsSync(STAGING_PATH)) {
    return { generatedAt: null, model: null, recipes: [], rejected: [] };
  }
  return JSON.parse(readFileSync(STAGING_PATH, 'utf-8')) as StagingFile;
}

function saveStaging(staging: StagingFile) {
  mkdirSync(dirname(STAGING_PATH), { recursive: true });
  writeFileSync(STAGING_PATH, JSON.stringify(staging, null, 2) + '\n');
}

/** 从模型输出中提取 JSON 数组：strip markdown fence，截取首个 [ 到最后 ] */
function extractJsonArray(text: string): unknown[] {
  const cleaned = text.replace(/```(?:json)?/g, '');
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('输出中找不到 JSON 数组');
  }
  const parsed: unknown = JSON.parse(cleaned.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error('解析结果不是数组');
  return parsed;
}

function buildPrompt(
  cuisine: CuisineKey,
  count: number,
  existingNames: string[],
): string {
  // few-shot：优先取同菜系的人工精选示例
  const sameCuisine = CURATED_RECIPES.filter((r) => r.cuisine === cuisine);
  const examples = (sameCuisine.length > 0 ? sameCuisine : CURATED_RECIPES)
    .slice(0, 2)
    .map(({ name, ...rest }) => ({ ...rest, name: '示例菜名' }));

  return `你是中文菜谱内容编辑。请生成 ${count} 道「${CUISINE_LABEL[cuisine]}」菜谱，输出为 JSON 数组（不要输出任何其他文字）。

每道菜的字段（严格遵守）：
- name: 菜名（中文，禁止与下方黑名单重复）
- desc: 一句话描述（20 字以内，口语化）
- cuisine: 固定为 "${cuisine}"
- time: 烹饪总时长（分钟，整数，3-120）
- kcal / protein / carb / fat: 每份的估算营养（kcal 千卡，其余克）。必须满足 kcal ≈ 4*protein + 4*carb + 9*fat（偏差不超过 20%）
- img: 固定为空字符串 ""
- tags: 从白名单中选 0-3 个：${TAGS.join(', ')}（QUICK 仅当 time ≤ 15）
- ingredients: 至少 3 项，每项 { "name": "食材名", "amount": "用量（如 200g / 2个 / 适量）" }
- steps: 至少 3 条，每条一句话，口语化、可执行

要求：
- 菜名必须真实存在、常见，不编造黑暗料理
- 食材用量要具体合理，steps 与 ingredients 对应
- ${count} 道菜之间口味、主材尽量不重复

菜名黑名单（禁止使用）：${existingNames.join('、')}

输出格式示例（仅示意结构，不要照抄内容）：
${JSON.stringify(examples, null, 2)}`;
}

async function generateBatch(
  model: ReturnType<ReturnType<typeof createOpenAI>['chat']>,
  cuisine: CuisineKey,
  count: number,
  existingNames: string[],
): Promise<unknown[]> {
  const prompt = buildPrompt(cuisine, count, existingNames);
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { text } = await generateText({ model, prompt });
    try {
      return extractJsonArray(text);
    } catch (e) {
      console.warn(
        `  ⚠️ 第 ${attempt} 次解析失败（${(e as Error).message}）${attempt === 1 ? '，重试' : ''}`,
      );
    }
  }
  return [];
}

function parseArgs(argv: string[]) {
  const args = { perBatch: 8, batches: 1, only: null as CuisineKey[] | null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--per-batch') args.perBatch = Number(argv[++i]);
    else if (argv[i] === '--batches') args.batches = Number(argv[++i]);
    else if (argv[i] === '--only') {
      const list = (argv[++i] ?? '')
        .split(',')
        .map((s) => s.trim().toUpperCase());
      for (const c of list) {
        if (!CUISINES.includes(c as CuisineKey)) {
          throw new Error(`--only 含非法菜系: ${c}（可选：${CUISINES.join(', ')}）`);
        }
      }
      args.only = list as CuisineKey[];
    }
  }
  return args;
}

async function main() {
  const apiKey = process.env['OPENAI_API_KEY'];
  const modelName = process.env['MODEL_NAME'];
  if (!apiKey || !modelName) {
    throw new Error(
      '缺少 OPENAI_API_KEY 或 MODEL_NAME（在 apps/server/.env 中配置）',
    );
  }
  const model = createOpenAI({
    apiKey,
    baseURL: process.env['OPENAI_BASE_URL'],
  }).chat(modelName);

  const args = parseArgs(process.argv.slice(2));
  const staging = loadStaging();

  // 名称精确去重：人工精选 + staging 已有（ADR-0003 不上向量相似度）
  const seen = new Set([
    ...CURATED_RECIPES.map((r) => r.name),
    ...staging.recipes.map((r) => r.name),
  ]);

  const cuisines = args.only ?? [...CUISINES];
  let added = 0;
  let rejected = 0;
  let duplicated = 0;

  for (const cuisine of cuisines) {
    for (let batch = 1; batch <= args.batches; batch++) {
      console.log(
        `▶ 生成 ${CUISINE_LABEL[cuisine]}（${cuisine}）第 ${batch}/${args.batches} 批，每批 ${args.perBatch} 道…`,
      );
      const rawList = await generateBatch(
        model,
        cuisine,
        args.perBatch,
        [...seen],
      );
      if (rawList.length === 0) {
        console.warn('  ✗ 本批解析失败，整批跳过');
        continue;
      }
      for (const raw of rawList) {
        const result = validateRecipeDraft(raw);
        const name = (raw as Record<string, unknown>)['name'];
        if (!result.ok) {
          staging.rejected.push({
            name: typeof name === 'string' ? name : '(未知菜名)',
            errors: result.errors,
          });
          rejected++;
          continue;
        }
        const draft = raw as RecipeDraft;
        if (seen.has(draft.name)) {
          console.log(`  ⏭ 重复跳过：${draft.name}`);
          duplicated++;
          continue;
        }
        draft.img = ''; // 图片全走占位符策略
        seen.add(draft.name);
        staging.recipes.push(draft);
        added++;
        console.log(`  ✓ ${draft.name}`);
      }
    }
  }

  staging.generatedAt = new Date().toISOString();
  staging.model = modelName;
  saveStaging(staging);

  console.log(
    `\n完成：新增 ${added}，拒绝 ${rejected}，重复 ${duplicated}。staging 现有 ${staging.recipes.length} 道 → ${STAGING_PATH}`,
  );
  console.log('下一步：人工抽检 staging JSON，然后 pnpm db:seed 导入。');
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
