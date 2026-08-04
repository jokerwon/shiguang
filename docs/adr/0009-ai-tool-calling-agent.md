# ADR-0009: AI Tool-Calling Agent —— 工具清单、注入演进与分级确认

- **状态**:已接受
- **日期**:2026-08-04
- **决策者**:Kai(经 grill 会话确认)

## 背景 (Context)

ADR-0006 的上下文注入让 AI 推荐落在真实菜谱上,但它是「盲动」的:不能查库、不能改数据,候选菜谱在 prompt 构建时一次性钉死。ADR-0008 确定本阶段主题为 AI 能力跃迁,本条定义 tool-calling 的具体形态。

技术前提已验证:当前 `MODEL_NAME` 指向的 OpenAI 兼容端点支持 function calling(tools 参数 + 流式 tool_calls)。

## 决策 (Decision)

### 工具清单

**只读工具(Phase 3)**:
- `search_recipes` — 按食材/菜系/标签/时长/营养条件检索菜谱库
- `get_recipe` — 单道菜谱详情
- `get_pantry` / `get_favorites` / `get_preferences` — 查用户数据

**写工具 · 直接执行(Phase 3)** — pantry 与收藏:
- `add_pantry_items` / `remove_pantry_items`
- `set_favorite`(收藏/取消收藏)

**写工具 · 需确认(Phase 4)** — 偏好档案:
- `propose_preference_update` — **不直接执行**,返回「待确认草稿」

### 注入策略演进(修订 ADR-0006)

- **保留注入**:偏好档案 + pantry 现有食材(便宜、每轮都需要,是推荐与安全的基准上下文)。
- **移除注入**:top 5–8 候选菜谱不再每轮注入,改为 `search_recipes` 工具按需查询。
- 推荐算法(`RecommendationService`)仍作为工具背后的检索/排序实现,单一事实源不变。

### 分级确认 (Tiered Confirmation)

按误操作后果分两级:

| 级别 | 范围 | 机制 |
|------|------|------|
| 直接执行 + 可撤销 | pantry、收藏 | AI 调工具直接落库;前端在消息流渲染**操作卡片**(「已添加 牛腩 到食材清单」),附「撤销」按钮,点击调同一 API 逆向操作;复用现有 SWR 乐观更新/回滚 |
| 显式确认 | 偏好档案(忌口/过敏原/健康目标) | 工具只返回待确认草稿;前端渲染**确认卡片**展示变更 diff;用户点「确认」后前端直接调现有 `PUT /preferences`,再把结果告知 AI |

**安全红线:确认动作不依赖 AI 理解用户意图**——用户对确认卡片的操作是前端按钮,不是一句「好的」让 AI 自行判断。过敏原写错有真实安全后果,此路径必须确定性。

## 理由 (Rationale)

- 「偏好注入 + 菜谱用工具」是成本与质量的平衡点:偏好/pantry 每轮必用且量小,注入最划算;候选菜谱量大且查询条件随对话变化,工具按需查更准更省。全工具化每轮多几次 round-trip,延迟与成本双涨,否。
- 分级确认而非全部确认:「动嘴不动手」的价值场景要求 pantry/收藏零摩擦;全部自动则在过敏原场景出人命,两级是唯一合理切分。
- 前端确认卡片而非对话内确认:模型误解「确认意图」是真实失败模式,关键写操作必须走确定性 UI 路径。

## 备选方案 (Alternatives Considered)

- **全量注入保留 + 工具补充**:每轮付双份 token(注入候选 + 工具查询),否。
- **全工具化**(system prompt 只留行为准则):最 agentic,但每轮多次工具往返,延迟/成本不可接受,否。
- **JSON 指令协议**(模型输出结构化动作,后端解析):仅作为端点不支持 function calling 时的退路,当前不需要。

## 后果 (Consequences)

- 正面:AI 从顾问变代理;token 成本结构优化(菜谱候选从每轮固定注入变按需);写操作有确定性的安全边界。
- 负面:chat 变为多轮 tool round-trip 架构,流式响应需处理 tool_calls 增量;前端需渲染工具调用过程与两类卡片(操作/确认);undo 需维护操作的可逆映射。
- 影响:ADR-0006 的候选菜谱注入被本条取代(偏好/pantry 注入仍有效);`ChatService` 需重构为 tool-loop;前端对话页引入工具渲染(ai-elements 已具备 Tool 组件基础)。

**相关 ADR**:[0006](0006-ai-context-injection.md)(部分被本条修订) [0008](0008-theme-ai-capability-leap.md) [0010](0010-persistent-conversations.md)
