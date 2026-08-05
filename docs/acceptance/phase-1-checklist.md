# Phase 1 验收走查清单 —— 内容深度 + 个性化

- **依据**:[ADR-0001](../adr/0001-theme-content-depth-personalization.md) ~ [ADR-0007](../adr/0007-shopping-list-snapshot.md)
- **验收方式**:手动场景走查,每条须可复现、通过条件明确
- **定位**:Phase 1 已先于本清单交付。本清单为**后补的回归基线**,用于 Phase 2(及以后改动 Phase 1 代码时)回归——尤其 Phase 2 会重构 `chat`、动推荐注入,改完须重走本清单确认地基未破
- **后补说明**:条目依据真实代码回溯编写(非凭空设计),核对源见各节"核对源"

## 验收原则

| 决策点 | 结论 |
|--------|------|
| 验收形态 | 手动场景走查,不设数字性能指标 |
| 与 Phase 2 的关系 | Phase 2 收尾回归必须重走 A/B/C/D 节;E 节(食材页纯函数)在 Phase 2 工具改 pantry 后仍需走,确认缺料计算未被波及 |

## A. 认证地基(ADR 隐含,W0 阻塞性前置)

核对源:`apps/server/src/auth/jwt-auth.guard.ts`、`current-user.decorator.ts`

| # | 场景 | 通过条件 |
|---|------|---------|
| A1 | 无 token 调 `/pantry`、`/favorites`、`/preferences`、`/recipes/personalized`、`/chat` | 全部 401 |
| A2 | 带有效 token 调上述端点 | 200 且能取到当前用户 |
| A3 | 登录/注册(`POST /auth/login`、`/auth/register`) | 公开端点,返回 `{ token, user }` |
| A4 | `/recipes`(列表)、`/recipes/:id`(详情)无 token | 200(公开端点不被守卫误伤) |

## B. 数据持久化与隔离(ADR-0004)

核对源:`apps/server/src/pantry|favorite|preference` 模块、`schema.prisma` 三表 `@@unique`

| # | 场景 | 通过条件 |
|---|------|---------|
| B1 | `PUT /pantry`(裸 `string[]` 整体替换)→ `GET /pantry` | 返回一致;刷新后仍在 |
| B2 | `POST /favorites/:recipeId` toggle 两次 | 幂等:二次 toggle 回到初始状态,不报错 |
| B3 | `PUT /preferences`(忌口/过敏原/健康目标)→ `GET /preferences` | 落库一致;空偏好时返回默认值(BALANCED) |
| B4 | 用户 A 写入后,用户 B 读取 | 互不可见(按 userId 隔离) |
| B5 | 登出 → 换账号登录 | 前端 SWR 缓存清空,数据按新账号拉取(不串号) |
| B6 | 删除用户 | 级联删除其 pantry/favorites/preference(`onDelete: Cascade`) |

## C. 个性化推荐与硬过滤(ADR-0005/0006)

核对源:`apps/server/src/recipe/recommendation.service.ts`、`recommendation.scoring.ts`

| # | 场景 | 通过条件 |
|---|------|---------|
| C1 | `GET /recipes/personalized`,pantry 有匹配食材 | 匹配度高的菜谱排序靠前 |
| C2 | 设置忌口/过敏原 → 个性化结果 | **硬过滤生效**:含 blocked 食材的菜谱绝不出现(安全红线) |
| C3 | 同用户同天重复请求 | 结果稳定(当天内不抖动) |
| C4 | 跨天请求 | 新鲜度轮换生效,首页不全推同样菜谱 |
| C5 | 晚间(服务器本地 ≥17 点)请求 | 优先 ≤30min 的菜(timeFit 加权) |
| C6 | `/chat` system prompt | 注入了偏好 + pantry + 候选菜谱;AI 推荐落在库内真实菜谱,不编造 |

## D. 菜谱内容与详情页(ADR-0002/0003/0007)

核对源:`apps/server/prisma/schema.prisma`(Recipe 字段)、`apps/web/app/(screen)/recipe/[id]/recipe-detail.tsx`、`apps/web/lib/recipes.ts`

| # | 场景 | 通过条件 |
|---|------|---------|
| D1 | 详情页食材清单 | 显示真实用量(非"适量"),食材带 `{name, amount}` |
| D2 | 详情页营养区块 | 显示 protein/carb/fat,标注"营养为估算值" |
| D3 | 菜谱图片 | 占位符(首字 + 菜系配色),无真图 |
| D4 | 详情页缺料清单 | 基于 pantry 即时生成,可勾选,**不持久化**;pantry 变化后重算 |
| D5 | seed 幂等 | `pnpm db:seed` 按 name upsert,重复跑不报错、不产生重复 |

## E. 纯函数(单测兜底)

核对源:`apps/server/src/recipe/recommendation.scoring.spec.ts`、`recipe-draft.spec.ts`、`apps/web/lib/recipes.ts`

| # | 场景 | 通过条件 |
|---|------|---------|
| E1 | `pnpm --filter @shiguang/server test` | recommendation.scoring / recipe-draft 单测全绿 |
| E2 | 前端 `matchScore` / `missingIngredients` | 与服务端 `ingredientHit` 同语义(双向 includes);食材页本地即时反馈正常 |

**术语**见 [glossary.md](../glossary.md);决策依据见 [adr/](../adr/)。
