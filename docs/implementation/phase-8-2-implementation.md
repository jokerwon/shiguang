# Phase 8-2 实施记录：菜谱关联稳定食材身份并打通后续发布

> 对应 [GitHub Issue #7](https://github.com/jokerwon/shiguang/issues/7)（父票 [#5](https://github.com/jokerwon/shiguang/issues/5)），依据 [ADR-0018](../adr/0018-ingredient-catalog-and-filtering.md)。逐项核对材料见 [phase-8-2-ingredient-mapping-review.md](./phase-8-2-ingredient-mapping-review.md)。
>
> **内容复核状态**：本轮的归一判断与资料措辞仍是 AI 起草，`reviewedAt` 是导入时间戳。逐项核对表已生成，**尚未由维护者逐条签字**——签字前不对应「内容已复核」的验收条目。

## 交付内容

| 层面         | 交付物                                                                                     | 位置                                                      |
| ------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| 菜谱载荷     | `Recipe.ingredients[]` 携带 `ingredientId`（身份）与 `note`（括号说明），来自稳定关联       | `packages/domain/src/index.ts`、`src/recipe/recipe.mapper.ts` |
| 详情读取     | `GET /recipes/:id` 带 `ingredientLinks`（含身份）读取，不再由前端按名称猜身份               | `src/recipe/recipe.service.ts`                            |
| Web 详情     | 原料按 `ingredientId` 链接资料页，删除「拉 100 条食材再字符串匹配」的旁路；无 id 时不生成链接 | `apps/web/app/(screen)/recipe/[id]/recipe-detail.tsx`     |
| 发布闸门     | 未收录 / 未发布写法整体拒绝；同身份多写法保留第一条并逐条告警（不静默丢用量）               | `src/ingredient/normalize.ts`（`resolveRecipeLinks`）     |
| seed 发布    | 导入菜谱时同步建立 `RecipeIngredient` 关联，重复运行不产生重复行；未归一即整批拒绝           | `prisma/seed.ts`（`pnpm db:seed`）                        |
| 生成提示词   | 生成草稿的食材名限定在已发布选材白名单内；白名单外写法当场打印待处理                        | `scripts/generate-recipes.ts`                             |
| 逐项核对材料 | 220 种正文写法 → 身份 的核对表 + 35 组合并项清单                                            | `scripts/ingredient-mapping-review.ts` → 核对表文档        |

## 关键前置发现（来自真实代码与 live 数据库）

1. live 库：88 道菜谱、173 条食材（`published=true`，无 `reviewedAt=null`）、656 条 `RecipeIngredient`。
2. `Recipe.ingredients` 正文共 657 项，与关联相差 1 条：`夫妻肺片` 的 `花椒` 与 `花椒粉` 落在同一身份（`花椒.aliases` 含 `花椒粉`），`dedupeIngredientLinks` 只保留第一条——该菜谱 `花椒粉 1茶匙` 的用量不在关联行里。
3. 详情页此前的链接方式为 `useIngredients({limit:100})` + 名称/别名等值匹配：接口上限 100（`QueryRecipesDto.limit` 的 `@Max(100)`），第 101 条之后（`SEASONING`/`OTHER` 尾部）一律匹配不到；`牛排（西冷或眼肉）` 这类带括号写法也匹配不到。
4. 关联行按 `note` 保留了 3 处括号说明；5 条食材条目完全没有菜谱（苹果、橙子、火腿肠、樱桃、葡萄干、韭菜、大白菜、黄豆酱共 8 条），属独立收录。
5. `recipes-curated.ts`（28 道）+ `staging/recipes-staging.json`（60 道）正好是库内 88 道；seed 的原料写法与审核资料归一表零缺失（唯一例外是第 2 条的花椒粉，它在写法层命中、在身份层被合并）。

## 验收证据

| #   | 场景                       | 实际结果                                                                                                                                                                      |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | 存量覆盖与差异核对         | live 库 657 项正文 → 656 条关联，逐项比对后唯一差异为「夫妻肺片」的花椒/花椒粉同身份合并；8 条食材无菜谱属独立收录                                                              |
| A2  | 身份稳定、不误合并         | `番茄`/`西红柿`、`包菜`/`卷心菜` 等合并项见核对表 35 组；`鸡蛋`≠`鸭蛋`、`生抽`≠`老抽` 在既有回归中仍区分（`recipe-safety.service.spec.ts`）                                      |
| A3  | 用量与说明保留             | 关联行保留 `1块(约200g)`、`note='西冷或眼肉'`；接口返回 `牛排（西冷或眼肉）` + `note` 与正确身份 id                                                                            |
| A4  | 别名改动能不动关联         | 关联以身份 id 为准（`RecipeIngredient.ingredientId`）；改别名只重建 `IngredientAlias`，不改关联行（Phase 8-1 A3 已验证 656 → 656，本轮 seed 重跑后仍为 656）                  |
| A5  | 迁移/备份                  | 本轮无 schema 变更（沿用 `20260930120000_add_ingredient_catalog`），未执行 destructive 迁移；写入前 `pg_dump` 备份沿用 Phase 8-1 的 `/tmp/shiguang-backup/pre-phase8-1.sql` |
| B1  | 详情按 id 跳转             | 真实 API：`GET /recipes` 逐条取详情，656 条已关联原料的 `ingredientId` 全部能反查到资料接口且名称一致；`花椒粉` 1 条无 id（已知缺口）                                           |
| B2  | 未归一样式整体拒绝         | 向 staging 注入「未收录的神秘食材」后 `pnpm db:seed` 报 `「红烧肉」原料「未收录的神秘食材」未收录，需先审核归一` 并整批不写入；恢复后库内仍 88/656/173                        |
| B3  | 同身份多写法如实上报       | `pnpm db:seed` 与 `pnpm ingredients:import` 都打印 `「夫妻肺片」的「花椒粉」与「花椒」指向同一食材身份，已合并为一条关联（被合并项的用量不写进关联表）`                          |
| B4  | 重复发布幂等               | 连续两次 `pnpm db:seed` 均为 `Seeded 88 recipes … 食材关联 656 条`；`(recipeId, ingredientId)` 重复行为 0                                                                       |
| B5  | 生成侧不再回流未收录写法   | 生成提示词把 `ingredients.name` 限定在已发布选材白名单（173 个规范名），并禁止同一身份两种写法同时出现；草稿命中白名单外写法时打印待处理清单                                    |
| B6  | 发布链路共用同一校验       | 导入命令与 seed 都走 `normalize.ts` 的身份索引与 `resolveRecipeLinks`；不存在「名称看起来相近就自动发布」的旁路                                                                 |

### 自动化检查

- `pnpm --filter @shiguang/server test`：10 个 suite、109 个用例全部通过（新增 `recipe.mapper.spec.ts` 4 例：position 空洞配对、括号说明、未关联身份、缺少关联列）。
- `pnpm -r lint`：`@shiguang/server` 与 `@shiguang/web` 均通过（本次改动文件；`scripts/import-ingredients.ts` 的既有 prettier 偏差未在本票范围）。
- Web 类型检查：本次改动文件 0 错误；仓库仍有的 7 条错误全部在未改动的 `components/ai-elements/prompt-input.tsx`（Phase 3.5 记录的既有限制）。

### 真实表面走查

- `GET /recipes?limit=3` 返回的每条原料均带 `ingredientId`；`GET /recipes/<id>`（夫妻肺片）逐项打印身份，除 `花椒粉` 外全部有 id。
- 逐条反查 `GET /ingredients/<id>`：656 条已关联原料的身份全部能解析（脚本 `/tmp/detailcheck.js`），个别「写法 → 规范名」的差异（`糖 → 白糖`、`油 → 食用油`、`猪瘦肉 → 猪里脊`、`红酒醋 → 黑醋`）是归一表的既有审阅结果，已列入核对表待维护者确认。

### 浏览器走查（真实 Chromium，验收账号 phase82-check@example.com）

| 场景         | 实际观察                                                                                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 详情原料链接 | `/recipe/<黑椒牛排>`「食材清单」5 条原料全部渲染为链接，`href=/ingredient/<id>` 与接口返回的 `ingredientId` 一致；`牛排（西冷或眼肉）` 用量显示 `1块(约200g)`，说明未重复补括号 |
| 正向跳转     | 点击「牛排（西冷或眼肉）」→ `/ingredient/cmunmi1xg0021vs9gbcrgfhgr`，资料页标题「牛排」、分类「肉禽」、简介/挑选/保存/来源齐全，相关菜谱 1 道                                 |
| 反向跳转     | 资料页相关菜谱卡片「黑椒牛排」→ 回到菜谱详情，原料链接保持同一组 `href`（双向链路成立）                                                                                    |
| 移动端 390px | Tabbar 五项可达；「食材清单」展开后原料链接与用量正常排版，无横向溢出                                                                                                      |
| 键盘         | Tab 顺序：导航 → 返回 → 做法 → 食材清单 → 收藏；对「食材清单」按 Enter 后 Tab 依次落在 5 条原料链接上，焦点可见                                                            |
| 登录态       | 未登录访问详情跳转 `/login?redirect=/recipe/<id>`；经真实登录表单登录后回到详情页，说明详情读取走认证链路                                                                  |

### 代码审查后的修正（同轮，真实复现）

独立审查提出的三条均已复现并修复：

1. **生成白名单里的规范名反被归一器拒绝**：`buildRawIndex` 只索引 `rawNames`，而 16 条食材（生姜、鳕鱼、苹果等）的 `rawNames` 不含自身规范名，于是「按白名单生成的草稿」会在 seed 被判「未收录」。修复：归一索引同时收录规范名与 `rawNames`，歧义检查用同一键集合并按消息去重。复现证据：修复前 16 条规范名解析不到，修复后 0 条，且 `生姜 → 生姜`、`姜片 → 生姜`、`苹果 → 苹果` 均可解析。
2. **seed 未校验发布状态**：原先仅 `findUnique({ name })`，未发布身份也会被写进关联，前端会拿到点开即 404 的链接（`IngredientService.findById` 按 `published: true` 查）。修复：改为 `findFirst({ name, published: true })`。
3. **正文与关联分开提交**：`upsert`、`deleteMany`、`createMany` 各自提交，中断时会留下「新正文 + 空关联」，使身份链接与按食材筛选同时失效。修复：每道菜谱的三步放进同一个 `$transaction`。修复后重跑 `pnpm db:seed` 仍为 88 道 / 656 条 / 0 条重复关联行。

## 遗留与边界

- **内容复核未签字**：220 种写法 → 身份 的 220 行核对表与 35 组合并项仍未由维护者逐条确认（见核对表文档）；签字前 `reviewedAt` 只代表导入时间。
- **花椒粉缺口**：按本轮确认的处理方式保持现状（不拆身份），已在上表 B3 与核对表中登记；若要拆成独立条目，需改 `published.ts` 后重跑 `pnpm ingredients:import` 与 `pnpm db:seed`。
- **无 schema 变更**：本轮未新增迁移，`RecipeIngredient` 结构沿用 Phase 8-1。
- 用户动作产生的数据（收藏、偏好会话）不受本轮影响；seed 只重建菜谱与原料关联，不触碰用户表。
