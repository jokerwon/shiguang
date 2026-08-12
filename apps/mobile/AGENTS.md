# apps/mobile AGENTS.md —— 食光移动端（Expo/React Native）

> 本文件是 AI 编码助手在 `apps/mobile` 子项目中的工作指令。`CLAUDE.md` 仅为 `@AGENTS.md` 指针。

## 概述

Expo/React Native 原生 app（iOS 先行），食光的核心客户端。
- **框架**: Expo SDK 57 + expo-router（文件路由）+ TypeScript
- **导航**: 4 Tab（发现/食材/收藏/我的）+ 详情 push + 认证门
- **后端**: 消费 `@shiguang/server` REST API（端口 3001），零后端改动

## 项目结构

```
apps/mobile/
  app/                 → expo-router 文件路由
    _layout.tsx        → 根布局（AuthContext + 路由守卫）
    index.tsx          → 重定向到 (tabs)
    (tabs)/            → 4 Tab 导航
      _layout.tsx      → Tab 配置
      index.tsx        → 发现 Tab（personalized + 菜系探索）
      pantry.tsx       → 食材 Tab（pantry + 匹配反馈）
      favorite.tsx     → 收藏 Tab（全量拉取 + 本地交集）
      profile.tsx      → 我的 Tab（偏好 + 登出）
    (auth)/            → 认证页
      login.tsx        → 登录/注册
    recipe/[id].tsx    → 菜谱详情 + 缺料清单
  lib/                 → 核心逻辑
    config.ts          → API_BASE 配置
    auth.ts            → 认证模块（access 内存 / refresh Keychain / user 快照）
    api.ts             → API 客户端（401 单飞 refresh）
    cache.ts           → 离线只读缓存（AsyncStorage + stale-while-revalidate）
  components/          → 可复用组件
    recipe-card.tsx    → 菜谱卡片（常规 + compact 变体）
```

## 认证机制（ADR-0014 决策 4）

- **access token**: 仅内存（模块级 `let`），不持久化
- **refresh token**: 存 SecureStore（iOS Keychain），每次 refresh/logout 放 body
- **user 快照**: 存 AsyncStorage（非敏感），冷启动恢复 UI
- **401 拦截**: `request()` 遇 401 → `authManager.refreshOnce()` → 重放一次
- **单飞**: 模块级 inflight Promise，并发 401 只起一次 refresh
- **冷启动**: 读 user 快照恢复 UI → 后台 refreshOnce → 失败才进登录页

## 离线缓存（ADR-0014 决策 3）

- **范围**: 浏览链三键（personalized / recipe detail / favorites 组合）
- **策略**: AsyncStorage + stale-while-revalidate
- **无网不可写**: 写路径直连在线，无写队列
- **pantry 不缓存**: 离线时缺料清单降级

## 共享域层（ADR-0015）

`@shiguang/domain`（`packages/domain`）提供：
- `Recipe` / `Ingredient` 类型
- `CUISINE_LABELS` / `PREF_LABELS` / `TIME_LABELS` 中文标签
- `SUGGEST_INGS` 食材建议
- `norm` / `resolveIng` / `hasIng` / `matchScore` / `missingIngredients` / `matchRecipes` 纯函数

Metro 配置通过 `watchFolders` + `nodeModulesPaths` 转译共享包源码。

## 命令

```bash
pnpm --filter @shiguang/mobile start     # 启动 Expo dev server
pnpm --filter @shiguang/mobile ios       # 启动 iOS 模拟器
```

## 注意事项

- 收藏页取数模式：`/recipes?limit=100` + `/favorites` 本地交集（与 Web 对齐，不逐 id 取详情）
- iOS 模拟器 localhost 指向宿主机，API_BASE 可用 `http://localhost:3001`
- 离线缺料降级：pantry 不缓存，离线时详情页缺料入口隐藏或提示「联网后查看」
