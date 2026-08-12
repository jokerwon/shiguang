# Phase 5 验收走查清单 —— 原生 app 首发

- **依据**: [ADR-0014](../adr/0014-theme-mobile-first-native-app.md)（移动主战场）+ [ADR-0015](../adr/0015-shared-domain-layer.md)（共享域层）
- **验收方式**: iOS 模拟器手动走查 + 自动化测试
- **前置**: Phase 5 实施清单 W0–W4 完成；后端已启动（端口 3001）

## W0 共享域层验收

| # | 场景 | 通过条件 |
|---|------|---------|
| 0.1 | `pnpm --filter @shiguang/server test` | 94 测试全过（read-tools 标签渲染、推荐算法不回迁无影响） |
| 0.2 | `pnpm --filter @shiguang/server lint` | 全绿 |
| 0.3 | grep `CUISINE_ZH` | 代码中不再存在 `CUISINE_ZH` / `TAG_ZH` 定义（仅注释/文档保留） |
| 0.4 | `@shiguang/domain` 产物 | `dist/index.js`（CJS）+ `dist/index.d.ts` 存在 |
| 0.5 | Web 迁移 | `apps/web/lib/recipes.ts` 改为 re-export `@shiguang/domain`，`ScreenId` 留 Web |

## A. 认证落地（ADR-0014 决策 4）

| # | 场景 | 通过条件 |
|---|------|---------|
| A1 | 邮箱密码登录 | access 在内存、refresh 在 Keychain（SecureStore）、user 快照在 AsyncStorage |
| A2 | 注册 | 同 A1，直接以新身份进入 Tab 面 |
| A3 | 冷启动静默恢复 | 杀掉 app 重启 → 不闪登录页 → 直接进入 Tab 面（后台 refreshOnce 换新 access） |
| A4 | refresh 失败 → 进登录页 | refresh token 失效后冷启动 → 自动清本地 → 进登录页 |
| A5 | 401 单飞 | 两个并发请求同刻 401 → 只起一次 refresh（inflight 单例） |
| A6 | 登出 | `POST /auth/logout`（body 带 refresh）→ 服务端 refresh 行作废 → 本地全清 → 进登录页 |
| A7 | 登出网络失败 | 后端请求失败也照清本地（登出不因网络卡死） |

## B. 离线只读缓存（ADR-0014 决策 3）

| # | 场景 | 通过条件 |
|---|------|---------|
| B1 | 有网走浏览链 → 开飞行模式 → 三键页面仍可读 | 内容为最近成功快照（personalized / recipe detail / favorites） |
| B2 | 离线点收藏/改食材 | 明确报「离线不可用」或禁用（无写队列） |
| B3 | 回网 | 自动刷新为最新数据 |
| B4 | 离线详情页缺料降级 | pantry 不缓存 → 离线时缺料入口隐藏或提示「联网后查看」 |

## C. 四 Tab 功能（ADR-0014 决策 2）

| # | 场景 | 通过条件 |
|---|------|---------|
| C1 | 发现 Tab | personalized（今日推荐 + quick）+ 菜系探索；复用 `CUISINE_LABELS` 渲染中文 |
| C2 | 食材 Tab | pantry 展示 + 添加 + `SUGGEST_INGS` 点选 + `resolveIng` 归一 + `matchRecipes` 即时反馈 |
| C3 | 收藏 Tab | `/recipes?limit=100` + `/favorites` 交集渲染；收藏 toggle 正确 |
| C4 | 我的 Tab | 偏好档案展示 + 编辑 + 登出入口 |

## D. 菜谱详情 + 缺料清单

| # | 场景 | 通过条件 |
|---|------|---------|
| D1 | 详情页 | 步骤/食材/营养正确展示 |
| D2 | 缺料清单 | `missingIngredients(recipe, pantry)` 纯函数结果正确；可勾选 |
| D3 | 匹配度 | 与 Web 端 `matchScore` 结果一致（共享包纯函数） |
| D4 | 离线缺料降级 | 离线时缺料入口降级（隐藏或提示） |

## E. 回归

| # | 场景 | 通过条件 |
|---|------|---------|
| E1 | `pnpm -r lint` 全绿 | 含 mobile/domain 包（既有 Web lint 错误不计入） |
| E2 | `pnpm --filter @shiguang/server test` | 94 测试全过，零回归 |
| E3 | `docs/README.md` | Phase 5 状态更新为「已交付」 |
| E4 | 零后端改动 | 本期未修改任何服务端业务逻辑（仅标签引用改造） |
| E5 | Web 导出 | `expo export --platform web` 成功（Metro 解析链路通，`disableHierarchicalLookup` 未使用） |
| E6 | iOS 生产导出 | `expo export --platform ios` 成功（Hermes bytecode 生成成功，RN/React 与 SDK 兼容矩阵对齐） |
