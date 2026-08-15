<script setup lang="ts">
import type { MemoryType, RenderStyle } from '@memory-hub/contracts'
import { NAlert, NButton, NForm, NFormItem, NInput, NSelect } from 'naive-ui'
import { computed, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { Save } from 'lucide-vue-next'

import AppShell from '../components/AppShell.vue'
import MemoryMarkdownEditor from '../components/MemoryMarkdownEditor.vue'
import { ApiError } from '../api'
import { useCreateCandidateMutation } from '../queries'

const router = useRouter()
const createMutation = useCreateCandidateMutation()

const form = reactive({
  title: '',
  body: '',
  memoryType: 'project_context' as MemoryType,
  project: '',
  renderStyle: 'xhs_note' as RenderStyle,
  emojiEnabled: true,
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

async function submitCandidate() {
  if (!canSubmit.value || createMutation.isPending.value) return
  await createMutation.mutateAsync({
    title: form.title.trim(),
    body: form.body.trim(),
    memoryType: form.memoryType,
    project: form.project.trim() || undefined,
    renderStyle: form.renderStyle,
    emojiEnabled: form.emojiEnabled,
  })
  await router.push('/inbox')
}
</script>

<template>
  <AppShell active-nav="capture" title="手动录入" context="创建候选">
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
          <MemoryMarkdownEditor
            v-model="form.body"
            v-model:render-style="form.renderStyle"
            v-model:emoji-enabled="form.emojiEnabled"
            :memory-type="form.memoryType"
            :title="form.title"
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
  </AppShell>
</template>
