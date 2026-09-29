# Phase 6 实施清单：Supabase → 自建 PostgreSQL 16

> 状态：已交付（2026-09-29）。本清单为一次性迁移记录，非持续维护工件。

## 背景

后端原先托管在 Supabase。目标是把数据整体迁到 `117.72.123.231:5432` 的自建 PostgreSQL 16（`shiguang` 库），使应用与 Prisma CLI 都直连自建实例，不再依赖 Supabase pooler。

## 关键前置发现

以下事实来自执行时对真实环境的探查，不是计划假设：

1. **源库版本是 PostgreSQL 17.6**，高于目标 16.15。`pg_dump` 必须 ≥ 源库主版本，因此导出用 17.x 客户端；恢复同样用 17.x 的 `psql`（见第 4 条：16 的 `psql`/`pg_restore` 会拒掉归档头里的 PG17 专属 `SET`）。**注意这推翻了「源库 >16 就停」的原始前置——它防的是降版本恢复，而本 schema（text cuid 主键、JSON、enum、`text[]`）没有任何 17 专属对象，跨版本恢复风险实测为零（9 表哈希逐字节相等即为证）。**
2. **源库是托管 Supabase 实例**：`public` 之外有 `auth/storage/realtime/vault/graphql/extensions` 等托管 schema，`pg_extension` 含 `supabase_vault` 等。`public` 内本身干净——9 张表 + 3 个 enum，无 view/function/trigger/policy/sequence，所以按 schema 导出即可，不需要整库迁移。
3. **Supabase 超管/开发角色密码不可恢复**（`scram-sha-256` 单向哈希）。`pg_dumpall --roles-only` 无法在自建实例上复现；由于 `--no-owner --no-privileges` + 目标库以 `user` 为 owner 恢复，托管角色与 606 条授权不需要迁移。
4. **`pg_restore` 不能直接吃 17 的 custom-format 归档进 16**：归档头部带 `SET transaction_timeout = 0;`（PG17 新增 GUC），16 报 `unrecognized configuration parameter`，且该 SET 在 psql 事务外执行，`--single-transaction` 也不覆盖它。改用 `pg_dump --format=plain` 后 `sed` 掉该行，再由 `psql --single-transaction` 恢复。
5. **`prisma migrate diff --from-migrations --to-config-datasource` 在本仓库不可用**：Prisma 7.9 要求 `datasource.shadowDatabaseUrl`（v7 已移除 CLI 的 `--shadow-database-url`），仓库 `prisma.config.ts` 未配置 shadow 库。等价且零成本的形式是 `--from-config-datasource --to-schema prisma/schema.prisma --exit-code`。
6. **备份必须落到容器能看见的路径**：本机 Docker 由 colima 提供，colima VM **只挂载 `$HOME`**，`/tmp` 在 VM 内是独立的 tmpfs。`docker run -v /tmp/...` 不会绑定到宿主 `/tmp`，且容器内写入不会回写宿主。因此 dump/manifest 的落盘目录选 `~/shiguang-migration`。

## 迁移步骤（实际执行）

| 步骤 | 操作 | 证据 |
|------|------|------|
| 1 | 源库只读基线：版本、对象集、9 表行数、FK 孤儿、Message seq 连续性、`parts NOT NULL`、`_prisma_migrations` 9/9 完成未回滚 | 全部偏移量为 0；行数 4/88/12/4/5/0/1/1 |
| 2 | 停写：终止 NestJS server 与种子脚本，确认 `pg_stat_activity` 无应用会话（只剩 Supabase 内部后台连接） | `usename='postgres'` 的会话数为 0 |
| 3 | 生成源 manifest：9 表按 `ORDER BY id` 的 CSV 行流 sha256，`PGOPTIONS='-c timezone=UTC -c datestyle=ISO,MDY'` | 生成后重跑 manifest 逐字节一致，证明 dump 前无漂移 |
| 4 | `pg_dump --schema=public --no-owner --no-privileges`（PG17 客户端），TOC 校验器断言只有 `public` 的 9 表 + 3 enum | 校验器退出码 0 |
| 5 | 确认目标 `shiguang` 不存在 → `CREATE DATABASE shiguang OWNER "user" TEMPLATE template0` | 建库前查询返回空 |
| 6 | `--format=plain` dump 去掉 `SET transaction_timeout = 0;` 行，容器内（`postgres:17-alpine`）`psql --single-transaction -v ON_ERROR_STOP=1 -f`；恢复前 `DROP SCHEMA public CASCADE` 让 dump 原样重建 | 退出码 0 |
| 7 | 目标侧对象/行数/完整性 SQL 对账 + 目标 manifest，与源 manifest `diff` | `diff` 无输出（9 表逐字节一致） |
| 8 | `DIRECT_URL=<目标> pnpm db:status` → `Database schema is up to date!`；`prisma migrate diff --from-config-datasource --to-schema` → `No difference detected.`；`db:generate` 成功 | 三者均通过 |
| 9 | 重写 `apps/server/.env`：`DATABASE_URL` 与 `DIRECT_URL` 同时指向新库，删除失效 Supabase 串；原文件备份到工作区外 `~/shiguang-migration/env-backup/.env.pre-migration` | 文件内 `supabase` 出现次数为 0 |
| 10 | 重启真实 server：`GET /recipes?limit=1` → 200 `{data,meta}`，`meta.total=88`；注册临时账号 → `POST /auth/login` 201 → `GET /favorites`/`GET /conversations` 200；`PUT /pantry ["迁移验收食材"]` 200 → `GET /pantry` 回读一致 | 直连目标库确认 `PantryItem` 有该行，源库该账号不存在（写入确已切换） |
| 11 | 删除临时账号：目标库 `User` 删除 1 行（级联清 `PantryItem`/`RefreshToken`），源库 0 行；两库均确认无该邮箱 | `PantryItem` 回到 0，`User` 回到 4 |
| 12 | 回归：`pnpm --filter @shiguang/server test`（94 passed）、`pnpm --filter @shiguang/server lint`（通过，后端单独跑；`pnpm -r lint` 因前端 pre-existing 错误在 web 处 `FIRST_FAIL` 中止，见下） | 见下方"已知遗留" |

## 环境依赖（本机）

- 本机原先没有 16.x 客户端，且 Homebrew 的 `postgresql@16` 在 macOS 27 / arm64 上无 bottle。迁移改用 `docker run postgres:17-alpine`（工具链在容器内）执行 dump/manifest，用 `postgres:17-alpine` 的 `psql` 恢复——**版本选择由源库主版本决定，不是由目标库决定**。
- 自建的 schema 恢复不依赖 `prisma migrate deploy`：归档里已含完整 schema 与 `_prisma_migrations` 账本；先 replay migration 会制造对象冲突。

## 已知遗留

- `pnpm -r lint` 在前端失败：`apps/web` 有 3 处 React 19 规则错误（`shimmer.tsx` 的 `react-hooks/static-components`、`chat/[[...slug]]/page.tsx` 的 `set-state-in-effect`、`recipe/[id]/page.tsx` 的 JSX-in-try/catch）。全部位于本次迁移未触碰的文件，最后提交在 2026-07-24 ~ 08-11 之间，属 pre-existing。后端 lint 与 94 个单测全绿。
- Supabase 项目保留为只读回退源，未下线。回退方式：把 `DATABASE_URL` 与 `DIRECT_URL` 同时指向 Supabase Session pooler 5432 连接串。**注意**：迁移后切换到自建库所产生的业务写入不会回灌 Supabase，回退只适用于"尚未开放真实写入"的窗口。
