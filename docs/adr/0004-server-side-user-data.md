# ADR-0004: 用户数据服务端持久化 —— Pantry / Favorite / UserPreference

- **状态**:已接受
- **日期**:2026-07-29
- **决策者**:Kai(经 grill 会话确认)

## 背景 (Context)

pantry(食材清单)、收藏(favorites)、筛选(filters)当前均存于浏览器 `localStorage` + CustomEvent,后端完全无感知。这导致:

- 换设备 / 登出即丢,无法跨设备。
- 服务端无法读取用户状态 → AI 上下文注入、个性化推荐都拿不到数据。
- 「个性化」主题的地基是"服务端知道用户是谁、有什么、喜欢什么",数据锁在 localStorage 则个性化沦为一次性 session 把戏。

## 决策 (Decision)

将 pantry、收藏、偏好**迁移到服务端持久化**:

- 新增三张表:`PantryItem`、`Favorite`、`UserPreference`。
- 前端对应 hooks(`usePantry` / `useFavorites`)由 localStorage 实现改为调用后端 API。
- **`useFilters`(筛选)保留在 localStorage,不迁移**——筛选是"本次想找什么"的临时意图,非长期画像。

**本地数据迁移策略:直接放弃。** 项目处于开发期、无真实存量用户,localStorage 中为测试数据,不值得为此写合并 + 冲突解决逻辑。上线即切服务端,用户重新添加。

## 理由 (Rationale)

- 服务端持久化是个性化的**前提**:跨设备、登出不丢、为推荐沉淀数据。
- filters 语义上是临时意图,留本地反而贴切,且少改一处。

## 备选方案 (Alternatives Considered)

- **前端随请求带上下文(不持久化)**:后端零改,但换设备即丢、每次重复传,个性化无沉淀,否。
- **本地数据一次性合并上云**:有真实存量用户时才值得;当前无,过度工程。
- **双跑(本地为主 + 后台同步)**:风险最低但代码最复杂,本版不需要。

## 后果 (Consequences)

- 正面:数据架构一次立起;跨设备;为 AI 注入与个性化推荐提供数据源。
- 负面:3 张新表 + 前后端收藏/pantry 全改,工作量大;现有用户本地数据丢失(可接受,无真实用户)。
- 影响:`usePantry` / `useFavorites` 的 SSR-safe localStorage 模式被 API 调用取代,需处理加载态与错误态。

**相关 ADR**:[0001](0001-theme-content-depth-personalization.md) [0005](0005-personalized-recommendation.md) [0006](0006-ai-context-injection.md)
