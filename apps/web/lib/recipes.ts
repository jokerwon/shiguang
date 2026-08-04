export interface Ingredient {
  name: string
  amount: string
}

export interface Recipe {
  id: string
  name: string
  /** 菜系 key，对应 CUISINE_LABELS */
  cuisine: string
  time: number
  kcal: number
  protein: number
  carb: number
  fat: number
  img: string
  /** 标签 key 数组，对应 PREF_LABELS */
  tags: string[]
  ingredients: Ingredient[]
  steps: string[]
  desc: string
}

export const CUISINES = ['home', 'western', 'japanese', 'sichuan', 'light']
export const PREFS = ['vegetarian', 'high-protein', 'low-cal', 'low-carb', 'quick', 'rice-friendly', 'comforting']
export const TIMES = ['le15', 'le30', 'any']

/** 菜系 key → 中文展示 */
export const CUISINE_LABELS: Record<string, string> = {
  home: '家常',
  western: '西餐',
  japanese: '日料',
  sichuan: '川菜',
  light: '轻食',
}

/** 偏好/标签 key → 中文展示 */
export const PREF_LABELS: Record<string, string> = {
  vegetarian: '素食',
  'high-protein': '高蛋白',
  'low-cal': '低卡',
  'low-carb': '低碳',
  quick: '快手',
  'rice-friendly': '下饭',
  comforting: '治愈系',
}

/** 烹饪时间 key → 中文展示 */
export const TIME_LABELS: Record<string, string> = {
  le15: '≤15分钟',
  le30: '≤30分钟',
  any: '不限',
}

// RECIPES 数据已迁移到数据库，通过 API 获取

/** 常见食材（点选添加到 pantry） */
export const SUGGEST_INGS: string[] = [
  '西红柿',
  '鸡蛋',
  '鸡肉',
  '豆腐',
  '土豆',
  '三文鱼',
  '意面',
  '牛油果',
]

export type ScreenId = 'home' | 'pantry' | 'chat' | 'saved' | 'filter' | 'detail'

export function norm(s: string) {
  return s.trim().toLowerCase()
}

/**
 * 将用户输入的食材文本归一到 canonical。
 * 优先匹配 SUGGEST_INGS，匹配不到则原样返回。
 */
export function resolveIng(text: string): string {
  const t = norm(text)
  const hit = SUGGEST_INGS.find((s) => norm(s) === t)
  return hit ?? text.trim()
}

/** 食材命中：norm 后双向 includes（与服务端推荐算法的硬过滤同语义） */
export function hasIng(pantry: string[], name: string): boolean {
  return pantry.some((p) => norm(name).includes(norm(p)) || norm(p).includes(norm(name)))
}

export function matchScore(recipe: Recipe, pantry: string[]) {
  if (pantry.length === 0) return { score: 0, have: [] as string[] }
  const have = recipe.ingredients.filter((i) => hasIng(pantry, i.name)).map((i) => i.name)
  return { score: Math.round((have.length / recipe.ingredients.length) * 100), have }
}

/** 缺料清单（ADR-0007）：pantry 中没有的食材，含用量。即时快照，不持久化 */
export function missingIngredients(recipe: Recipe, pantry: string[]): Ingredient[] {
  return recipe.ingredients.filter((i) => !hasIng(pantry, i.name))
}

export function matchRecipes(recipes: Recipe[], pantry: string[]) {
  return recipes
    .map((r) => ({ r, ...matchScore(r, pantry) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.r.time - b.r.time)
}
