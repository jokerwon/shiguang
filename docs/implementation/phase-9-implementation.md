# Phase 9 实施记录：菜谱原料收敛为单一事实源

> 依据 [ADR-0019](../adr/0019-recipe-ingredient-single-source.md)。上游 Phase 8（[#5](https://github.com/jokerwon/shiguang/issues/5)）交付了身份关联，本 Phase 收掉与 `Recipe.ingredients` 并存的双份事实。

## 交付内容

| 层面       | 交付物                                                                                                         | 位置                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 数据模型   | `RecipeIngredient` 主键改 `(recipeId, position)`；删除 `Recipe.ingredients` 列                                  | `apps/server/prisma/schema.prisma`                         |
| 迁移       | 换主键 → 按正文补齐缺失关联行 → 删列（一次性，已在 live 执行并记为 applied）                                    | `prisma/migrations/20261008000000_recipe_ingredient_single_source/` |
| 读取       | `toResponse` 从关联行按 `position` 升序派生原料；`toIngredientViews` 每条关联行一个身份视图，删掉按名称配对兜底  | `src/recipe/recipe.mapper.ts`、`src/recipe/recipe-safety.service.ts` |
| 查询       | `get_recipe` 带 `ingredientLinks` include；工具依赖类型收紧为必定带关联行                                       | `src/chat/chat.service.ts`、`src/chat/tools/types.ts`       |
| 关键词     | 关键词匹配改读关联行（`displayIngredientName` 还原带括号写法），不再读 JSON                                     | `src/chat/tools/read-tools-logic.ts`                       |
| 打分       | `ScorableRecipe` / `rankRecipes` 去掉 `ingredients` 入参（打分只用 id/时间/营养）                               | `src/recipe/recommendation.scoring.ts`                     |
| 写入       | `seed.ts` 只写关联行（菜谱行与关联同一事务）；`import-ingredients.ts` 以现存关联行为归一输入（带 `note`+`orderBy position`） | `prisma/seed.ts`、`scripts/import-ingredients.ts`           |
| 归一       | 删除 `dedupeIngredientLinks` 与 `merged` 上报：同身份多写法各保留一行，用量不丢                                  | `src/ingredient/normalize.ts`                              |
| 域类型     | `Ingredient.ingredientId` 改为必填；新增 `displayIngredientName` 统一「名称 + 说明」的展示口径                   | `packages/domain/src/index.ts`、`src/ingredient/normalize.ts` |
| Web        | 详情原料恒为链接（不再有「无 id」降级分支）；列表组件按下标做 key（同身份可多行）                                | `app/(screen)/recipe/[id]/recipe-detail.tsx`、`components/recipe-card.tsx` |

## 关键前置发现（来自真实代码与 live 数据库）

1. live 库（迁移前）：88 道菜谱、176 条已发布身份、659 条关联、正文 JSON 660 项；逐行对账 659 行 `name`/`amount`/`note`/`position` 与正文完全一致——关联表已能完整派生正文，唯一缺口是 `夫妻肺片` 的 `花椒粉`（同身份多写法被去重合并）。
2. 记录 3 处括号说明（`牛排`/`西冷或眼肉`、`意面`/`如spaghetti`、`甜玉米粒`/`罐头或冷冻`）；`toIngredientViews` 原先按名称配对并以 `?? links[0]` 兜底，是唯一能静默错配身份的分支。
3. 写入链路只有 `prisma/seed.ts` 与 `scripts/import-ingredients.ts`，二者原本都按名称读 JSON 重建关联。
4. 本机无 `pg_dump`/`psql`，备份改用 Prisma 全表 JSON 导出（`/tmp/shiguang-pre-migrate.json`，296 KB，11 张表）。
5. 唯一缺口不由主键造成：`花椒` 的别名含 `花椒粉`，旧复合主键 `(recipeId, ingredientId)` 逼着实现去重；改主键后无需拆身份即可保留两行。

## 验收证据

| #   | 场景                   | 实际结果                                                                                                                       |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A1  | 迁移前备份             | `/tmp/shiguang-pre-migrate.json`：recipe=88 ingredient=176 ingredientAlias=99 ingredientAllergen=85 recipeIngredient=659 user=4 userPreference=1 favorite=1 refreshToken=13 conversation=14 message=25 |
| A2  | 迁移 SQL 回放          | scratch schema 复原迁移前形状（659 行、旧主键）后跑 `migration.sql`：660 行、0 重复 position、0 空洞、列已删；`花椒粉` 补出 `position=12 / 1茶匙` |
| A3  | live 迁移              | 换主键+补 1 行+删列后：88 菜谱 / 660 关联 / 0 无关联菜谱 / `Recipe.ingredients` 列 0 条；`prisma migrate diff --from-config-datasource --to-schema` 输出「empty migration」 |
| A4  | 数据与备份逐行对账     | 660 行 `(position, name, amount, note)` 与迁移前正文逐项比对：`mismatches 0`                                                                |
| B1  | seed 幂等              | `pnpm db:seed` → `Seeded 88 recipes … 食材关联 660 条`；重跑两次结果一致，0 重复行                                                          |
| B2  | import 幂等且不丢说明  | 修掉「漏选 note、未按 position 排序」后重跑 `pnpm ingredients:import` → `覆盖菜谱 88 道、原料关联 660 条`，与备份对账 `mismatches 0`（首跑曾丢 3 处括号说明并打乱 1 道菜顺序，已修） |
| C1  | REST 详情              | `GET /recipes/<夫妻肺片>` 15 条原料全部带 `ingredientId`，`花椒粉` 与 `花椒` 各一行且指向同一身份                                          |
| C2  | REST 列表              | `GET /recipes?limit=100`：88 道 / 660 项 / 缺 `ingredientId` 0 项；`黑椒牛排` 返回 `牛排` + `note=西冷或眼肉`                                  |
| C3  | 按食材筛选未回归       | `GET /recipes?ingredients=<番茄>`：total 8，与迁移前一致（水煮蛋蔬菜沙拉、地中海沙拉、希腊沙拉、西班牙海鲜饭、鸡胸肉沙拉、番茄蛋花汤、西红柿炒鸡蛋、番茄罗勒意面） |
| D1  | 单测                   | `pnpm --filter @shiguang/server test`：13 套件 / 136 例全过（新增 normalize 3 例 + 改写 mapper 4 例，删掉去重合并用例）                       |
| D2  | 类型与 lint            | `tsc --noEmit`（server）0 错；`pnpm --filter @shiguang/server lint` 通过；改动过的 Web 文件 eslint 通过（`components/ai-elements/prompt-input.tsx` 的既有错误与本轮无关） |
| D3  | 构建与运行时           | `pnpm --filter @shiguang/server build` + `pnpm build:domain` 通过，重启 `dist/src/main.js` 后 A1–C3 的接口证据均取自该进程               |

## 遗留与边界

- **`position` 语义**：它是展示顺序，不再对应「已删除的正文数组下标」。写入方必须自行保证菜谱内唯一（主键即约束）。
- **括号说明只在 `note` 里**：`name` 是剥离说明后的展示名，页面按「`name` 未包含 `note` 才补括号」还原写法；需要原样写法的地方用 `displayIngredientName`。
- **内容复核未签字**：Phase 8-2 的 219 行归一核对表仍未逐条确认；本 Phase 只把「同身份多写法」从合并改为各保留一行，不改变任何身份判定。
- **回滚**：迁移不可逆（列已删）。回滚需从 `/tmp/shiguang-pre-migrate.json` 恢复；`Recipe.ingredients` 内容可由关联行完整重建（已由 A4 证明）。
