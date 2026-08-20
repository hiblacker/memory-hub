# 工作区体验、筛选分页与回收站

状态：**待确认**  
版本：`workspace-ux-v1`  
日期：2026-08-20  
关联：[V1 范围](06-v1-scope.md)、[交互设计](12-frontend-interaction-design.md)、[修订与版本](14-memory-revision-and-version-history.md)、[安全](09-security.md)

本文件覆盖本次提出的 4 项能力，以及它们与剩余 V1 工作的排期。确认后再开发，不在确认前改业务代码。

## 1. 现状与问题

| 问题 | 现状 |
| --- | --- |
| 详情页同步记录 | 一次列出该记忆全部交付，占正文空间 |
| 顶栏「思源待配置」 | `AppShell` 写死 warning 文案，不读设置接口；连接已成功也会误导 |
| 记忆列表 | 收件箱/已同步都是全量拉取，无筛选、无分页 |
| 删除 | 没有删除入口；V1 原先禁止自动删除，但未提供人工删除与回收站 |

V1 已写明要做「关键词搜索、来源/类型/状态/项目过滤」，尚未实现。删除+回收站是新增能力，需单独确认后纳入 V1。

## 2. 设计原则

- 列表筛选、排序、分页只走 URL query，刷新可恢复。
- 顶栏连接状态来自服务端摘要，不在 Web 读 Token。
- 删除必须显式确认，禁止静默删、禁止 API 请求内调思源。
- 删除是软删除：MemoryHub 进回收站，Worker 再补偿删除思源文档。
- 思源删除失败要可见、可重试，不能把本地记录假装没删。
- 回收站可恢复；恢复后思源文档需重新同步，不假设原 ID 仍在。

## 3. 详情页：同步记录收纳

详情主区只展示**最新一条**交付：状态、尝试次数、文档 ID、路径、错误摘要（若失败）。

右侧或底部提供「查看全部」：`NModal` 列出该记忆全部交付，按时间倒序，含重试按钮（失败/死信）。

```text
GET /api/v1/candidates/:id/deliveries          # 保持，弹窗用
详情页默认只渲染 items[0]
```

不新增接口。组件局部状态只保存 modal 开关。

## 4. 顶栏思源状态

`GET /api/v1/home` 增加：

```ts
siyuan: {
  status: 'unconfigured' | 'failed' | 'connected'
  notebookName: string | null
  lastTestedAt: string | null
}
```

判定：

| 条件 | 状态 | 文案 |
| --- | --- | --- |
| 无 notebookId 或未配置 token | `unconfigured` | 思源待配置 |
| 最近测试失败 | `failed` | 思源连接失败 |
| 最近测试成功且有笔记本 | `connected` | 思源已连接 · {笔记本名} |

Tag 颜色：warning / error / success。点击跳转 `/settings/siyuan`。

Token 仍只在服务端，Web 只拿布尔 `tokenConfigured` 与测试结果。

## 5. 记忆列表：筛选、排序、分页

收件箱 `/inbox` 与已同步 `/synced` 共用同一套查询协议，区别只是默认状态。

### 5.1 Query

```text
q            关键词，匹配标题/正文（PostgreSQL ILIKE / 全文检索）
status       pending,queued,synced,rejected,conflict；可多选，逗号分隔
type         memoryType 多选
source       manual,claude_code,...
project      精确或前缀
from,to      更新时间 ISO 日期
sort         updated_at_desc（默认）| updated_at_asc | capture_time_desc
page         从 1 开始
pageSize     20，最大 100
```

收件箱默认 `status=pending,queued,conflict`。  
已同步页默认 `status=synced`。  
回收站不走这两个列表。

URL 示例：`/inbox?type=decision,preference&from=2026-08-01&page=2`

### 5.2 API

```text
GET /api/v1/candidates?...上述参数
{
  items: CandidateSummary[]
  page: number
  pageSize: number
  total: number
}
```

`/api/v1/synced` 复用同一查询，服务端强制排除 `trashed`，默认 status=synced。

### 5.3 UI

工具条：搜索框、状态下拉（多选）、类型、时间范围、项目。  
列表底部 `NPagination`。  
空状态区分「没有任何记忆」和「筛选无结果（清除筛选）」。

## 6. 删除、思源补偿与回收站

### 6.1 为什么要回收站

删除已同步记忆会同时影响 PostgreSQL 和思源。网络失败、Worker 未启动、文档已在思源被手删，都会让两侧不一致。软删除 + 补偿任务 + 回收站，才能审计、重试和反悔。

