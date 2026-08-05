// 写工具的纯逻辑（W1.2）：从 tool() 包装中抽出，便于单测（无需导入 ai）。
// pantry 工具基于 findAll + replace 组合实现（PantryService 只有整体替换语义），
// 在工具层做去重与幂等：已存在的跳过、不存在的忽略，返回实际增删的条目供操作卡片渲染。
// set_favorite 用幂等 set 语义（toggle 对 AI 是危险的，ADR-0009）。
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
