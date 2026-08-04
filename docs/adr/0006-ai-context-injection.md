# ADR-0006: AI 对话升级 —— 上下文注入到 System Prompt(非 Tool-Calling Agent)

- **状态**:已接受(候选菜谱注入部分已被 [ADR-0009](0009-ai-tool-calling-agent.md) 取代;偏好+pantry 注入仍有效)
- **日期**:2026-07-29
- **决策者**:Kai(经 grill 会话确认)

## 背景 (Context)

当前 AI 对话是"盲"的:`ChatService.stream()` 裸调 `streamText`,**不给模型任何工具**;`setPromptContext()` 已写好却从无人调用。用户问"冰箱里有鸡蛋西红柿能做什么",模型凭常识瞎答,不知道库里有哪些菜谱、用户 pantry 有什么、偏好是什么。它是个聊天玩具,不是推荐引擎。

## 决策 (Decision)

**本版做轻量升级:将用户上下文注入 system prompt,不实现 tool-calling Agent。**

**注入内容(三样)**:
- 偏好档案(忌口 / 过敏原 / 健康目标)
- pantry 现有食材
- top 5–8 候选菜谱(复用 `/recipes/personalized` 的推荐结果)

**实现**:
- `/chat` 增加 JWT 认证 guard,按 `sub` 查用户数据(所有 `(screen)` 页面本就强制登录,非新门槛)。
- 后端在构建 system prompt 时,先用推荐算法预筛出真实候选菜谱,连同偏好、pantry 一并注入。
- AI 从候选中组织语言推荐,**推荐结果约束在真实菜谱上**,不编造库里没有的菜。

**不注入**:收藏列表、最近对话 / 浏览历史(边际价值低,且历史需新增存储)。

## 理由 (Rationale)

- 用很低的成本拿到 tool-calling 约 80% 的效果(约束在真实数据上),却**不改 chat 架构**(无多轮 tool round-trip、前端无需渲染工具调用过程)。
- 候选菜谱复用 `/recipes/personalized`,推荐逻辑单一事实源。
- 架构不动、风险小,符合本版"轻量升级"定位。

## 备选方案 (Alternatives Considered)

- **Tool-calling Agent**(`searchRecipes` / `getUserPantry` / `getUserPreferences` 工具):更通用、可实时查库,但改变 chat 架构、前端需渲染工具调用,工作量大,留待后续版本。
- **注入收藏 / 历史**:边际价值低,历史需新增存储,否。

## 后果 (Consequences)

- 正面:AI 推荐落在真实菜谱上,从玩具变推荐助手;架构零改动;成本低。
- 负面:候选在 prompt 构建时一次性确定,AI 无法多轮动态查库(如用户中途改条件);token 成本随注入候选数略增。
- 影响:`ChatService.setPromptContext()` 需被实际调用并支持从 DB 读用户数据;`/chat` 从公开接口变为需认证。

**相关 ADR**:[0001](0001-theme-content-depth-personalization.md) [0004](0004-server-side-user-data.md) [0005](0005-personalized-recommendation.md)
