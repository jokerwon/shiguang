# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Codex, etc.) when working with code in this repository.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 项目概述

**食光 (Shiguang)** — 一个菜谱推荐 Web 应用。用户通过食材匹配、菜系筛选、对话式交互来发现菜谱。支持收藏、食材清单管理。

## Monorepo 结构

```
shiguang/
  apps/
    web/    ← 当前项目（Next.js 16 前端）
    server/ ← 后端 API（NestJS, 端口 3001）
  pnpm-workspace.yaml
```

## 常用命令

```bash
pnpm dev          # 启动开发服务器 (next dev)
pnpm build        # 生产构建 (next build)
pnpm start        # 启动生产服务器 (next start)
pnpm lint         # 运行 ESLint
```

## 技术栈

- **框架**: Next.js 16.2 (App Router, React 19, RSC)
- **样式**: Tailwind CSS v4 + `tw-animate-css` + shadcn/ui (base-nova style)
- **UI 组件**: `@base-ui/react` (NavigationMenu 等基元), `lucide-react` (图标)
- **工具库**: `class-variance-authority`, `clsx`, `tailwind-merge`
- **包管理**: pnpm (workspace monorepo)

## 路由结构 (App Router)

```
app/
  layout.tsx              # 根布局 — <html>, <body>, Providers
  globals.css             # Tailwind + shadcn + 自定义 CSS 变量
  login/page.tsx          # 登录/注册页（无需认证）

  (screen)/               # 路由组 — 需要认证的页面（AuthGuard 包裹）
    layout.tsx            # 共享布局：顶部导航 + TabBar + AuthGuard
    page.tsx              # 发现页（首页）— 为你推荐、菜系探索、15 分钟快手
    pantry/page.tsx       # 食材清单 — 添加食材、智能匹配
    chat/page.tsx         # 对话 Agent — AI 菜谱推荐（上下文注入）
    filter/page.tsx       # 筛选页 — 按菜系/偏好/时间筛选
    favorite/page.tsx     # 收藏夹 — 已收藏菜谱列表
    settings/page.tsx     # 我的 — 偏好档案（忌口/过敏原/健康目标）
    recipe/[id]/page.tsx  # 菜谱详情页 — 步骤/食材、营养、缺料清单
```

## 认证机制

- **存储**: JWT token + user 对象持久化在 `localStorage`（key: `shiguang:token`, `shiguang:user`）
- **后端 API**: `NEXT_PUBLIC_API_URL`（默认 `http://localhost:3001`），端点 `/auth/login`, `/auth/register`
- **前端状态**: `AuthProvider` (`lib/use-auth.tsx`) — React Context；login/logout 时清空全部 SWR 缓存（天然按用户隔离）
- **路由保护**: `AuthGuard` (`components/auth-guard.tsx`) — 未登录用户重定向到 `/login?redirect=原路径`，加载中显示 spinner
- **登录页**: 已登录用户自动跳转回 `redirect` 参数指定的页面

## 数据层（SWR + 服务端持久化，ADR-0004）

用户数据已迁服务端，前端经 SWR 消费（乐观更新 + 失败回滚）：

| Hook | SWR key | 说明 |
|------|---------|------|
| `usePantry()` | `/pantry` | 食材清单（PUT 整体替换） |
| `useFavorites()` | `/favorites` | 收藏（POST toggle，返回 id 列表 → `saved: Set`） |
| `usePreferences()` | `/preferences` | 偏好档案（忌口/过敏原/健康目标），含 `isEmpty`（首页软提示用） |
| `usePersonalized()` | `/recipes/personalized` | 首页个性化推荐（需认证） |
| `useFilters()` | localStorage | 筛选草稿（唯一仍走本地存储的状态） |

- **`lib/api.ts`** — `request<T>()` 自动拼 `API_BASE` + 附 Bearer；失败抛 `ApiError`（带 `status`，401 可识别 → logout）
- **`lib/fetcher.ts`** — SWR fetcher 复用 `request()`，所有 SWR key 天然带鉴权
- **`lib/recipes.ts`** — `Recipe` 类型、分类常量、`matchScore/matchRecipes`（食材页本地即时反馈）、`hasIng/missingIngredients`（缺料清单纯函数）
- **首页为何 client 端取数**：token 在 localStorage，RSC 服务端 fetch 拿不到 Bearer，个性化端点只能 client SWR（骨架屏兜底首屏）；详情页是公开端点，保留 RSC

## 共享组件

- `components/app-nav.tsx` — `Navbar`（桌面）/ `Tabbar`（移动），五个导航项：发现/食材/对话/收藏/我的
- `components/recipe-card.tsx` — 菜谱卡片（图、收藏、匹配度徽标）
- `components/recipe-image.tsx` — 图片与占位符（ADR-0003：首字 + 菜系配色，`variant: card | hero`），card 与详情页共用
- `components/shopping-list-dialog.tsx` — 缺料清单浮层（ADR-0007：即时快照，勾选不持久化）
- `components/prefs-hint.tsx` — 首页软提示（空偏好档案时引导去设置，可关闭）
- `components/auth-guard.tsx` — 路由保护
- `components/providers.tsx` — SWRProvider > AuthProvider
- `components/ui/` — shadcn/ui 组件；`components/ai-elements/` — AI SDK Elements（对话页）

## 设计系统

- 绿色系主题（`--primary: oklch(0.9215 0.2322 125.33)`）
- 自定义 CSS 变量：`--nav-h: 62px`（导航栏高度）、`--shell-w: 1120px`（内容最大宽度）
- `@base-ui/react` 的 NavigationMenu 用于桌面导航
- 响应式：md 断点以下显示 TabBar，以上显示 Navbar
