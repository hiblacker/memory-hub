<script setup lang="ts">
import { ArrowLeft, Check, Save, X } from 'lucide-vue-next'
import {
  NAlert,
  NButton,
  NForm,
  NInput,
  NSelect,
  NSpin,
  NTag,
  useDialog,
  useMessage,
} from 'naive-ui'
import type {
  CandidateStatus,
  MemoryType,
  RenderStyle,
  Sensitivity,
} from '@memory-hub/contracts'
import { useQuery } from '@tanstack/vue-query'
import { computed, reactive, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppShell from '../components/AppShell.vue'
import MemoryMarkdownEditor from '../components/MemoryMarkdownEditor.vue'
import { ApiError, getCandidate } from '../api'
import {
  candidateQueryKey,
  useApproveCandidateMutation,
  useRejectCandidateMutation,
  useUpdateCandidateMutation,
} from '../queries'

const route = useRoute()
const router = useRouter()
const dialog = useDialog()
const message = useMessage()

const candidateId = computed(() => String(route.params.candidateId ?? ''))

const candidateQuery = useQuery({
  queryKey: computed(() => candidateQueryKey(candidateId.value)),
  queryFn: () => getCandidate(candidateId.value),
  enabled: computed(() => candidateId.value.length > 0),
})

const updateMutation = useUpdateCandidateMutation()
const approveMutation = useApproveCandidateMutation()
const rejectMutation = useRejectCandidateMutation()

const form = reactive({
  title: '',
  body: '',
  memoryType: 'project_context' as MemoryType,
  project: '',
  renderStyle: 'xhs_note' as RenderStyle,
  emojiEnabled: true,
  rejectReason: '',
})

watch(
  () => candidateQuery.data.value,
  (candidate) => {
    if (!candidate) return
    form.title = candidate.title
    form.body = candidate.body
    form.memoryType = candidate.memoryType
    form.project = candidate.project ?? ''
    form.renderStyle = candidate.renderStyle
    form.emojiEnabled = candidate.emojiEnabled
  },
  { immediate: true },
)

const memoryTypeOptions = [
  { label: '永久事实', value: 'permanent_fact' },
  { label: '偏好', value: 'preference' },
  { label: '项目上下文', value: 'project_context' },
  { label: '决策', value: 'decision' },
  { label: '临时状态', value: 'temporary_state' },
  { label: '待办', value: 'todo' },
  { label: '敏感内容', value: 'sensitive' },
]

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

const isPending = computed(
  () => candidateQuery.data.value?.status === 'pending',
)

const canSave = computed(
  () =>
    isPending.value &&
    form.title.trim().length > 0 &&
    form.body.trim().length > 0,
)

const errorMessage = computed(() => {
  const error =
    candidateQuery.error.value ??
    updateMutation.error.value ??
    approveMutation.error.value ??
    rejectMutation.error.value
  if (error instanceof ApiError) return error.message
  return error ? '暂时无法处理该候选，请稍后重试。' : ''
})

const statusType = computed(() => {
  switch (candidateQuery.data.value?.status) {
    case 'approved':
    case 'archived':
      return 'success'
    case 'rejected':
    case 'conflict':
      return 'error'
    case 'queued':
      return 'info'
    default:
      return 'warning'
  }
})

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

async function saveDraft() {
  if (!canSave.value || updateMutation.isPending.value) return
  await updateMutation.mutateAsync({
    candidateId: candidateId.value,
    input: {
      title: form.title.trim(),
      body: form.body.trim(),
      memoryType: form.memoryType,
      project: form.project.trim() || undefined,
      renderStyle: form.renderStyle,
      emojiEnabled: form.emojiEnabled,
    },
  })
  message.success('草稿已保存')
}

function confirmApprove() {
  if (!isPending.value || approveMutation.isPending.value) return
  dialog.warning({
    title: '确认批准该候选？',
    content:
      '批准后将标记为已通过审核。当前版本尚未接入思源归档，后续可在归档流程中继续处理。',
    positiveText: '确认批准',
    negativeText: '取消',
    onPositiveClick: async () => {
      await approveMutation.mutateAsync(candidateId.value)
      message.success('候选已批准')
    },
  })
}

function confirmReject() {
  if (!isPending.value || rejectMutation.isPending.value) return
  dialog.error({
    title: '确认拒绝该候选？',
    content: '拒绝后保留来源与审计记录，但不会进入归档队列。',
    positiveText: '确认拒绝',
    negativeText: '取消',
    onPositiveClick: async () => {
      await rejectMutation.mutateAsync({
        candidateId: candidateId.value,
        input: {
          reason: form.rejectReason.trim() || undefined,
        },
      })
      message.success('候选已拒绝')
    },
  })
}
</script>

<template>
  <AppShell active-nav="inbox" title="候选详情" context="审核与整理">
    <div class="detail-page">
      <div class="detail-sticky-top">
        <NButton quaternary class="back-link" @click="router.push('/inbox')">
          <template #icon><ArrowLeft :size="16" /></template>
          返回收件箱
        </NButton>
        <div class="detail-sticky-top-right">
          <NTag
            v-if="candidateQuery.data.value"
            size="small"
            :type="statusType"
            :bordered="false"
          >
            {{ statusLabels[candidateQuery.data.value.status] }}
          </NTag>
        </div>
      </div>

      <div class="detail-page-body">
        <div v-if="candidateQuery.isPending.value" class="page-loading">
          <NSpin size="large" />
          <span>正在加载候选详情</span>
        </div>

        <form
          v-else-if="candidateQuery.data.value"
          id="candidate-detail-form"
          class="detail-main"
          @submit.prevent="saveDraft"
        >
          <NAlert v-if="errorMessage" type="error" class="page-alert compact">
            {{ errorMessage }}
          </NAlert>

          <NAlert
            v-if="candidateQuery.data.value.rejectionReason"
            type="warning"
            class="page-alert compact"
          >
            拒绝原因：{{ candidateQuery.data.value.rejectionReason }}
          </NAlert>

          <div class="detail-compact-fields">
            <NInput
              v-model:value="form.title"
              size="medium"
              maxlength="200"
              :disabled="!isPending"
              placeholder="标题"
              class="detail-title-input"
            />
            <NSelect
              v-model:value="form.memoryType"
              size="medium"
              :options="memoryTypeOptions"
              :disabled="!isPending"
              class="detail-type-select"
            />
            <NInput
              v-model:value="form.project"
              size="medium"
              maxlength="120"
              :disabled="!isPending"
              placeholder="项目（可选）"
              class="detail-project-input"
            />
          </div>

          <div class="detail-meta-inline" aria-label="候选属性">
            <NTag size="small" :bordered="false">
              来源 {{ candidateQuery.data.value.source }}
            </NTag>
            <NTag size="small" :bordered="false">
              {{ memoryTypeLabels[form.memoryType] }}
            </NTag>
            <NTag size="small" :bordered="false">
              敏感 {{ sensitivityLabels[candidateQuery.data.value.sensitivity] }}
            </NTag>
            <NTag size="small" :bordered="false">
              置信度 {{ candidateQuery.data.value.confidence }}%
            </NTag>
            <NTag size="small" :bordered="false">
              捕获 {{ formatTime(candidateQuery.data.value.captureTime) }}
            </NTag>
            <NTag size="small" :bordered="false">
              更新 {{ formatTime(candidateQuery.data.value.updatedAt) }}
            </NTag>
          </div>

          <div class="detail-md-wrap">
            <MemoryMarkdownEditor
              v-model="form.body"
              v-model:render-style="form.renderStyle"
              v-model:emoji-enabled="form.emojiEnabled"
              :memory-type="form.memoryType"
              :title="form.title"
              :readonly="!isPending"
            />
          </div>
        </form>

        <section v-else class="detail-surface">
          <NAlert type="error" class="page-alert">
            {{ errorMessage || '候选记忆不存在或已被删除。' }}
          </NAlert>
        </section>
      </div>

      <div class="detail-sticky-bottom">
        <div class="detail-actions">
          <div class="detail-actions-left">
            <NButton @click="router.push('/inbox')">返回列表</NButton>
            <NInput
              v-if="candidateQuery.data.value && isPending"
              v-model:value="form.rejectReason"
              size="small"
              maxlength="1000"
              placeholder="拒绝原因（可选）"
              class="detail-reject-input"
            />
          </div>
          <div class="detail-actions-primary">
            <template v-if="candidateQuery.data.value && isPending">
              <NButton
                :disabled="!canSave"
                :loading="updateMutation.isPending.value"
                attr-type="submit"
                form="candidate-detail-form"
              >
                <template #icon><Save :size="16" /></template>
                保存草稿
              </NButton>
              <NButton
                type="error"
                secondary
                :loading="rejectMutation.isPending.value"
                @click="confirmReject"
              >
                <template #icon><X :size="16" /></template>
                拒绝
              </NButton>
              <NButton
                type="primary"
                :loading="approveMutation.isPending.value"
                @click="confirmApprove"
              >
                <template #icon><Check :size="16" /></template>
                批准
              </NButton>
            </template>
            <NButton
              v-else-if="
                !candidateQuery.data.value && !candidateQuery.isPending.value
              "
              type="primary"
              @click="router.push('/inbox')"
            >
              返回收件箱
            </NButton>
          </div>
        </div>
      </div>
    </div>
  </AppShell>
</template>
