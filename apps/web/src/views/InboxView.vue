<script setup lang="ts">
import { CirclePlus, ShieldCheck } from 'lucide-vue-next'
import {
  NButton,
  NEmpty,
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

import AppShell from '../components/AppShell.vue'
import { getHomeSummary, listCandidates } from '../api'
import { stripMarkdown } from '../markdown/strip'
import { candidatesQueryKey, homeQueryKey } from '../queries'

const router = useRouter()
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

function summaryText(body: string) {
  const text = stripMarkdown(body)
  return text.length > 140 ? `${text.slice(0, 140)}…` : text
}
</script>

<template>
  <AppShell active-nav="inbox" title="候选收件箱" context="默认工作区">
    <div class="page-heading">
      <div>
        <h1>候选收件箱</h1>
        <p>集中审核、整理并归档长期记忆候选。</p>
      </div>
      <div class="page-actions">
        <NButton type="primary" @click="router.push('/capture')">
          <template #icon><CirclePlus :size="17" /></template>
          新建候选
        </NButton>
      </div>
    </div>

    <section class="queue-summary" aria-label="队列摘要">
      <div>
        <span>待审核</span>
        <strong>{{ homeQuery.data.value?.counts.pendingCandidates ?? 0 }}</strong>
      </div>
      <div>
        <span>排队中</span>
        <strong>{{ homeQuery.data.value?.counts.queuedDeliveries ?? 0 }}</strong>
      </div>
      <div>
        <span>已归档</span>
        <strong>{{ homeQuery.data.value?.counts.archivedMemories ?? 0 }}</strong>
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
          <p class="candidate-body">{{ summaryText(item.body) }}</p>
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
  </AppShell>
</template>
