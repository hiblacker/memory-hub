# 开源项目调研

调研日期：2026-08-14。活跃度以 GitHub 页面展示的近期提交为依据，star 只作为社区规模信号，不作为选型的唯一标准。

## 核心候选

| 项目                                                            | 解决的问题                                     | 架构与依赖                                                                                | 活跃度/许可          | 参考结论                                                                 |
| --------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------ |
| [claude-mem](https://github.com/thedotmack/claude-mem)          | Claude Code 跨会话记忆和渐进式召回             | 生命周期 Hook、Bun/Express Worker、SQLite/FTS5、Chroma、MCP；服务端模式可接 Valkey/BullMQ | 近期活跃，Apache-2.0 | 复用统一事件适配、非阻塞 Hook、待处理队列、幂等和渐进式披露              |
| [Mem0](https://github.com/mem0ai/mem0)                          | 通用用户/会话/Agent 记忆层                     | FastAPI、PostgreSQL/pgvector、Next.js 管理台、LLM 与 Embedding Provider                   | 近期活跃，Apache-2.0 | 复用作用域、API Key、Provider 抽象和管理台；不直接采用 ADD-only 数据模型 |
| [Supermemory](https://github.com/supermemoryai/supermemory)     | 对话事实、用户画像、冲突和过期处理             | TypeScript、本地单机服务、本地 Embedding，可接 Ollama 和云模型                            | 近期活跃，MIT        | 复用静态/动态画像、单目录备份和本地优先理念                              |
| [Graphiti](https://github.com/getzep/graphiti)                  | 可变化事实的时序知识图谱                       | Python、Neo4j/FalkorDB、LLM、Embedding、MCP                                               | 近期活跃，Apache-2.0 | 复用来源 episode、有效期和 supersedes 语义；V1 不引入图数据库            |
| [Karakeep](https://github.com/karakeep-app/karakeep)            | 自托管信息收件箱、浏览器采集、审核和规则       | Next.js、Drizzle、tRPC、Meilisearch、Worker、浏览器扩展                                   | 近期活跃，AGPL-3.0   | 复用产品交互思路；不复制其 AGPL 代码，不引入媒体抓取复杂度               |
| [ChatGPT Exporter](https://github.com/pionxzh/chatgpt-exporter) | ChatGPT 页面及官方导出文件转换为 Markdown/JSON | TypeScript、Preact、Vite、Tampermonkey                                                    | 近期活跃，MIT        | 参考会话树解析、显式选择和批量导入；不依赖未公开 backend API             |

## 排除作为基座的项目

- [Zep](https://github.com/getzep/zep)：当前仓库主线是 Zep Cloud 示例和集成，原 Community Edition 已标记为不再支持。
- [Letta](https://github.com/letta-ai/letta)：定位为完整状态化 Agent 平台，服务端仓库也处于代际迁移，范围远大于本项目。
- [Open WebUI](https://github.com/open-webui/open-webui)：功能和部署面过大，且当前许可证包含品牌修改限制，不适合作为专用归档应用基座。

## 最终吸收的设计

- 所有来源先映射成稳定的 `SourceEvent`，核心逻辑不读取 Claude Code 或 ChatGPT 私有字段。
- 采集失败永不阻断用户正常对话或编码会话。
- 原始事件、候选记忆、记忆版本和归档交付分层保存。
- 使用内容指纹和来源幂等键防止 Hook 重放、网络重试造成重复数据。
- 矛盾事实生成新版本并指向被替代版本，不由模型静默覆盖历史。
- 检索先返回紧凑索引，再按需展示来源原文，降低界面噪声和模型 token 消耗。

## 明确避免

- V1 不同时维护 PostgreSQL、Chroma、Neo4j、Redis、Meilisearch 多套状态。
- 不把未经审核的 LLM 推断直接视为永久事实。
- 不默认保存完整工具响应、源代码文件或密钥。
- 不把思源 `.sy` 文件当普通文件直接修改，只通过内核 API 写入。
- 不把 ChatGPT 页面 DOM 或未公开 API 视为稳定契约。
