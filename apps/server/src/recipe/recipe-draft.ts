// 菜谱草稿校验（ADR-0003）：AI 生成结果进入 staging 待审区前的质量闸门。
// 纯函数、运行时零依赖（仅 import type 引用 Prisma 枚举），
// 供 scripts/generate-recipes.ts 与 prisma/seed.ts 共用。
import type { Cuisine, Tag } from 'generated/prisma/client';

export type RecipeDraft = {
  name: string;
  desc: string;
  cuisine: Cuisine;
  time: number;
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  img: string;
  tags: Tag[];
  ingredients: { name: string; amount: string }[];
  steps: string[];
};

// 与 prisma/schema.prisma 的 Cuisine / Tag 枚举保持一致（校验用值清单）
const CUISINES = ['HOME', 'WESTERN', 'JAPANESE', 'SICHUAN', 'LIGHT'] as const;
const TAGS = [
  'VEGETARIAN',
  'HIGH_PROTEIN',
  'LOW_CAL',
  'LOW_CARB',
  'QUICK',
  'RICE_FRIENDLY',
  'COMFORTING',
] as const;

export interface DraftValidation {
  ok: boolean;
  errors: string[];
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * 校验一条 AI 生成的菜谱草稿。通过时不代表已归一化（如 img），
 * 调用方负责把 img 归一为 ''（图片全走占位符策略）。
 */
export function validateRecipeDraft(raw: unknown): DraftValidation {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['不是对象'] };
  }
  const r = raw as Record<string, unknown>;

  if (!isNonEmptyString(r['name'])) errors.push('name 缺失或为空');
  if (!isNonEmptyString(r['desc'])) errors.push('desc 缺失或为空');

  if (!CUISINES.includes(r['cuisine'] as (typeof CUISINES)[number])) {
    errors.push(`cuisine 非法: ${String(r['cuisine'])}`);
  }

  if (!Array.isArray(r['tags'])) {
    errors.push('tags 不是数组');
  } else {
    const bad = r['tags'].filter(
      (t) => !TAGS.includes(t as (typeof TAGS)[number]),
    );
    if (bad.length > 0) errors.push(`tags 含非法值: ${bad.join(', ')}`);
  }

  if (!isFiniteNumber(r['time']) || r['time'] < 3 || r['time'] > 120) {
    errors.push(`time 越界 [3,120]: ${String(r['time'])}`);
  }
  if (!isFiniteNumber(r['kcal']) || r['kcal'] < 50 || r['kcal'] > 1200) {
    errors.push(`kcal 越界 [50,1200]: ${String(r['kcal'])}`);
  }
  for (const key of ['protein', 'carb', 'fat'] as const) {
    const v = r[key];
    if (!isFiniteNumber(v) || v < 0 || v > 150) {
      errors.push(`${key} 越界 [0,150]: ${String(v)}`);
    }
  }

  // 营养合理性：kcal 应约等于 4*protein + 4*carb + 9*fat（估算偏差 ≤30%）
  if (
    isFiniteNumber(r['kcal']) &&
    isFiniteNumber(r['protein']) &&
    isFiniteNumber(r['carb']) &&
    isFiniteNumber(r['fat']) &&
    r['kcal'] > 0
  ) {
    const estimate = 4 * r['protein'] + 4 * r['carb'] + 9 * r['fat'];
    const deviation = Math.abs(r['kcal'] - estimate) / r['kcal'];
    if (deviation > 0.3) {
      errors.push(
        `kcal(${r['kcal']}) 与宏量营养素估算(${Math.round(estimate)}) 偏差 ${Math.round(deviation * 100)}%`,
      );
    }
  }

  if (!Array.isArray(r['ingredients']) || r['ingredients'].length < 3) {
    errors.push('ingredients 少于 3 项');
  } else {
    const bad = r['ingredients'].some(
      (i) =>
        typeof i !== 'object' ||
        i === null ||
        !isNonEmptyString((i as Record<string, unknown>)['name']) ||
        !isNonEmptyString((i as Record<string, unknown>)['amount']),
    );
    if (bad) errors.push('ingredients 存在 name/amount 为空的项');
  }

  if (!Array.isArray(r['steps']) || r['steps'].length < 3) {
    errors.push('steps 少于 3 条');
  } else if (r['steps'].some((s) => !isNonEmptyString(s))) {
    errors.push('steps 存在空步骤');
  }

  return { ok: errors.length === 0, errors };
}
