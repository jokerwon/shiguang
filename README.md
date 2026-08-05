# 食光 (Shiguang)

菜谱推荐 Web 应用：食材匹配、个性化推荐、对话式 AI 助手（可代操作 pantry/收藏）。

pnpm workspace monorepo：

| 包 | 技术栈 | 端口 |
|----|--------|------|
| `apps/web` (@shiguang/web) | Next.js 16 / React 19 / Tailwind v4 | 3000 |
| `apps/server` (@shiguang/server) | NestJS / Prisma / PostgreSQL | 3001 |

## 快速开始

```bash
pnpm install
# 配置 apps/server/.env（DATABASE_URL / JWT_SECRET / OPENAI_*，见 apps/server/.env.example）
pnpm --filter @shiguang/server db:generate && pnpm --filter @shiguang/server db:migrate
pnpm dev   # 同时启动前后端
```

要求：Node.js >= 20，pnpm >= 10.15，PostgreSQL。

## 文档

- 文档索引与状态：[docs/README.md](docs/README.md)
- 架构决策记录：[docs/adr/](docs/adr/README.md)
- Agent 工作指令：[CLAUDE.md](CLAUDE.md)（根）、[apps/web/AGENTS.md](apps/web/AGENTS.md)、[apps/server/AGENTS.md](apps/server/AGENTS.md)
