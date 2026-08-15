<script setup lang="ts">
import {
  Bot,
  BookOpenCheck,
  ChevronDown,
  CirclePlus,
  FileInput,
  Inbox,
  LogOut,
  ShieldCheck,
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
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type {
  CandidateStatus,
  MemoryType,
  Sensitivity,
} from '@memory-hub/contracts'

import { getHomeSummary, listCandidates } from '../api'
import { candidatesQueryKey, homeQueryKey, useLogoutMutation } from '../queries'

const router = useRouter()
const logoutMutation = useLogoutMutation()
const homeQuery = useQuery({
  queryKey: homeQueryKey,
  queryFn: getHomeSummary,
})
const candidatesQuery = useQuery({
  queryKey: candidatesQueryKey,
  queryFn: listCandidates,
})

const items = computed(() => candidatesQuery.data.value?.items ?? [])

const memoryTypeLabels: Record<MemoryType, string> = {
  permanent_fact: '永久事实',
  preference: '偏好',
  project_context: '项目上下文',
  decision: '决策',
  temporary_state: '临时状态',
  todo: '待办',
  sensitive: '敏感内容',
}

const statusLabels: Record<CandidateStatus, string> = {
  pending: '待审核',
  approved: '已批准',
  queued: '已排队',
  archived: '已归档',
  rejected: '已拒绝',
  conflict: '冲突',
}

const sensitivityLabels: Record<Sensitivity, string> = {
  normal: '普通',
  private: '私密',
  strict: '严格私密',
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

async function signOut() {
  await logoutMutation.mutateAsync()
  await router.replace('/login')
}
</script>

<template>
  <NLayout has-sider class="app-shell">
    <NLayoutSider
      bordered
      collapse-mode="width"
      :width="236"
      :native-scrollbar="false"
      class="app-sider"
    >
      <div class="brand-lockup compact">
        <span class="brand-mark" aria-hidden="true">M</span>
        <span>MemoryHub</span>
      </div>
      <nav class="side-nav" aria-label="主导航">
        <p class="nav-section">工作区</p>
        <RouterLink class="nav-item active" to="/inbox">
          <Inbox :size="17" aria-hidden="true" />
          <span>候选收件箱</span>
        </RouterLink>
        <RouterLink class="nav-item" to="/capture">
          <CirclePlus :size="17" aria-hidden="true" />
          <span>手动录入</span>
        </RouterLink>
        <div class="nav-item disabled">
          <BookOpenCheck :size="17" aria-hidden="true" />
          <span>归档记录</span>
        </div>
        <p class="nav-section">配置</p>
        <div class="nav-item disabled">
          <ShieldCheck :size="17" aria-hidden="true" />
          <span>自动归档规则</span>
        </div>
        <div class="nav-item disabled">
          <FileInput :size="17" aria-hidden="true" />
          <span>来源与导入</span>
        </div>
        <div class="nav-item disabled">
          <Bot :size="17" aria-hidden="true" />
          <span>系统设置</span>
        </div>
      </nav>
      <div class="sider-footer">
        <NTag size="small" type="success" :bordered="false">服务运行正常</NTag>
        <span>PostgreSQL 已连接</span>
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
            <NButton type="primary" @click="router.push('/capture')">
              <template #icon><CirclePlus :size="17" /></template>
              新建候选
            </NButton>
          </div>
        </div>

        <NAlert
          v-if="homeQuery.isError.value || candidatesQuery.isError.value"
          type="error"
          class="page-alert"
        >
          收件箱数据加载失败，请刷新页面重试。
        </NAlert>

        <section class="queue-summary" aria-label="处理队列摘要">
          <div>
            <span>待审核</span>
            <strong>{{
              homeQuery.data.value?.counts.pendingCandidates ?? 0
            }}</strong>
          </div>
          <div>
            <span>归档队列</span>
            <strong>{{
              homeQuery.data.value?.counts.queuedDeliveries ?? 0
            }}</strong>
          </div>
          <div>
            <span>已归档</span>
            <strong>{{
              homeQuery.data.value?.counts.archivedMemories ?? 0
            }}</strong>
          </div>
        </section>

        <section class="inbox-surface" aria-label="候选记忆列表">
          <div class="list-toolbar">
            <span>候选记忆</span>
            <NTag size="small" :bordered="false">更新时间倒序</NTag>
          </div>

          <div
            v-if="homeQuery.isPending.value || candidatesQuery.isPending.value"
            class="page-loading"
          >
            <NSpin size="large" />
            <span>正在加载候选记忆</span>
          </div>
          <NEmpty
            v-else-if="items.length === 0"
            description="还没有候选记忆"
            class="inbox-empty"
          >
            <template #icon><Bot :size="42" /></template>
            <template #extra>
              <p>
                后续可通过手动录入、ChatGPT 显式保存或 Claude Code Hook 添加。
              </p>
              <NButton type="primary" @click="router.push('/capture')">
                新建候选
              </NButton>
            </template>
          </NEmpty>
          <div v-else class="candidate-list">
            <RouterLink
              v-for="item in items"
              :key="item.id"
              class="candidate-card"
              :to="`/inbox/${item.id}`"
            >
              <div class="candidate-card-top">
                <h2>{{ item.title }}</h2>
                <NTag size="small" type="warning" :bordered="false">
                  {{ statusLabels[item.status] }}
                </NTag>
              </div>
              <p class="candidate-body">{{ item.body }}</p>
              <div class="candidate-meta">
                <NTag size="small" :bordered="false">
                  {{ memoryTypeLabels[item.memoryType] }}
                </NTag>
                <NTag size="small" :bordered="false">
                  来源：{{ item.source }}
                </NTag>
                <NTag size="small" :bordered="false">
                  敏感级别：{{ sensitivityLabels[item.sensitivity] }}
                </NTag>
                <NTag size="small" :bordered="false">
                  置信度 {{ item.confidence }}%
                </NTag>
                <span class="candidate-time">
                  更新于 {{ formatTime(item.updatedAt) }}
                </span>
              </div>
            </RouterLink>
          </div>
        </section>

        <footer class="workspace-footer">
          <ShieldCheck :size="15" aria-hidden="true" />
          <span>自动归档默认关闭，所有候选均保留来源与审计记录。</span>
        </footer>
      </NLayoutContent>
    </NLayout>
  </NLayout>
</template>

