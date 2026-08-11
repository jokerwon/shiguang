# Phase 5 实现任务清单 —— 原生 app 首发（移动主战场）

> 对应 [ADR-0014](../adr/0014-theme-mobile-first-native-app.md)（主题）+ [ADR-0015](../adr/0015-shared-domain-layer.md)（共享域层）。
> **目标**:新增 Expo/React Native `apps/mobile`（iOS 先行），首发核心子集（发现/食材/收藏/我的 + 菜谱详情 + 缺料清单 + 登录注册）；离线只读缓存（浏览链）+ 移动端认证落地（refresh 存 Keychain、access 仅内存）；配套 `packages/domain` 共享域层并迁移 Web 去重。**目标零后端改动**。
> **不在本期**:AI 对话（二期紧随首发）、推送、筛选页、小组件、生物识别、Android、Web 新功能。
> **完成判定**:[验收清单](../acceptance/phase-5-checklist.md)（待实现阶段编写）全过，iOS 模拟器手动走查。

## ⚠️ 关键前置发现

以下事实来自对真实代码的探索。

**1. `/favorites` 返回 `recipeId[]`，不是菜谱对象。收藏页 Web 的取数模式是「全量拉取 + 本地过滤」。** [favorite.service.ts](../../apps/server/src/favorite/favorite.service.ts) 的 `findAll` 返回 `recipeId` 列表；Web 收藏页 [page.tsx](../../apps/web/app/(screen)/favorite/page.tsx) 先 `fetchRecipes({ limit: 100 })` 全量拉，再与 `useFavorites` 的 `saved: Set`（`lib/use-favorites.ts`）过滤出收藏菜谱。移动端收藏 Tab **复刻此模式**（`/recipes?limit=100` + `/favorites` 本地交集），不逐 id 取详情（N+1 不可接受）。**已知限制**:limit=100 是 Web 现状硬上限，移动端对齐（收藏 >100 时同截断）。这也直接决定离线缓存「收藏」键的形态——离线 = 缓存 `/recipes?limit=100` 与 `/favorites` 两键后本地交集。

**2. Web 与服务端的中文标签双份重复，共享包迁移即顺带治好——但方向要对。** [recipes.ts](../../apps/web/lib/recipes.ts) 的 `CUISINE_LABELS`/`PREF_LABELS`/`TIME_LABELS` 与服务端 [recipe.mapper.ts](../../apps/server/src/recipe/recipe.mapper.ts) 的 `CUISINE_ZH`/`TAG_ZH` **同值重复**（mapper 注释自述「与前端对齐」）。迁移方向:中文标签进共享包、双端引用同一份；`CUISINE_UP`/`TAG_UP`/`CUISINE_DOWN`/`TAG_DOWN`（Prisma 枚举 ↔ key 映射）是**服务端私有**（ADR-0015 边界），留在 mapper 不动。`CUISINE_ZH`/`TAG_ZH` 的消费者是 [read-tools-logic.ts](../../apps/server/src/chat/tools/read-tools-logic.ts)（AI prompt 渲染候选菜谱）。

