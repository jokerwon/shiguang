# ADR-0002: 菜谱 Schema 扩展 —— 食材用量 + 营养三要素

- **状态**:已接受
- **日期**:2026-07-29
- **决策者**:Kai(经 grill 会话确认)

## 背景 (Context)

现有 Recipe schema 存在两处"深度空洞":

1. `ingredients` 为 `string[]`,详情页每样食材均显示"适量",**无法照着做**。
2. 仅有 `kcal` 一个营养数值;`high-protein / low-carb / low-cal` 等偏好是手工 boolean tag,无法动态计算、无法个性化。

同时规划将菜谱从 12 道扩至 80–100 道。若沿用旧 schema,这些空洞会被带入所有新菜,且 12 道老菜后续仍需返工回填。

## 决策 (Decision)

扩展 Recipe schema,新增两类字段:

1. **食材用量**:`ingredients` 从 `string[]` 改为 `{ name: string; amount: string }[]`。
2. **营养三要素**:新增 `protein`、`carb`、`fat`(单位:克)。

对 12 道老菜执行**一次性回填**;新增字段纳入 AI 批量生成的输出 schema。

明确**不新增**:难度、份数、辣度、过敏原独立字段(过敏原从 ingredients 推导,辣度作 tag)。

## 理由 (Rationale)

- 食材用量把"展示型菜谱"变为"可烹饪菜谱",是内容深度最硬的一块。
- 营养三要素让偏好从手工 tag 变为**可计算的数值**,为个性化推荐(健康目标排序)提供真数据,而非靠人工标签猜。
- 字段克制:每加一个字段 = 80+ 新菜填充 + 12 道老菜回填的持续债务,先打穿这两个最高杠杆的。

## 备选方案 (Alternatives Considered)

- **再加难度 + 份数**:AI 生成能顺手填,但份数暂无消费者,老菜回填成本高,留待下版。
- **再加辣度 + 过敏原字段**:过敏原可从 ingredients 推导,辣度可作 tag,专门字段偏重。
- **不改 schema 只扩量**:空洞被放大到 80+ 道菜,后续必然返工,否。

## 后果 (Consequences)

- 正面:菜谱可烹饪、营养可计算;个性化推荐有真数据支撑。
- 负面:12 道老菜需回填;`ingredients` 结构变更影响前端 `matchScore`、详情页、seed、AI 生成脚本,需同步修改。
- 注意:`matchScore` 的双向 `includes` 匹配逻辑需适配 `{name, amount}` 结构(取 `name` 参与匹配)。

**相关 ADR**:[0001](0001-theme-content-depth-personalization.md) [0003](0003-recipe-content-expansion.md) [0005](0005-personalized-recommendation.md)
