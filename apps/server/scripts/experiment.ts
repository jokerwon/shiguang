// Phase 10 离线实验入口（实施清单 A/B/C/D 组）。
//
// 用法（在 apps/server 下运行）：
//   pnpm experiment:snapshot                       # 从数据库导出冻结菜谱快照（一次性）
//   pnpm experiment:run                            # 只跑候选/基线/边界，不调用 Jev
//   pnpm experiment:run -- --execute               # 真实调用 Jev（付费，需另行授权）
//   pnpm experiment:run -- --execute --only dev-hot-rice-bowl
//   pnpm experiment:blind -- --run experiments/phase-10/runs/<id>/results.json
//   pnpm experiment:review -- --run <results.json> --blind <blind-material.json> \
//       --reveal <reveal.json> --reviews <reviews.json>
//
// 选项：`--execute` 才构造客户端并发起付费请求；`--model` 显式指定代理环境下的模型名（默认 jev-1.13.0）；
//   `--budget-usd` 覆盖总预算上限（默认 US$10）；`--timeout` 单次请求超时毫秒；`--rpm` 主动限流（默认 90/分钟，
//   代理限速 100/分钟）；`--only` / `--out` 见上。SDK 重试上限 1（仅网络错误/限速/5xx）。
//
// 边界：不修改共享排序、在线 search_recipes、首页、HTTP、聊天模型或 schema；
// 凭证只从服务端环境变量读取，不写入任何工件；付费请求只在显式 --execute 下发生。
import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { PrismaClient } from '../generated/prisma/client';
import {
  buildCandidates,
  factsOf,
  parseSnapshot,
  type FrozenSnapshot,
  type ScenarioCandidates,
} from '../src/experiment/candidates';
import {
  DEV_SCENARIOS,
  EDGE_SCENARIOS,
  FROZEN_NOW,
  MAIN_SCENARIOS,
  SCENARIOS,
  type Scenario,
} from '../src/experiment/scenarios';
import {
  JEV_MODEL,
  buildQuestions,
  buildState,
  checkRerankInvariants,
  rerank,
  type CandidateJudgement,
} from '../src/experiment/jev';
import {
  buildBlindMaterial,
  renderBlindMarkdown,
  tally,
  type BlindEntry,
  type EdgeObservation,
  type RevealMap,
  type Review,
  type ScenarioRun,
} from '../src/experiment/evaluation';

const ROOT = join(process.cwd(), 'experiments/phase-10');
const SNAPSHOT_PATH = join(ROOT, 'snapshot.json');
/** 官方 jev-1.13.0 输入单价（US$/百万 token，输出免费）；代理环境可用环境变量覆盖 */
const DEFAULT_INPUT_PRICE_PER_MTOK = 0.042;
const DEFAULT_BUDGET_USD = 10;

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(name);

