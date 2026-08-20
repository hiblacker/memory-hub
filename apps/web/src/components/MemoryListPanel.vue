<script setup lang="ts">
import { Trash2, RotateCcw } from 'lucide-vue-next'
import {
  NButton,
  NDataTable,
  NEmpty,
  NDatePicker,
  NInput,
  NPagination,
  NSelect,
  NTag,
  useDialog,
  type DataTableColumns,
} from 'naive-ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, h } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import type { CandidateSummary } from '@memory-hub/contracts'

import {
  destroyCandidate,
  restoreCandidate,
  trashCandidate,
} from '../api'
import { homeQueryKey } from '../queries'

const props = withDefaults(
  defineProps<{
    queryKey: string
    fetcher: (query: Record<string, string | number | undefined>) => Promise<{
      items: CandidateSummary[]
      total: number
      page: number
      pageSize: number
    }>
    defaultStatus?: string
    showStatusFilter?: boolean
    showTypeFilter?: boolean
    showDateFilter?: boolean
    actions?: Array<'delete' | 'restore' | 'destroy'>
  }>(),
  {
    showStatusFilter: true,
    showTypeFilter: true,
    showDateFilter: true,
    actions: () => ['delete'],
  },
)

const route = useRoute()
const router = useRouter()
const dialog = useDialog()
const queryClient = useQueryClient()

const memoryTypeLabels: Record<string, string> = {
  permanent_fact: '永久事实',
  preference: '偏好',
  project_context: '项目上下文',
  decision: '决策',
  temporary_state: '临时状态',
  todo: '待办',
  sensitive: '敏感内容',
}

const statusLabels: Record<string, string> = {
  pending: '待审核',
  approved: '已批准',
  queued: '同步中',
  synced: '已同步',
  rejected: '已拒绝',
  conflict: '冲突',
  trashed: '回收站',
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

const listParams = computed(() => {
  const status =
    typeof route.query.status === 'string'
      ? route.query.status
      : props.defaultStatus
  return {
    q: typeof route.query.q === 'string' ? route.query.q : undefined,
    status,
    type: typeof route.query.type === 'string' ? route.query.type : undefined,
    from: typeof route.query.from === 'string' ? route.query.from : undefined,
    to: typeof route.query.to === 'string' ? route.query.to : undefined,
    page: Number(route.query.page ?? 1),
    pageSize: Number(route.query.pageSize ?? 20),
  }
})

const listQuery = useQuery({
  queryKey: computed(() => [props.queryKey, listParams.value]),
  queryFn: () => props.fetcher(listParams.value),
})

const rows = computed(() => listQuery.data.value?.items ?? [])
const total = computed(() => listQuery.data.value?.total ?? 0)

function updateQuery(patch: Record<string, string | number | undefined>) {
  const next: Record<string, string | number> = {}
  const merged = { ...route.query, ...patch }
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === '' || value === null) continue
    if (key === 'page' && Number(value) === 1) continue
    if (key === 'status' && props.defaultStatus && String(value) === props.defaultStatus) continue
    next[key] = String(value)
  }
  void router.replace({ query: next })
}

const searchValue = computed({
  get: () => (typeof route.query.q === 'string' ? route.query.q : ''),
  set: (value: string) => updateQuery({ q: value || undefined, page: 1 }),
})

const selectedStatuses = computed({
  get: () => (listParams.value.status ?? '').split(',').filter(Boolean),
  set: (value: string[]) =>
    updateQuery({ status: value.join(',') || undefined, page: 1 }),
})

const selectedTypes = computed({
  get: () => (listParams.value.type ?? '').split(',').filter(Boolean),
  set: (value: string[]) =>
    updateQuery({ type: value.join(',') || undefined, page: 1 }),
})

const dateRange = computed<[number, number] | null>({
  get() {
    if (!listParams.value.from || !listParams.value.to) return null
    return [
      new Date(listParams.value.from).getTime(),
      new Date(listParams.value.to).getTime(),
    ]
  },
  set(value) {
    if (!value) {
      updateQuery({ from: undefined, to: undefined, page: 1 })
      return
    }
    updateQuery({
      from: new Date(value[0]).toISOString(),
      to: new Date(value[1]).toISOString(),
      page: 1,
    })
  },
})

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

const trashMutation = useMutation({
  mutationFn: trashCandidate,
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: [props.queryKey] })
    await queryClient.invalidateQueries({ queryKey: homeQueryKey })
  },
})
const restoreMutation = useMutation({
  mutationFn: restoreCandidate,
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: [props.queryKey] })
    await queryClient.invalidateQueries({ queryKey: homeQueryKey })
  },
})
const destroyMutation = useMutation({
  mutationFn: destroyCandidate,
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: [props.queryKey] })
    await queryClient.invalidateQueries({ queryKey: homeQueryKey })
  },
})

