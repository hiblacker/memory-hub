<script setup lang="ts">
import { CirclePlus, ShieldCheck, Trash2 } from 'lucide-vue-next'
import {
  NButton,
  NEmpty,
  NInput,
  NPagination,
  NSelect,
  NSpin,
  NTag,
  useDialog,
} from 'naive-ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type {
  CandidateStatus,
  MemoryType,
  Sensitivity,
} from '@memory-hub/contracts'

import AppShell from '../components/AppShell.vue'
import { getHomeSummary, listCandidates, trashCandidate } from '../api'
import { stripMarkdown } from '../markdown/strip'
import { candidatesQueryKey, homeQueryKey } from '../queries'

const router = useRouter()
const route = useRoute()
const dialog = useDialog()
const queryClient = useQueryClient()

const homeQuery = useQuery({
  queryKey: homeQueryKey,
  queryFn: getHomeSummary,
})

const listParams = computed(() => ({
  q: typeof route.query.q === 'string' ? route.query.q : undefined,
  status:
    typeof route.query.status === 'string'
      ? route.query.status
      : 'pending,queued,conflict',
  type: typeof route.query.type === 'string' ? route.query.type : undefined,
  page: Number(route.query.page ?? 1),
  pageSize: 20,
}))

const candidatesQuery = useQuery({
  queryKey: computed(() => [...candidatesQueryKey, listParams.value]),
  queryFn: () => listCandidates(listParams.value),
})

const items = computed(() => candidatesQuery.data.value?.items ?? [])
const total = computed(() => candidatesQuery.data.value?.total ?? 0)

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
  synced: '已同步',
  rejected: '已拒绝',
  conflict: '冲突',
  trashed: '回收站',
}

const sensitivityLabels: Record<Sensitivity, string> = {
  normal: '普通',
  private: '私密',
  strict: '严格私密',
}

const statusOptions = [
  { label: '待审核', value: 'pending' },
  { label: '同步中', value: 'queued' },
  { label: '已同步', value: 'synced' },
  { label: '已拒绝', value: 'rejected' },
  { label: '冲突', value: 'conflict' },
]

const typeOptions = Object.entries(memoryTypeLabels).map(([value, label]) => ({
  value,
  label,
}))

const selectedStatuses = computed({
  get: () => (listParams.value.status ?? '').split(',').filter(Boolean),
  set: (value: string[]) => updateQuery({ status: value.join(',') || undefined, page: 1 }),
})
const selectedTypes = computed({
  get: () => (listParams.value.type ?? '').split(',').filter(Boolean),
  set: (value: string[]) => updateQuery({ type: value.join(',') || undefined, page: 1 }),
})

function updateQuery(patch: Record<string, string | number | undefined>) {
  const next = { ...route.query, ...patch }
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || value === '' || value === 'pending,queued,conflict' && key === 'status' && !patch.status) {
      // keep
    }
    if (value === undefined || value === '') delete next[key]
  }
  if (next.page === 1) delete next.page
  void router.replace({ query: next })
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

const trashMutation = useMutation({
  mutationFn: trashCandidate,
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: candidatesQueryKey })
    await queryClient.invalidateQueries({ queryKey: homeQueryKey })
  },
})

function confirmTrash(id: string, synced: boolean) {
  dialog.error({
    title: '移入回收站？',
    content: synced
      ? '将进入回收站并排队删除对应思源文档。'
      : '将进入回收站，可稍后恢复。',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: () => trashMutation.mutateAsync(id),
  })
}
</script>

<template>
  <AppShell active-nav="inbox" title="候选收件箱" context="默认工作区">
    <div class="page-heading">
      <div>
        <h1>候选收件箱</h1>
        <p>集中审核、整理并同步长期记忆候选。</p>
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
        <span>已同步</span>
        <strong>{{ homeQuery.data.value?.counts.syncedMemories ?? 0 }}</strong>
      </div>
    </section>

    <section class="inbox-surface" aria-label="候选记忆列表">
      <div class="list-toolbar list-filters">
        <NInput
          :value="typeof route.query.q === 'string' ? route.query.q : ''"
          clearable
          placeholder="搜索标题或正文"
          style="max-width: 240px"
          @update:value="(v: string) => updateQuery({ q: v, page: 1 })"
        />
        <NSelect
          multiple
          :value="selectedStatuses"
          :options="statusOptions"
          placeholder="状态"
          style="min-width: 180px"
          @update:value="(v: string[]) => (selectedStatuses = v)"
        />
        <NSelect
          multiple
          :value="selectedTypes"
          :options="typeOptions"
          placeholder="类型"
          style="min-width: 180px"
          @update:value="(v: string[]) => (selectedTypes = v)"
        />
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
        :description="route.query.q || route.query.type ? '没有符合筛选的记忆' : '还没有候选记忆'"
        class="inbox-empty"
      >
        <template #extra>
          <NButton v-if="route.query.q || route.query.type" @click="router.replace({ query: {} })">
            清除筛选
          </NButton>
          <NButton v-else type="primary" @click="router.push('/capture')">
            新建候选
          </NButton>
        </template>
      </NEmpty>
      <div v-else class="candidate-list">
        <div v-for="item in items" :key="item.id" class="candidate-card-wrap">
          <RouterLink class="candidate-card" :to="`/inbox/${item.id}`">
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
              <span class="candidate-time">更新于 {{ formatTime(item.updatedAt) }}</span>
            </div>
          </RouterLink>
          <NButton
            class="candidate-delete"
            size="tiny"
            tertiary
            type="error"
            @click="confirmTrash(item.id, item.status === 'synced')"
          >
            <template #icon><Trash2 :size="14" /></template>
            删除
          </NButton>
        </div>
        <div v-if="total > listParams.pageSize" class="list-pagination">
          <NPagination
            :page="listParams.page"
            :page-size="listParams.pageSize"
            :item-count="total"
            @update:page="(page: number) => updateQuery({ page })"
          />
        </div>
      </div>
    </section>

    <footer class="workspace-footer">
      <ShieldCheck :size="15" aria-hidden="true" />
      <span>自动同步默认关闭，所有候选均保留来源与审计记录。</span>
    </footer>
  </AppShell>
</template>
