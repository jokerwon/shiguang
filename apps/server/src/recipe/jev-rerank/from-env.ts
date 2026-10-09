// 从服务端环境变量构造重排客户端（ADR-0020 决策 5/6/7）。
//
// 凭证只从环境变量读取，不落盘、不入日志。未启用或凭证不全时返回 undefined：
// 搜索保持基线顺序，启动不受影响。模型名必须显式给出——代理路由名与官方版本名不同，
// 在代码里硬编码任何一个都会在另一套环境上静默失败。
import { TypeSafeClient } from '@typesafe-ai/sdk';
import {
  JevRerankClient,
  TypeSafeJudge,
  type RerankClient,
  type RerankMode,
} from './client';

export interface RerankEnv {
  [key: string]: string | undefined;
}

/** 官方 jev-1.13.0 输入单价（US$/百万 token）；代理环境可用环境变量覆盖 */
const DEFAULT_PRICE_PER_MTOK = 0.042;

function num(env: RerankEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function modeOf(env: RerankEnv): RerankMode {
  const raw = (env['JEV_RERANK_MODE'] ?? 'off').trim().toLowerCase();
  return raw === 'shadow' || raw === 'live' ? raw : 'off';
}

/**
 * 构造客户端。`log` 用于报告「已要求启用但缺少配置」（配置错误不能静默变成
 * 「功能没生效」，也不能让服务启动失败）与每次重排的观测结果。
 */
export interface RerankLog {
  warn(message: string): void;
  info(message: string): void;
}

export function createRerankClient(
  env: RerankEnv,
  log?: RerankLog,
): RerankClient | undefined {
  const mode = modeOf(env);
  if (mode === 'off') return undefined;

  const apiKey = env['TYPESAFE_API_KEY']?.trim();
  const model = env['JEV_RERANK_MODEL']?.trim();
  const missing = [
    ...(apiKey ? [] : ['TYPESAFE_API_KEY']),
    ...(model ? [] : ['JEV_RERANK_MODEL']),
  ];
  if (missing.length > 0) {
    log?.warn(
      `JEV_RERANK_MODE=${mode} 但缺少 ${missing.join('、')}，候选重排序保持关闭（回退基线顺序）`,
    );
    return undefined;
  }

  const baseURL = env['TYPESAFE_BASE_URL']?.trim();
  const client = new TypeSafeClient({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    defaultModel: model,
    logLevel: 'off',
  });

  const judge = new TypeSafeJudge(client, {
    model,
    // 仅网络错误/限速/5xx 重试一次；限速由令牌桶提前规避
    retry: { maxRetries: 1, backoffMaxMs: 10_000 },
  });

  return new JevRerankClient(judge, {
    mode,
    rolloutPercent: num(env, 'JEV_RERANK_ROLLOUT_PERCENT', 0),
    maxCandidates: num(env, 'JEV_RERANK_MAX_CANDIDATES', 12),
    timeoutMs: num(env, 'JEV_RERANK_TIMEOUT_MS', 2000),
    rpm: num(env, 'JEV_RERANK_RPM', 90),
    budgetUsd: num(env, 'JEV_RERANK_BUDGET_USD', 0),
    pricePerMTok: num(env, 'JEV_RERANK_PRICE_PER_MTOK', DEFAULT_PRICE_PER_MTOK),
    // 观测（ADR-0020 决策 8）：候选池、调用数、墙钟耗时、是否生效、降级原因、失败数；
    // 影子模式额外记录「基线前 N vs 重排前 N」的差异——这才是影子阶段要看的对照
    onOutcome: (o, req) => {
      log?.info(
        `候选重排 候选池=${o.candidates} 调用=${o.requests} 耗时=${o.durationMs}ms 生效=${o.applied}${o.reason ? ` 原因=${o.reason}` : ''} 失败=${o.failures}`,
      );
      if (o.reason === 'shadow') {
        const head = (ids: string[]) =>
          ids
            .slice(0, req.limit)
            .map((id) => req.candidates.find((c) => c.id === id)?.name ?? id)
            .join('、');
        log?.info(
          `影子对比 前${req.limit}｜基线：${head(req.candidates.map((c) => c.id))}｜重排：${head(o.order)}`,
        );
      }
    },
  });
}
