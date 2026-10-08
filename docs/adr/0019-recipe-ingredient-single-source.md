# ADR-0019: 菜谱原料以关联行为唯一事实源，下线 Recipe.ingredients

- **状态**：已接受
- **日期**：2026-10-08
- **Phase**：9
- **决策者**：Kai
- **关系**：补充 [ADR-0018](./0018-ingredient-catalog-and-filtering.md) 决策 5（菜谱归一与关联），不改动其身份、别名与安全边界；取代 ADR-0018 中「`Recipe.ingredients` 正文与关联并存」的过渡形态。不改变 ADR-0002 的营养字段与 ADR-0005 的排序权重。

## 背景 (Context)

ADR-0018 引入 `RecipeIngredient` 关联时，`Recipe.ingredients`（Json）保留为展示用正文，关联表另存一份身份与用量，读取时按 `position` 把身份配回正文项。核心事实（2026-10-08 对 live 库与真实读路径核对）：

- `RecipeIngredient` 每行自带 `name`（剥离括号说明后的展示名）、`amount`、`note`、`position`（正文数组下标），659 行与 88 道菜谱的 660 项正文逐行比对，除 1 项外全部一对一且 `name`/`amount`/`note` 与正文一致——关联表已能完整派生正文。
- 唯一缺口：`夫妻肺片` 的 `花椒粉` 被 `dedupeIngredientLinks` 以「同身份多写法只保留第一条」合并掉，正文仍留着该项，读路径按 `position` 查不到 → 该行没有 `ingredientId`（ADR-0018 登记的已知事项）。
- 写入链路只有两处（`prisma/seed.ts` 与 `scripts/import-ingredients.ts`），二者都在同一事务里同时写正文与关联，注释明写「不保留第二套事实源」。应用层没有其他菜谱写路径。
- 读路径中 `recipe-safety.service.ts#toIngredientViews` 把关联行按**名称**配正文（`links.find(l => l.name === raw.name) ?? links[0]`），与 `recipe.mapper.ts` 按 `position` 配对不一致；`RecipeSafetyService` 的 `Recipe` 类型仍要求 `ingredients` 字段，安全判断读的是 Json 列而不是关联行。
- 正文里的鸡蛋、番茄、熟芝麻等原料写法是身份规范名或别名（`published.ts` 的 `rawNames`），关联行存的是**规范名**：删掉 Json 列后，`食用油的 raw 写法「油」`这类差异不会丢失，因为关联行存的 `name` 本就是归一后的展示名。

上述是决策时点的实现事实，不是新功能声明。

## 决策 (Decision)

### 1. 唯一事实源

- 菜谱原料**只有** `RecipeIngredient` 一张表：`(recipeId, position, ingredientId, name, amount, note)`。
- 删除 `Recipe.ingredients` 列。展示正文由关联行按 `position` 升序派生：`{ name, amount, note? , ingredientId }`，即共享域层 `Ingredient` 类型。
- `name` 是展示名（剥离括号说明后的主体名），`note` 存放括号内说明；展示时按下述规则还原成原样：「`name` 已包含 `note` 则不重复补括号」。这与当前前端 `recipe-detail.tsx` 的既有渲染规则一致。

### 2. 主键与去重

- 主键从 `(recipeId, ingredientId)` 改为 `(recipeId, position)`：同一道菜可以合法地为同一身份保留多条原料行（`花椒` 与 `花椒粉` 只是写法不同，用量不同不能丢），`position` 在菜谱内唯一。
- 删除 `dedupeIngredientLinks`：同身份多写法不再合并、不再产生 `merged` 上报。ADR-0018 决策 5「明确别名可自动对应，歧义项由维护者确认」仍然成立——归一仍然要求每条写法唯一命中一个身份，未收录/未发布/歧义一律拒绝整批导入。
- 代价：`花椒粉` 自主名（有所属身份 `花椒`）不再需要合并，回归为一条正常关联行。这修正了 ADR-0018 登记的缺口，不需要拆分身份目录。

### 3. 读取路径

- `toResponse`：原料完全来自关联行，`position` 决定顺序，不再读 Json，也不再按名称猜测。
- `toIngredientViews`：安全视图以**关联行**为准（每条关联行一个身份视图，`rawName` 取 `name`），消除「按名称配对 + `?? links[0]` 兜底」这条会错配身份的旁路。
- `rankRecipes` 与 `ScorableRecipe` 不再要求 `ingredients` 字段（打分只用 id/时间/营养），`ChatService` 与 `RecipeService` 的 include 里传 `ingredientLinks`。

### 4. 写入路径

- `seed.ts`：校验 `SeedRecipe` 后剥离 `ingredients`，按 `(recipeId, position)` 事务化重建关联；`recipes-curated.ts` 与 `staging/recipes-staging.json` 的文件格式不变（它们仍是内容源）。
- `import-ingredients.ts`：不再读 JSON，熔接**既有关联行**的 `name`（展示名，已是归一表可识别的写法）重建身份映射；这样重复运行不依赖已删列。
- 归一函数只保留「写法 → 身份」的校验与拒绝语义，不再产生 `merged`。

### 5. 迁移与安全

- 迁移是一次性数据变更：先按正文补齐缺失的关联行（当前仅 `花椒粉` 一条），再换主键，最后删列；`RecipeIngredient.name` 已有数据即为正文，无需回填。
- 迁移前备份：本机无 `pg_dump`，用全表 JSON 导出（`/tmp/shiguang-pre-migrate.json`）。

## 理由 (Rationale)

- 两份事实在任何一次写入失败或结构变更时都可能分叉；ADR-0018 已经用「同一事务」「position 配对」等约束去防它，成本高于收益。删掉 Json 才能让「菜谱含哪些原料」只有一个答案。
- `position` 主键让用量、说明与身份真正一一对应，`花椒粉 1茶匙` 不再需要靠「合并时丢弃用量」保住不变量。
- 安全判断直接读关联行，去掉按名称配对的兜底分支——那是当前唯一能静默把身份配错的地方。

## 备选方案 (Alternatives Considered)

- **保留 Json，仅补齐 `花椒粉` 关联行**：改动最小，但两个事实源继续并存，本 ADR 要解决的分叉风险不变，拒绝。
- **保留 `(recipeId, ingredientId)` 主键、按位置携带用量**：同身份多写法仍需合并或拆身份，`花椒粉` 问题照旧，拒绝。
- **维持现状（关联 + Json 并存，按 position 配对）**：ADR-0018 已登记并接受；本次在确认「关联表可完整派生」后升级为单事实源，因此该备选作废。

## 后果 (Consequences)

- 一致性由主键保证：`position` 在菜谱内唯一，正文顺序就是 `position` 顺序。
- 删除 `Recipe.ingredients` 后，任何依赖该列的新代码会编译失败——这是期望的，防止再次引入旁路。
- 迁移是破坏性变更，必须先备份；`docs/implementation/phase-9-implementation.md` 记录执行顺序与验收证据。
- 关联行成为唯一内容源后，菜谱正文的编辑变成「改关联行」；`pnpm db:seed` 是幂等重建入口，`recipes-curated.ts` 与 staging 文件仍是内容输入。
