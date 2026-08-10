# Phase 3.5 实施清单 —— 自动化验证补齐

> 无新 ADR：本期不改变任何架构决策，仅兑现既有决策（ADR-0009 分级确认、ADR-0011 Message 表重审、ADR-0012 偏好草稿）的测试层保障。
> **目标**：把 AGENTS.md「验收」步骤里的质量门从口号变成可跑的命令——后端纯逻辑测试补齐 + chat 工具参数校验路径覆盖 + 迁移验证增强。
> **不在本期**：前端测试（留触发器，见验收清单备注）；CI（部署 Runbook 编写时一次配好）；husky/lint-staged；Prisma 集成测试自动化；覆盖率指标。
> **完成判定**：`pnpm --filter @shiguang/server test` 全绿 + [验收清单](../acceptance/phase-2-3-checklist.md) 新增节全过。

## ⚠️ 关键前置发现

**1. 现有 5 个 spec 全是纯函数风格，零 Nest 容器、零 DB，本期必须沿用。** 测试基建已就绪：`package.json` 的 jest 字段配置（ts-jest、`src/` rootDir），参考样板 [recommendation.scoring.spec.ts](../../apps/server/src/recipe/recommendation.scoring.spec.ts) / [tools.spec.ts](../../apps/server/src/chat/tools/tools.spec.ts)。**不引入 @nestjs/testing**——一旦引入容器测试，运行时长和维护成本跳档，与本期"轻量补齐"定位冲突。

**2. `runUpdatePreferences` 是纯函数但测试覆盖在工具层，且归一化分支未穷举。** [write-tools-logic.ts](../../apps/server/src/chat/tools/write-tools-logic.ts) 的 add/remove 幂等归一化（`addOps` = 输入−当前、`removeOps` = 输入∩当前）和「归一后全空 → note」分支是 ADR-0012 决策 3 的核心语义。现有 [tools.spec.ts](../../apps/server/src/chat/tools/tools.spec.ts) 已覆盖零副作用与空操作集拒绝，但「add 已存在跳过」「remove 不存在忽略」「归一后全空出 note」三分支缺用例。

**3. schema 校验失败路径（AI 幻觉参数 → 工具错误 → D2 如实告知）无测试。** tool 定义层（[write-tools.ts](../../apps/server/src/chat/tools/write-tools.ts)）的 input schema 是 AI 输出进系统的第一道闸。需要验证：非法 `setHealthGoal` 枚举值、全字段缺省的 `update_preferences` 调用，会以工具错误呈现而非静默/崩溃（D2 验收场景的自动化兜底）。

**4. `appendMessage` 的 seq 不变量无自动化保障。** ADR-0011 的两个核心不变量——seq 从 1 起单调递增、`@@unique` 冲突重试——目前只有手动走查兜底。[conversation.service.ts](../../apps/server/src/conversation/conversation.service.ts) 的 `nextSeq`/重试循环是私有方法，测试策略：**不mock Prisma 容器**，而是对 service 注入一个最小 fake prisma（对象字面量实现 `message.aggregate/create` 两个方法），保持零 DB 风格。

**5. 迁移验证四步已进 AGENTS.md，但 destructive 变更缺备份动作。** 当前流程「改 schema → db:migrate 本地验证 → db:generate → 测试通过」对加列安全，对砍列/改类型（如 ADR-0011 砍 content/toolCalls）失败即数据丢失。本期把 `pg_dump` 备份加进常驻流程，成本一行命令。

**6. 前端触发器的落点。** tool-loop 客户端状态机（操作卡片 → 确认 → undo 链）的复杂度观察点：当「一条 assistant 消息内可交互卡片数」或「卡片状态种类」再增长时，手动走查开始漏。此触发条件写进验收清单备注，不写代码。

---

## W0 · 测试基建确认 + 偏好归一化用例

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 0.1 | `runUpdatePreferences` 归一化用例 | `apps/server/src/chat/tools/tools.spec.ts` | 补三分支：add 已存在被跳过（幂等）、remove 不存在被忽略、归一后全空返回 `note` 且 draft 无键。沿用现有 mock deps 风格 |
| 0.2 | `preference.service.ts` upsert 部分更新语义 | 同模块新增 `preference.service.spec.ts` | fake prisma（对象字面量实现 `userPreference.upsert`），验证：只传 `dislikedIngredients` 时 update 体不含另两字段（部分更新不覆盖——ADR-0012 决策 3 并行修改场景的 service 层保障） |

**验收**：新用例全绿；刻意改坏 `addOps`（如去掉已存在过滤）→ 测试红。

---

## W1 · chat 工具 schema 校验失败路径

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 1.1 | `update_preferences` 非法输入用例 | `apps/server/src/chat/tools/tools.spec.ts` | ① 全字段缺省 → 工具错误（已有则用，确认断言文本）；② `setHealthGoal` 传非枚举值 → schema 拒绝（在 tool 定义层测，不经 execute）；③ 数组含空串/纯空白 → 归一化清洗后行为正确 |
| 1.2 | 其余写工具 schema 抽查 | 同上 | `add_pantry_items` 空数组、`set_favorite` 非法 recipeId 类型——各一条，确认走工具错误而非未捕获异常 |

**验收**：对应 D2 场景（工具执行失败如实告知）有自动化用例兜底；全绿。

---

## W2 · conversation 不变量 + 迁移备份

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 2.1 | `appendMessage` seq 不变量 | 新增 `apps/server/src/conversation/conversation.service.spec.ts` | fake prisma：`aggregate` 返回 max、`create` 第一次抛 P2002 第二次成功 → 断言重试后落库的 seq = max+1；空会话（aggregate 返 null）→ seq 从 1 起。零 DB |
| 2.2 | 迁移备份进流程 | 根 `AGENTS.md`「数据模型变更」节 | 加第 0 步：destructive 变更（砍列/改类型/删表）前 `pg_dump "$DATABASE_URL" > /tmp/shiguang-pre-migrate.sql`；同时更新 [CLAUDE.md 数据模型变更] 之外的引用点（无） |

**验收**：fake prisma 用例全绿；AGENTS.md 迁移步骤为 5 步且含备份。

---

## W3 · 收尾

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 3.1 | 验收清单更新 | `docs/acceptance/phase-2-3-checklist.md` | 新增「G. 自动化验证」节：G1 质量门命令全绿、G2 工具参数校验用例存在且通过、G3 seq 不变量用例通过；前端状态机触发器写入验收原则备注表 |
| 3.2 | 常驻层文档审计 | 根/子 `AGENTS.md` | 根 AGENTS.md「根目录命令」是否需要补测试命令（已有 lint/test 在子项目）；`apps/server/AGENTS.md` 单测清单行更新（新增 spec 文件） |
| 3.3 | 索引同步 | `docs/README.md` | Phase 3.5 行：实施清单 + 验收清单指向 + 状态 |

**验收**：`pnpm -r lint && pnpm --filter @shiguang/server test` 一次全绿；文档与代码一致。