### 6.2 状态

新增候选状态 `trashed`。列表默认过滤。`deleted_at`、`deleted_from_status` 记录进回收站前的状态。

状态机增量：

```text
pending|queued|synced|rejected|conflict --确认删除--> trashed
trashed --恢复--> 原状态（queued 恢复为 pending，避免卡在无交付的 queued）
trashed --彻底删除--> 物理删除候选及其版本（交付与审计保留或归档摘要）
```

`queued` 删除：取消未完成交付（标记 cancelled），再进回收站。

### 6.3 删除流程

1. 列表/详情点删除。
2. Dialog 明确：将移入回收站；若已同步，将排队删除对应思源文档。
3. API `POST /candidates/:id/trash`：同一事务把状态改为 `trashed`，写审计 `candidate.trash`，若存在成功过的 `document_id` 则写入 outbox `siyuan.purge`。
4. API **不**调用思源。
5. Worker 调 `removeDocByID`；文档已不存在视为成功。
6. 交付或 purge 记录保存结果：`purge_status = pending|succeeded|failed`。

失败时记忆仍在回收站，提供「重试删除思源文档」。MemoryHub 侧不自动恢复。

### 6.4 恢复

`POST /candidates/:id/restore`：

- 回到 `deleted_from_status`（queued → pending）
- 审计 `candidate.restore`
- **不**自动重建思源文档
- 已同步过的记忆恢复后状态为 `pending`（修订待同步），用户再批准才会按新文档创建

避免恢复后误以为思源里还在。

### 6.5 彻底删除

回收站内二次确认后物理删除工作副本与版本正文。审计、purge 记录保留。不可从产品内找回。

可后续加 30 天到期自动彻底删除，V1 先做手动。

### 6.6 列表入口

卡片/行增加删除。批量删除 V1 可做，但第一刀先做单条。  
导航增加「回收站」`/trash`。

### 6.7 安全

- 删除/彻底删除/恢复都要登录会话。
- 确认框不可省略。
- 日志不写正文全文。
- 思源路径与 ID 校验，禁止用用户输入拼接任意路径。

## 7. 页面与路由

| 路由 | 用途 |
| --- | --- |
| `/inbox` | 待处理列表 + 筛选分页 |
| `/synced` | 已同步列表 + 筛选分页 |
| `/inbox/:id` | 详情；同步记录默认 1 条 |
| `/trash` | 回收站 |
| `/settings/siyuan` | 顶栏状态点击目标 |

详情同步记录 Modal 不单独占路由。

## 8. 与剩余工作的总排期

建议顺序（确认后执行）：

| 序号 | 项 | 类型 | 说明 |
| --- | --- | --- | --- |
| A | 顶栏思源状态 | 缺陷 | 小、独立，先做 |
| B | 详情同步记录收纳 | 体验 | 小、纯前端 + 现有 deliveries API |
| C | 列表筛选/分页 | V1 原范围 | 契约、SQL、收件箱与已同步页 |
| D | 删除 + 回收站 + 思源 purge | 新范围 | 迁移、Worker、审计 |
| E | 版本历史与比对 | 已设计未做 | 见文档 14 第二步 |
| F | 规则引擎 | V1 | 干跑 + 自动同步 |
| G | Claude Code Hook / ChatGPT 导入 | V1 | 连接器主路径 |
| H | 可选 LLM Provider | V1 | 可关，不阻塞人工流 |
| I | NAS 部署/备份/E2E | V1 | 收尾 |

不纳入本轮：图片 Markdown、双向思源同步、自动清空回收站、批量删除（可作 D 的增强）。

## 9. 验收

- 详情默认 1 条同步记录，弹窗可看全部并可重试失败项。
- 顶栏在测试成功后显示「思源已连接 · 笔记本名」，不再误报待配置。
- `/inbox?type=decision&page=2` 刷新后条件仍在；总数与页码正确。
- 删除已同步记忆：列表消失、回收站可见、思源文档被删或 purge 失败可见。
- 恢复后记忆回到待审核，再次同步会新建文档而不是写已删 ID。
- 筛选与删除都不把 Token 或思源原始错误堆栈送到浏览器。

## 10. 待确认

- [ ] A–D 纳入当前开发，顺序 A → B → C → D。
- [ ] 删除为软删除 + 回收站；恢复后需重新同步思源。
- [ ] 彻底删除仅在回收站，V1 不做到期自动清空。
- [ ] 批量删除、版本比对、规则引擎按 E 之后排队，不插入 A–D。
