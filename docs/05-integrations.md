# 集成设计

## 标准事件契约

所有来源转换为同一结构后再入库：

```json
{
  "schemaVersion": 1,
  "source": "claude_code",
  "eventType": "session_summary",
  "externalConversationId": "session-id",
  "externalEventId": "event-id",
  "occurredAt": "2026-08-14T12:00:00Z",
  "project": {
    "name": "memory-hub",
    "repository": "local",
    "branch": "main"
  },
  "content": {
    "title": "会话总结",
    "text": "结构化后的对话或总结"
  },
  "metadata": {}
}
```

API 必须验证大小、媒体类型、时间范围和 schema 版本。超大工具输出在客户端截断并记录摘要。

## ChatGPT

V1 提供两条稳定路径：

- 浏览器扩展中的“保存当前回答/所选消息”，由用户明确触发。
- 导入官方数据导出中的 `conversations.json`，支持预览和选择会话。

项目不提供网页自动监听、后台抓取或隐藏长期记忆读取能力，不依赖 ChatGPT DOM 结构或未公开的 `backend-api`。ChatGPT 桌面端没有稳定 DOM 扩展面时，使用粘贴、导入或受支持的 REST/MCP 客户端。

## Claude Code

V1 使用 Hook 适配器，优先采集会话摘要、用户目标、项目目录、分支和变更文件清单。完整工具输入/输出默认不上传。

Hook 设计要求：

- 超时、网络失败或 MemoryHub 停机时退出成功，不阻断 Claude Code。
- 失败事件可写入本地 spool，下一次 Hook 重试。
- 适配器版本与标准事件 schema 解耦。
- 支持 `<private>` 标记或等价排除范围。

具体 Hook 名称和载荷应按安装时的 Claude Code 版本做契约测试，不把版本特定字段写进核心领域层。

## 思源笔记

目标地址默认为 `http://192.168.1.10:1166`。已验证该主机 API 可达，未鉴权调用受保护接口返回 401。

V1 使用：

- `/api/notebook/lsNotebooks`：测试连接并选择笔记本。
- `/api/filetree/createDocWithMd`：首次创建目标文档。
- `/api/block/appendBlock`：新增记忆块。
- `/api/block/updateBlock`：审核后的同一记忆版本更新。

鉴权请求头做成配置项，默认支持 `X-Auth-Token`，并兼容需要 `Authorization: Token ...` 的版本。Token 只由 Worker 读取。

推荐路径模板：

```text
/MemoryHub/00 收件箱/{yyyy}/{MM}.sy
/MemoryHub/10 长期记忆/{type}.sy
/MemoryHub/20 项目/{project}/决策.sy
```

每个归档块包含 `memory_id`、版本、来源、捕获时间和 MemoryHub 回链。不得直接编辑思源数据目录中的 `.sy` 文件。

## 模型 Provider

统一接口包括 `extractMemories`、`classifySensitivity` 和 `summarizeSource`。V1 支持一个启用的 Provider，可选 OpenAI-compatible、Anthropic 或 Ollama。关闭 LLM 时仍允许人工创建和归档记忆。
