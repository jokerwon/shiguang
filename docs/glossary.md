# 食光 (Shiguang) 领域术语表

> 本术语表定义「下一版(内容深度 + 个性化)」涉及的核心领域概念,作为前后端、AI prompt、文档的统一语言 (Ubiquitous Language)。

## 核心实体 (Core Entities)

### Recipe(菜谱)
一道可烹饪的菜。系统的核心内容单元。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 唯一标识 |
| `name` | string | 菜名,唯一(用于 upsert / AI 生成去重) |
| `desc` | string | 一句话描述 |
| `cuisine` | enum | 菜系:`HOME / WESTERN / JAPANESE / SICHUAN / LIGHT` |
| `time` | number | 烹饪时长(分钟) |
| `kcal` | number | 热量(千卡) |
| `protein` | number | **新增** 蛋白质(克),估算值 |
| `carb` | number | **新增** 碳水化合物(克),估算值 |
| `fat` | number | **新增** 脂肪(克),估算值 |
| `img` | string | 图片 URL,**本版不使用真图**,统一走占位符 |
| `tags` | enum[] | 偏好标签:`VEGETARIAN / HIGH_PROTEIN / LOW_CAL / LOW_CARB / QUICK / RICE_FRIENDLY / COMFORTING` |
| `ingredients` | `{name, amount}[]` | **schema 变更** 食材及用量(原为 `string[]`) |
| `steps` | string[] | 烹饪步骤 |

### User(用户)
注册用户。JWT 认证,`{ sub: userId, email }`,7 天有效期。

### PantryItem(食材清单项)
用户"现有食材"的一条记录。**本版从 localStorage 迁移到服务端**,成为个性化推荐的输入。

### Favorite(收藏)
用户收藏的菜谱。**本版从 localStorage 迁移到服务端**。

### UserPreference(偏好档案)
用户的长期饮食画像,**本版新增**。个性化的核心输入。

| 维度 | 形态 | 作用 |
|------|------|------|
| `dislikedIngredients` | string[] | 忌口/不吃的食材(如"香菜")→ 推荐/AI 时排除 |
| `allergens` | string[] | 过敏原(花生/海鲜/麸质/乳制品)→ 安全硬过滤 |
| `healthGoal` | enum | 健康目标:`BALANCED / FAT_LOSS / MUSCLE_GAIN` → 营养加权排序 |

> **未采集**:饮食类型(素食/纯素)、偏好菜系。理由:素食可用 `VEGETARIAN` tag 兜住;菜系自述噪声大,留待后续用行为推断。

## 派生概念 (Derived Concepts)

### 匹配度 (Match Score)
菜谱与用户 pantry 的食材重叠度,`0–100`。算法:双向 `includes` 子串匹配,`have / total * 100`。**本版起首页个性化由服务端计算,前端 `matchScore` 仅保留给食材页本地即时反馈。**

### 缺料 (Missing Ingredients)
菜谱 `ingredients` 中、pantry 未覆盖的部分。是 pantry 与菜谱用量的**纯函数**,不持久化。在菜谱详情页以"购物清单"快照形式呈现。

### 购物清单 (Shopping List)
**本版定义**:菜谱详情页内,基于缺料即时生成的可勾选快照,**不持久化**。pantry 变化时清单自动重算。

### 个性化推荐 (Personalized Recommendation)
首页"今日推荐"的升级版。服务端 `GET /recipes/personalized` 计算,流程:
1. **硬过滤**:排除含忌口食材、过敏原的菜谱
2. **加权排序**:pantry 匹配度 + 时间适配 + 新鲜度轮换
3. 返回成品列表

### 时间适配 (Time Adaptation)
根据当前时段推导的隐式排序信号(如晚间优先 ≤30min 的菜),无需用户配置。

### 新鲜度轮换 (Freshness Rotation)
避免首页总推同样菜谱的机制。**本版采用无状态实现**:以 `userId + 当天日期` 为随机种子排序,按天轮换、当天内稳定,不新增存储。

## AI 相关 (AI Concepts)

### 上下文注入 (Context Injection)
**本版 AI 对话的升级方式**。后端在构建 system prompt 时,注入:
- 偏好档案(忌口/过敏原/健康目标)
- pantry 现有食材
- top 5–8 候选菜谱(复用个性化推荐结果)

使 AI 推荐**约束在真实菜谱上**,不编造库里没有的菜。**本版不实现 tool-calling Agent。**

### 待审区 (Staging Area)
AI 批量生成菜谱的缓冲区。生成的菜谱**先入待审区(JSON / staging 表),人工抽检 + 校验后再导入 Recipe 表**,不直接入库。

### 营养估算值 (Estimated Nutrition)
菜谱的 `protein / carb / fat` 由 AI 生成时估算得出,详情页需标注"营养为估算值"以避免误导。

## 筛选 (Filters)
筛选页的临时筛选条件(菜系/标签/时间)。**保留在 localStorage,不迁移**——它表达"本次想找什么"的临时意图,而非"我是谁"的长期画像。

---

**相关文档**:[决策记录 (ADR)](./adr/)
