# ADR-0001：技术基线

- 状态：Accepted
- 日期：2026-08-14

## 决策

采用 Vue 3 + Vite 管理端、Fastify API、Node.js Worker、PostgreSQL/Drizzle 和 pg-boss。代码组织为 pnpm TypeScript monorepo。

## 原因

- 浏览器扩展、Claude Code 适配器、Vue 前端、API 和 Worker 可以共享 TypeScript Schema。
- PostgreSQL 同时承载业务数据、全文检索和可靠任务，减少 NAS 容器数量。
- Fastify 支持轻量 API、schema 驱动验证和无网络单元测试。
- Vue 满足指定前端技术栈，并有成熟的状态管理与测试生态。

## 暂不采用

- Redis/BullMQ：V1 没有需要独立缓存和高吞吐队列的规模。
- Chroma/独立向量库：增加状态和备份复杂度，关键词检索足够覆盖 V1 审核场景。
- Neo4j/FalkorDB：时序语义可先在关系模型中表达。
- SQLite：单进程简单，但 API/Worker 并发、迁移和 NAS 恢复流程不如 PostgreSQL 稳定。

## 后果

V1 至少需要 PostgreSQL 容器。任何新增基础设施依赖必须提交新的 ADR，并说明备份、升级和故障模式。
