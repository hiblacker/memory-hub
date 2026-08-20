# ChatGPT 记忆保存：规则命中后入库，经 MCP / Skill / Agent 接入

状态：**待确认**  
版本：`chatgpt-mcp-v2`  
日期：2026-08-20

本方案替换 `chatgpt-session-v1`。确认后再开发接入；手动录入 UI 按你的要求删除。

## 先回答两个概念

**「无 LLM」**  
之前那版的意思是：MemoryHub **可以不接大模型**，关掉模型时仍能人工改记忆、同步思源。  
不是「ChatGPT 没有模型」。  
在本方案里：抽取发生在 **Agent 侧**（ChatGPT / Codex / Claude 自己就是模型）。MemoryHub 服务端默认 **不需要再调一次 LLM** 才能决定是否入库；它只做规则匹配、去重、脱敏、同步。

**「导入官方导出」**  
指 ChatGPT 账号设置里「导出数据」得到的 `conversations.json` 整包导入。  
你要求以软件 + Skill/Agent/MCP 为主，**本方案取消官方导出导入，也不做浏览器扩展。**

## 1. 目标

- 长期记忆按**会话**沉淀，但 **不是每个会话都入库**。
- 只有命中你在 MemoryHub 里配置的规则，才写入数据库并（按规则）同步思源。
- 项目记忆按 **project** 聚合到同一目录。
- 接入面是 MemoryHub 提供的 **MCP Server + Skill**，由 Agent 在对话结束时调用；不是爬 ChatGPT 网页。

## 2. 什么会入库，什么不会

Agent 把「本会话候选记忆」交给 MemoryHub（一次调用可带 1..N 条结构化记忆，附带 conversationId）。

MemoryHub **先评规则，再决定是否落库**：

```text
MCP 调用
  → 校验、脱敏
  → 规则引擎（类型 / 项目 / 来源 / 关键词 / 置信度 / 敏感级）
  → 未命中：不写 source_events、不写 candidates，返回 { accepted: false, matches: [] }
  → 命中：才入库、去重、按规则同步或进收件箱
```

未启用任何规则时：**全部拒绝入库**（避免「来了就存」）。需要至少一条启用规则，例如：

- 长期：`memoryType in (permanent_fact, preference)` 且 `sensitivity = normal`
- 项目：`project 非空` 且 `memoryType in (project_context, decision)`

可提供 `dryRun: true`：只返回是否命中，不写库。

## 3. 聚合与思源路径

| 命中类型 | 聚合 | 路径 | 文档 |
| --- | --- | --- | --- |
| 永久事实 / 偏好 等长期记忆 | 会话 | `/MemoryHub/长期记忆/会话/{conversationTitle}` | 同一 `conversationId` 更新同一篇 |
| 项目上下文 / 项目决策 / 项目待办 | 项目 | `/MemoryHub/项目/{project}/{title}` | 同项目同标题走修订，不新建平行文档 |

没有项目名的条目不能进项目目录；若也不命中长期规则，则丢弃。

## 4. 软件接入（MCP / Skill / Agent）

MemoryHub 作为本机/NAS 上的服务，对外提供 MCP（可同时给 ChatGPT、Codex、Claude Code 用）。

建议工具：

| 工具 | 作用 |
| --- | --- |
| `memoryhub.evaluate_memories` | 干跑：这些候选会不会入库 |
| `memoryhub.save_memories` | 真正提交；仅保存命中规则的条目 |
| `memoryhub.list_rules` | 让 Agent 知道当前规则，避免乱提交 |

Skill（例如 Codex `SKILL.md` / Claude Skill）：

- 何时调用：用户明确说「记住」「记到项目 X」，或会话结束且内容明显是长期偏好/项目决策。
- 调用前在本地整理成结构化条目（标题、类型、项目、会话 id、正文）。
- **不要**把整段闲聊塞进来；规则是第二道闸，Skill 是第一道闸。
- 失败不得打断用户对话。

不提供浏览器扩展，不读 ChatGPT 隐藏 Memory。

## 5. 和现有系统的关系

- 收件箱仍用于：命中规则但不够自动同步条件（例如要人审）的条目。
- 已同步记忆、修订、回收站逻辑不变。
- **删除手动录入页、导航和相关 UI。** 记忆只从 MCP/事件进入。`POST /api/v1/candidates` 可保留给测试，产品界面不再暴露。

## 6. 开发顺序（确认后）

1. 规则引擎最小闭环：声明式规则 CRUD + 试运行 + 启用。
2. `save_memories` / `evaluate_memories`：规则未命中不落库。
3. 同步路径：长期按会话文档，项目按项目目录；同会话/同项目标题更新原文档。
4. MCP Server 接到 MemoryHub（stdio 或 HTTP）。
5. 仓库内 Skill 文档（Codex / Claude 各一份）。
6. ChatGPT 侧通过官方 MCP 客户端指向该 Server（不写扩展）。

没有规则引擎，就无法做到「符合规则才入库」，所以规则要先于 MCP。

## 7. 待确认

- [ ] 未命中规则的会话/条目完全不入库。
- [ ] 不接浏览器扩展、不接官方数据导出。
- [ ] 入口是 MCP + Skill + Agent。
- [ ] 服务端默认不再为入库去调一层 LLM。
- [ ] 先做规则引擎，再做 MCP。
- [ ] 手动录入 UI 删除（进行中）。
