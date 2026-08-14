# ADR-0002：前端组件库采用 Naive UI

- 状态：Accepted
- 日期：2026-08-14

## 决策

MemoryHub V1 管理端采用 Naive UI。组件按需导入，应用级主题和消息、通知、对话框上下文通过统一 Provider 提供。

## 原因

- 原生支持 Vue 3 和 TypeScript，与现有 Vite 基线一致。
- DataTable、Form、Modal、Drawer、Tree、Menu 等组件覆盖 V1 管理端需求。
- 主题覆盖 API 类型安全，适合建立 MemoryHub 自有的浅色、深色和信息密度规范。
- 无需导入全局组件库 CSS，按需使用方式与当前工程边界清晰。
- 相比源码型组件集合，能降低 V1 复杂表格、表单和反馈交互的组装成本。

## 后果

- 前端新增 `naive-ui` 运行时依赖。
- 业务页面优先复用 Naive UI 基础能力，但仍需维护 MemoryHub 的语义 Token 和布局规范。
- 不为所有基础组件建立二次封装；仅在形成稳定、重复的业务模式后抽取组件。
- 组件库升级必须通过类型检查、单元测试、构建和关键页面视觉检查。

## 被替代方案

Element Plus、Ant Design Vue、Arco Design Vue、Vuetify、shadcn-vue 和 PrimeVue 均已评估。完整比较见 `docs/10-frontend-component-library.md`。
