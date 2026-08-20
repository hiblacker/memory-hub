# ChatGPT 记忆保存：规则命中后入库，经 MCP / Skill / Agent 接入

状态：**待确认**  
版本：`chatgpt-mcp-v3`  
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

## 4. 策略分两层：何时提交 vs 能否入库

MemoryHub **不接 LLM**。因此「能不能入库」不能交给模型自己说了算，必须由 MemoryHub 的**声明式规则**判定。会话软件端只决定**什么时候把候选交过来**。

| 层 | 谁 | 何时 | 做什么 | 是否信任 |
| --- | --- | --- | --- | --- |
| 触发 | 会话软件 / Skill / Hook | 见下表 | 把本会话整理成结构化候选，调用 MCP | 不可作为最终闸门 |
| 入库策略 | MemoryHub 规则引擎 | **每次 MCP `save_memories` 时、写库之前** | 匹配规则、脱敏、去重 | **唯一入库闸门** |

Agent 即使每次都调用，未命中规则也不会入库。这是「不是每个会话都入库」的硬保证。

### 会话软件端何时触发提交（推荐）

不要每个 token、每一轮都调 MCP。推荐 **会话结束时提交一次**，外加 **用户明确要求时立刻提交**。

| 客户端 | 最佳触发点 | 实现方式 | 说明 |
| --- | --- | --- | --- |
| **Claude Code** | 会话结束 | `Stop` / `SessionEnd` Hook 调本地脚本 → MCP `save_memories` | 软件钩子，不依赖模型是否记得去调工具；失败 exit 0，不打断会话 |
| **Codex** | 会话收尾 + 用户说「记住」 | 仓库 Skill（`SKILL.md`）约定：收尾整理候选并调 MCP；用户显式指令立即调 | Codex 无稳定 Stop Hook 时，用 Skill 当协议；仍由服务端规则否决 |
| **ChatGPT** | 用户说「记住」或模型判断本轮有长期/项目结论后调 MCP 工具 | ChatGPT 官方 MCP 客户端连 MemoryHub，**不写扩展、不监听页面** | ChatGPT 网页没有可靠的「会话结束钩子」，不能也不该后台自动上传 |

不推荐：每条消息都提交、定时器扫描、打开 ChatGPT 就上传、MemoryHub 再调一遍 LLM 判断该不该存。

### 一次提交里带什么

软件端交的是 **已经结构化的记忆条目**（标题、类型、项目、conversationId、正文），不是原始聊天日志全文。  
整理这步用的是 **会话里正在跑的那个模型**（ChatGPT/Claude/Codex），不是 MemoryHub。

流程：

```text
会话结束或用户说「记住」
  → Skill/Hook 让当前 Agent 抽出 0..N 条候选（长期 / 项目）
  → 若抽出 0 条：不调用 MCP
  → 若抽出 ≥1 条：MCP save_memories
  → MemoryHub 规则：命中才入库；可部分命中（只存其中几条）
  → 返回每条 accepted / rejected + 命中的规则 id
```

Hook 失败、MemoryHub 关机：客户端记本地 spool 下次再送，**禁止阻塞** ChatGPT/Claude/Codex。

## 5. 软件接入（MCP / Skill / Agent）

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

## 6. 和现有系统的关系

- 收件箱仍用于：命中规则但不够自动同步条件（例如要人审）的条目。
- 已同步记忆、修订、回收站逻辑不变。
- **删除手动录入页、导航和相关 UI。** 记忆只从 MCP/事件进入。`POST /api/v1/candidates` 可保留给测试，产品界面不再暴露。

## 7. 开发顺序（确认后）

1. 规则引擎最小闭环：声明式规则 CRUD + 试运行 + 启用。
2. `save_memories` / `evaluate_memories`：规则未命中不落库。
3. 同步路径：长期按会话文档，项目按项目目录；同会话/同项目标题更新原文档。
4. MCP Server 接到 MemoryHub（stdio 或 HTTP）。
5. 仓库内 Skill 文档（Codex / Claude 各一份）。
6. ChatGPT 侧通过官方 MCP 客户端指向该 Server（不写扩展）。

没有规则引擎，就无法做到「符合规则才入库」，所以规则要先于 MCP。

## 8. 待确认

- [ ] 未命中规则的会话/条目完全不入库。
- [ ] 不接浏览器扩展、不接官方数据导出。
- [ ] 入口是 MCP + Skill + Agent。
- [ ] 服务端默认不再为入库去调一层 LLM。
- [ ] 先做规则引擎，再做 MCP。
- [x] 手动录入 UI 删除。
- [ ] 入库策略只在 MemoryHub 规则引擎执行；会话软件只负责触发提交。
- [ ] 触发时机：会话结束提交一次 + 用户明确「记住」时立即提交；不每轮都提交。
- [ ] Claude Code 用 Stop Hook；Codex 用 Skill；ChatGPT 用官方 MCP 工具调用。
