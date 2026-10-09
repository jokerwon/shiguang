# 食光文档索引

> 状态约定：**常驻** = 必须永远保鲜；**活跃** = 当前 Phase 内迭代；**归档** = 只读，不再修改；**缺失** = 已知断链，诚实标注。

## 常驻层

| 文档 | 状态 | 说明 |
|------|------|------|
| 根 [CONTEXT.md](../CONTEXT.md) | 常驻 | 食材领域术语、别名、浏览分类与安全约束；已确认设计的实施状态见 ADR-0018，菜谱原料的形态见 ADR-0019，其他术语见 glossary.md |
| [glossary.md](./glossary.md) | 常驻 | 领域术语表（Ubiquitous Language）。⚠️ 字段级事实以 `apps/server/prisma/schema.prisma` 为准，本表只定义概念语义 |
| 根 [AGENTS.md](../AGENTS.md) / [apps/web/AGENTS.md](../apps/web/AGENTS.md) / [apps/server/AGENTS.md](../apps/server/AGENTS.md) | 常驻 | Agent 工作指令。各层 `AGENTS.md` 是唯一事实源；同层 `CLAUDE.md` 均为 `@AGENTS.md` 指针文件 |
| [agents/](./agents/) | 常驻 | 工程技能配置：`issue-tracker.md`（GitHub Issues）／`triage-labels.md`（五个 triage 角色标签）／`domain.md`（域文档消费规则，single-context）。由 setup-matt-pocock-skills 生成，可直接手改 |

## 决策层（ADR）

| 文档 | 状态 | 说明 |
|------|------|------|
| [adr/](./adr/README.md) | 归档（只增不改） | ADR-0001 ~ 0020，含 Phase 总览；被取代的决策用 supersede 指针，不改原文 |

## 实施层（按 Phase）

> **编号沿革（2026-08-05）**：旧编号中「地基=Phase 1、体验=Phase 2、AI 会动手=Phase 3、更懂你=Phase 4」，现统一为全局顺序：地基+体验合并为 **Phase 1**，AI 两阶段为 **Phase 2 / 3**。历史文档（ADR-0001~0007、phase-1-implementation.md）保留原文不改。

