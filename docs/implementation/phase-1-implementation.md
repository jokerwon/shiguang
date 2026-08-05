# Phase 1 实现任务清单 —— 数据地基

> 对应 [ADR-0001](../adr/0001-theme-content-depth-personalization.md)(分期)、[ADR-0002](../adr/0002-recipe-schema-depth.md)(schema)、[ADR-0004](../adr/0004-server-side-user-data.md)(持久化)。
> **目标**:立起数据架构,不新增用户可见功能。三块:① Recipe schema 扩展 + 回填 ② 三张新表 + 后端 API ③ 前端 hooks 由 localStorage 改为服务端。

## ⚠️ 关键前置发现

**后端当前没有 JWT 认证守卫。** `AuthService` 只在登录/注册时签发 token,但全 src 无任何 guard / passport strategy / `@CurrentUser`。只装了 `@nestjs/jwt`(未装 passport)。

→ 所有"按用户读写"的接口(pantry / 收藏 / 偏好)都依赖这层拦截,**W0 是阻塞性前置,必须最先做。**

## 前端利好

`lib/api.ts` 的 `request()` 已通过 `getToken()` 自动附加 `Authorization: Bearer`,`lib/fetcher.ts` 的 SWR fetcher 直接复用它。因此 **`useSWR('/pantry')` 天然携带认证**,前端改造主要是"换数据源",不是"补认证"。

---

## W0 · 认证基础设施(阻塞性前置)

后端补 JWT 拦截层。**方案:不引入 passport,用 `JwtService` 直接验签,保持依赖最小。**

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 0.1 | 新建 `JwtAuthGuard` | `apps/server/src/auth/jwt-auth.guard.ts` | 实现 `CanActivate`:读 `Authorization: Bearer`,`JwtService.verifyAsync` 验签,把 payload `{ sub, email }` 挂到 `request.user`。失败抛 `UnauthorizedException` |
| 0.2 | 新建 `@CurrentUser()` 装饰器 | `apps/server/src/auth/current-user.decorator.ts` | `createParamDecorator`,从 `request.user` 取当前用户(或 `sub`) |
| 0.3 | `AuthModule` 导出 `JwtModule` | `apps/server/src/auth/auth.module.ts` | `exports: [AuthService, JwtModule]`,使 guard 在其它模块能注入 `JwtService` |

**验收**:任一加 `@UseGuards(JwtAuthGuard)` 的端点,无 token → 401;带有效 token → 200 且能取到 `sub`。

> 取舍:选 per-controller `@UseGuards` 而非全局 `APP_GUARD`,避免误伤 `login` / `register` 等公开端点,改动最小。

---

## W1 · Recipe Schema 扩展 + 12 道回填(ADR-0002)

> 与 W2 可并行;但二者都改 `schema.prisma`,建议**各自独立 migration**,便于回滚。

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 1.1 | `Recipe` 加营养列 | `apps/server/prisma/schema.prisma` | 新增 `protein Int`、`carb Int`、`fat Int`(单位:克)。**这三列需要 migration** |
| 1.2 | `ingredients` 结构变更 | (同上) | `ingredients` 是 `Json` 字段,**结构变为 `{name, amount}[]` 不需要 migration**,只需改 seed 数据 + TS 类型 |
| 1.3 | 跑迁移 + 重新生成 Client | — | `pnpm --filter @shiguang/server db:migrate` + `db:generate` |
| 1.4 | seed 回填 12 道 | `apps/server/prisma/seed.ts` | `RECIPES` 每条:`ingredients` 改 `{name, amount}[]`(填真实用量)、补 `protein/carb/fat`(合理估值);`SeedRecipe` 类型同步;`upsert` 的 `create`/`update` 都加新字段 |
| 1.5 | 后端响应类型 | `apps/server/src/recipe/recipe.service.ts` | `RecipeResponse` 加 `protein/carb/fat`,`ingredients` 类型改 `{name,amount}[]`;`toResponse` 映射新字段 |
| 1.6 | 前端领域模型 | `apps/web/lib/recipes.ts` | `Recipe` interface:`ingredients: {name, amount}[]`、加 `protein/carb/fat`;**`matchScore` / `matchRecipes` 适配——取 `i.name` 参与匹配**(`norm(i.name).includes(...)`) |
| 1.7 | 详情页用量 + 匹配 | `apps/web/app/(screen)/recipe/[id]/recipe-detail.tsx` | 食材清单 tab 把写死的 `适量` 改为真实 `i.amount`;匹配度 chips 用 `i.name` 渲染与比对 |
| 1.8 | 卡片食材名 | `apps/web/components/recipe-card.tsx` | `r.ingredients.slice(0,3)` 渲染 `i.name` |

**验收**:`db:seed` 后 12 道菜均有完整用量 + 营养;详情页显示真实用量;食材页匹配、详情页匹配度 chips 仍正常(基于 `name`)。

---

## W2 · 三张新表 + 后端 API(ADR-0004)

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 2.1 | 定义三个模型 | `apps/server/prisma/schema.prisma` | 见下方 schema 草案;`User` 加对应 relations |
| 2.2 | 跑迁移 | — | `db:migrate`(与 W1 分开的独立 migration) |
| 2.3 | `PantryModule` | `apps/server/src/pantry/` | `GET /pantry`(读当前用户)、`PUT /pantry`(整体替换,body `string[]`)。挂 `JwtAuthGuard` + `@CurrentUser` |
| 2.4 | `FavoriteModule` | `apps/server/src/favorite/` | `GET /favorites`(返回 recipeId 列表)、`POST /favorites/:recipeId`(toggle 收藏/取消) |
| 2.5 | `PreferenceModule` | `apps/server/src/preference/` | `GET /preferences`、`PUT /preferences`(upsert)。**Phase 1 只建表 + 最小读写 API,设置页 UI 属 Phase 2** |
| 2.6 | 注册模块 | `apps/server/src/app.module.ts` | `imports` 加 `PantryModule / FavoriteModule / PreferenceModule` |

