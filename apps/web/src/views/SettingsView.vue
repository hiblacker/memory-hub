<script setup lang="ts">
import { NAlert, NButton, NForm, NFormItem, NInput, NSwitch, NTag } from 'naive-ui'
import { ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

import {
  ApiError,
  getSiyuanSettings,
  testSiyuanSettings,
  updateSiyuanSettings,
} from '../api'
import AppShell from '../components/AppShell.vue'

const queryClient = useQueryClient()
const errorMessage = ref('')
const form = ref({
  name: '',
  enabled: true,
  baseUrl: '',
  authHeader: 'X-Auth-Token',
  notebookId: '',
  notebookName: '',
  pathTemplate: '/MemoryHub/10 长期记忆/{type}',
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
    errorMessage.value = ''
    await queryClient.invalidateQueries({ queryKey: ['settings', 'siyuan'] })
  },
  onError: (error) => {
    errorMessage.value =
      error instanceof ApiError ? error.message : '保存失败。'
  },
})

const testMutation = useMutation({
  mutationFn: testSiyuanSettings,
  onSuccess: async () => {
    errorMessage.value = ''
    await queryClient.invalidateQueries({ queryKey: ['settings', 'siyuan'] })
  },
  onError: (error) => {
    errorMessage.value =
      error instanceof ApiError ? error.message : '连接测试失败。'
    void queryClient.invalidateQueries({ queryKey: ['settings', 'siyuan'] })
  },
})
</script>

<template>
  <AppShell active-nav="settings" title="思源连接" context="归档目标与鉴权引用">
    <div class="page-stack">
      <NAlert v-if="errorMessage" type="error" class="page-alert">{{ errorMessage }}</NAlert>
      <NAlert type="info" class="page-alert">
        Token 不进入浏览器。请在 Worker/API 运行环境配置
        <code>SIYUAN_TOKEN</code> 或 <code>SIYUAN_TOKEN_FILE</code>。
      </NAlert>

      <section class="panel settings-panel">
        <header class="panel-header">
          <div>
            <h2>默认思源目标</h2>
            <p>批准后的记忆由 Worker 幂等写入该目标。</p>
          </div>
          <NTag size="small" :type="settingsQuery.data.value?.tokenConfigured ? 'success' : 'warning'">
            {{ settingsQuery.data.value?.tokenConfigured ? 'Token 已配置' : 'Token 未配置' }}
          </NTag>
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
            <NInput v-model:value="form.authHeader" placeholder="X-Auth-Token" />
          </NFormItem>
          <NFormItem label="笔记本 ID">
            <NInput v-model:value="form.notebookId" placeholder="连接测试成功后可自动回填" />
          </NFormItem>
          <NFormItem label="笔记本名称">
            <NInput v-model:value="form.notebookName" />
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
            <span class="meta-v">{{ settingsQuery.data.value.lastTestStatus || '—' }}</span>
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
