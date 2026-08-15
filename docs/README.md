# MemoryHub 设计文档

状态：**方案已确认**  
版本：`design-v1`  
日期：2026-08-14

本目录是进入业务开发前的设计基线。任何涉及记忆抽取、自动归档或读取第三方对话的实现，都必须先更新对应文档并获得确认。

## 阅读顺序

1. [开源项目调研](01-open-source-research.md)
2. [产品与需求设计](02-product-design.md)
3. [系统架构](03-system-architecture.md)
4. [领域与数据模型](04-domain-data-model.md)
5. [集成设计](05-integrations.md)
6. [V1 范围与开发顺序](06-v1-scope.md)
7. [测试策略](07-testing-strategy.md)
8. [NAS Docker 部署方案](08-nas-deployment.md)
9. [安全与隐私](09-security.md)
10. [前端组件库选型](10-frontend-component-library.md)
11. [Vue 状态管理工具调研](11-frontend-state-management.md)
12. [前端交互设计图](12-frontend-interaction-design.md)
13. [记忆正文 Markdown 与排版规范](13-memory-markdown-formatting.md)
14. [TODO（待定事项）](TODO.md)

当前实现进度：登录、手动录入、收件箱列表与候选详情审核已完成。后续按 [V1 范围与开发顺序](06-v1-scope.md) 继续实现 Markdown 正文编辑/预览、思源归档交付与人工闭环剩余能力。

## 已确认决策

- [x] 接受 Vue 3 + Vite + Fastify + PostgreSQL 的单一 TypeScript 技术栈。
- [x] V1 使用 PostgreSQL 全文检索，不引入独立向量库、Neo4j、Redis 或 Meilisearch。
- [x] ChatGPT V1 仅支持显式保存和官方导出导入，不提供网页自动监听、后台抓取或隐藏长期记忆读取。
- [x] Claude Code V1 使用 Hook 发送最终摘要和必要元数据，不默认保存完整工具输出。
- [x] 永久记忆只有在规则命中、脱敏通过且不存在冲突时才自动归档。
- [x] 思源是最终归档，不承担任务队列和业务状态存储。
- [x] 原始对话默认保留 90 天，敏感内容不进入自动归档。
- [x] Pinia 已从 3.0.4 升级到 4.0.3，并补齐对应 Vue DevTools API 依赖。
- [x] Vue 3 管理端采用 Naive UI，按需导入组件并统一管理主题 Provider。
- [x] Vue 3 管理端采用 Pinia 管理跨页面客户端状态。

## 已确认的交互设计

- [x] 接受 [前端交互设计图](12-frontend-interaction-design.md) 作为 V1 管理端开发基线。
- [x] 静态页面画板已纳入仓库：[前端页面设计图](designs/frontend-pages.html)。
- [x] 接受 [记忆正文 Markdown 与排版规范](13-memory-markdown-formatting.md)：默认仅预览、双风格均含 emoji、录入/详情共用编辑器。
- [x] 明确删除并不再排期：LLM 润色、WYSIWYG 富文本、复杂图文贴纸引擎、思源正文回写、自定义 CSS 主题市场。
- [x] 图片 Markdown 是否支持待定，见 [TODO](TODO.md)。

