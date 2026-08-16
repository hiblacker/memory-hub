<script setup lang="ts">
import { ArrowLeft, Check, Save, X } from 'lucide-vue-next'
import {
  NAlert,
  NButton,
  NForm,
  NFormItem,
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, h, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppShell from '../components/AppShell.vue'
import MemoryMarkdownEditor from '../components/MemoryMarkdownEditor.vue'
import { getCandidate, listCandidateDeliveries, retryDelivery } from '../api'
import {
  candidateQueryKey,
  homeQueryKey,
  useApproveCandidateMutation,
  useRejectCandidateMutation,
  useUpdateCandidateMutation,
} from '../queries'

const route = useRoute()
const router = useRouter()
const dialog = useDialog()
const message = useMessage()
const queryClient = useQueryClient()

const candidateId = computed(() => String(route.params.candidateId ?? ''))

const candidateQuery = useQuery({
  queryKey: computed(() => candidateQueryKey(candidateId.value)),
  queryFn: () => getCandidate(candidateId.value),
  enabled: computed(() => candidateId.value.length > 0),
})

const deliveriesQuery = useQuery({
  queryKey: computed(() => ['candidate-deliveries', candidateId.value]),
  queryFn: () => listCandidateDeliveries(candidateId.value),
  enabled: computed(() => Boolean(candidateId.value)),
  refetchInterval: 4000,
})

const retryMutation = useMutation({
  mutationFn: (deliveryId: string) => retryDelivery(deliveryId),
  onSuccess: async () => {
    await queryClient.invalidateQueries({
      queryKey: ['candidate-deliveries', candidateId.value],
    })
    await queryClient.invalidateQueries({ queryKey: ['candidate', candidateId.value] })
    await queryClient.invalidateQueries({ queryKey: homeQueryKey })
  },
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
})

const rejectReasonDraft = ref('')

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
  message.success('草稿已保存', { duration: 2000 })
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
      message.success('候选已批准', { duration: 2000 })
    },
  })
}

function confirmReject() {
  if (!isPending.value || rejectMutation.isPending.value) return
  rejectReasonDraft.value = ''
  dialog.error({
    title: '确认拒绝该候选？',
    content: () =>
      h('div', { class: 'reject-dialog-body' }, [
        h(
          'p',
          { class: 'reject-dialog-tip' },
          '拒绝后保留来源与审计记录，但不会进入归档队列。',
        ),
        h(NInput, {
          type: 'textarea',
          rows: 3,
          maxlength: 1000,
          showCount: true,
          placeholder: '请输入拒绝原因（可选）',
          value: rejectReasonDraft.value,
          'onUpdate:value': (value: string) => {
            rejectReasonDraft.value = value
          },
        }),
      ]),
    positiveText: '确认拒绝',
    negativeText: '取消',
    onPositiveClick: async () => {
      await rejectMutation.mutateAsync({
        candidateId: candidateId.value,
        input: {
          reason: rejectReasonDraft.value.trim() || undefined,
        },
      })
      message.success('候选已拒绝', { duration: 2000 })
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
          <NAlert
            v-if="candidateQuery.data.value.rejectionReason"
            type="warning"
            class="page-alert compact"
          >
            拒绝原因：{{ candidateQuery.data.value.rejectionReason }}
          </NAlert>

          <div class="detail-meta-inline" aria-label="候选属性">
            <span class="detail-meta-chip">
              <span class="meta-k">来源</span>
              <span class="meta-v">{{ candidateQuery.data.value.source }}</span>
            </span>
            <span class="detail-meta-chip">
              <span class="meta-k">敏感</span>
              <span class="meta-v">{{
                sensitivityLabels[candidateQuery.data.value.sensitivity]
              }}</span>
            </span>
            <span class="detail-meta-chip">
              <span class="meta-k">置信度</span>
              <span class="meta-v"
                >{{ candidateQuery.data.value.confidence }}%</span
              >
            </span>
            <span class="detail-meta-chip">
              <span class="meta-k">捕获</span>
              <span class="meta-v">{{
                formatTime(candidateQuery.data.value.captureTime)
              }}</span>
            </span>
            <span class="detail-meta-chip">
              <span class="meta-k">更新</span>
              <span class="meta-v">{{
                formatTime(candidateQuery.data.value.updatedAt)
              }}</span>
            </span>
          </div>

          <NForm
            class="detail-fields-form"
            label-placement="left"
          >
            <NFormItem label="标题" required class="detail-field-title">
              <NInput
                v-model:value="form.title"
                maxlength="200"
                :disabled="!isPending"
                placeholder="候选标题"
              />
            </NFormItem>
            <div class="detail-field-pair">
              <NFormItem label="类型" required class="detail-field-type">
                <NSelect
                  v-model:value="form.memoryType"
                  :options="memoryTypeOptions"
                  :disabled="!isPending"
                />
              </NFormItem>
              <NFormItem label="项目" class="detail-field-project">
                <NInput
                  v-model:value="form.project"
                  maxlength="120"
                  :disabled="!isPending"
                  placeholder="可选，例如 memory-hub"
                />
              </NFormItem>
            </div>
          </NForm>

          <div v-if="deliveriesQuery.data.value?.length" class="delivery-panel">
            <strong>归档交付</strong>
            <div
              v-for="item in deliveriesQuery.data.value"
              :key="item.id"
              class="delivery-row"
            >
              <div>
                <div>状态：{{ item.status }} · 尝试 {{ item.attemptCount }} 次</div>
                <div v-if="item.documentId">文档：{{ item.documentId }}</div>
                <div v-if="item.blockId">块：{{ item.blockId }}</div>
                <div v-if="item.lastErrorMessage" class="text-danger">
                  {{ item.lastErrorCode }}: {{ item.lastErrorMessage }}
                </div>
              </div>
              <NButton
                v-if="item.status === 'dead_letter' || item.status === 'blocked' || item.status === 'retrying'"
                size="small"
                :loading="retryMutation.isPending.value"
                @click="retryMutation.mutate(item.id)"
              >
                重试
              </NButton>
            </div>
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
          <NAlert type="warning" class="page-alert">
            候选记忆不存在或已被删除。
          </NAlert>
        </section>
      </div>

      <div class="detail-sticky-bottom">
        <div class="detail-actions">
          <div class="detail-actions-left">
            <NButton @click="router.push('/inbox')">返回列表</NButton>
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
