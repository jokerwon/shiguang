# Phase 3 实现任务清单 —— 更懂你

> 对应 [ADR-0008](../adr/0008-theme-ai-capability-leap.md)(分期)、[ADR-0009](../adr/0009-ai-tool-calling-agent.md)(分级确认)、[ADR-0010](../adr/0010-persistent-conversations.md)(滑窗+摘要)、[ADR-0012](../adr/0012-phase-3-preference-confirm-and-summary.md)(本期设计定稿)。
> **目标**:记忆的深度与安全。三块:① 偏好写入确认卡片(E)② 滑窗 + 会话摘要(F)③ 长会话种子脚本(F3 前置)。
> **不在本期**:独立打磨项(记 backlog);原子轮次(ADR-0011 Future Work)。本期「体验打磨」仅限 E/F 实现中长出的部分(ADR-0012 决策 1)。
> **完成判定**:[验收清单](../acceptance/phase-2-3-checklist.md) E1–E4 + F1–F3 全过。

## ⚠️ 关键前置发现

**1. `update_preferences` 工具不存在,E4 红线靠它的结构保证。** 现有写工具只有 `add_pantry_items` / `remove_pantry_items` / `set_favorite`([write-tools.ts](../../apps/server/src/chat/tools/write-tools.ts))。新工具的 `execute` **只产出草稿对象、不接触 `PreferenceService`**——「未确认不落库」由架构保证而非 prompt 自觉,这是 E4 的双保险。

**2. 确认路径全部复用现成件,零新 API。** `PUT /preferences` 支持部分字段更新([preference.service.ts](../../apps/server/src/preference/preference.service.ts) 的 `upsert`),前端 `updatePreferences` + `usePreferences`(乐观更新 + 失败回滚,[use-preferences.ts](../../apps/web/lib/use-preferences.ts))已存在。确认 = 前端 `fetchPreferences()` → apply 操作集(add 并集 / remove 差集 / healthGoal 覆盖)→ `updatePreferences(全量三字段)` → `mutate('/preferences')`(ADR-0012 决策 3)。

**3. 「刷新后只读」边界当前没有机制,且有活 bug。** A4 声称「刷新后撤销入口只读」,但 `ChatActionCard` 的 `undone` 是 `useState`([chat-action-card.tsx](../../apps/web/components/chat-action-card.tsx))——刷新后撤销按钮复活,且撤销基于 tool output 里的**过期 pantry 快照**做 `replacePantry`,会冲掉刷新后新增的食材。本期必须建立「历史消息只读」机制(区分 `setMessages` 历史与流式新消息),确认卡片与操作卡片**共用**,顺手修复此 bug。注意:前端启用 React Compiler,render 期禁读 `ref.current`(ADR-0011 实施勘误),只读标记用 state 不用 ref。

