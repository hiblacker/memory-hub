# MemoryHub

MemoryHub 是一个面向 ChatGPT、Claude Code 与思源笔记的可审核记忆中枢。对话先进入候选记忆收件箱，经过去重、脱敏、人工审核或规则判断后，再归档到思源。

当前状态：**V1 业务开发中**。第一个纵向切片已经完成：PostgreSQL 自动初始化、单管理员登录、服务端会话、登录页和候选收件箱首页。

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
  api/       Fastify API、管理员认证与会话
  web/       Vue 登录页与管理界面
  worker/    后台任务进程占位
packages/
  contracts/ 跨应用共享契约
  database/  PostgreSQL Schema、初始化和数据访问
docs/        设计、测试、部署与安全文档
deploy/      本地数据库与 NAS Docker Compose 文件
```

设计入口见 [docs/README.md](docs/README.md)。贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。AI 编码约束见 [AGENTS.md](AGENTS.md)。

## 本地启动

```bash
corepack enable
pnpm install --frozen-lockfile
docker compose -f deploy/compose.dev.yaml up -d
pnpm dev
# 等同于并行启动 web / api / worker
```

打开 <http://localhost:8788>。开发环境默认登录凭据：

```text
用户名：admin
密码：memoryhub-dev
```

API 与 Worker 启动时会自动加载仓库根目录或当前目录的 `.env`（已存在的系统环境变量优先，不会覆盖）。

Worker 负责消费归档 outbox 并调用思源。开发环境可在 `.env` 中设置：

```text
SIYUAN_TOKEN=你的思源Token
SIYUAN_BASE_URL=http://192.168.1.10:1166
```

该密码仅在 `NODE_ENV=development` 且未配置管理员密码时生效。生产环境必须通过 `MEMORY_HUB_ADMIN_PASSWORD_FILE` 注入密码。

API 启动时自动应用数据库版本 `1`，创建用户、会话、候选摘要和归档交付表，并在首次启动时创建管理员账号。可通过以下端点检查状态：

- `GET http://localhost:8787/healthz`：API 进程存活。
- `GET http://localhost:8787/readyz`：PostgreSQL 可用。

## 质量检查

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

业务开发须继续遵循 V1 范围、ADR 和安全边界。
