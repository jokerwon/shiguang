# ADR-0015: 共享域层 packages/domain —— Web 与移动端共用的领域类型与纯函数

- **状态**:已接受
- **日期**:2026-08-11
- **决策者**:Kai(经 grill 会话确认)
- **驱动**:原生 app 首发（ADR-0014）需要移动端复用 Web 的领域素材，避免双份漂移

## 背景 (Context)

原生 app（ADR-0014）要与 Web 共享领域素材。探索发现这些素材**已经存在，且已有重复**：

- Web 侧 `apps/web/lib/recipes.ts`：`Recipe`/`Ingredient` 类型、`CUISINE_LABELS`/`PREF_LABELS`/`TIME_LABELS` 标签映射、`matchScore`/`matchRecipes`/`hasIng`/`missingIngredients`/`resolveIng`/`norm` 纯函数。
- 服务端 `apps/server/src/recipe/recipe.mapper.ts`：`CUISINE_ZH`/`TAG_ZH` 中文标签映射与 Web 的 `CUISINE_LABELS`/`PREF_LABELS` **同值重复**（代码注释自述「与前端 CUISINE_LABELS/PREF_LABELS 对齐」）——这是既有的双份漂移。

grill 拷问的取舍：选择共享包（而非移动端自带副本），且选择**迁移 Web**（而非只建不动）——「Web 维持现状」只约束不加新功能，不约束改 import；真正单一事实源，否则共享包与 Web 副本继续漂移。

## 决策 (Decision)

1. 新增 **`packages/domain`**（workspace package，挂 `@shiguang/domain`），收编：
   - **领域类型**：`Recipe`/`Ingredient`、`UserPreference`/`Favorite`/`PantryItem` 的 DTO 形状。
   - **纯函数与常量**：`matchScore`/`matchRecipes`/`hasIng`/`missingIngredients`/`resolveIng`/`norm`；菜系/偏好/时间的 key 枚举与中文标签映射（`CUISINE_LABELS`/`PREF_LABELS`/`TIME_LABELS`）。
2. **框架无关**：只放类型 + 纯函数，**不共享 React 组件 / hooks**（RN 与 Web 渲染差异大，共享 UI 层是过度设计）。
3. **迁移 Web**：`apps/web/lib/recipes.ts` 的上述内容迁入共享包，Web 改 import 指向，删本地副本。服务端 `recipe.mapper.ts` 的中文标签改引用共享包；Prisma 枚举 ↔ 前端 key 的 `*_UP`/`*_DOWN` 映射仍是服务端私有，不入共享包。
4. **构建**：纯 TS、零运行时依赖；双端各自消费（Web 经 Next 转译，移动端经 Metro watchFolders 转译）。

## 理由 (Rationale)

- **既有重复是真实证据**：Web 与服务端的中文标签已双份存在，共享包不只是「为移动端新建」，而是顺带治好已有的漂移。
- **框架无关保证可共享**：类型与纯函数不依赖 React，RN 与 Web 可安全共用；UI 层差异大，共享 UI 是负资产。
- **迁移而非复制**：复制 = 第三个副本，漂移继续；迁移才让共享包成为单一事实源。「Web 维持现状」的定义是「不加新功能」，import 迁移不属于新功能。

## 备选方案 (Alternatives Considered)

- **移动端自带副本**：零 monorepo 复杂度、不动 Web；但 Web/移动端双份漂移，且放着服务端既有的标签重复不治，否。
- **OpenAPI 契约生成**：给后端补 spec、双端 codegen 类型；契约单一来源但引入 codegen 链，且当前后端无 OpenAPI，成本前置，否（后续可评估）。
- **共享 UI 层（组件/主题）**：一次抽象双端复用；RN 与 Web 的布局/交互模型差异大，抽象层会不断漏风，否。

## 后果 (Consequences)

- **正面**：领域单一事实源；Web 与服务端既有标签重复顺带消除；移动端零领域逻辑重写。
- **负面**：Web 需一次 import 迁移（纯机械改动，不引入新功能）；Metro 需配置 monorepo（共享包进 watchFolders / `expo/metro-config`），这是 Expo + pnpm monorepo 的已知难点。
- **影响面**：新增 `packages/domain`；`pnpm-workspace.yaml`；`apps/web/lib/recipes.ts` 拆分为共享包（纯函数部分）+ 页面私有逻辑（如 `ScreenId`）；服务端 `recipe.mapper.ts` 标签引用改造；Metro 配置。
- **边界**：Prisma 枚举 ↔ 前端 key 的映射（`CUISINE_UP`/`TAG_UP` 等）是服务端私有，留在服务端；`ScreenId` 等 UI 编排类型留在 Web；对话相关契约（Message parts 等）不预埋，留对话二期（ADR-0014「首发不预埋」）。

## 相关 ADR

- [ADR-0014](./0014-theme-mobile-first-native-app.md)（原生 app 首发，本 ADR 是其共享层的实现决策）
- [ADR-0007](./0007-shopping-list-snapshot.md)（缺料清单纯函数，入共享包）