**4. 摘要触发点与滑窗常量位置现成。** 触发 = [chat.service.ts](../../apps/server/src/chat/chat.service.ts) `onFinish`(落库 assistant 消息后);滑窗 = `CONTEXT_WINDOW = 20`([conversation.service.ts:14](../../apps/server/src/conversation/conversation.service.ts#L14))。溢出区 = `seq ≤ maxSeq − CONTEXT_WINDOW` 且 `seq > summaryUpToSeq`。触发阈值(溢出攒够多少条起一次摘要)为本期新常量,建议 10,以代码为准。

**5. 摘要注入照 `buildSystemPrompt` 现有模式加段。** [context-builder.ts](../../apps/server/src/chat/prompts/context-builder.ts) 的 `dynamicParts` 组装模式直接沿用,加「会话摘要:…」一行;`ChatService.stream` 读会话行时多取 `summary` 字段。

**6. 摘要 service 必须能脱离 Nest 容器直调。** 种子脚本要进程内调用它(ADR-0012 决策 5),所以摘要逻辑写成**纯函数 + 显式依赖注入**(与 tools 的单测友好风格一致),Nest service 只做薄封装。脚本运行模式照 [scripts/generate-recipes.ts](../../apps/server/scripts/generate-recipes.ts)(`tsx` + `dotenv/config`)。

**7. 摘要输入的消息序列化要处理 tool parts。** 直接喂 UIMessage JSON 会给 LLM 一堆结构噪音。序列化规则:text part 取原文;`tool-*` part 折成一行(如「[操作] 添加食材:牛腩」),复用/对齐前端 `TOOL_LABELS` 的语义([tool.tsx](../../apps/web/components/ai-elements/tool.tsx))。

---

## W0 · Schema + 摘要 service(后端基础)

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 0.1 | `Conversation` 加两列 | `apps/server/prisma/schema.prisma` | `summary String?`、`summaryUpToSeq Int?`;迁移 + `db:generate`(独立 migration) |
| 0.2 | 摘要纯逻辑 | `apps/server/src/chat/summary.ts`(新增) | 纯函数:`summarizeOverflow(model, oldSummary, messages)` → 新摘要文本。消息序列化规则见前置发现 7。依赖显式注入,不进 Nest 容器也能跑 |
| 0.3 | 触发钩子 | `apps/server/src/chat/chat.service.ts` | `onFinish` 落库后:查 `max(seq)` 与 `summaryUpToSeq`,溢出超阈值 → fire-and-forget 调 0.2 + 更新会话行(`.catch` 记日志,**不 throw**——失败降级 = 纯滑窗) |
| 0.4 | 摘要注入 | `apps/server/src/chat/prompts/context-builder.ts`、`chat.service.ts` | `PromptContext` 加 `conversationSummary?`;`buildSystemPrompt` 加段;`stream` 查会话时取 `summary` |
| 0.5 | 单测 | `apps/server/src/chat/summary.spec.ts` | 序列化规则(text/tool 混合 parts)、增量拼接(旧摘要+新溢出)、空溢出早退。零 DB 风格,参考 `recommendation.scoring.spec.ts` |

**验收**:40+ 条会话发一条消息后,DB 会话行出现 `summary` 与 `summaryUpToSeq`;下一轮 system prompt 含摘要段;摘要生成失败(可临时改坏端点验证)不影响主对话。

---

## W1 · `update_preferences` 工具(后端)

> 依赖 W0 无耦合,可与 W0 并行。

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 1.1 | 工具定义 | `apps/server/src/chat/tools/write-tools.ts`、`write-tools-logic.ts` | 输入:`addDisliked?` / `removeDisliked?` / `addAllergens?` / `removeAllergens?` / `setHealthGoal?`(全可选但至少一项)。`execute` 只组装草稿对象返回,**不调任何 service**;output 含操作集 + 当前偏好快照(仅供卡片渲染 diff 对照,不作确认依据) |
| 1.2 | prompt 规范 | `apps/server/src/chat/prompts/behavior.ts`、`guardrails.ts` | 偏好变更必须走 `update_preferences` 草稿;**不得声称「已保存/已记住」**(只说「已为你准备变更,请确认」);草稿挂出期间可当场回避用户口头忌口,但推荐仍以注入偏好为准;E4 诱导(「你看着办直接改」)一律回应「需要你点确认」 |
| 1.3 | 单测 | `apps/server/src/chat/tools/index.spec.ts` | 工具返回草稿且**零副作用**(断言 mock deps 未被调用);空操作集(全字段缺省)拒绝或归一化 |

**验收**:说「我不吃香菜」→ 消息流出现草稿 tool part,`PUT /preferences` **零调用**(DevTools 网络面板验证);说「好的你看着办直接改吧」→ AI 不产出任何落库行为(E4)。

---

## W2 · 前端:历史只读机制 + 确认卡片

> 依赖 W1 的 output 形态。

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 2.1 | 历史消息只读机制 | `apps/web/app/(screen)/chat/[[...slug]]/page.tsx` | `setMessages(历史)` 时记录历史消息 id 集合(state,非 ref——见前置发现 3);渲染时透传 `readOnly` 给 `ToolPartView` → 卡片。**同时接到 `ChatActionCard` 的撤销按钮**,修 A4 机制缺口与过期快照 bug |
| 2.2 | 确认卡片组件 | `apps/web/components/chat-confirm-card.tsx`(新增) | 渲染操作集 diff(add 绿 / remove 灰 / **过敏原 remove 警告色** / healthGoal 前后对照);「确认」= 前置发现 2 的读-apply-PUT 流程,成功后卡片变「已生效」(会话内 state);「取消」变「已取消」;`readOnly` 时显示「该草稿已过期,请再告诉我一次」 |
| 2.3 | 注册渲染 | `apps/web/components/ai-elements/tool.tsx` | `TOOL_LABELS` 加 `update_preferences`;完成态 → 确认卡片(独立于 `WRITE_TOOLS` 集合——它不是写工具,不渲染操作卡片) |

**验收**:E1(草稿挂出时偏好页未变)→ E2(确认后落库、推荐避开)→ E3(取消/忽略不落库);刷新后卡片只读;设置页并行修改不被确认覆盖(决策 3 场景实测)。

---

## W3 · 长会话种子脚本

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 3.1 | 种子脚本 | `apps/server/scripts/seed-long-conversation.ts`(新增) | `tsx` + `dotenv/config`(照 `generate-recipes.ts` 模式)。直插 DB:一个会话 + 40+ 条消息(text parts,seq 连续,内容围绕 2–3 个可探测话题,如「减脂餐」→「周末聚餐」);随后**进程内直调 W0.2 纯函数**预生成摘要并写回会话行。幂等:重复跑先删旧种子会话(固定 title 前缀识别) |
| 3.2 | 脚本入口 | `apps/server/package.json` | `seed:long-conversation` script;根 `package.json` 是否加转发,随 `recipes:generate` 惯例 |

**验收**:跑完脚本 → 打开种子会话发第一条探测消息(「我们之前聊的减脂餐里,有没有适合带饭的?」)→ 回答体现滑窗外话题(F2 一次走查到位)。

---

## W4 · 收尾

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 4.1 | 全量走查 | [验收清单](../acceptance/phase-2-3-checklist.md) | E1–E4 + F1–F3 逐条过;回归 A4(撤销只读机制生效)与 C1–C3(确认卡片改动未碰操作卡片路径) |
| 4.2 | 常驻层文档审计 | 根/子 `AGENTS.md`、`docs/glossary.md` | 按 Phase 收尾纪律核对文档与代码实际行为一致(新工具、摘要、种子脚本入口) |
| 4.3 | 索引同步 | `docs/README.md`、`docs/adr/README.md` | Phase 3 行状态翻转;确认无指向旧路径的断链 |
