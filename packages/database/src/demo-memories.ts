export type DemoMemoryType =
  | 'permanent_fact'
  | 'preference'
  | 'project_context'
  | 'decision'
  | 'temporary_state'
  | 'todo'
  | 'sensitive'

export type DemoRenderStyle = 'xhs_note' | 'tech_clean'

export interface DemoMemorySeed {
  id: string
  title: string
  body: string
  memoryType: DemoMemoryType
  project: string
  renderStyle: DemoRenderStyle
  emojiEnabled: boolean
}

export const DEVELOPMENT_DEMO_MEMORIES: DemoMemorySeed[] = [
  {
    id: 'cand_demo_preference_ts',
    title: '偏好使用 TypeScript + Vue 3',
    memoryType: 'preference',
    project: 'memory-hub',
    renderStyle: 'xhs_note',
    emojiEnabled: true,
    body: `# 🌟 偏好使用 TypeScript + Vue 3

> 💡 一句话：个人长期技术栈默认优先 TypeScript，前端框架优先 Vue 3。

## 📌 关键点
- 新项目默认启用 TypeScript strict 模式，不走纯 JavaScript 起步。
- 管理端与后台共享类型时，优先放在 monorepo 的 contracts 包，而不是页面内复制接口。
- UI 层默认 Vue 3 + Composition API；复杂表格/表单可搭配 Naive UI。
- 类型定义要覆盖请求、响应和领域状态，避免 any 在审核链路扩散。

## 🧠 为什么重要
- 记忆归档和审核流涉及多状态迁移，类型能显著降低非法状态组合。
- 前后端契约集中后，改 API 时更容易同步 OpenAPI/测试。
- 长期维护成本低于“先快后乱”的弱类型写法。

## ✅ 后续可执行
- [ ] 新功能先补 contracts schema，再写 API/Web
- [ ] 禁止在业务页复制一份不完整的本地类型
- [ ] Code review 时重点检查状态机和可选字段

---
🔗 适用：MemoryHub / 个人 NAS 项目 / Vue 管理端
`,
  },
  {
    id: 'cand_demo_decision_archive',
    title: '归档边界：先审核后写思源',
    memoryType: 'decision',
    project: 'memory-hub',
    renderStyle: 'tech_clean',
    emojiEnabled: true,
    body: `# 🧩 归档边界：先审核后写思源

> ✅ 结论：MemoryHub 是审核收件箱，思源只接收已确认记忆，不承担业务状态。

## 📌 背景
- ChatGPT / Claude Code 会产生大量候选信息，直接写入笔记会造成噪声和误归档。
- 需要保留来源、版本、脱敏结果和人工决策轨迹。

## 🔍 关键细节
- PostgreSQL 保存候选、版本、任务和审计；思源只存人类可读归档。
- 自动归档默认关闭；规则必须先试运行。
- 批准后走异步 delivery，支持重试与幂等，不在 HTTP 请求内直写思源。
- 敏感内容与冲突状态必须阻断自动路径。

## ⚠️ 约束与影响
- 不做思源到 MemoryHub 的完整双向同步。
- 不静默覆盖已归档内容，修正应形成新版本或补偿记录。
- Web 端永远不接触思源 Token / 模型密钥 / 数据库密码。

## ✅ 后续可执行
- [ ] 完成手动批准到思源 delivery 闭环
- [ ] 归档确认框展示最终 Markdown 预览
- [ ] delivery 失败进入可见重试/死信
`,
  },
  {
    id: 'cand_demo_project_context',
    title: 'MemoryHub 本地开发上下文',
    memoryType: 'project_context',
    project: 'memory-hub',
    renderStyle: 'xhs_note',
    emojiEnabled: true,
    body: `# 🌟 MemoryHub 本地开发上下文

> 💡 一句话：本地用 Docker Postgres + pnpm monorepo，Web 8788 / API 8787。

## 📌 关键点
- 仓库路径：\`D:/WorkSpace/AIProjects/memory-hub\`
- 开发账号：\`admin / memoryhub-dev\`
- 启动顺序：Docker Desktop → Postgres Compose → API → Web
- 代理干扰本机回环时设置：
  - \`NO_PROXY=127.0.0.1,localhost\`
  - 清空 \`HTTP_PROXY/HTTPS_PROXY\`

## 🧠 为什么重要
- 登录会话依赖 Cookie + Postgres；数据库未就绪时页面会表现为“无法访问/一直转圈”。
- Windows 下 Vite/Vitest 需要保留 \`--configLoader runner\`。
- 功能块完成后默认本地 Conventional Commit，不自动 push 远程。

## ✅ 后续可执行
- [ ] 验证 Markdown 预览在详情页的双风格效果
- [ ] 配置思源地址与 Token（仅 Worker/服务端）
- [ ] 补齐归档 delivery 与失败重试页面

---
🖥️ 端口
- Web: http://127.0.0.1:8788
- API: http://127.0.0.1:8787/readyz
`,
  },
  {
    id: 'cand_demo_todo_siyuan',
    title: '下一步：接入思源归档交付',
    memoryType: 'todo',
    project: 'memory-hub',
    renderStyle: 'xhs_note',
    emojiEnabled: true,
    body: `# 🌟 下一步：接入思源归档交付

> 💡 一句话：把已批准记忆按模板渲染后幂等写入思源笔记本。

## 📌 关键点
- 使用思源 API：创建文档 / 追加块 / 更新块
- 每个归档块附带 memory_id、版本、来源、捕获时间、MemoryHub 回链
- 默认目标路径参考：
  - \`/MemoryHub/10 长期记忆/{type}.sy\`
  - \`/MemoryHub/20 项目/{project}/决策.sy\`

## 🧠 为什么重要
- 当前“批准”只改状态，还没有真正形成可回看的笔记资产。
- 用户最关心的是归档后是否好看、可追溯、可重试。

## ✅ 后续可执行
- [ ] 连接测试与笔记本选择
- [ ] 批准确认框展示最终 Markdown
- [ ] delivery 幂等键：memory_version_id + target_id
- [ ] 失败重试与死信可见化

---
⚠️ 注意：不要直接修改思源 \`.sy\` 文件。
`,
  },
]

