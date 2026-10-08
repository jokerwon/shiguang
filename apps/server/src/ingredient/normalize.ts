// 食材归一与按食材筛选的纯逻辑（Phase 8-1 / ADR-0018）：无框架依赖，便于单测。
//
// 职责：
// - 归一：菜谱自由文本原料名 → 稳定食材身份；命中不了或指向多个身份时明确报出，不猜测。
// - 全部包含：选中多个食材时要求菜谱同时包含全部身份（允许还有其他原料）。

/**
 * 整理原料名：去空白、统一全角括号，并剥离尾部括号说明。
 * 「牛排（西冷或眼肉）」与「意面（如spaghetti）」的括号是来源说明而非身份的一部分，
 * 正文要求保留说明但按「牛排」「意面」关联；不在这里猜「是 A 还是 B」，
 * 备选关系写进 note 供人阅读，身份只按主名。
 */
export function splitIngredientNote(rawName: string): {
  name: string;
  note: string | null;
} {
  const text = rawName.trim().replace(/（/g, '(').replace(/）/g, ')');
  const match = text.match(/^(.*?)\((.+)\)$/);
  if (!match) return { name: text, note: null };
  const base = (match[1] ?? '').trim();
  const note = (match[2] ?? '').trim();
  if (!base || !note) return { name: text, note: null };
  return { name: base, note };
}

/** 归一键：身份比较统一用剥离说明后的主体名 */
export function normalizeIngredientText(raw: string): string {
  return splitIngredientNote(raw).name;
}

/**
 * 关联行 → 展示写法：`note` 已在展示名里时不重复补括号。
 * 与 Web 详情的渲染规则一致（ADR-0019：正文只剩关联行一份）。
 */
export function displayIngredientName(
  name: string,
  note: string | null,
): string {
  return note && !name.includes(note) ? `${name}（${note}）` : name;
}

/** 资料条目提供的最小结构化形状（避免与 Prisma 类型耦合） */
export interface IngredientCatalogEntry {
  name: string;
  rawNames: string[];
}

/** 归一索引要覆盖的写法：规范名本身 + 条目声明的库内写法 */
function indexKeys(entry: IngredientCatalogEntry): string[] {
  // 规范名必须可解析：生成侧选材白名单只给规范名，若索引不认它，
  // 完全按白名单生成的草稿反而会在发布时被判「未收录」。
  return [entry.name, ...entry.rawNames].map(normalizeIngredientText);
}

/** 把「菜谱原料写法 → 身份」的归一表建立起来（重复写法不覆盖，交由调用方查歧义） */
export function buildRawIndex<T extends IngredientCatalogEntry>(
  entries: T[],
): Map<string, T> {
  const index = new Map<string, T>();
  for (const entry of entries) {
    for (const key of indexKeys(entry)) {
      index.set(key, entry);
    }
  }
  return index;
}

/**
 * 找出指向多个身份的原料写法（归一歧义必须先解决，不能静默取一个）。
 * 同一对身份可能由多条写法触发，按消息去重，避免导入报错里重复同一句话。
 */
export function findAmbiguousRawNames<T extends IngredientCatalogEntry>(
  entries: T[],
): string[] {
  const seen = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const entry of entries) {
    for (const key of indexKeys(entry)) {
      const prev = seen.get(key);
      if (prev && prev !== entry.name) {
        ambiguous.add(`「${key}」同时指向「${prev}」与「${entry.name}」`);
        continue;
      }
      seen.set(key, entry.name);
    }
  }
  return [...ambiguous];
}

export interface RecipeIngredientLink {
  recipeId: string;
  ingredientId: string;
  name: string;
  amount: string;
  note: string | null;
  position: number;
}

/**
 * 把一道菜谱的原始原料数组归一为关联数据。
 * 返回 `rejected` 非空表示该菜谱存在无法归一的原料，调用方必须报错而不是跳过。
 */
export function buildRecipeIngredientLinks(
  rawIngredients: { name: string; amount: string }[],
  rawIndex: Map<string, IngredientCatalogEntry>,
  idByName: Map<string, string>,
  recipeId = '',
): { links: RecipeIngredientLink[]; rejected: string[] } {
  const links: RecipeIngredientLink[] = [];
  const rejected: string[] = [];
  rawIngredients.forEach((raw, position) => {
    if (!raw?.name) {
      rejected.push(`第 ${position + 1} 项缺少原料名`);
      return;
    }
    const { name, note } = splitIngredientNote(raw.name);
    const entry = rawIndex.get(name);
    if (!entry) {
      rejected.push(`原料「${raw.name}」未收录，需先审核归一`);
      return;
    }
    const ingredientId = idByName.get(entry.name);
    if (!ingredientId) {
      rejected.push(`食材「${entry.name}」尚未发布`);
      return;
    }
    links.push({
      recipeId,
      ingredientId,
      name,
      amount: raw.amount,
      note,
      position,
    });
  });
  return { links, rejected };
}

/** 菜谱正文的原料视图（发布校验与归一的最小输入） */
export interface RecipeIngredientsView {
  /** 报错定位用；seed 传菜谱名 */
  label: string;
  ingredients: { name: string; amount: string }[];
}

/** 关联解析结果：`rejected` 非空即整体拒绝，不残缺发布 */
export interface RecipeLinkResolution<T> {
  links: T[];
  /** 未收录、未发布或缺少原料名的原料，逐条列出菜谱与写法 */
  rejected: string[];
}

/**
 * 把菜谱正文解析成「写法 → 稳定身份」的关联（发布链路的共同入口）。
 * 未收录 / 未发布 / 缺原料名 → 进 `rejected`，调用方必须整体拒绝该菜谱。
 *
 * 同一身份的多种写法（「花椒」+「花椒粉」）各保留一条关联行（ADR-0019）：
 * 主键是 (recipeId, position)，用量与说明互不覆盖，不再合并丢弃。
 */
export function resolveRecipeLinks<T>(
  recipe: RecipeIngredientsView,
  rawIndex: Map<string, IngredientCatalogEntry>,
  idByName: Map<string, string>,
  link: (
    built: Omit<RecipeIngredientLink, 'recipeId' | 'ingredientId'>,
    ingredientId: string,
  ) => T,
): RecipeLinkResolution<T> {
  const { links: built, rejected } = buildRecipeIngredientLinks(
    recipe.ingredients,
    rawIndex,
    idByName,
  );
  const rejectedAll = rejected.map((r) => `「${recipe.label}」${r}`);
  if (rejectedAll.length) return { links: [], rejected: rejectedAll };

  const links = built
    .sort((a, b) => a.position - b.position)
    .map((item) =>
      link(
        {
          name: item.name,
          amount: item.amount,
          note: item.note,
          position: item.position,
        },
        item.ingredientId,
      ),
    );

  return { links, rejected: [] };
}

/** 全部包含语义：菜谱必须同时包含全部所选食材身份（允许还有其他原料） */
export function hasEveryIngredient(
  recipeIngredientIds: Iterable<string>,
  selectedIds: string[],
): boolean {
  const present = new Set(recipeIngredientIds);
  return selectedIds.every((id) => present.has(id));
}
