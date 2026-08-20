<script setup lang="ts">
import { NAlert, NButton, NForm, NFormItem, NInput, NSwitch, NTag } from 'naive-ui'
import { computed, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

import {
  getSiyuanSettings,
  testSiyuanSettings,
  updateSiyuanSettings,
} from '../api'
import AppShell from '../components/AppShell.vue'
import { showSuccessToast } from '../feedback'

const queryClient = useQueryClient()
const form = ref({
  name: '',
  enabled: true,
  baseUrl: '',
  authHeader: 'Authorization',
  notebookId: '',
  notebookName: '',
  pathTemplate: '/MemoryHub/{group}/{title}',
  allowedHosts: '192.168.1.10,127.0.0.1,localhost',
})

const settingsQuery = useQuery({
  queryKey: ['settings', 'siyuan'],
  queryFn: getSiyuanSettings,
})

watch(
  () => settingsQuery.data.value,
  (value) => {
    if (!value) return
    form.value = {
      name: value.name,
      enabled: value.enabled,
      baseUrl: value.baseUrl,
      authHeader: value.authHeader,
      notebookId: value.notebookId ?? '',
      notebookName: value.notebookName ?? '',
      pathTemplate: value.pathTemplate,
      allowedHosts: value.allowedHosts ?? '',
    }
  },
  { immediate: true },
)

const lastTestStatus = computed(
  () => settingsQuery.data.value?.lastTestStatus ?? null,
)
const lastTestLabel = computed(() => {
  switch (lastTestStatus.value) {
    case 'succeeded':
      return '成功'
    case 'failed':
      return '失败'
    default:
      return '未测试'
  }
})
const lastTestTagType = computed(() => {
  switch (lastTestStatus.value) {
    case 'succeeded':
      return 'success' as const
    case 'failed':
      return 'error' as const
    default:
      return 'default' as const
  }
})

const saveMutation = useMutation({
  mutationFn: () =>
    updateSiyuanSettings({
      name: form.value.name,
      enabled: form.value.enabled,
      baseUrl: form.value.baseUrl,
      authHeader: form.value.authHeader,
      notebookId: form.value.notebookId || null,
      notebookName: form.value.notebookName || null,
      pathTemplate: form.value.pathTemplate,
      allowedHosts: form.value.allowedHosts || null,
    }),
  onSuccess: async () => {
    showSuccessToast('配置已保存。')
    await queryClient.invalidateQueries({ queryKey: ['settings', 'siyuan'] })
  },
})

const testMutation = useMutation({
  mutationFn: () =>
    testSiyuanSettings({
      name: form.value.name,
      enabled: form.value.enabled,
      baseUrl: form.value.baseUrl,
      authHeader: form.value.authHeader,
      // Prefer name matching: clear stale id when user changed notebook name.
      notebookId: form.value.notebookId || null,
      notebookName: form.value.notebookName || null,
      pathTemplate: form.value.pathTemplate,
      allowedHosts: form.value.allowedHosts || null,
    }),
  onSuccess: async (data) => {
    showSuccessToast(data.lastTestMessage || '连接测试成功。')
    form.value = {
      ...form.value,
      authHeader: data.authHeader,
      notebookId: data.notebookId ?? '',
      notebookName: data.notebookName ?? '',
    }
    await queryClient.invalidateQueries({ queryKey: ['settings', 'siyuan'] })
  },
  onError: () => {
    void queryClient.invalidateQueries({ queryKey: ['settings', 'siyuan'] })
  },
})
</script>

<template>
  <AppShell active-nav="settings" title="思源连接" context="归档目标与鉴权引用">
    <div class="page-stack">
      <NAlert type="info" class="page-alert">
        Token 不进入浏览器。请在仓库根目录
        <code>.env</code>
        配置
        <code>SIYUAN_TOKEN</code>
        或
        <code>SIYUAN_TOKEN_FILE</code>
        ，然后重启 API / Worker。填写「笔记本名称」后测试连接会优先按名称匹配，不会再静默改回首个笔记本。思源 3.x 默认使用
        <code>Authorization: Token &lt;token&gt;</code>
        。
      </NAlert>

      <section class="panel settings-panel">
        <header class="panel-header">
          <div>
            <h2>默认思源目标</h2>
            <p>批准后的记忆由 Worker 幂等写入该目标。</p>
          </div>
          <div class="settings-header-tags">
            <NTag size="small" :type="settingsQuery.data.value?.tokenConfigured ? 'success' : 'warning'">
              {{ settingsQuery.data.value?.tokenConfigured ? 'Token 已配置' : 'Token 未配置' }}
            </NTag>
            <NTag size="small" :type="lastTestTagType">
              最近测试：{{ lastTestLabel }}
            </NTag>
          </div>
        </header>

        <NForm label-placement="top" class="settings-form">
          <NFormItem label="名称">
            <NInput v-model:value="form.name" />
          </NFormItem>
          <NFormItem label="启用">
            <NSwitch v-model:value="form.enabled" />
          </NFormItem>
          <NFormItem label="Base URL" required>
            <NInput v-model:value="form.baseUrl" placeholder="http://192.168.1.10:1166" />
          </NFormItem>
          <NFormItem label="鉴权请求头">
            <NInput v-model:value="form.authHeader" placeholder="Authorization（思源 3.x 常用）或 X-Auth-Token" />
          </NFormItem>
          <NFormItem label="笔记本 ID">
            <NInput v-model:value="form.notebookId" placeholder="可留空；按名称匹配成功后自动回填" />
          </NFormItem>
          <NFormItem label="笔记本名称">
            <NInput
              v-model:value="form.notebookName"
              placeholder="例如 MemoryHub（优先按名称匹配，需在思源中已存在）"
              @update:value="form.notebookId = ''"
            />
          </NFormItem>
          <NFormItem label="路径模板">
            <NInput v-model:value="form.pathTemplate" />
          </NFormItem>
          <NFormItem label="允许主机（逗号分隔，SSRF 防护）">
            <NInput v-model:value="form.allowedHosts" />
          </NFormItem>
        </NForm>

        <div class="settings-meta" v-if="settingsQuery.data.value">
          <div>
            <span class="meta-k">最近测试</span>
            <span class="meta-v">{{ lastTestLabel }}</span>
          </div>
          <div>
            <span class="meta-k">测试信息</span>
            <span class="meta-v">{{ settingsQuery.data.value.lastTestMessage || '—' }}</span>
          </div>
        </div>

        <div class="settings-actions">
          <NButton
            type="primary"
            :loading="saveMutation.isPending.value"
            @click="saveMutation.mutate()"
          >
            保存配置
          </NButton>
          <NButton
            type="info"
            secondary
            :loading="testMutation.isPending.value"
            @click="testMutation.mutate()"
          >
            测试连接
          </NButton>
        </div>
      </section>
    </div>
  </AppShell>
</template>