| Phase | 实施清单 | 验收清单 | 状态 |
|-------|---------|---------|------|
| 1 内容深度+个性化 | [implementation/phase-1-implementation.md](./implementation/phase-1-implementation.md)（仅覆盖地基部分；体验部分无文档，承认断链，追溯见 git history，勿补写） | [phase-1-checklist.md](./acceptance/phase-1-checklist.md)（后补的回归基线，依据真实代码回溯编写） | 已交付，实施文档归档 |
| 2 AI 会动手 | [implementation/phase-2-implementation.md](./implementation/phase-2-implementation.md) | [phase-2-3-checklist.md](./acceptance/phase-2-3-checklist.md) | 已交付——Conversation/Message 表 + 会话 CRUD、chat tool-loop、只读/写工具、操作卡片 undo、会话列表 |
| 2.1 会话重设计 | [implementation/phase-2-1-implementation.md](./implementation/phase-2-1-implementation.md) | [phase-2-3-checklist.md](./acceptance/phase-2-3-checklist.md)（补充 URL 归属场景） | 已交付——ADR-0011：会话状态归属(URL)+ Message 表重审（砍 content/toolCalls、加 seq） |
| 3 更懂你 | [implementation/phase-3-implementation.md](./implementation/phase-3-implementation.md) | [phase-2-3-checklist.md](./acceptance/phase-2-3-checklist.md)（E/F 节） | 已交付——`update_preferences` 草稿 + 确认卡片、历史消息只读、滑窗 + 会话摘要、长会话种子脚本（ADR-0012） |
| 3.5 自动化验证补齐 | [implementation/phase-3-5-implementation.md](./implementation/phase-3-5-implementation.md) | [phase-2-3-checklist.md](./acceptance/phase-2-3-checklist.md)（G 节） | 已交付——后端纯逻辑/service 测试补齐（preference upsert、seq 不变量、工具 schema 清洗）、迁移备份入流程、pre-existing lint 修复；前端 React 19 lint 留待后续 |
| 4 认证双轨 | [implementation/phase-4-implementation.md](./implementation/phase-4-implementation.md) | [phase-4-checklist.md](./acceptance/phase-4-checklist.md) | 已交付——短 access + 滑动 refresh、复用检测、cookie/body 双轨、删 User.role（ADR-0013，原生 app 认证前置）；验收全过（API 冒烟 + 浏览器手动走查） |
| 5 原生 app 首发 | [implementation/phase-5-implementation.md](./implementation/phase-5-implementation.md) | [phase-5-checklist.md](./acceptance/phase-5-checklist.md) | **已移除**（ADR-0016，2026-09-28）——曾交付 Expo/React Native `apps/mobile`（iOS 先行）+ 移动端认证 + 离线只读缓存；`packages/domain` 共享域层保留（ADR-0015 继续有效）。两份工件只读，不再维护 |
| 6 PostgreSQL 迁移 | [implementation/phase-6-implementation.md](./implementation/phase-6-implementation.md) | 无独立验收清单（一次性迁移，验收证据见实施清单表格） | 已交付——Supabase → 自建 PostgreSQL 16：`public` schema 逻辑迁移 + 9 表内容哈希对账 + 连接串切换 + 运行时冒烟 |
| 7 库存与购物清单下线 | [implementation/phase-7-implementation.md](./implementation/phase-7-implementation.md) | [phase-7-checklist.md](./acceptance/phase-7-checklist.md) | 已交付——删除库存、匹配度、缺料与购物清单；纯偏好排序、筛选入口、备份恢复演练与历史 JSON 清理边界均已验收（ADR-0017）。全库 Web 质量门既有限制见 Phase 7 实施清单。 |
| 8 食材资料库与按食材筛选 | [implementation/phase-8-implementation.md](./implementation/phase-8-implementation.md) | [phase-8-checklist.md](./acceptance/phase-8-checklist.md) | 已交付——[#5](https://github.com/jokerwon/shiguang/issues/5)（子票 #6–#12）：A–G 组验收全部有可复核证据（2026-10-08 收口轮实跑）；仍待维护者过目的是 2026-09-30 核对轮新增/改写的 5 条资料文案与来源（不阻塞验收） |
| 8-1 发布并查阅食材资料 | [implementation/phase-8-1-implementation.md](./implementation/phase-8-1-implementation.md)（含验收证据与遗留边界） | 证据并入上方 phase-8 清单（A/B 组） | 已交付——[#6](https://github.com/jokerwon/shiguang/issues/6)：稳定身份入库、审核资料导入发布、已发布读取接口、食材列表与详情及真实浏览器走查 |
| 8-2 菜谱关联稳定食材身份 | [implementation/phase-8-2-implementation.md](./implementation/phase-8-2-implementation.md)（含验收证据与遗留边界）；逐项核对材料见 [phase-8-2-ingredient-mapping-review.md](./implementation/phase-8-2-ingredient-mapping-review.md) | 证据并入上方 phase-8 清单（A 组） | 已交付——[#7](https://github.com/jokerwon/shiguang/issues/7)：菜谱载荷携带身份 id、详情按 id 跳转、seed 发布共用归一校验、生成侧选材白名单；219 行逐项核对表已由维护者复核（2026-09-30） |
| 8-3 按别名和分类发现食材 | [implementation/phase-8-3-implementation.md](./implementation/phase-8-3-implementation.md)（含验收证据与遗留边界） | 证据并入上方 phase-8 清单（B 组、E1） | 已交付——[#8](https://github.com/jokerwon/shiguang/issues/8)：身份优先搜索（整串相等才算命中，子串只作「相近候选」）、`GET /ingredients/identify` 名称解析与歧义候选、列表页直达/候选/无命中三态；真实浏览器与移动端、键盘走查与会话记录见实施清单 |
| 8-7 AI 搜索复用多食材筛选 | [implementation/phase-8-7-implementation.md](./implementation/phase-8-7-implementation.md)（含验收证据与遗留边界） | 证据并入上方 phase-8 清单（F 组与 D1） | 已交付——[#11](https://github.com/jokerwon/shiguang/issues/11)：`search_recipes` 增 `ingredients`（名称/别名→复用 `IngredientService.identify` 归一→`recipeIdsContainingAll` 全部包含）、歧义/未收录/空白如实报错不扩大查询、安全排除与无匹配给出可区分说明、确定性回归（11 例）与真实 SSE 冒烟（正向、忌口排除、信息不足、调味料、歧义） |
| 9 菜谱原料单一事实源 | [implementation/phase-9-implementation.md](./implementation/phase-9-implementation.md)（含迁移证据与遗留边界） | 无独立验收清单（证据见实施清单表格） | 已交付——[ADR-0019](./adr/0019-recipe-ingredient-single-source.md)：`RecipeIngredient` 主键改 `(recipeId, position)`、删除 `Recipe.ingredients`，读取/写入/归一/AI 工具全部改读关联行；live 库迁移后 88 道 / 660 项原料全部带身份，与迁移前备份逐行对账 0 差异 |
| 10 Jev 候选重排序离线实验 | [implementation/phase-10-implementation.md](./implementation/phase-10-implementation.md)（含 2026-10-08 实施与验证记录、开发样例与正式评估运行记录） | [phase-10-checklist.md](./acceptance/phase-10-checklist.md) | 已交付（实验完成，未接入线上）——[Spec #14](https://github.com/jokerwon/shiguang/issues/14)（子票 #15–#18）：离线脚本 + 21 例回归；30 主场景 + 7 边界实跑真实服务（416 次请求、响应版本 `jev-1.13.0`、0 不变量违规）；用户完成 30 场景盲评，揭盲 **Jev 胜 16 / 平 11 / 负 3、净胜 13**（门槛 6），出口 `continue`＝建议继续接入设计（不自动上线，不构成统计显著性，结论限于本次中文且候选充足的冻结排序场景）。线上共享排序/搜索/首页/schema 未改动；**A2–A3 未勾选**（账号价格与计费条件无法核实，费用均为估算） |
| 11 Jev 候选重排序接入线上 | [implementation/phase-11-implementation.md](./implementation/phase-11-implementation.md)（含 2026-10-09 实施与验证记录） | [phase-11-checklist.md](./acceptance/phase-11-checklist.md)（G2–G4 未勾选） | **接入实现已交付、未放量**——[Spec #19](https://github.com/jokerwon/shiguang/issues/19)（子票 #20–#23）；[ADR-0020](./adr/0020-jev-rerank-online-integration.md)：在候选池（`rankRecipes` 之后、`slice` 之前）重排，只换序不改集合，上限默认 12；软偏好由聊天模型按用户原话填 `demand`（填不出不重排）；保持单候选协议、派发改并行 + 全局令牌桶；默认 `off` + 总超时回退基线；影子 → 灰度 → 全量。关闭态离线重放 38/38 场景与 Phase 10 工件一致；19 套件 / 193 例、lint、构建通过。**G2 真实 SSE 需付费授权、G3 需真实流量、G4 需人工盲评**；线上收益与呈现层均未验证 |

## 运行层

| 文档 | 状态 | 说明 |
|------|------|------|
| 部署 Runbook | **待写** | 进入真实部署前编写：部署步骤、环境变量/密钥清单（用途/获取/轮换）、故障处置。OPC 没有 on-call 轮值，这是写给状态最差的自己看的 |
