// 食材资料发布校验（ADR-0018）：审核文件是发布输入，本函数是发布闸门。
// 纯函数、无框架依赖：导入脚本与回归测试共用，避免测试只验证解析格式。
//
// 最低标准：明确名称、经人工审核的简介、可核查参考来源、维护者复核标记；
// 过敏原关系必须带可核查依据。不满足即拒绝，不发布空壳。
// `rawNames` 允许为空——食材收录不依赖菜谱存在（ADR-0018 §1），
// 独立条目只影响当归一时能否命中，不影响发布。
export interface PublishCandidate {
  name: string;
  summary: string;
  sources: string[];
  rawNames: string[];
  /** 维护者逐条复核时间；缺失即未复核，不予发布 */
  reviewedAt?: string;
  allergens?: { allergen: string; source: string }[];
}

export function validateReviewedIngredient(item: PublishCandidate): string[] {
  const errors: string[] = [];
  if (!item.name?.trim()) errors.push('缺少名称');
  if (!item.summary?.trim()) errors.push('缺少经人工审核的简介');
  if (!item.sources?.length) errors.push('缺少可核查参考来源');
  if (!item.reviewedAt?.trim()) errors.push('缺少维护者复核时间（reviewedAt）');
  for (const a of item.allergens ?? []) {
    if (!a.allergen?.trim()) errors.push('过敏原缺少名称');
    if (!a.source?.trim()) errors.push(`过敏原「${a.allergen}」缺少可核查依据`);
  }
  return errors;
}