function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (e) {
    throw new Error(`读取 ${path} 失败：${e instanceof Error ? e.message : String(e)}`);
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function loadSnapshot(): FrozenSnapshot {
  return parseSnapshot(readFileSync(SNAPSHOT_PATH, 'utf8'));
}

/** 从数据库导出冻结快照：菜谱完整事实 + 原料身份/别名/过敏原关系（不写凭证） */
async function snapshot(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL 未设置（apps/server/.env）');
  const prisma = new PrismaClient({ adapter: new PrismaPg(url) });
  try {
    const recipes = await prisma.recipe.findMany({
      // 固定顺序（按名称）是冻结输入的一部分：重放得到相同候选与基线顺序
      orderBy: { name: 'asc' },
      include: {
        ingredientLinks: {
          include: {
            // 只取身份/别名/过敏原关系（与 RecipeIngredientLinkRow 同形），
            // 不把 Ingredient 的审核资料重复写进每条关联行
            ingredient: {
              select: {
                id: true,
                name: true,
                category: true,
                aliases: { select: { alias: true } },
                allergens: { select: { allergen: true } },
              },
            },
          },
        },
      },
    });
    const frozen: FrozenSnapshot = {
      frozenAt: FROZEN_NOW.toISOString(),
      source: 'apps/server/prisma（Recipe + RecipeIngredient + Ingredient/Alias/Allergen）',
      recipes,
    };
    // 紧凑 JSON：快照是生成工件，可读版本由场景文件与评审材料承担
    mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(frozen)}\n`);
    const ingredients = new Set(
      recipes.flatMap((r) => r.ingredientLinks.map((l) => l.ingredient.id)),
    );
    console.log(
      `✅ 冻结快照已写入 ${SNAPSHOT_PATH}：${recipes.length} 道菜谱，${ingredients.size} 个稳定身份`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

interface Budget {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

/** 边界场景判定：按预先固定的期望核对实际观察，不把控制模拟当作服务证据 */
function edgeObservation(
  scenario: Scenario,
  built: ScenarioCandidates,
  extra: {
    modelCalled: boolean;
    failures: string[];
    paused: boolean;
    hasJevTop4: boolean;
    executed: boolean;
  },
): EdgeObservation {
  const count = built.candidates.length;
  const note = built.note ?? '';
  const observed = {
    candidates: count,
    modelCalled: extra.modelCalled,
    note,
    ...(built.error ? { error: built.error } : {}),
    ...(extra.failures.length ? { failures: extra.failures.join(' | ') } : {}),
    paused: extra.paused,
  };
  if (
    !extra.executed &&
    (scenario.expect === 'service-failure' || scenario.expect === 'budget-pause')
  ) {
    // 这两个边界只在真实调用路径下成立；未执行时如实记为未执行，不冒充通过
    return {
      expect: scenario.expect,
      passed: false,
      observed: { ...observed, notRun: true },
    };
  }
  switch (scenario.expect) {
    case 'empty':
      return { expect: 'empty', passed: count === 0 && !extra.modelCalled, observed };
    case 'insufficient':
      return {
        expect: 'insufficient',
        passed: count > 0 && count < 4 && !extra.modelCalled,
        observed,
      };
    case 'clarify':
      return { expect: 'clarify', passed: !extra.modelCalled, observed };
    case 'safety-excluded':
      return {
        expect: 'safety-excluded',
        passed: count === 0 && note.includes('安全设置被排除'),
        observed,
      };
    case 'allergen-unknown':
      return {
        expect: 'allergen-unknown',
        passed: count === 0 && note.includes('成分信息尚不完整'),
        observed,
      };
    case 'service-failure':
      return {
        expect: 'service-failure',
        passed: extra.failures.length > 0 && !extra.hasJevTop4,
        observed,
      };
    case 'budget-pause':
      return {
        expect: 'budget-pause',
        passed: extra.paused && !extra.modelCalled,
        observed,
      };
    default:
      return { expect: 'none', passed: true, observed };
  }
}

async function run(): Promise<void> {
  if (MAIN_SCENARIOS.length !== 30) {
    throw new Error(`主评估场景必须固定为 30 个，当前 ${MAIN_SCENARIOS.length} 个`);
  }
  const snapshotData = loadSnapshot();
  const execute = flag('--execute');
  const only = arg('--only')
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const targets = only
    ? SCENARIOS.filter((s) => only.includes(s.id))
    : SCENARIOS;
  if (!targets.length) throw new Error('--only 没有匹配到任何场景');
  const model = arg('--model') ?? JEV_MODEL;
  const budgetUsd = Number(arg('--budget-usd') ?? DEFAULT_BUDGET_USD);
  /** 预算暂停边界用 0 预算实跑守卫；其余场景共用总预算 */
  const pauseBudgetUsd = 0;
  const pricePerMTok = Number(
    process.env['PHASE10_INPUT_PRICE_PER_MTOK'] ?? DEFAULT_INPUT_PRICE_PER_MTOK,
  );
  const timeout = Number(arg('--timeout') ?? 20000);
  /** 每分钟请求上限（代理公开限速 100/分钟，留出余量） */
  const rpm = Number(arg('--rpm') ?? 90);

  const apiKey = process.env['TYPESAFE_API_KEY'];
  if (execute && !apiKey) {
    throw new Error('缺少 TYPESAFE_API_KEY（仅经服务端环境变量提供）');
  }
  const client = execute
    ? new TypeSafeClient({
        apiKey,
        ...(process.env['TYPESAFE_BASE_URL']
          ? { baseURL: process.env['TYPESAFE_BASE_URL'] }
          : {}),
        defaultModel: model,
        logLevel: 'off',
      })
    : null;

  const budget: Budget = {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
  };
  const results: ScenarioRun[] = [];
  /** 上次请求时刻，用于跨场景限流 */
  let lastRequestAt = 0;

  for (const scenario of targets) {
    const usageBefore = { ...budget };
    const built = await buildCandidates(snapshotData, scenario, FROZEN_NOW);
    const facts = built.candidates.flatMap((c) => {
      const fact = factsOf(snapshotData, c.id);
      return fact ? [fact] : [];
    });
    const baselineTop4 = built.baselineTop4.map((c) => c.id);
    const scenarioRun: ScenarioRun = {
      scenarioId: scenario.id,
      kind: scenario.kind,
      request: scenario.request,
      candidates: built.candidates.map((c) => c.id),
      facts,
      baselineTop4,
      ...(built.error ? { error: built.error } : {}),
      ...(built.note ? { note: built.note } : {}),
    };

    const failures: string[] = [];
    const judgements: CandidateJudgement[] = [];
    let paused = false;
    let modelCalled = false;
    let violations: string[] = [];

    // 不足 4 道无法形成两组前 4 对照，矛盾需求不猜：都不发模型请求
    const skipModel = scenario.expect === 'clarify' || built.candidates.length < 4;
    const scenarioBudgetUsd =
      scenario.expect === 'budget-pause' ? pauseBudgetUsd : budgetUsd;

    if (execute && !skipModel) {
      for (const candidate of built.candidates) {
        const fact = factsOf(snapshotData, candidate.id);
        if (!fact) {
          failures.push(`快照缺少候选事实：${candidate.id}`);
          break;
        }
        const state = buildState(scenario, fact);
        // 保守上界：按 1 token/字符估算本次请求，超出预算即暂停
        const estimate = (state.length / 1_000_000) * pricePerMTok;
        if (budget.estimatedCostUsd + estimate > scenarioBudgetUsd) {
          paused = true;
          failures.push(
            `预算暂停：已估算 US$${budget.estimatedCostUsd.toFixed(4)}，本次约 US$${estimate.toFixed(4)}，上限 US$${scenarioBudgetUsd}`,
          );
          break;
        }
        if (scenario.expect === 'service-failure') {
          failures.push('服务失败（确定性控制触发，非真实服务证据）：模拟连接错误');
          break;
        }
        try {
          // 代理限速 100 次/分钟：按 --rpm 主动限流，避免用重试掩盖限速
          const minIntervalMs = Math.ceil(60_000 / rpm);
          const waitMs = minIntervalMs - (Date.now() - lastRequestAt);
          if (waitMs > 0) await sleep(waitMs);
          modelCalled = true;
          lastRequestAt = Date.now();
          const startedAt = Date.now();
          // SDK 重试上限 1（仅网络错误/限速/5xx，最多多一次请求）；限速由上面的节流提前规避
          const result = await client!.systemOne(
            { state, questions: buildQuestions(scenario.soft), model },
            { retry: { maxRetries: 1, backoffMaxMs: 10_000 }, timeout },
          );
          const elapsedMs = Date.now() - startedAt;
          budget.requests += 1;
          budget.inputTokens += result.usage.input_tokens;
          budget.outputTokens += result.usage.output_tokens;
          budget.estimatedCostUsd =
            (budget.inputTokens / 1_000_000) * pricePerMTok;
          judgements.push({
            recipeId: candidate.id,
            adequacy: result.answers.adequacy.choice,
            score: result.answers.match.score,
            elapsedMs,
            raw: { model: result.model, answers: result.answers, usage: result.usage },
          });
        } catch (e) {
          failures.push(`服务失败：${e instanceof Error ? e.message : String(e)}`);
          break;
        }
      }
    }

    // 本场景的用量与费用增量（预算对象是跨场景累计的）
    const usage = {
      requests: budget.requests - usageBefore.requests,
      inputTokens: budget.inputTokens - usageBefore.inputTokens,
      outputTokens: budget.outputTokens - usageBefore.outputTokens,
    };
    const estimatedCostUsd = budget.estimatedCostUsd - usageBefore.estimatedCostUsd;
    const controlled = scenario.expect === 'service-failure';

    // 判断不完整（服务失败/预算暂停）时不算排序结果：不把服务失败冒充成硬约束违规
    if (
      built.candidates.length > 0 &&
      judgements.length === built.candidates.length &&
      failures.length === 0
    ) {
      const order = rerank(
        built.candidates.map((c) => c.id),
        judgements,
      );
      violations = checkRerankInvariants(
        built.candidates.map((c) => c.id),
        judgements,
        order,
      );
      scenarioRun.jevTop4 = order.slice(0, 4);
      scenarioRun.jev = {
        model,
        judgements,
        failures,
        violations,
        usage,
        estimatedCostUsd,
        ...(controlled ? { controlled: true } : {}),
      };
    } else if (judgements.length || failures.length) {
      scenarioRun.jev = {
        model,
        judgements,
        failures,
        violations,
        usage,
        estimatedCostUsd,
        ...(controlled ? { controlled: true } : {}),
      };
    }

    if (scenario.kind === 'edge') {
      scenarioRun.edge = edgeObservation(scenario, built, {
        modelCalled,
        failures,
        paused,
        hasJevTop4: Boolean(scenarioRun.jevTop4?.length),
        executed: execute,
      });
    }

    results.push(scenarioRun);
    let label = '候选';
    if (scenario.kind === 'edge') {
      if (scenarioRun.edge?.passed) label = '边界通过';
      else if (scenarioRun.edge?.observed.notRun) label = '边界未执行';
      else label = '边界未通过';
    }
    console.log(
      `- ${scenario.id}（${scenario.kind}）：候选 ${built.candidates.length} 道｜基线前 4 ${baselineTop4.length} 道｜${label}` +
        (scenarioRun.jevTop4?.length ? `｜Jev 前 4 ${scenarioRun.jevTop4.length} 道` : '') +
        (failures.length ? `｜${failures[0]}` : ''),
    );
  }

  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  const outDir = arg('--out') ?? join(ROOT, 'runs', stamp);
  const record = {
    runId: stamp,
    executed: execute,
    model,
    frozenNow: FROZEN_NOW.toISOString(),
    snapshotFrozenAt: snapshotData.frozenAt,
    budgetUsd,
    pricePerMTok,
    priceSource:
      process.env['PHASE10_INPUT_PRICE_PER_MTOK'] != null
        ? '环境变量 PHASE10_INPUT_PRICE_PER_MTOK'
        : `官方 jev-1.13.0 输入价 US$${DEFAULT_INPUT_PRICE_PER_MTOK}/百万 token（估算依据，非账单）`,
    results,
  };
  writeJson(join(outDir, 'results.json'), record);
  console.log(
    `\n${execute ? '已执行' : '未调用 Jev（默认；加 --execute 才付费调用）'}：${results.length} 个场景 → ${join(outDir, 'results.json')}`,
  );
  if (execute) {
    console.log(
      `请求 ${budget.requests} 次，输入 ${budget.inputTokens} token，费用估算 US$${budget.estimatedCostUsd.toFixed(4)}（估算，非账单）`,
    );
  }
}

function blind(): void {
  const runPath = arg('--run');
  if (!runPath) throw new Error('缺少 --run <results.json>');
  const record = readJson<{ results: ScenarioRun[] }>(runPath);
  const { material, reveal } = buildBlindMaterial(record.results);
  if (!material.length) {
    throw new Error('运行记录里没有已完成 Jev 判断的主场景，无法生成评审材料');
  }
  const outDir = arg('--out') ?? dirname(runPath);
  writeJson(join(outDir, 'blind-material.json'), material);
  writeFileSync(join(outDir, 'blind-material.md'), renderBlindMarkdown(material));
  writeJson(join(outDir, 'reveal.json'), reveal);
  writeJson(
    join(outDir, 'reviews.template.json'),
    material.map((m: BlindEntry) => ({ scenarioId: m.scenarioId, verdict: null })),
  );
  console.log(
    `✅ 匿名材料 ${material.length} 个场景 → ${outDir}（blind-material.md / blind-material.json / reveal.json / reviews.template.json）`,
  );
  console.log('   揭盲映射与评审材料分离：评审完成前不要把 reveal.json 交给评审者。');
}

function review(): void {
  const runPath = arg('--run');
  const blindPath = arg('--blind');
  const revealPath = arg('--reveal');
  const reviewsPath = arg('--reviews');
  if (!runPath || !blindPath || !revealPath || !reviewsPath) {
    throw new Error('缺少 --run / --blind / --reveal / --reviews 之一');
  }
  const record = readJson<{ results: ScenarioRun[] }>(runPath);
  const material = readJson<BlindEntry[]>(blindPath);
  const reveal = readJson<RevealMap>(revealPath);
  const reviews = readJson<Review[]>(reviewsPath);
  // 人工编辑过的输入在信任边界上校验形状，避免静默算出错误结论
  if (!Array.isArray(record?.results)) throw new Error(`${runPath} 缺少 results 数组`);
  if (!Array.isArray(material)) throw new Error(`${blindPath} 应为场景数组`);
  if (!Array.isArray(reviews)) throw new Error(`${reviewsPath} 应为评审数组`);
  if (!reveal || typeof reveal !== 'object') {
    throw new Error(`${revealPath} 应为揭盲映射对象`);
  }
  const hardViolations = record.results.flatMap((r) => r.jev?.violations ?? []);
  const report = tally({
    mainScenarioIds: MAIN_SCENARIOS.map((s) => s.id),
    edgeScenarioIds: EDGE_SCENARIOS.map((s) => s.id),
    runs: record.results,
    reveal,
    reviews,
    hardViolations,
  });
  const outDir = arg('--out') ?? dirname(runPath);
  writeJson(join(outDir, 'report.json'), {
    ...report,
    mainScenarios: MAIN_SCENARIOS.length,
    devScenarios: DEV_SCENARIOS.length,
    edgeScenarios: EDGE_SCENARIOS.length,
    reviewedScenarios: material.length,
    conclusionSource: '真实运行记录 + 用户人工盲评（不由代理代评）',
  });
  console.log(
    `结论：${report.exit}｜胜 ${report.wins} / 平 ${report.ties} / 负 ${report.losses}｜净胜 ${report.netWins}（门槛 ${6}）`,
  );
  for (const reason of report.reasons) console.log(`- ${reason}`);
  if (!report.complete || report.edgeNotRun.length) {
    console.log(
      `- 缺口：缺运行 ${report.missingRuns.length}、服务失败 ${report.failedRuns.length}、缺评审 ${report.missingReviews.length}、无效评审 ${report.invalidReviews.length}、边界未执行 ${report.edgeNotRun.length}`,
    );
  }
  console.log(`→ ${join(outDir, 'report.json')}`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === 'snapshot') await snapshot();
  else if (command === 'run') await run();
  else if (command === 'blind') blind();
  else if (command === 'review') review();
  else
    throw new Error(
      '用法：tsx scripts/experiment.ts <snapshot|run|blind|review> [选项]',
    );
}

void main().catch((e: unknown) => {
  console.error(`❌ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
