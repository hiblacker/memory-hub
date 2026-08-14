# MemoryHub

MemoryHub 是一个面向 ChatGPT、Claude Code 与思源笔记的可审核记忆中枢。对话先进入候选记忆收件箱，经过去重、脱敏、人工审核或规则判断后，再归档到思源。

当前状态：**方案已确认，准备进入 V1 业务开发**。仓库当前仍以基础工程、设计文档、测试基线和部署草案为主，记忆抽取及归档业务将按 V1 顺序实现。

## 技术基线

- 前端：Vue 3、Vite、TypeScript、Naive UI、Pinia、Vue Router、TanStack Query
- API：Node.js 22、Fastify、Zod
- 数据库：PostgreSQL、Drizzle ORM
- 后台任务：pg-boss
- 测试：Vitest、Vue Test Utils、Fastify inject、Playwright（后续阶段）
- 部署：Docker Compose，目标环境为 NAS

## 目录

```text
apps/
  api/       HTTP API 基础服务
  web/       Vue 管理界面基础壳
  worker/    后台任务进程占位
packages/
  contracts/ 跨应用共享契约
docs/        设计、测试、部署与安全文档
deploy/      NAS Docker Compose 草案
```

设计入口见 [docs/README.md](docs/README.md)。贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。AI 编码约束见 [AGENTS.md](AGENTS.md)。

## 本地基线验证

```bash
corepack enable
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

设计方案已确认，业务开发须遵循 V1 范围、ADR 和安全边界。
