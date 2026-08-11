# 食光 (Shiguang) 领域术语表

> 本术语表定义「内容深度 + 个性化」(Phase 1)与「AI 能力跃迁」(Phase 2–3)与「移动主战场」(Phase 5)涉及的核心领域概念,作为前后端、移动端、AI prompt、文档的统一语言 (Ubiquitous Language)。
> **本表只定义概念语义。字段级事实(字段名、类型、枚举取值)一律以 `apps/server/prisma/schema.prisma` 为准，此处不复制。**

## 核心实体 (Core Entities)

### Recipe(菜谱)
一道可烹饪的菜。系统的核心内容单元。
- 名称用于 upsert 与 AI 生成去重
- 食材带用量(非纯字符串数组)，是匹配与缺料计算的基础
- 营养三要素为估算值(见「营养估算值」)
- 图片不使用真图，统一走占位符(ADR-0003)

> 字段名/类型/枚举取值见 `apps/server/prisma/schema.prisma`。

### User(用户)
注册用户。双 token 认证（ADR-0013）：15 分钟 access(JWT) + 30 天滑动 refresh(opaque，bcrypt 哈希落库)。`role` 字段已删（零消费方死重）。

### RefreshToken(刷新令牌登记)
refresh token 的轮换登记表（ADR-0013）。一次一换、30 天滑动过期；已作废 token 再提交触发整族吊销。字段见 `apps/server/prisma/schema.prisma`。

### PantryItem(食材清单项)
用户"现有食材"的一条记录。存储于服务端，是个性化推荐的输入。

### Favorite(收藏)
用户收藏的菜谱。存储于服务端。

### UserPreference(偏好档案)
用户的长期饮食画像，个性化的核心输入。三个维度：忌口食材、过敏原(安全硬过滤)、健康目标(营养加权排序)。

> **未采集**:饮食类型(素食/纯素)、偏好菜系。理由:素食可用 `VEGETARIAN` tag 兜住;菜系自述噪声大,留待后续用行为推断。

## 派生概念 (Derived Concepts)

### 匹配度 (Match Score)
菜谱与用户 pantry 的食材重叠度。首页个性化由服务端计算；前端仅保留给食材页本地即时反馈。

> 算法实现见 `apps/server/src/recipe/recommendation.scoring.ts` 与 `apps/web/lib/recipes.ts`。

### 缺料 (Missing Ingredients)
菜谱食材中、pantry 未覆盖的部分。是 pantry 与菜谱用量的**纯函数**,不持久化。在菜谱详情页以"购物清单"快照形式呈现。

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
AI 执行写操作后,前端在消息流中渲染的结果卡片(如「已添加 牛腩 到食材清单」),附「撤销」按钮,撤销调同一 API 逆向操作。渲染数据随消息持久化,刷新后仍可显示。操作可用性边界:**刷新前可操作,刷新后只读**(验收原则;确认卡片同此边界,ADR-0012)。

### 待确认草稿 (Pending Draft)
偏好写工具的返回物:一份**未生效**的偏好变更,内容是**操作集**(`addDisliked` / `removeDisliked` / `addAllergens` / `removeAllergens` / `setHealthGoal`),不是目标快照(ADR-0012)。前端渲染确认卡片展示变更 diff;点「确认」后前端读当前偏好、apply 操作集、调偏好落库接口——并行修改不会被快照覆盖。**确认动作不经过 AI**,是确定性的 UI 路径(过敏原安全红线;E4 由架构保证——工具结构上无落库能力)。与操作卡片共用边界:**刷新前可确认,刷新后卡片只读**,过期草稿引导用户重新发起;确认状态不持久化(消息 parts 不可变)。

### 会话 (Conversation) / 消息 (Message)
Phase 2 起新增的核心实体(ADR-0010,表 schema 经 ADR-0011 重审)。一个用户可有多个会话;会话包含有序消息(user/assistant 两类角色,工具调用信息在 assistant 消息的 `parts` 内)。持久化到服务端,刷新/换设备不丢。UI 为最小会话列表:切换 + 删除,不重命名/置顶/搜索。

