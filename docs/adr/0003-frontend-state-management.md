# ADR-0003：前端客户端状态管理采用 Pinia

- 状态：Accepted
- 日期：2026-08-14

## 决策

MemoryHub 前端采用 Pinia 管理跨页面客户端状态。

Pinia 不作为服务端数据库或请求缓存的替代品。服务端状态继续由 TanStack Vue Query 管理，搜索、筛选和分页优先使用 Vue Router query，组件局部状态使用 Vue 原生响应式 API。

Pinia 只允许显式白名单的非敏感偏好写入浏览器存储。

## 原因

- Vue 官方推荐 Pinia 用于新应用，Vuex 已进入维护模式。
- 服务端事实需要请求去重、缓存失效、重试和分页能力，TanStack Vue Query 比普通全局 Store 更合适。
- URL 是搜索和筛选状态的自然持久化载体，能支持刷新、书签和分享。
- MemoryHub 处理对话和长期记忆，默认持久化整个客户端 Store 会扩大敏感数据暴露面。
- XState 能解决复杂流程建模，但 V1 尚不需要额外的浏览器状态机。

## 预期后果

- 页面开发前需要建立 Query Key 工厂和最小 Pinia Store 目录约定。
- 使用与当前 Vue/TypeScript 基线兼容的 Pinia 4.0.3，并显式安装其 Vue DevTools API Peer 依赖。
- 开发者必须识别状态所有权，不能在 Pinia 和 Query Cache 中维护同一份服务端数据。
- 本地持久化必须经过字段白名单、安全评审和迁移测试。

## 后续工程约定

- 后续是否因复杂流程引入 XState，或因多个组合式工具需求引入 VueUse。
- 具体 Store 目录、Query Key 工厂和本地偏好迁移实现。

完整调研见 `docs/11-frontend-state-management.md`。