function confirmTrash(row: CandidateSummary) {
  dialog.warning({
    title: '移入回收站？',
    content:
      row.status === 'synced'
        ? '记忆会进入回收站，并删除对应的思源文档。从回收站恢复时会重新写入思源。'
        : '记忆会进入回收站，可稍后恢复。',
    positiveText: '移入回收站',
    negativeText: '取消',
    onPositiveClick: () => trashMutation.mutateAsync(row.id),
  })
}

function confirmDestroy(row: CandidateSummary) {
  dialog.error({
    title: '彻底删除？',
    content: '不可从产品内恢复。',
    positiveText: '彻底删除',
    negativeText: '取消',
    onPositiveClick: () => destroyMutation.mutateAsync(row.id),
  })
}

const columns = computed<DataTableColumns<CandidateSummary>>(() => {
  const cols: DataTableColumns<CandidateSummary> = [
    {
      title: '标题',
      key: 'title',
      ellipsis: { tooltip: true },
      render(row) {
        return h(
          RouterLink,
          { to: `/inbox/${row.id}`, class: 'memory-title-link' },
          () => row.title,
        )
      },
    },
    {
      title: '类型',
      key: 'memoryType',
      width: 120,
      render: (row) => memoryTypeLabels[row.memoryType] ?? row.memoryType,
    },
    {
      title: '来源',
      key: 'source',
      width: 110,
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (row) =>
        h(
          NTag,
          { size: 'small', bordered: false },
          { default: () => statusLabels[row.status] ?? row.status },
        ),
    },
    {
      title: '更新时间',
      key: 'updatedAt',
      width: 140,
      render: (row) => formatTime(row.updatedAt),
    },
    {
      title: '操作',
      key: 'actions',
      width: props.actions?.includes('restore') ? 200 : 96,
      render(row) {
        const buttons = []
        if (props.actions?.includes('delete')) {
          buttons.push(
            h(
              NButton,
              {
                size: 'small',
                tertiary: true,
                type: 'error',
                onClick: () => confirmTrash(row),
              },
              { default: () => '删除', icon: () => h(Trash2, { size: 14 }) },
            ),
          )
        }
        if (props.actions?.includes('restore')) {
          buttons.push(
            h(
              NButton,
              {
                size: 'small',
                onClick: () => restoreMutation.mutate(row.id),
              },
              { default: () => '恢复', icon: () => h(RotateCcw, { size: 14 }) },
            ),
          )
        }
        if (props.actions?.includes('destroy')) {
          buttons.push(
            h(
              NButton,
              {
                size: 'small',
                tertiary: true,
                type: 'error',
                onClick: () => confirmDestroy(row),
              },
              { default: () => '彻底删除', icon: () => h(Trash2, { size: 14 }) },
            ),
          )
        }
        return h('div', { class: 'memory-row-actions' }, buttons)
      },
    },
  ]
  return cols
})
</script>

<template>
  <div class="memory-list">
    <div class="memory-list-filters">
      <NInput
        v-model:value="searchValue"
        clearable
        placeholder="搜索标题或正文"
        class="memory-list-search"
      />
      <NSelect
        v-if="showStatusFilter"
        v-model:value="selectedStatuses"
        multiple
        clearable
        max-tag-count="responsive"
        :options="statusOptions"
        placeholder="状态"
        class="memory-list-select"
      />
      <NSelect
        v-if="showTypeFilter"
        v-model:value="selectedTypes"
        multiple
        clearable
        max-tag-count="responsive"
        :options="typeOptions"
        placeholder="类型"
        class="memory-list-select"
      />
      <NDatePicker
        v-if="showDateFilter"
        v-model:value="dateRange"
        type="daterange"
        clearable
        class="memory-list-date"
      />
    </div>

    <NDataTable
      remote
      :columns="columns"
      :data="rows"
      :loading="listQuery.isFetching.value"
      :bordered="false"
      :single-line="false"
      :scroll-x="780"
    >
      <template #empty>
        <NEmpty :description="searchValue || selectedTypes.length ? '没有符合筛选的记忆' : '还没有候选记忆'" />
      </template>
    </NDataTable>

    <div class="memory-list-footer">
      <span class="memory-list-total">共 {{ total }} 条</span>
      <NPagination
        :page="listParams.page"
        :page-size="listParams.pageSize"
        :item-count="total"
        show-size-picker
        :page-sizes="[10, 20, 50]"
        @update:page="(page: number) => updateQuery({ page })"
        @update:page-size="(pageSize: number) => updateQuery({ pageSize, page: 1 })"
      />
    </div>
  </div>
</template>
