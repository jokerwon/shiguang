# 食光 (Shiguang) 领域术语表

> 本术语表定义「内容深度 + 个性化」(Phase 1)与「AI 能力跃迁」(Phase 2–3)涉及的核心领域概念,作为前后端、AI prompt、文档的统一语言 (Ubiquitous Language)。
> **本表只定义概念语义。字段级事实(字段名、类型、枚举取值)一律以 `apps/server/prisma/schema.prisma` 为准，此处不复制。**

## 核心实体 (Core Entities)

### Recipe(菜谱)
一道可烹饪的菜。系统的核心内容单元。
- `name` 唯一，用于 upsert 与 AI 生成去重
- `ingredients` 为 `{name, amount}[]`(食材 + 用量)，不是纯字符串数组
- `protein / carb / fat` 为估算值(见「营养估算值」)
- 图片不使用真图，统一走占位符(ADR-0003)

### User(用户)
注册用户。JWT 认证,`{ sub: userId, email }`,7 天有效期。

### PantryItem(食材清单项)
用户"现有食材"的一条记录。存储于服务端，是个性化推荐的输入。

### Favorite(收藏)
用户收藏的菜谱。存储于服务端。

### UserPreference(偏好档案)
用户的长期饮食画像，个性化的核心输入。三个维度：忌口食材、过敏原(安全硬过滤)、健康目标(营养加权排序)。

> **未采集**:饮食类型(素食/纯素)、偏好菜系。理由:素食可用 `VEGETARIAN` tag 兜住;菜系自述噪声大,留待后续用行为推断。

## 派生概念 (Derived Concepts)

### 匹配度 (Match Score)
菜谱与用户 pantry 的食材重叠度,`0–100`。算法:双向 `includes` 子串匹配,`have / total * 100`。首页个性化由服务端计算；前端 `matchScore` 仅保留给食材页本地即时反馈。

### 缺料 (Missing Ingredients)
菜谱 `ingredients` 中、pantry 未覆盖的部分。是 pantry 与菜谱用量的**纯函数**,不持久化。在菜谱详情页以"购物清单"快照形式呈现。

### 购物清单 (Shopping List)
菜谱详情页内,基于缺料即时生成的可勾选快照,**不持久化**。pantry 变化时清单自动重算。

### 个性化推荐 (Personalized Recommendation)
首页"今日推荐"的升级版。服务端 `GET /recipes/personalized` 计算,流程:
1. **硬过滤**:排除含忌口食材、过敏原的菜谱
2. **加权排序**:pantry 匹配度 + 时间适配 + 新鲜度轮换
3. 返回成品列表

### 时间适配 (Time Adaptation)
根据当前时段推导的隐式排序信号(如晚间优先 ≤30min 的菜),无需用户配置。

### 新鲜度轮换 (Freshness Rotation)
避免首页总推同样菜谱的机制。无状态实现:以 `userId + 当天日期` 为随机种子排序,按天轮换、当天内稳定,不新增存储。

## AI 相关 (AI Concepts)

### 上下文注入 (Context Injection)
后端在构建 system prompt 时注入用户上下文,使 AI 推荐**约束在真实数据上**。
- Phase 1 注入:偏好档案(忌口/过敏原/健康目标)、pantry 现有食材、top 5–8 候选菜谱(ADR-0006)。
- Phase 2 演进(ADR-0009):偏好 + pantry 保留注入;**候选菜谱不再每轮注入,改为 `search_recipes` 工具按需查询**。

### 工具调用 (Tool Calling)
Phase 2 起 AI 对话的架构(ADR-0009)。模型通过 function calling 主动调用后端工具:只读工具(`search_recipes` / `get_recipe` / `get_pantry` / `get_favorites` / `get_preferences`)与写工具(pantry/收藏直接执行;偏好档案走待确认草稿)。推荐算法仍是工具背后的单一事实源。

### 分级确认 (Tiered Confirmation)
写工具按误操作后果分两级处理(ADR-0009):
- **直接执行 + 可撤销**:pantry、收藏 —— AI 直接落库,UI 给 undo 入口。
- **显式确认**:偏好档案 —— 工具只产出待确认草稿,用户在前端确认卡片上点击才生效。

### 操作卡片 (Action Card)
AI 执行写操作后,前端在消息流中渲染的结果卡片(如「已添加 牛腩 到食材清单」),附「撤销」按钮,撤销调同一 API 逆向操作。渲染数据存于 `Message.toolCalls`,刷新后仍可显示。

### 待确认草稿 (Pending Draft)
`propose_preference_update` 工具的返回物:一份**未生效**的偏好变更。前端渲染确认卡片展示变更 diff,用户点「确认」后前端直接调 `PUT /preferences` 落库。**确认动作不经过 AI**,是确定性的 UI 路径(过敏原安全红线)。

### 会话 (Conversation) / 消息 (Message)
Phase 2 起新增的核心实体(ADR-0010)。一个用户可有多个会话;会话包含有序消息(role: user / assistant / tool)。持久化到服务端,刷新/换设备不丢。UI 为最小会话列表:切换 + 删除,不重命名/置顶/搜索。

### 滑窗 (Sliding Window)
每轮请求只携带最近 N 条消息原文作为历史上下文(Phase 2 默认 N=20),控制 token 成本。

### 会话摘要 (Conversation Summary)
Phase 3 新增。超出滑窗的历史由 AI 异步压缩为摘要,随 system prompt 注入;超长会话上下文不丢、成本有界。

### 待审区 (Staging Area)
AI 批量生成菜谱的缓冲区。生成的菜谱**先入待审区(JSON / staging 表),人工抽检 + 校验后再导入 Recipe 表**,不直接入库。

### 营养估算值 (Estimated Nutrition)
菜谱的 `protein / carb / fat` 由 AI 生成时估算得出,详情页需标注"营养为估算值"以避免误导。

## 筛选 (Filters)
筛选页的临时筛选条件(菜系/标签/时间)。**保留在 localStorage,不迁移**——它表达"本次想找什么"的临时意图,而非"我是谁"的长期画像。

---

**相关文档**:[决策记录 (ADR)](./adr/)
