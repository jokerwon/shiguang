# Phase 8-7 实施记录：AI 搜索复用多食材筛选

> 对应 [GitHub Issue #11](https://github.com/jokerwon/shiguang/issues/11)（父票 [#5](https://github.com/jokerwon/shiguang/issues/5)，标题「Phase 8-7」），依据 [ADR-0018](../adr/0018-ingredient-catalog-and-filtering.md) 决策 5「AI 搜索复用食材身份、别名与多食材全部包含规则；歧义名称不擅自映射」。前置 [#10](https://github.com/jokerwon/shiguang/issues/10)（Phase 8-5）已交付页面侧多选全部包含。

## 交付内容

| 层面       | 交付物                                                                                                                                                     | 位置                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 工具契约   | `search_recipes` 新增 `ingredients?: string[]`（名称或别名；调味料与加工食品同样适用），描述写明「全部包含」「无法唯一确定时返回 error」                       | `apps/server/src/chat/tools/read-tools.ts`        |
| 身份解析   | 逐词调用 `IngredientService.identify`（整串相等才命中，规范名与别名共用判定，多命中给候选），不另写名称匹配                                                  | `apps/server/src/chat/tools/read-tools-logic.ts`（`resolveIngredientTerms`） |
| 全部包含   | 复用 `IngredientService.recipeIdsContainingAll` 对 `ingredientLinks` 取交集，与筛选页同一条纯逻辑                                                            | 同上                                             |
| 执行顺序   | 食材 AND → 关键词/菜系/标签/营养 → 统一安全过滤（保留 `excluded` 原因）→ 打分排序；`rankRecipes` 只在对安全后候选打分，再按食材交集取结果，避免排序随条件变形   | 同上（`runSearchRecipes` / `restrictRanked`）     |
| 可区分说明 | `buildNote` 三态：安全排除（条数 + 原因 + 不得放宽条件）、食材交集为空（点名食材）、普通无匹配；`error` 仍只用于条件无法执行                                 | 同上                                             |
| 依赖注入   | `ChatToolDeps.identifyIngredient` / `recipeIdsContainingAll`；`ChatService` 注入 `IngredientService`（`ChatModule` import `IngredientModule`）              | `chat/tools/types.ts`、`chat/chat.service.ts`、`chat/chat.module.ts` |
| 对话指引   | 多食材必须用 `ingredients`；error 时转述候选请用户确认；note 里「因安全设置被排除」≠「库里没有」，不得混说                                                    | `apps/server/src/chat/prompts/behavior.ts`        |
| 回归       | `chat/tools/index.spec.ts` 新增 11 例（见下）                                                                                                              | `apps/server/src/chat/tools/index.spec.ts`        |

## 关键前置发现（来自真实代码与 live 数据库）

1. 工具侧食材条件原先只有 `keyword` 自由文本子串，无法表达「同时有番茄和鸡蛋」；单字符串子串会把只含一种的菜也算命中。
2. 稳定身份与全部包含纯逻辑已存在且页面在用：`IngredientService.identify`/`identifyIn`、`recipeIdsContainingAll`（`recipe-safety.service.spec.ts` 有回归）。本票只接线，不复制第二套实现。
3. live 库（2026-10-08 核对）：`番茄`（别名 `西红柿`）`cmunmhwsf…`、`鸡蛋`（过敏原 `蛋类`）`cmunmi33m…`；番茄 8 道，番茄+鸡蛋 3 道（`西红柿炒鸡蛋`/`番茄蛋花汤`/`水煮蛋蔬菜沙拉`）。别名唯一、无整串歧义（`油` 无身份）。
4. `RecipeSafetyService` 的保守排除会连带「成分未核查」的常见原料（番茄、葱、盐、生菜叶等），有过敏设置时番茄+鸡蛋 3 道全判 `unknown`——这是既有安全语义，不是本票回归失败。
5. `src/` 无 dotenv 加载，`auth.module.ts` 在模块定义时读 `process.env.JWT_SECRET`；本地冒烟用 `set -a && . ./.env && set +a` 后起进程，并用 `POST /auth/register` 拿服务端自签 token（不手工签 token）。

## 验收证据

### 确定性回归（`npx jest src/chat/tools/index.spec.ts`，30 例全过）

新用例断言具体返回/排除的身份、说明文案与错误边界；注入真实 `RecipeSafetyService` 与 `IngredientService` 纯逻辑（只 fake 其 Prisma），避免自证假语义：

| 用例                       | 断言                                                                     |
| -------------------------- | ------------------------------------------------------------------------ |
| 同时要求番茄与鸡蛋         | 只返回 `r-both`；`ingredients.names=['番茄','鸡蛋']`                     |
| 别名与规范名同一身份       | `['西红柿','番茄','鸡蛋']` 去重后结果一致，不产生重复条件                 |
| 身份不混淆                 | 要 `鸭蛋` 只返回鸭蛋菜谱                                                 |
| 歧义名称                   | `error` 含两个候选名，`recipes` 为空、无 `note`                          |
| 未收录名称                 | `error` 含「没有对应的已发布食材」，不静默丢条件返回更宽结果             |
| 只含空白/空串              | `error`「没有有效的食材名称」，**不**放行全部菜谱                        |
| 忌口排除                   | `note` 含「因安全设置被排除」+「忌口食材「鸡蛋」」+ 食材名，且不含「放宽条件」 |
| 成分信息不足               | `note` 含「成分信息尚不完整」「无法确认是否安全」，与忌口说明不同         |
| 食材交集为空（非安全排除） | `note` 点名食材「没有同时包含番茄、黄瓜的菜谱」，不引导放宽条件           |
| 与其他条件取交集           | 食材 + 菜系 + 时长命中两道；不匹配菜系时为空且无 `error`                 |
| 括号写法归一               | `牛排（西冷或眼肉）` → 身份「牛排」，与页面解析同口径                     |

### 真实对话冒烟（HTTP SSE，工具入参与返回逐条核对）

一次性注册 `phase8-7-smoke-<ts>@test.local`（`POST /auth/register`），用 `PUT /preferences` 制造安全场景，冒烟后删除该用户；服务用 `node dist/src/main.js` 起在 3001（日志有 Nest 启动横幅）。

| 场景                 | 工具输入                          | 工具输出                                                                                       | 模型对用户的表述 |
| -------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------- |
| 正向 AND（无偏好）   | `{"ingredients":["番茄","鸡蛋"]}` | `count:3`：西红柿炒鸡蛋 / 番茄蛋花汤 / 水煮蛋蔬菜沙拉；`ingredients.names=['番茄','鸡蛋']`      | 正确列出 3 道     |
| 忌口排除             | 同上（忌口 `鸡蛋`）               | `count:0` + `note`「有 3 道符合所选食材（番茄、鸡蛋）的菜谱因安全设置被排除：菜谱含忌口食材「鸡蛋」…放宽烹饪条件不会有帮助」 | 「不是『库里没有』…只有调整忌口/过敏设置才可能看到」 |
| 信息不足排除         | 同上（过敏原 `花生`）             | `note`「…原料「番茄」的成分信息不足，无法确认是否含过敏原…部分原料的成分信息尚不完整…不会拿它们凑数」 | 「这不是『库里没有这道菜』，而是被过敏原安全规则挡下了，放宽条件也不会有帮助」 |
| 调味料全部包含       | `{"ingredients":["食用油","盐"]}` | `count:6`（木须肉、酸菜鱼、干煸四季豆…）                                                        | 正确按「必须同时包含」列出 |
| 未识别名称           | `{"ingredients":["油"]}`          | `error:"「油」没有对应的已发布食材…"`，`recipes:[]`                                              | 复述原文并请用户指明是哪种油 |
| 原有能力保留         | `{"cuisine":"sichuan","tags":["high-protein"],"maxTime":20}` | 照常受理原参数并返回 note                                                     | 如实说明                                     |

### 与页面同口径对账（同一 token，REST）

- `GET /recipes?ingredients=<番茄id>,<鸡蛋id>`（无偏好）：`total 3`，`excluded.count 0`。
- 同一请求在过敏原 `花生` 下：`total 0`，`excluded.count 3`、`hasUnknown true`，原因「原料「生菜叶」/「番茄」的成分信息不足」——与工具 `note` 的条数与原因一致。

### 质量门

- `pnpm --filter @shiguang/server test`：13 套件 135 例全过（#11 新增 11 例）。
- `pnpm -r lint`：server 与 web 均通过。
- 类型检查：server `tsc --noEmit` 0 错误；Web 仍有 7 条错误，全部在未改动的 `components/ai-elements/prompt-input.tsx`（Phase 3.5 已记录的既有限制）。

## 遗留与边界

- **安全排除仍不逐条枚举**：`note` 给条数与至多 2 条原因（超出折叠为「等 N 条原因」），避免把整份排除清单塞进工具返回；页面侧仍可在筛选页看到完整原因。
- **自然问法下的歧义仍难触发**：库内无整串歧义（`油` 无身份），需强制 `ingredients:["油"]` 才走到「未识别 → error」；候选分支（同一写法命中多身份）由确定性回归锁定。
- **未新增**：不新增 AI 百科、资料写入、库存或缺料工具；未改变排序权重与安全判断本身。
- **无 schema 变更**：本轮无迁移。