**Schema 草案**:

```prisma
model PantryItem {
  id        String   @id @default(cuid())
  userId    String
  name      String
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, name])   // 同一用户食材名去重
  @@index([userId])
}

model Favorite {
  id        String   @id @default(cuid())
  userId    String
  recipeId  String
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  recipe    Recipe   @relation(fields: [recipeId], references: [id], onDelete: Cascade)

  @@unique([userId, recipeId])  // 幂等:重复收藏不报错
  @@index([userId])
}

enum HealthGoal {
  BALANCED
  FAT_LOSS
  MUSCLE_GAIN
}

model UserPreference {
  id                 String      @id @default(cuid())
  userId             String      @unique           // 一用户一份档案
  dislikedIngredients String[]    // 忌口食材
  allergens          String[]    // 过敏原
  healthGoal         HealthGoal  @default(BALANCED)
  updatedAt          DateTime    @updatedAt
  user               User        @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

`User` 与 `Recipe` 需补反向 relations(`pantryItems PantryItem[]`、`favorites Favorite[]`、`preference UserPreference?`;`Recipe.favorites Favorite[]`)。

**验收**:curl 带 token 能 `PUT/GET /pantry`、toggle `POST /favorites/:id` 并 `GET /favorites`、`PUT/GET /preferences`;无 token 一律 401;同一食材/菜谱重复写不报错(幂等)。

---

## W3 · 前端 Hooks 改造:localStorage → 服务端(ADR-0004)

> 原则:**保持 hook 返回签名不变**,让消费方零改动或仅加 loading 态。`useFilters` 不动(留 localStorage)。

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 3.1 | API 函数 | `apps/web/lib/api.ts` | 新增 `fetchPantry()`、`replacePantry(names)`、`fetchFavorites()`、`toggleFavorite(recipeId)`、`fetchPreferences()`、`updatePreferences(input)` |
| 3.2 | 改 `usePantry` | `apps/web/lib/use-pantry.ts` | 数据源改 `useSWR('/pantry')` + `mutate` 乐观更新;**保持返回签名 `{ pantry, setPantry, addIng, removeAt, toggleSuggest, clear }`**;删除 localStorage 读写与 CustomEvent |
| 3.3 | 改 `useFavorites` | `apps/web/lib/use-favorites.ts` | 数据源改 `useSWR('/favorites')`;**保持 `{ saved, toggleSave }`,`saved` 仍为 `Set<string>`**(由返回的 id 数组构造);`toggleSave` 乐观更新 + 调 `toggleFavorite` |
| 3.4 | 消费方核对 | 各页面 | `pantry/page.tsx`、`recipe-detail.tsx`、`favorite-client.tsx`、`discovery-client.tsx`、`filter/page.tsx`:签名不变则逻辑零改,仅需处理 **loading 态**(数据未到时的渲染) |

**乐观更新策略**:写操作先 `mutate` 本地缓存(立即反映 UI),再发请求,失败回滚。沿用 SWR 的 `optimisticData` / `rollbackOnError`。

**登出清理**:`use-auth.tsx` 的 `logout` / `login` 已 `mutate(() => true, undefined, { revalidate: false })` 清空全部 SWR 缓存——新 hooks 基于 SWR,**天然获得按用户隔离 + 切换账号重新拉取**,无需额外处理。

**验收**:登录后 pantry / 收藏跨页面同步;刷新后仍在;退出换账号后数据隔离、互不可见;断网写操作失败时 UI 回滚。

---

## 依赖顺序

```
W0(认证守卫)──┐
              ├─→ W2(新表 + API)──→ W3(前端 hooks)
W1(schema)───┘   (W1 与 W2 可并行,均各自独立 migration)
```

- **W0 最先行**:W2 的接口都依赖它。
- **W1 与 W2 可并行**:互不依赖,但都改 `schema.prisma`,分开 migration。
- **W3 最后**:依赖 W2 的 API 就绪。

## 风险与注意点

1. **`ingredients` 是 `Json` 列**:结构变更无需 migration,但**已有数据的回填靠 seed 的 upsert**(按 `name` 更新),务必让 seed 的 `update` 分支也写新结构,否则老库数据仍是旧结构。
2. **`matchScore` 适配遗漏**:`ingredients` 改对象数组后,所有用 `i` 当字符串的地方(匹配、渲染)都要改 `.name`,是最易漏的点(W1.6/1.7/1.8)。
3. **幂等约束**:`PantryItem`/`Favorite` 的 `@@unique` 是防重复写的底线,toggle 类接口要按"存在则删、不存在则增"实现。
4. **Phase 1 不做**:`/recipes/personalized`(W2 偏好 API 就绪也先不接首页)、AI 上下文注入、`/chat` 加 guard、设置页 UI、购物清单——均属 Phase 2(见各 ADR)。

**术语**见 [glossary.md](../glossary.md);决策依据见 [adr/](../adr/)。
