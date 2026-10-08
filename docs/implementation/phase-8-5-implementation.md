# Phase 8-5 实施记录：AI 搜索复用多食材筛选

> 对应 [GitHub Issue #11](https://github.com/jokerwon/shiguang/issues/11)（父票 [#5](https://github.com/jokerwon/shiguang/issues/5)），依据 [ADR-0018](../adr/0018-ingredient-catalog-and-filtering.md) 决策 5「AI 搜索复用食材身份、别名与多食材全部包含规则；歧义名称不擅自映射」。前置 [#10](https://github.com/jokerwon/shiguang/issues/10) 已交付页面侧多选全部包含。

## 交付内容

| 层面          | 交付物                                                                                                             | 位置                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| 工具契约      | `search_recipes` 新增 `ingredients?: string[]`（名称或别名），描述写明「全部包含」与「歧义返回错误」                 | `apps/server/src/chat/tools/read-tools.ts`     |
| 纯逻辑        | `runSearchRecipes` 内名称/别名 → 稳定身份 → 复用 `IngredientService.recipeIdsContainingAll` 取交集；歧义/未收录返回 `error` 且不筛选 | `apps/server/src/chat/tools/read-tools-logic.ts` |
| 身份解析      | `resolveIngredientTerms`：整串相等才命中，同一身份去重，未识别项连候选一并上报                                      | 同上                                          |
| 依赖注入      | `ChatToolDeps.ingredientIdentities` / `recipeIdsContainingAll`；`ChatService` 注入 `IngredientService` 与身份查询   | `chat/tools/types.ts`、`chat/chat.service.ts`、`chat/chat.module.ts` |
| 对话指引      | 多食材必须用 `ingredients`；工具返回 `error` 时如实转述候选并请用户确认，不得改用 `keyword` 或丢掉条件                | `apps/server/src/chat/prompts/behavior.ts`     |
| 回归          | `chat/tools/index.spec.ts` 新增 7 例：两食材都含、别名同一身份、身份不混淆、歧义候选、未收录报错、安全排除与错误区分、与其他条件取交集 | `apps/server/src/chat/tools/index.spec.ts`     |

## 关键前置发现（来自真实代码与 live 数据库）

1. 工具侧食材条件原先只有 `keyword` 自由文本子串（`read-tools-logic.ts` 第 2 步），无法表达「同时有番茄和鸡蛋」；单字符串子串匹配会把「只含一种」的菜也算命中。
2. 稳定身份与全部包含纯逻辑已存在且页面在用：`IngredientService.recipeIdsContainingAll`、`identifyIn`（`recipe-safety.service.spec.ts` 有回归），本票只是把它接进工具，不复制第二套实现。
3. live 库（2026-10-08 核对）：`番茄`（别名 `西红柿`）id `cmunmhwsf…`、`鸡蛋`（过敏原 `蛋类`）；含番茄 8 道，番茄+鸡蛋 3 道（`西红柿炒鸡蛋`/`番茄蛋花汤`/`水煮蛋蔬菜沙拉`）。当前数据别名唯一、无整串歧义（`油` 无身份）。
4. 用户 `jokerwon26@gmail.com` 有偏好（忌口 `生姜`、过敏原 `大豆`）；其 `UserPreference.allergens` 非空时，信息不足的原料按 ADR-0018 保守排除，因此该账号下番茄+鸡蛋 3 道全部落在 `unknown` 排除——这是既有安全语义，不是本次回归失败。
5. `nest start` 以 CJS 启动，`.env` 不一定在 Nest 初始化前加载（`import 'dotenv/config'` 或显式环境变量才可靠）；本轮冒烟用 `env JWT_SECRET=… npx nest start`。

## 验收证据

### 确定性回归（`npx jest src/chat/tools/index.spec.ts`）

26 例全过，其中新增 7 例断言具体返回/排除的身份与错误边界（注入真实 `RecipeSafetyService` 与 `IngredientService` 纯逻辑，只 fake 其 Prisma，避免自证假语义）：

| 用例                     | 断言                                                                 |
| ------------------------ | -------------------------------------------------------------------- |
| 同时要求番茄与鸡蛋       | 只返回 `r-both`；`ingredients.names` = `['番茄','鸡蛋']`             |
| 别名与规范名同一身份     | 传 `['西红柿','番茄','鸡蛋']` 结果与去重后一致，不产生重复条件       |
| 身份不混淆               | 要 `鸭蛋` 只返回鸭蛋菜谱，不把鸡蛋菜谱算进来                         |
| 歧义名称                 | 返回 `error` 含两个候选名，`recipes` 为空、无 `note`                 |
| 未收录名称               | `error` 含「没有对应的已发布食材」，不静默丢条件返回更宽结果         |
| 安全排除 ≠ 错误          | 身份全命中但被 safety 排除时给 `note`、无 `error`，仍回显解析身份    |
| 与其他条件取交集         | 食材 + 菜系 + 时长命中两道；不匹配菜系时为空且无 `error`             |

### 真实对话冒烟（HTTP SSE，工具入参与返回逐条核对）

命令：`env JWT_SECRET=… npx nest start` + `POST /chat`（`jokerwon26@gmail.com` 与无偏好档案的 `review-tmp@example.com`）。

| 场景             | 观察到的工具输入                                       | 工具输出                                                                 |
| ---------------- | ------------------------------------------------------ | ------------------------------------------------------------------------ |
| 多食材正向命中   | `{"ingredients":["番茄","鸡蛋"]}`                      | `count:3`，`西红柿炒鸡蛋/番茄蛋花汤/水煮蛋蔬菜沙拉`，`ingredients.names=['番茄','鸡蛋']` |
| 别名复用         | 模型先传 `["番茄","鸡蛋"]`，再传 `["西红柿","鸡蛋"]`   | 两次都归一到同一身份，结果一致（`names` 均为番茄/鸡蛋）                  |
| 歧义名称         | `{"ingredients":["油"]}`                               | `error:"「油」没有对应的已发布食材…"`，`recipes:[]`，未擅自映射也未返回更宽结果 |
| 安全排除（信息不足） | `{"ingredients":["豆腐","鸡蛋"]}`（该账号大豆过敏） | `count:0`，`ingredients.names=['豆腐','鸡蛋']` + `note`；无 `error`，但**未说明是因安全排除**  |
| 原有能力保留     | `{"cuisine":"sichuan","tags":["high-protein"],"maxTime":20}` 等 | 工具照常受理原参数并返回 `note`；不新增百科/写资料/库存工具              |

界面侧 SSE 文本与上述工具结果一致（模型如实转述「没有找到同时包含番茄和鸡蛋的菜谱」而非编造）。

**未达成（遗留，如实标注）**：AC 要求区分「安全排除 / 成分信息不足」与「真实无结果」，工具目前对两者返回同一条 `note`（「没有匹配的菜谱。可尝试放宽条件…」）。冒烟中的真实后果：`川菜`、`番茄`、`豆腐+鸡蛋` 三次命中都是被安全设置排除，模型却对用户说「库里没有川菜 / 没有同时含番茄和鸡蛋的菜谱」。`RecipeSafetyService.filter` 已能给出 `excluded` 数量与 `kind`（`blocked`/`unknown`），工具侧尚未消费；补上可区分信号后再验 F2/C6/C7/D1。

### 质量门

- `pnpm --filter @shiguang/server test`：13 套件 131 例全过（#11 新增 7 例）。
- `pnpm -r lint`：server 与 web 均通过。
- 类型检查：server `tsc --noEmit` 0 错误；Web 仍有 7 条错误，全部在未改动的 `components/ai-elements/prompt-input.tsx`（Phase 3.5 已记录的既有限制）。

## 遗留与边界

- **真实歧义未在自然对话中触发**：当前库无整串歧义（`油` 无身份），自然问法下模型倾向改用其他条件。歧义路径由确定性回归锁定，并在强制调用 `ingredients:["油"]` 时实测走通「未识别 → error」分支。若后续拆分合并身份（如「黑醋」）或为多个身份补同名别名，自然对话即可命中候选分支。
- **信息不足排除不区分原因**：工具目前只返回 `note`，不向模型说明「因安全设置或信息不足而排除」，这是既有 `safety` 契约（`Note` 文案）的延续，未扩大范围。
- **未新增**：不新增 AI 百科、资料写入、库存或缺料工具；未改变排序权重与安全判断。
- **无 schema 变更**：本轮无迁移。
