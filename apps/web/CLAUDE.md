# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

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
    page.tsx              # 发现页（首页）— 今日推荐、菜系探索
    pantry/page.tsx       # 食材清单 — 添加食材、智能匹配
    chat/page.tsx         # 对话 Agent — 模拟聊天推荐菜谱
    filter/page.tsx       # 筛选页 — 按菜系/偏好/时间筛选
    favorite/page.tsx     # 收藏夹 — 已收藏菜谱列表
    recipe/[id]/page.tsx  # 菜谱详情页 — 步骤/食材、匹配度
```

## 认证机制

- **存储**: JWT token + user 对象持久化在 `localStorage`（key: `shiguang_token`, `shiguang_user`）
- **后端 API**: `NEXT_PUBLIC_API_URL`（默认 `http://localhost:3001`），端点 `/auth/login`, `/auth/register`
- **前端状态**: `AuthProvider` (`lib/use-auth.tsx`) — React Context，在 `Providers` (`components/providers.tsx`) 中挂载
- **路由保护**: `AuthGuard` (`components/auth-guard.tsx`) — 未登录用户重定向到 `/login?redirect=原路径`，加载中显示 spinner
- **登录页**: 已登录用户自动跳转回 `redirect` 参数指定的页面

## 跨页面状态管理 (localStorage + Event)

所有持久化状态都通过 `localStorage` + `CustomEvent` 实现跨页面同步：

| Hook | Storage Key | 事件 |
|------|------------|------|
| `useFavorites()` | `shiguang:favorites` | `shiguang:favorites-change` |
| `usePantry()` | `shiguang:pantry` | `shiguang:pantry-change` |
| `useFilters()` | `shiguang:filters` | `shiguang:filters-change` |

每个 hook 都采用 SSR-safe 模式：初始 state 为空，在 `useEffect` 挂载后从 `localStorage` 读取真实数据，避免 hydration mismatch。同时监听 `storage` 事件（跨标签页）和自定义事件（同标签页）。

## 数据层

- **`lib/recipes.ts`** — 所有菜谱数据、分类常量（`CUISINES`, `PREFS`, `TIMES`）、匹配算法（`matchScore`, `matchRecipes`）。菜谱当前是硬编码数组，无需 API 调用。
- **`lib/auth.ts`** — 登录/注册 API 调用函数（`loginApi`, `registerApi`），纯 HTTP fetch。
- **`lib/utils.ts`** — `cn()` 函数（`clsx` + `twMerge`）。

## 共享组件

- `components/app-nav.tsx` — `Navbar`（桌面端顶部导航）和 `Tabbar`（移动端底部导航），四个导航项：发现/食材/对话/收藏
- `components/recipe-card.tsx` — 菜谱卡片，含图片、收藏按钮、匹配度徽标
- `components/auth-guard.tsx` — 路由保护
- `components/providers.tsx` — Client Provider 聚合（仅 AuthProvider）
- `components/logo.tsx` — Logo SVG 图标
- `components/ui/` — shadcn/ui 组件（button, input, alert, navigation-menu）

## 设计系统

- 绿色系主题（`--primary: oklch(0.9215 0.2322 125.33)`）
- 自定义 CSS 变量：`--nav-h: 62px`（导航栏高度）、`--shell-w: 1120px`（内容最大宽度）
- `@base-ui/react` 的 NavigationMenu 用于桌面导航
- 响应式：md 断点以下显示 TabBar，以上显示 Navbar
