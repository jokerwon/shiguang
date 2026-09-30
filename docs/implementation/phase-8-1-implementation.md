# Phase 8-1 实施记录：发布并查阅食材资料

> 对应 [GitHub Issue #6](https://github.com/jokerwon/shiguang/issues/6)（父票 [#5](https://github.com/jokerwon/shiguang/issues/5)），依据 [ADR-0018](../adr/0018-ingredient-catalog-and-filtering.md)。本票范围是**发布输入 + 已发布读取 + 真实浏览**，不含「尚未接入安全约束的相关菜谱查询」。

## 交付内容

| 层面     | 交付物                                                                                              | 位置                                                                             |
| -------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 数据模型 | `Ingredient` / `IngredientAlias` / `IngredientAllergen` / `RecipeIngredient` + `IngredientCategory` | `apps/server/prisma/schema.prisma`，迁移 `20260930120000_add_ingredient_catalog` |
| 审核资料 | 173 条资料条目（AI 起草，**尚未经维护者逐条复核**）：覆盖库内全部 221 个原料写法，另有 8 条无菜谱的独立条目；`reviewedAt` 记录的是导入时间，不等于内容已复核 | `apps/server/prisma/ingredients/published.ts` |
| 发布命令 | 校验最低标准 → 归一校验 → 幂等 upsert → 重建菜谱关联                                                | `apps/server/scripts/import-ingredients.ts`（`pnpm ingredients:import`）         |
| 发布校验 | 纯函数发布闸门（名称 / 审核简介 / 可核查来源；过敏原关系需依据）                                    | `apps/server/src/ingredient/publish-review.ts`                                   |
| 归一逻辑 | 括号说明剥离、身份索引、歧义检出、关联去重                                                          | `apps/server/src/ingredient/normalize.ts`                                        |
| 读取接口 | 列表（名称/别名 + 单层分类）、详情、相关菜谱                                                        | `apps/server/src/ingredient/ingredient.{controller,service,dto}.ts`              |
| Web      | `/ingredient` 列表与 `/ingredient/:id` 详情，导航入口，占位图                                       | `apps/web/app/(screen)/ingredient/**`、`apps/web/components/app-nav.tsx`         |

## 关键前置发现（来自真实代码）

1. 库内 88 道菜谱共 221 个原料写法；去括号等有损截断不可靠（`牛排（西冷或眼肉）`、`意面（如spaghetti）`）。
2. `Recipe.ingredients` 是自由文本 JSON，`UserPreference` 的忌口/过敏原是自由文本，没有稳定身份。
3. 「高汤」在库内指日式出汁（木鱼花 + 昆布），按鱼类过敏原处理；`鸡高汤` 单独按禽类收录。
4. `prisma/seed.ts` 按菜谱名称 upsert，发布入口可复用同一套校验模式。

## 验收证据（本票）

| #   | 场景               | 实际结果                                                                                                                                                                                                          |
| --- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | 迁移与客户端生成   | `pnpm --filter @shiguang/server db:migrate --name add_ingredient_catalog` 成功；`db:generate` 成功；`information_schema.tables` 可见 `Ingredient` / `IngredientAlias` / `IngredientAllergen` / `RecipeIngredient` |
| A2  | 全量覆盖           | `pnpm ingredients:import` → 发布 173 条、覆盖菜谱 88 道、原料关联 656 条；重跑得同一组数字（幂等）                                                                                                                |
| A3  | 别名与区分         | 改别名后 `RecipeIngredient` 计数不变（656 → 656）；番茄/西红柿同一身份，鸡蛋≠鸭蛋、生抽≠老抽（身份 id 不同）                                                                                                      |
| A4  | 括号说明与备选     | `黑椒牛排` 的 `牛排（西冷或眼肉）` 关联到「牛排」身份，`note='西冷或眼肉'`，未记为两种必备食材；`意面（如spaghetti）` 同理                                                                                        |
| A5  | 备份与恢复         | `pg_dump` 至 `/tmp/shiguang-backup/pre-phase8-1.sql`（82KB，8 张表）；恢复演练到 `shiguang_restore_check` 后核对 `Recipe=88 / User=4 / Message=7`，随后删除演练库                                                 |
| B1  | 列表/搜索/详情     | 独立条目恢复前 `GET /ingredients` 返回 165 条，最终发布 173 条；`keyword=西红柿` 与 `keyword=番茄` 命中同一身份；分类过滤只返回该分类条目                                                                         |
| B2  | 未达发布标准       | `validateReviewedIngredient` 对缺名称/缺审核简介/缺来源/过敏原缺依据均报错；导入脚本对任一条失败即整体不写入                                                                                                      |
| B3  | 完整与部分资料     | 番茄详情展示简介、挑选、保存、处理、参考来源；无依据的段落不渲染；`苹果` 无相关菜谱时显示真实空结果                                                                                                               |
| B4  | 非法关联           | 未收录原料导入时报出具体菜谱与原料名（如首次运行的 `牛排（西冷或眼肉）`），不静默猜测                                                                                                                             |
| B5  | 发布与安全信息分离 | 豆腐、鸡蛋等含过敏原关系的资料已发布；无关系的条目在接口中 `allergenInfoReviewed=false`，页面注明「未核查 ≠ 确认不含」                                                                                            |
| B6  | 重复导入           | 连续两次导入得到相同的已发布数与关联数；菜谱用量/说明保留（`猪里脊肉 100g`）                                                                                                                                      |

### 浏览器走查（真实 Chromium，验收账号 phase8-check@example.com）

| 场景     | 实际观察                                                                                                                                                                |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 导航     | 导航出现「食材」入口；移动端 Tabbar 五项均可达，当前项 `aria-current=page`                                                                                              |
| 列表     | 显示 173 种；分类「其他」下可见 `苹果`、`橙子` 等独立条目；占位图标注「占位图 · 非实物」                                                                                |
| 别名搜索 | 输入「西红柿」→ 结果 1 种「番茄，又叫 西红柿」                                                                                                                          |
| 详情     | 番茄详情含简介/挑选/保存/处理/参考来源/相关菜谱 8 道；来源链接 `USDA FoodData Central`、`中国食品安全风险评估中心` 实际可访问（HTTP 200；浏览器打开 USDA 站点标题正确） |
| 空结果   | `苹果`（recipeCount=0）显示「目前没有使用这种食材的菜谱」；与错误态（`/ingredient/does-not-exist` → 「食材资料不存在或尚未发布」）可区分                                |
| 键盘     | 详情页 Tab 顺序覆盖 导航 → 返回 → 两个来源链接 → 去筛选页 → 收藏按钮；列表页 Tab 顺序覆盖 搜索框 → 分类 → 食材卡；Enter 可打开食材卡与来源链接                    |
| 移动端   | 实测视口宽 390（`matchMedia('(min-width:768px)')=false`）：桌面导航 `display:none`、Tabbar `display:flex`（高 62px、每项 78×61px）；搜索框 334×40、分类 chip 56×34、食材卡 173×116 在窄屏可用；键盘可从搜索框走到详情与来源链接；`?ingredients=` 进入筛选页只选中该食材（8 道），再选鸡蛋得 3 道 |
| 多选筛选 | 多选「番茄 + 鸡蛋」→ 3 道（均同时包含两者）；刷新后选择保留                                                                                                             |
| 资料入口 | 从番茄资料进入筛选后 `localStorage` 的 `cuisine/pref/time` 被清空，只剩该食材，结果 8 道                                                                                |
| 安全状态 | 设置大豆过敏后，筛选页显示「另有 3 道菜谱因你的忌口或过敏设置被排除（含成分信息不足、无法判断的菜谱）」；资料页仍可查阅并说明保守排除                                   |

### 自动化检查

- `pnpm --filter @shiguang/server test`：9 个 suite、105 个用例全部通过（新增 `recipe-safety.service.spec.ts`：归一、全部包含、安全优先级、发布校验、工具行为）。
- `pnpm -r lint`：`@shiguang/server` 通过；`@shiguang/web` 失败 4 项，全部位于本次未改动的既有文件（`app/(screen)/chat/[[...slug]]/page.tsx` 的 `react-hooks/set-state-in-effect`、`app/(screen)/recipe/[id]/page.tsx` 的 try/catch JSX、`components/ai-elements/{prompt-input,shimmer}.tsx`），属 Phase 3.5 记录过的既有限制。
- Web 类型检查：本次改动文件无新增错误；既有错误集中在 `components/ai-elements/prompt-input.tsx` 与 `@base-ui/react` 的类型不兼容。

## 遗留与边界

- 后端已接入统一安全过滤（筛选、首页 today/quick、食材相关菜谱、AI `search_recipes`），但 **安全约束下的相关菜谱查询与 AI 侧完整验收属父票 #5**；本票只保证资料发布与读取链路。
- **内容复核未完成**：173 条资料的简介/挑选/保存/处理措辞与 221 条归一判断由 AI 起草，维护者尚未逐条复核；`reviewedAt` 只是导入时间戳。`rawNames` 映射已用脚本核对「零缺失、零多余、零歧义」，但归并判断（例如把 `小番茄`/`樱桃番茄` 并入番茄）仍待人工确认；来源为通用可核查入口，需替换为逐条可核查的条目页。
- 部分复合调味料（咖喱块、火锅底料、日式猪排酱、大阪烧酱、天妇罗蘸汁、凯撒酱、水浸金枪鱼罐头等）沿用商品级复合描述，过敏原按可核查分类登记；若后续采购具体品牌，应改用该品牌配料表核对。
- 运行期配置问题：`apps/server/.env` 的 `JWT_SECRET` 带引号，而 `AuthModule` 在 `ConfigModule.forRoot` 之前读取环境变量，实际生效的是 `shiguang-dev-secret` 兜底值。本次验收改用 `POST /auth/register` + `/auth/login` 取得服务端签发 token 以绕开该既有问题；修复该配置不属本票范围。
- 验收账号 `phase8-check@example.com` 为本次造数，验收完成后已从数据库删除（`User` 表仅剩既有账号），避免线上残留。