### 当前会话归属 (Active Conversation Ownership)
当前会话 id 由 **URL 拥有**(ADR-0011):`/chat/new`(新会话)、`/chat/:id`(已有会话)。前端不再用 `useState` 持有当前会话 id,从 `useParams()` 读取;URL 是单一事实源,刷新可恢复、多标签共享同视图,并根治新建会话的并发竞态。

### 消息序号 (Message seq)
消息在会话中的单调递增序号(消息级,ADR-0011),`(conversationId, seq)` 唯一。取代此前靠 `createdAt` 排序的隐式顺序——seq 把顺序变成显式数据,与写入时机解耦,滑窗按 seq 取最近 N 条,顺序确定。

### 滑窗 (Sliding Window)
每轮请求只携带最近若干条消息原文作为历史上下文,控制 token 成本。窗口大小以代码为准。

### 会话摘要 (Conversation Summary)
超出滑窗的历史由 AI 压缩为摘要,随 system prompt 注入;超长会话上下文不丢、成本有界(ADR-0012 定稿机制):
- **异步生成**:每轮响应落库后检查溢出消息,攒够阈值后台压缩;用户请求路径零延迟
- **增量更新**:新摘要 = 压缩(旧摘要 + 新溢出消息),不做全量重算
- **存储**:`Conversation` 表 `summary` + `summaryUpToSeq` 两列
- **失败降级**:保持旧摘要、下轮重试,最坏退回纯滑窗(现状)

### 待审区 (Staging Area)
AI 批量生成菜谱的缓冲区。生成的菜谱**先入待审区(JSON / staging 表),人工抽检 + 校验后再导入 Recipe 表**,不直接入库。

### 长会话种子脚本 (Long-Conversation Seed Script)
摘要功能验收(F2/F3)的前置工具:直插 DB 构造 40+ 条消息的会话,再进程内直调摘要 service 预生成摘要(ADR-0012)。不走真实 API 回放(慢、烧 token、不可重复)。

### 营养估算值 (Estimated Nutrition)
菜谱的营养三要素由 AI 生成时估算得出,详情页需标注"营养为估算值"以避免误导。

### 离线只读缓存 (Offline Read Cache)
移动端的离线策略(ADR-0014):**只读、不写**。范围限定在「浏览链」,语义为「每查询键持久化最近成功响应 + stale-while-revalidate」;无网不可写(写路径仍在线,无写队列),回网自动刷新。

### 浏览链 (Browse Chain)
离线只读缓存覆盖范围的命名(ADR-0014):个性化推荐 → 菜谱详情 → 收藏 这一条核心浏览路径。离线范围的后续扩展(对话/推送等)以此为基线。

## 平台与架构 (Platform & Architecture)

### 移动端主战场 (Mobile-First Platform)
食光的平台战略(ADR-0014):移动端是主要使用入口,Web 为辅助。首发以原生 app(iOS 先行)落地;主张由原生能力(离线只读缓存、Keychain 常驻登录、原生体验)立住,而非功能面复刻 Web。

### 共享域层 (Shared Domain Layer)
`packages/domain` 共享包(ADR-0015):Web 与移动端共用的领域类型与纯函数,**框架无关**(无 React,不共享 UI)。Web 与服务端既有的中文标签重复随迁移消除。

## 协作实践 (Practices)

### grill 会话 (Grill Session)
本项目的决策评审实践:在做出架构/产品决策前,由另一角色(或自我对抗式审视)对草案进行拷问式盘问(grill),逼出隐藏假设、反例与失败路径,结论记入 ADR。ADR 与验收清单中的「经 grill 会话确认」即指此流程。

## 筛选 (Filters)
筛选页的临时筛选条件(菜系/标签/时间)。**保留在 localStorage,不迁移**——它表达"本次想找什么"的临时意图,而非"我是谁"的长期画像。

---

**相关文档**:[决策记录 (ADR)](./adr/)
