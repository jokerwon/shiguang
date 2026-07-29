# ADR-0007: 缺料购物清单 —— 菜谱详情页即时快照,不持久化

- **状态**:已接受
- **日期**:2026-07-29
- **决策者**:Kai(经 grill 会话确认)

## 背景 (Context)

个性化范围包含「缺料购物清单」:选中菜谱后,自动算出 pantry 还缺什么食材。需确定其形态——一次性快照还是持久化清单,差别在于是否新增存储与独立页面。

## 决策 (Decision)

**菜谱详情页即时快照,不持久化。**

- 在菜谱详情页,基于 pantry 与菜谱食材用量**即时计算**缺料,以可勾选的区块 / 浮层呈现。
- **不新增 ShoppingList 表**,不做独立清单页。
- 缺料是 pantry 与菜谱用量的**纯函数**,pantry 变化时清单自动重算。

## 理由 (Rationale)

- 本版已新增 3 张表(PantryItem / Favorite / UserPreference),再加 ShoppingList 表 + 独立清单页会压垮版本。
- 缺料本质是纯函数,现算即可,无需持久化——pantry 变了清单自然变。
- 详情页就地呈现贴合"看菜谱→决定做→看缺什么"的真实动线。
- 食光不是购物 App,独立持久清单非本版必需。

## 备选方案 (Alternatives Considered)

- **独立持久清单(新表 + 清单页)**:跨菜谱累积、可标记已买,但属购物 App 形态,本版过重,否。
- **快照 + 一键导出 / 分享**:锦上添花,可作为后续轻量增强(复制文本),本版不做。

## 后果 (Consequences)

- 正面:零新表、零新页面;打通"想做→缺什么→去买"闭环;实现轻。
- 负面:无法跨菜谱累积购物项;清单状态(勾选)不保存,离开即重置。
- 依赖:需 `ingredients` 为 `{name, amount}` 结构(见 [ADR-0002](0002-recipe-schema-depth.md))以给出缺料用量。

**相关 ADR**:[0001](0001-theme-content-depth-personalization.md) [0002](0002-recipe-schema-depth.md) [0004](0004-server-side-user-data.md)
