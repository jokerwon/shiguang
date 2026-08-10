// 写工具的纯逻辑（W1.2）：从 tool() 包装中抽出，便于单测（无需导入 ai）。
// pantry 工具基于 findAll + replace 组合实现（PantryService 只有整体替换语义），
// 在工具层做去重与幂等：已存在的跳过、不存在的忽略，返回实际增删的条目供操作卡片渲染。
// set_favorite 用幂等 set 语义（toggle 对 AI 是危险的，ADR-0009）。
// update_preferences 只产出待确认草稿（ADR-0012 决策 3）：零写副作用，确认只认前端按钮。
import type { HealthGoal } from 'generated/prisma/client';
import type { ChatToolDeps } from './types';

const norm = (s: string) => s.trim();

/** add_pantry_items 纯逻辑：读-算-整体替换，幂等去重 */
export async function runAddPantryItems(
  deps: ChatToolDeps,
  userId: string,
  names: string[],
): Promise<{ added: string[]; pantry: string[] }> {
  const current = await deps.pantryFindAll(userId);
  const currentSet = new Set(current.map(norm));
  const toAdd = [
    ...new Set(names.map(norm).filter((n) => n && !currentSet.has(n))),
  ];
  if (toAdd.length === 0) return { added: [], pantry: current };
  const next = [...current, ...toAdd];
  const pantry = await deps.pantryReplace(userId, next);
  return { added: toAdd, pantry };
}

/** remove_pantry_items 纯逻辑：幂等，不存在的忽略 */
export async function runRemovePantryItems(
  deps: ChatToolDeps,
  userId: string,
  names: string[],
): Promise<{ removed: string[]; pantry: string[] }> {
  const current = await deps.pantryFindAll(userId);
  const removeSet = new Set(names.map(norm));
  const removed = current.filter((n) => removeSet.has(norm(n)));
  if (removed.length === 0) return { removed: [], pantry: current };
  const next = current.filter((n) => !removeSet.has(norm(n)));
  const pantry = await deps.pantryReplace(userId, next);
  return { removed, pantry };
}

/** set_favorite 纯逻辑：幂等 set */
export async function runSetFavorite(
  deps: ChatToolDeps,
  userId: string,
  recipeId: string,
  saved: boolean,
): Promise<{ saved: boolean; favorites: string[] }> {
  const favorites = await deps.favoriteSet(userId, recipeId, saved);
  return { saved, favorites };
}

/** update_preferences 输入：全可选但至少一项（execute 运行时校验） */
export interface UpdatePreferenceInput {
  addDisliked?: string[];
  removeDisliked?: string[];
  addAllergens?: string[];
  removeAllergens?: string[];
  setHealthGoal?: HealthGoal;
}

/** 待确认草稿 = 操作集（ADR-0012 决策 3：非目标快照，避免并行修改被静默覆盖） */
export interface PreferenceDraft {
  addDisliked?: string[];
  removeDisliked?: string[];
  addAllergens?: string[];
  removeAllergens?: string[];
  setHealthGoal?: HealthGoal;
}

/** 当前偏好快照（仅供卡片 diff 对照，不作确认依据） */
export interface PreferenceSnapshot {
  dislikedIngredients: string[];
  allergens: string[];
  healthGoal: HealthGoal;
}

function uniqueClean(list: string[]): string[] {
  return [...new Set(list.map(norm).filter(Boolean))];
}

/**
 * update_preferences 纯逻辑：只产出草稿，零写副作用。
 * 归一化：add 取「输入 − 当前」，remove 取「输入 ∩ 当前」；归一后全空 → note 说明已一致。
 * 全字段缺省 → throw（拒绝空操作集，AI 端以工具错误呈现，D2 如实告知）。
 * 读当前偏好（preferenceFind）仅作快照，未确认不落库由「工具无写能力」架构保证（E4）。
 */
export async function runUpdatePreferences(
  deps: ChatToolDeps,
  userId: string,
  input: UpdatePreferenceInput,
): Promise<{
  draft: PreferenceDraft;
  current: PreferenceSnapshot;
  note?: string;
}> {
  const hasAny =
    input.addDisliked?.length ||
    input.removeDisliked?.length ||
    input.addAllergens?.length ||
    input.removeAllergens?.length ||
    input.setHealthGoal;
  if (!hasAny) throw new Error('未指定任何偏好变更，请明确要改什么');

  const current = (await deps.preferenceFind(userId)) ?? {
    dislikedIngredients: [],
    allergens: [],
    healthGoal: 'BALANCED',
  };

  // add 幂等：已存在的跳过；remove 幂等：不存在的忽略
  const addOps = (existing: string[], incoming?: string[]) =>
    uniqueClean(incoming ?? []).filter((n) => !existing.map(norm).includes(n));
  const removeOps = (existing: string[], incoming?: string[]) => {
    const remove = new Set(uniqueClean(incoming ?? []));
    return existing.filter((n) => remove.has(norm(n)));
  };

  const draft: PreferenceDraft = {};
  const addDisliked = addOps(current.dislikedIngredients, input.addDisliked);
  const removeDisliked = removeOps(
    current.dislikedIngredients,
    input.removeDisliked,
  );
  const addAllergens = addOps(current.allergens, input.addAllergens);
  const removeAllergens = removeOps(current.allergens, input.removeAllergens);
  if (addDisliked.length) draft.addDisliked = addDisliked;
  if (removeDisliked.length) draft.removeDisliked = removeDisliked;
  if (addAllergens.length) draft.addAllergens = addAllergens;
  if (removeAllergens.length) draft.removeAllergens = removeAllergens;
  if (input.setHealthGoal) draft.setHealthGoal = input.setHealthGoal;

  const isEmpty =
    !draft.addDisliked &&
    !draft.removeDisliked &&
    !draft.addAllergens &&
    !draft.removeAllergens &&
    !draft.setHealthGoal;

  return isEmpty
    ? { draft, current, note: '当前偏好已是该状态，无需变更' }
    : { draft, current };
}
