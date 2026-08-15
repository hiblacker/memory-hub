<script setup lang="ts">
import {
  Bot,
  BookOpenCheck,
  ChevronDown,
  CirclePlus,
  FileInput,
  Inbox,
  LogOut,
  Save,
  ShieldCheck,
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
  NTag,
} from 'naive-ui'
import type { MemoryType } from '@memory-hub/contracts'
import { useQuery } from '@tanstack/vue-query'
import { computed, reactive } from 'vue'
import { useRouter } from 'vue-router'

import { ApiError, getHomeSummary } from '../api'
import {
  homeQueryKey,
  useCreateCandidateMutation,
  useLogoutMutation,
} from '../queries'

const router = useRouter()
const logoutMutation = useLogoutMutation()
const createMutation = useCreateCandidateMutation()
const homeQuery = useQuery({
  queryKey: homeQueryKey,
  queryFn: getHomeSummary,
})

const form = reactive({
  title: '',
  body: '',
  memoryType: 'project_context' as MemoryType,
  project: '',
})

const memoryTypeOptions = [
  { label: '永久事实', value: 'permanent_fact' },
  { label: '偏好', value: 'preference' },
  { label: '项目上下文', value: 'project_context' },
  { label: '决策', value: 'decision' },
  { label: '临时状态', value: 'temporary_state' },
  { label: '待办', value: 'todo' },
  { label: '敏感内容', value: 'sensitive' },
]

const canSubmit = computed(
  () => form.title.trim().length > 0 && form.body.trim().length > 0,
)

const errorMessage = computed(() => {
  const error = createMutation.error.value
  if (error instanceof ApiError) return error.message
  return error ? '暂时无法保存候选，请检查服务状态后重试。' : ''
})

async function signOut() {
  await logoutMutation.mutateAsync()
  await router.replace('/login')
}

async function submitCandidate() {
  if (!canSubmit.value || createMutation.isPending.value) return
  await createMutation.mutateAsync({
    title: form.title.trim(),
    body: form.body.trim(),
    memoryType: form.memoryType,
    project: form.project.trim() || undefined,
  })
  await router.push('/inbox')
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
        <RouterLink class="nav-item" to="/inbox">
          <Inbox :size="17" aria-hidden="true" />
          <span>候选收件箱</span>
        </RouterLink>
        <RouterLink class="nav-item active" to="/capture">
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
          <strong>手动录入</strong>
          <span class="header-context">创建候选</span>
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
            <h1>手动录入候选记忆</h1>
            <p>先写入收件箱，再进入审核与归档流程，不直接写入思源。</p>
          </div>
        </div>

        <section class="capture-surface" aria-label="手动录入表单">
          <NAlert v-if="errorMessage" type="error" class="page-alert">
            {{ errorMessage }}
          </NAlert>

          <NForm label-placement="top" @submit.prevent="submitCandidate">
            <NFormItem label="标题" required>
              <NInput
                v-model:value="form.title"
                size="large"
                maxlength="200"
                show-count
                placeholder="例如：偏好使用 TypeScript"
              />
            </NFormItem>
            <NFormItem label="类型" required>
              <NSelect
                v-model:value="form.memoryType"
                size="large"
                :options="memoryTypeOptions"
              />
            </NFormItem>
            <NFormItem label="项目">
              <NInput
                v-model:value="form.project"
                size="large"
                maxlength="120"
                placeholder="可选，例如 memory-hub"
              />
            </NFormItem>
            <NFormItem label="正文" required>
              <NInput
                v-model:value="form.body"
                type="textarea"
                :autosize="{ minRows: 8, maxRows: 16 }"
                maxlength="20000"
                show-count
                placeholder="写下需要长期保留的记忆内容"
              />
            </NFormItem>
            <div class="capture-actions">
              <NButton @click="router.push('/inbox')">取消</NButton>
              <NButton
                type="primary"
                attr-type="submit"
                :disabled="!canSubmit"
                :loading="createMutation.isPending.value"
              >
                <template #icon><Save :size="17" /></template>
                保存到收件箱
              </NButton>
            </div>
          </NForm>
        </section>
      </NLayoutContent>
    </NLayout>
  </NLayout>
</template>
