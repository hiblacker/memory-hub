<script setup lang="ts">
import {
  ArrowLeft,
  Bot,
  BookOpenCheck,
  Check,
  ChevronDown,
  CirclePlus,
  FileInput,
  Inbox,
  LogOut,
  Save,
  ShieldCheck,
  X,
} from 'lucide-vue-next'
import {
  NAlert,
  NButton,
  NForm,
  NFormItem,
  NInput,
  NLayout,
  NLayoutContent,
  NLayoutHeader,
  NLayoutSider,
  NSelect,
  NSpin,
  NTag,
  useDialog,
  useMessage,
} from 'naive-ui'
import type {
  CandidateStatus,
  MemoryType,
  Sensitivity,
} from '@memory-hub/contracts'
import { useQuery } from '@tanstack/vue-query'
import { computed, reactive, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ApiError, getCandidate, getHomeSummary } from '../api'
import {
  candidateQueryKey,
  homeQueryKey,
  useApproveCandidateMutation,
  useLogoutMutation,
  useRejectCandidateMutation,
  useUpdateCandidateMutation,
} from '../queries'

const route = useRoute()
const router = useRouter()
const dialog = useDialog()
const message = useMessage()
const logoutMutation = useLogoutMutation()

const candidateId = computed(() => String(route.params.candidateId ?? ''))

const homeQuery = useQuery({
  queryKey: homeQueryKey,
  queryFn: getHomeSummary,
})

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
    year: 'numeric',
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

async function saveDraft() {
  if (!canSave.value || updateMutation.isPending.value) return
  await updateMutation.mutateAsync({
    candidateId: candidateId.value,
    input: {
      title: form.title.trim(),
      body: form.body.trim(),
      memoryType: form.memoryType,
      project: form.project.trim() || undefined,
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
          <strong>候选详情</strong>
          <span class="header-context">审核与整理</span>
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
            <NButton quaternary class="back-link" @click="router.push('/inbox')">
              <template #icon><ArrowLeft :size="16" /></template>
              返回收件箱
            </NButton>
            <h1>候选详情</h1>
            <p>查看来源信息，编辑草稿，并完成批准或拒绝。</p>
          </div>
          <NTag
            v-if="candidateQuery.data.value"
            size="medium"
            :type="statusType"
            :bordered="false"
          >
            {{ statusLabels[candidateQuery.data.value.status] }}
          </NTag>
        </div>

        <div v-if="candidateQuery.isPending.value" class="page-loading">
          <NSpin size="large" />
          <span>正在加载候选详情</span>
        </div>

        <section v-else-if="candidateQuery.data.value" class="detail-surface">
          <NAlert v-if="errorMessage" type="error" class="page-alert">
            {{ errorMessage }}
          </NAlert>

          <div class="detail-meta-grid">
            <div>
              <span>来源</span>
              <strong>{{ candidateQuery.data.value.source }}</strong>
            </div>
            <div>
              <span>类型</span>
              <strong>{{
                memoryTypeLabels[candidateQuery.data.value.memoryType]
              }}</strong>
            </div>
            <div>
              <span>敏感级别</span>
              <strong>{{
                sensitivityLabels[candidateQuery.data.value.sensitivity]
              }}</strong>
            </div>
            <div>
              <span>置信度</span>
              <strong>{{ candidateQuery.data.value.confidence }}%</strong>
            </div>
            <div>
              <span>捕获时间</span>
              <strong>{{
                formatTime(candidateQuery.data.value.captureTime)
              }}</strong>
            </div>
            <div>
              <span>更新时间</span>
              <strong>{{
                formatTime(candidateQuery.data.value.updatedAt)
              }}</strong>
            </div>
          </div>

          <NAlert
            v-if="candidateQuery.data.value.rejectionReason"
            type="warning"
            class="page-alert"
          >
            拒绝原因：{{ candidateQuery.data.value.rejectionReason }}
          </NAlert>

          <NForm label-placement="top" @submit.prevent="saveDraft">
            <NFormItem label="标题" required>
              <NInput
                v-model:value="form.title"
                size="large"
                maxlength="200"
                show-count
                :disabled="!isPending"
                placeholder="候选标题"
              />
            </NFormItem>
            <NFormItem label="类型" required>
              <NSelect
                v-model:value="form.memoryType"
                size="large"
                :options="memoryTypeOptions"
                :disabled="!isPending"
              />
            </NFormItem>
            <NFormItem label="项目">
              <NInput
                v-model:value="form.project"
                size="large"
                maxlength="120"
                :disabled="!isPending"
                placeholder="可选，例如 memory-hub"
              />
            </NFormItem>
            <NFormItem label="正文" required>
              <NInput
                v-model:value="form.body"
                type="textarea"
                :autosize="{ minRows: 10, maxRows: 18 }"
                maxlength="20000"
                show-count
                :disabled="!isPending"
                placeholder="记忆正文"
              />
            </NFormItem>
            <NFormItem v-if="isPending" label="拒绝原因（可选）">
              <NInput
                v-model:value="form.rejectReason"
                type="textarea"
                :autosize="{ minRows: 2, maxRows: 4 }"
                maxlength="1000"
                show-count
                placeholder="例如：信息过时或不应长期保存"
              />
            </NFormItem>

            <div class="detail-actions">
              <NButton @click="router.push('/inbox')">返回列表</NButton>
              <div class="detail-actions-primary">
                <NButton
                  v-if="isPending"
                  :disabled="!canSave"
                  :loading="updateMutation.isPending.value"
                  attr-type="submit"
                >
                  <template #icon><Save :size="16" /></template>
                  保存草稿
                </NButton>
                <NButton
                  v-if="isPending"
                  type="error"
                  secondary
                  :loading="rejectMutation.isPending.value"
                  @click="confirmReject"
                >
                  <template #icon><X :size="16" /></template>
                  拒绝
                </NButton>
                <NButton
                  v-if="isPending"
                  type="primary"
                  :loading="approveMutation.isPending.value"
                  @click="confirmApprove"
                >
                  <template #icon><Check :size="16" /></template>
                  批准
                </NButton>
              </div>
            </div>
          </NForm>
        </section>

        <section v-else class="detail-surface">
          <NAlert type="error" class="page-alert">
            {{ errorMessage || '候选记忆不存在或已被删除。' }}
          </NAlert>
          <div class="detail-actions">
            <NButton @click="router.push('/inbox')">返回收件箱</NButton>
          </div>
        </section>
      </NLayoutContent>
    </NLayout>
  </NLayout>
</template>