**3. `resolveIng` 依赖 `SUGGEST_INGS`，二者必须一起进共享包。** [recipes.ts:79-83](../../apps/web/lib/recipes.ts#L79-L83) 的 `resolveIng` 用 `SUGGEST_INGS` 作为食材 canonical 匹配源——它不是纯 UI 常量，是纯函数的依赖，需随迁。`ScreenId`（UI 编排类型）留在 Web（ADR-0015 边界）。

**4. 服务端推荐算法的 `norm`/`ingredientHit` 与 Web `norm`/`hasIng` 同语义但独立实现——不回迁。** [recommendation.scoring.ts](../../apps/server/src/recipe/recommendation.scoring.ts) 的 `ingredientHit` 注释自述「与前端 matchScore 同语义」，但它是服务端推荐算法的单一事实源、有独立单测（`recommendation.scoring.spec.ts`），且本期目标零后端改动。这是「共享域层 = 领域单一事实源」的例外边界:**共享的是类型 + 展示标签 + 纯函数，不共享服务端算法实现**（算法留在服务端，语义保持一致即可）。

**5. 移动端认证 = Web pattern 的移植 + 双轨切换，无新机制。** Web [lib/refresh.ts](../../apps/web/lib/refresh.ts) 的 `refreshOnce()`（模块级 inflight 单例）+ [api.ts:23-36](../../apps/web/lib/api.ts#L23-L36) 的 `request()` 401 拦截是可直接移植的模板。移动端差异（ADR-0014 决策 4）:access 从**内存**读（Web 从 localStorage），refresh 从 **Keychain** 读放 body（Web 走 httpOnly cookie）。原生无 cookie jar → 每次 refresh/logout 都要 body 带 refresh token；服务端 `extractRefreshToken`（body 优先）已铺好双轨，零后端改动成立。

**6. 详情页缺料清单依赖 pantry，而 pantry 不在离线缓存范围（ADR-0014 决策 3）——离线时缺料需降级。** Web 详情页缺料 = `missingIngredients(recipe, pantry)` 纯函数 + `usePantry`（SWR `/pantry`，[shopping-list-dialog.tsx](../../apps/web/components/shopping-list-dialog.tsx)）。移动端离线范围只有 personalized / recipe detail / favorites 三键，**pantry 不缓存**（无网不可写原则）。因此离线时详情页仍可看步骤/食材/营养（recipe by id 已缓存），但缺料清单不可算——UI 需降级（隐藏缺料入口或提示「联网后查看」）。这是离线语义的明确边界，验收要覆盖。

**7. 共享包形态:服务端不能直接消费 TS 源码，需产物 dist；ADR-0015 决策 4 只覆盖 Web/Metro 双端转译。** 服务端 [tsconfig.json](../../apps/server/tsconfig.json) 是 `module: nodenext`，`nest build` 用 swc 编译、**运行时是编译后的 dist**——Node 运行时无法执行 `.ts` 源码共享包（node_modules 依赖默认不编译）。而 ADR-0015 决策 4 只写了「Web 经 Next 转译、移动端经 Metro watchFolders 转译」，**没提服务端怎么消费**。实施需补:共享包提供 tsc 产物（`dist`）供服务端消费，Web/Metro 走源码转译。Web 的 [next.config.ts](../../apps/web/next.config.ts) 当前为空（无 `transpilePackages`），若走源码转译需补。`pnpm-workspace.yaml` 当前 glob 只收 `apps/*`，扩 `packages/*` 是本组前置。

**8. 后端端点面已全部就绪，移动端纯消费（零后端改动成立）。** 探索核对:
- 认证:`POST /auth/login` `/auth/register` `/auth/refresh` `/auth/logout`（body 双轨，ADR-0013）
- 发现:`GET /recipes/personalized`（认证，返回 `{today, quick}`）、`GET /recipes?cuisine=...`（公开）
- 详情:`GET /recipes/:id`（公开）
- 食材:`GET /pantry` / `PUT /pantry`（认证，body 裸 `string[]` 整体替换）
- 收藏:`GET /favorites` / `POST /favorites/:recipeId`（认证，带 `{saved}` body 走幂等 set）
- 我的:`GET /preferences` / `PUT /preferences`（认证）
无缺口需后端改动；收藏页取数模式（发现 1）已被 Web 验证可行。

---

## W0 · `packages/domain` 共享域层（ADR-0015，移动端复用前提）

> 本组**独立可交付**、建议先合入主干的独立 PR:Web 迁移是机械改动（import 指向），不引入新功能，符合 ADR-0014「Web 维持现状」（只约束不加功能）的定义；回归面小、可先行验证，移动端后续直接消费。

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 0.1 | workspace glob 扩展 | `pnpm-workspace.yaml` | `- 'apps/*'` → 追加 `- 'packages/*'`（发现 7） |
| 0.2 | 建包 scaffold | `packages/domain/package.json`、`tsconfig.json`、`src/index.ts` | workspace 包，name `@shiguang/domain`；纯 TS、零运行时依赖 |
| 0.3 | 收编类型 + key 枚举 + 中文标签 + 食材建议 | `packages/domain/src/recipes.ts` | `Ingredient`/`Recipe` 类型、`CUISINES`/`PREFS`/`TIMES`、`CUISINE_LABELS`/`PREF_LABELS`/`TIME_LABELS`、`SUGGEST_INGS`（随 `resolveIng` 迁，发现 3） |
| 0.4 | 收编纯函数 | `packages/domain/src/recipes.ts` | `norm`/`resolveIng`/`hasIng`/`matchScore`/`missingIngredients`/`matchRecipes`（缺料清单纯函数，ADR-0007） |
| 0.5 | **共享包产物策略（探索）** | `packages/domain/package.json` | 服务端需 `dist` 产物（发现 7）:tsc 编译 + `exports` 条件映射（`node` → `dist` / `default` → `src`，Metro/Next 转译源码）。具体映射与 Web `transpilePackages` 取舍在实现时验证 |
| 0.6 | 迁移 Web | `apps/web/lib/recipes.ts` | 收编内容改 `import from '@shiguang/domain'`，删本地副本；`ScreenId` 留 Web；pantry 页等 `SUGGEST_INGS`/`resolveIng` 消费方同步改 import |
| 0.7 | 服务端标签引用改造 | `apps/server/src/recipe/recipe.mapper.ts`、`read-tools-logic.ts` | `CUISINE_ZH`/`TAG_ZH` 删本地定义，改引用共享包中文标签；`*_UP`/`*_DOWN` 留私有不动（发现 2，ADR-0015 边界） |
| 0.8 | Web 类型一致性核对 | `apps/server/src/recipe/recipe.mapper.ts` | `RecipeResponse` 与共享包 `Recipe` 字段已逐一对齐（探索核对一致），`toResponse` 改返回共享包 `Recipe` 类型（消除类型级重复；不改字段逻辑） |

**验收**:`pnpm -r lint` + `pnpm --filter @shiguang/web build` 干净通过，Web 迁移零行为变化（页面渲染、匹配分数与迁移前一致）；`pnpm --filter @shiguang/server test` 通过（read-tools 标签渲染、推荐算法不回迁无影响）；grep 兜底 `CUISINE_LABELS` 与 `CUISINE_ZH` 不再双份存在；`@shiguang/domain` 可被服务端（dist）与 Web（源码转译）两端解析。

---

## W1 · `apps/mobile` 脚手架 + Metro 连通

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 1.1 | Expo 项目初始化 | `apps/mobile/` | `create-expo-app` 或模板，iOS 先行（macOS 已就绪）；TypeScript 默认 |
| 1.2 | Metro 配置 | `apps/mobile/metro.config.js` | `expo/metro-config` + `watchFolders: [repoRoot]` + `nodeModulesPaths`（pnpm hoisting）——`packages/domain` 源码能被解析并转译（发现 7） |
| 1.3 | 依赖 expo-secure-store | `apps/mobile/package.json` | Keychain 凭据容器（ADR-0014 决策 4） |
| 1.4 | 依赖 `@shiguang/domain` | `apps/mobile/package.json` | `"@shiguang/domain": "workspace:*"`;验证 `import { Recipe } from '@shiguang/domain'` 在 iOS 模拟器可解析（Metro 转译链路通） |
| 1.5 | 根脚本（可选） | `package.json` | `dev:mobile` 脚本（对齐 `pnpm dev` 惯例） |
| 1.6 | 后端连通验证 | `apps/mobile/` | 模拟器访问 `http://localhost:3001`（iOS 模拟器 localhost 指向宿主机，注意 base url 形态）;调 `GET /recipes` 返回数据 |

**验收**:`pnpm --filter @shiguang/mobile start`（或 expo start）起模拟器，脚手架首页渲染；`CUISINE_LABELS` 等在 RN 环境渲染正常（共享包经 Metro 转译）；`GET /recipes` 打通。

---

## W2 · 移动端 API 客户端 + 认证落地（ADR-0014 决策 4）

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 2.1 | API base 配置 | `apps/mobile/lib/` | `API_BASE` 常量（对应 Web `constants.ts` 的 `NEXT_PUBLIC_API_URL` 等价） |
| 2.2 | token 容器抽象 | `apps/mobile/lib/` | **access 仅内存**（模块级 `let`）; **refresh 存 SecureStore**（Keychain）;user 快照存轻量存储（非敏感） |
| 2.3 | `request<T>()` + 401 单飞 | `apps/mobile/lib/` | 移植 Web [api.ts:23-36](../../apps/web/lib/api.ts#L23-L36):401 → `refreshOnce()` → 重放一次;`refreshOnce` 模块级 inflight 单例（[refresh.ts](../../apps/web/lib/refresh.ts) pattern）。差异:access 从内存取、refresh 从 SecureStore 取放 **body**（发现 5，无 cookie jar） |
| 2.4 | 登录/注册 | `apps/mobile/lib/` | 调 `/auth/login` `/auth/register`;成功后 refresh 存 Keychain、access 存内存、user 快照存轻量存储 |
| 2.5 | 冷启动静默恢复 | `apps/mobile/` | 启动:读 user 快照恢复 UI（不闪登录页）→ 后台 `refreshOnce()` 换新 access;refresh 失败才进登录页（Web `use-auth.tsx` pattern） |
| 2.6 | 登出 | `apps/mobile/` | 先 `POST /auth/logout`（body 带 refresh，ADR-0013 幂等）→ 再清 Keychain + 内存 + user 快照;后端失败也照清本地（登出不能因网络卡死） |
| 2.7 | API 函数封装 | `apps/mobile/lib/` | 对齐 Web [api.ts](../../apps/web/lib/api.ts):`fetchRecipes`/`fetchRecipeById`/`fetchPantry`/`replacePantry`/`fetchFavorites`/`toggleFavorite`/`setFavorite`/`fetchPreferences`/`updatePreferences`（消费面见发现 8） |

**验收**:登录 → access 在内存、refresh 在 Keychain（模拟器 SecureStore 可查）;access 过期（改短 TTL 或手工）→ 任意请求自动 refresh 重放成功（用户无感）;refresh 也失效 → 进登录页;两个并发请求同刻 401 → 单飞一次 refresh（inflight 生效）;冷启动不闪登录页 → 静默恢复;登出 → 后端 refresh 行作废 + 本地全清。

---

## W3 · 离线只读缓存（浏览链，ADR-0014 决策 3）

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 3.1 | 数据层选型（**探索**） | `apps/mobile/` | ADR-0014 consequences「选型留实现探索」。候选:AsyncStorage（key-value，最贴合「每查询键持久化最近成功响应」）/ expo-sqlite（结构化，重）。倾向 AsyncStorage——浏览链三键数据量小、无查询需求，SQLite 过度。实现时验证体积与读写延迟 |
| 3.2 | 缓存层抽象 | `apps/mobile/lib/cache.ts` | 语义:每查询键（personalized / `/recipes/:id` / favorites 组合）持久化最近成功响应 + stale-while-revalidate;**无网不可写**（写路径直连在线，无写队列），回网自动刷新 |
| 3.3 | 浏览链三键接入 | `apps/mobile/` | ① personalized（`/recipes/personalized`）② recipe detail（`/recipes/:id`）③ favorites（`/recipes?limit=100` + `/favorites` 交集，发现 1）。SWR 或等价逻辑:有网先读缓存渲染 + 后台 revalidate;无网读缓存兜底 |
| 3.4 | 离线缺料降级 | `apps/mobile/` | pantry 不缓存（ADR-0014）→ 离线时详情页缺料入口降级（隐藏或提示「联网后查看」，发现 6）;食材/偏好等在线功能照常在线 |

**验收**:有网走查浏览链 → 开飞行模式（iOS 模拟器 network toggle）→ 三键页面仍可读（内容为最近成功快照）;离线点收藏/改食材 → 明确报「离线不可用」或禁用（无写队列）;回网 → 自动刷新为最新;离线时详情页缺料降级正确。

---

## W4 · 移动端 UI（4 Tab + 详情 + 缺料 + 登录注册）

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 4.1 | Tab 骨架 | `apps/mobile/` | 4 Tab:发现/食材/收藏/我的（ADR-0014 决策 2）;登录态门（未登录 → 登录页） |
| 4.2 | 发现 Tab | `apps/mobile/` | personalized（今日推荐 + quick）+ 菜系探索（`GET /recipes?cuisine=`）;复用共享包 `CUISINE_LABELS` 渲染中文 |
| 4.3 | 食材 Tab | `apps/mobile/` | pantry 展示 + 添加;复用共享包 `SUGGEST_INGS` 点选 + `resolveIng` 归一 + `matchRecipes` 本地即时反馈 |
| 4.4 | 收藏 Tab | `apps/mobile/` | Web 模式（发现 1）:`/recipes?limit=100` + `/favorites` 交集渲染菜谱卡;收藏 toggle 走 `POST /favorites/:recipeId` |
| 4.5 | 我的 Tab | `apps/mobile/` | 偏好档案展示 + 编辑（`GET/PUT /preferences`）+ 登出入口 |
| 4.6 | 详情页 + 缺料清单 | `apps/mobile/` | `GET /recipes/:id`;步骤/食材/营养;缺料清单 = 共享包 `missingIngredients(recipe, pantry)` 纯函数 + 勾选快照（不持久化，ADR-0007）;离线降级见 3.4 |
| 4.7 | 登录/注册页 | `apps/mobile/` | 对接 W2.4;已登录自动进 Tab 面 |

**验收**:iOS 模拟器手动走查全链:登录 → 发现（personalized + 菜系）→ 进详情（食材/步骤/缺料清单勾选）→ 收藏 → 食材页匹配反馈 → 我的（偏好编辑 + 登出）;与 Web 行为对齐（匹配度分数、缺料清单内容一致）。

---

## W5 · 收尾

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 5.1 | 验收清单编写 + 全量走查 | `docs/acceptance/phase-5-checklist.md`（新增） | 按 ADR-0014 验收维度（离线/认证/浏览链/四 Tab/详情/缺料）编写，iOS 模拟器手动走查制（对齐 phase-2-3 / phase-4 清单）;逐条勾选 |
| 5.2 | 常驻层文档审计 | 根 `AGENTS.md`、新增 `apps/mobile/AGENTS.md`、`docs/glossary.md` | 根 AGENTS.md monorepo 结构补 `apps/mobile` + `packages/domain`;新增 mobile 子项目 AGENTS.md（架构/命令/认证/离线缓存/共享域层引用）;glossary 词条（离线只读缓存/浏览链/共享域层/移动端主战场）与实现核对一致 |
| 5.3 | 索引同步 | `docs/README.md`、`docs/adr/README.md` | Phase 5 行更新（实施/验收清单落位）;检查无断链 |
| 5.4 | 根命令文档 | 根 `AGENTS.md`、`README.md` | `dev:mobile` 等新脚本入命令区（如已加） |

**验收**:`pnpm -r lint` 全绿（含新 mobile/domain 包）;`pnpm --filter @shiguang/server test` 无回归;`docs/README.md` 无断链;Phase 5 状态更新为「已交付」。

---

### 完成判定

[验收清单](../acceptance/phase-5-checklist.md) 全过（iOS 模拟器手动走查）+ `pnpm --filter @shiguang/server test` 与 `pnpm -r lint` 无回归。
