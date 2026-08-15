<script setup lang="ts">
import {
  Archive,
  BookOpenCheck,
  Bot,
  ChevronDown,
  CirclePlus,
  FileInput,
  Inbox,
  LogOut,
  Settings,
  ShieldCheck,
  Workflow,
} from 'lucide-vue-next'
import {
  NAlert,
  NButton,
  NEmpty,
  NLayout,
  NLayoutContent,
  NLayoutHeader,
  NLayoutSider,
  NSpin,
  NTag,
} from 'naive-ui'
import { useQuery } from '@tanstack/vue-query'
import { useRouter } from 'vue-router'

import { getHomeSummary } from '../api'
import { homeQueryKey, useLogoutMutation } from '../queries'

const router = useRouter()
const homeQuery = useQuery({
  queryKey: homeQueryKey,
  queryFn: getHomeSummary,
  retry: false,
})
const logoutMutation = useLogoutMutation()

async function signOut() {
  await logoutMutation.mutateAsync()
  await router.replace('/login')
}
</script>

<template>
  <NLayout class="app-shell" has-sider>
    <NLayoutSider class="app-sider" :width="216" bordered>
      <div class="app-brand">
        <span class="brand-mark" aria-hidden="true">M</span>
        <span>MemoryHub</span>
      </div>

      <nav class="primary-nav" aria-label="主导航">
        <p class="nav-label">工作区</p>
        <a class="nav-item active" href="/inbox" aria-current="page">
          <Inbox :size="17" />
          <span>候选收件箱</span>
          <span
            v-if="homeQuery.data.value?.counts.pendingCandidates"
            class="nav-count"
          >
            {{ homeQuery.data.value.counts.pendingCandidates }}
          </span>
        </a>
        <span class="nav-item disabled"
          ><CirclePlus :size="17" /><span>手动录入</span></span
        >
        <span class="nav-item disabled"
          ><Archive :size="17" /><span>归档记录</span></span
        >

        <p class="nav-label">配置</p>
        <span class="nav-item disabled"
          ><Workflow :size="17" /><span>自动归档规则</span></span
        >
        <span class="nav-item disabled"
          ><FileInput :size="17" /><span>来源与导入</span></span
        >
        <span class="nav-item disabled"
          ><Settings :size="17" /><span>系统设置</span></span
        >
      </nav>

      <div class="sider-status">
        <span class="status-dot"></span>
        <div><strong>服务运行正常</strong><small>PostgreSQL 已连接</small></div>
      </div>
    </NLayoutSider>

    <NLayout>
      <NLayoutHeader class="app-header" bordered>
        <div>
          <strong>候选收件箱</strong>
          <span class="header-context">默认工作区</span>
        </div>
        <div class="header-actions">
          <NTag size="small" type="warning" :bordered="false">
            <template #icon><BookOpenCheck :size="14" /></template>
            思源待配置
          </NTag>
          <NButton
            quaternary
            size="small"
            :loading="logoutMutation.isPending.value"
            @click="signOut"
          >
            <template #icon><LogOut :size="16" /></template>
            退出
          </NButton>
          <button class="user-chip" type="button" aria-label="当前管理员">
            <span class="user-avatar">{{
              homeQuery.data.value?.user.username.slice(0, 1).toUpperCase() ??
              'A'
            }}</span>
            <span>{{ homeQuery.data.value?.user.username ?? 'admin' }}</span>
            <ChevronDown :size="14" aria-hidden="true" />
          </button>
        </div>
      </NLayoutHeader>

      <NLayoutContent class="workspace-content">
        <div class="page-heading">
          <div>
            <h1>候选收件箱</h1>
            <p>集中审核、整理并归档长期记忆候选。</p>
          </div>
          <div class="page-actions">
            <NButton disabled>
              <template #icon><FileInput :size="17" /></template>
              导入官方导出
            </NButton>
            <NButton type="primary" disabled>
              <template #icon><CirclePlus :size="17" /></template>
              新建候选
            </NButton>
          </div>
        </div>

        <NAlert v-if="homeQuery.isError.value" type="error" class="page-alert">
          首页数据加载失败，请刷新页面重试。
        </NAlert>

        <section class="queue-summary" aria-label="处理队列摘要">
          <div>
            <span>待审核</span
            ><strong>{{
              homeQuery.data.value?.counts.pendingCandidates ?? 0
            }}</strong>
          </div>
          <div>
            <span>归档队列</span
            ><strong>{{
              homeQuery.data.value?.counts.queuedDeliveries ?? 0
            }}</strong>
          </div>
          <div>
            <span>已归档</span
            ><strong>{{
              homeQuery.data.value?.counts.archivedMemories ?? 0
            }}</strong>
          </div>
        </section>

        <section class="inbox-surface" aria-label="候选记忆列表">
          <div class="list-toolbar">
            <span>候选记忆</span>
            <NTag size="small" :bordered="false">更新时间倒序</NTag>
          </div>

          <div v-if="homeQuery.isPending.value" class="page-loading">
            <NSpin size="large" />
            <span>正在加载候选记忆</span>
          </div>
          <NEmpty v-else description="还没有候选记忆" class="inbox-empty">
            <template #icon><Bot :size="42" /></template>
            <template #extra>
              <p>
                后续可通过手动录入、ChatGPT 显式保存或 Claude Code Hook 添加。
              </p>
            </template>
          </NEmpty>
        </section>

        <footer class="workspace-footer">
          <ShieldCheck :size="15" aria-hidden="true" />
          <span>自动归档默认关闭，所有候选均保留来源与审计记录。</span>
        </footer>
      </NLayoutContent>
    </NLayout>
  </NLayout>
</template>
