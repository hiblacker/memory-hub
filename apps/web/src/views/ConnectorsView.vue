<script setup lang="ts">
import {
  NAlert,
  NButton,
  NForm,
  NFormItem,
  NInput,
  NSelect,
  NTag,
  useMessage,
} from 'naive-ui'
import { ref } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { ConnectorType } from '@memory-hub/contracts'

import {
  ApiError,
  createConnector,
  listConnectors,
  setConnectorEnabled,
} from '../api'
import AppShell from '../components/AppShell.vue'

const message = useMessage()
const queryClient = useQueryClient()
const errorMessage = ref('')
const revealedKey = ref<string | null>(null)
const form = ref({
  name: '',
  type: 'rest' as ConnectorType,
})

const typeOptions = [
  { label: 'REST / MCP 客户端', value: 'rest' },
  { label: 'Claude Code Hook', value: 'claude_code' },
  { label: 'ChatGPT 导出导入', value: 'chatgpt_export' },
  { label: 'ChatGPT 扩展', value: 'chatgpt_extension' },
]

const connectorsQuery = useQuery({
  queryKey: ['connectors'],
  queryFn: listConnectors,
})

const createMutation = useMutation({
  mutationFn: () =>
    createConnector({
      name: form.value.name,
      type: form.value.type,
    }),
  onSuccess: async (result) => {
    revealedKey.value = result.apiKey
    form.value.name = ''
    errorMessage.value = ''
    message.success('连接器已创建。请立即复制 API Key，之后无法再次查看。')
    await queryClient.invalidateQueries({ queryKey: ['connectors'] })
  },
  onError: (error) => {
    errorMessage.value =
      error instanceof ApiError ? error.message : '创建连接器失败。'
  },
})

const toggleMutation = useMutation({
  mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
    setConnectorEnabled(id, enabled),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ['connectors'] })
  },
  onError: (error) => {
    errorMessage.value =
      error instanceof ApiError ? error.message : '更新连接器失败。'
  },
})
</script>

<template>
  <AppShell
    active-nav="sources"
    title="来源与连接器"
    context="为 Hook / 导入 / REST 客户端签发 API Key"
  >
    <div class="page-stack">
      <NAlert v-if="errorMessage" type="error" class="page-alert">
        {{ errorMessage }}
      </NAlert>
      <NAlert type="info" class="page-alert">
        事件通过 <code>POST /api/v1/events</code> 接入。使用
        <code>Authorization: Bearer &lt;apiKey&gt;</code> 或
        <code>X-Api-Key</code>。可选 <code>Idempotency-Key</code>。
        API 只持久化事件并入队，不在请求内写思源或跑模型。
      </NAlert>

      <section class="panel settings-panel">
        <header class="panel-header">
          <div>
            <h2>创建连接器</h2>
            <p>API Key 仅展示一次，数据库只保存哈希。</p>
          </div>
        </header>
        <NForm label-placement="top" class="settings-form">
          <NFormItem label="名称" required>
            <NInput v-model:value="form.name" placeholder="例如 claude-code-laptop" />
          </NFormItem>
          <NFormItem label="类型" required>
            <NSelect v-model:value="form.type" :options="typeOptions" />
          </NFormItem>
        </NForm>
        <div class="settings-actions">
          <NButton
            type="primary"
            :loading="createMutation.isPending.value"
            :disabled="!form.name.trim()"
            @click="createMutation.mutate()"
          >
            创建并生成 API Key
          </NButton>
        </div>
        <NAlert v-if="revealedKey" type="warning" class="page-alert" style="margin-top: 12px">
          请立即复制 API Key：
          <code style="user-select: all">{{ revealedKey }}</code>
        </NAlert>
      </section>

      <section class="panel settings-panel">
        <header class="panel-header">
          <div>
            <h2>已有连接器</h2>
            <p>禁用后对应 Key 立即失效。</p>
          </div>
        </header>
        <div v-if="connectorsQuery.isLoading.value">加载中…</div>
        <div v-else-if="!(connectorsQuery.data.value?.length)" class="empty-hint">
          还没有连接器。
        </div>
        <div v-else class="candidate-list">
          <div
            v-for="item in connectorsQuery.data.value"
            :key="item.id"
            class="candidate-card"
            style="cursor: default"
          >
            <div class="candidate-card-top">
              <strong>{{ item.name }}</strong>
              <NTag size="small" :type="item.enabled ? 'success' : 'default'">
                {{ item.enabled ? '启用' : '禁用' }}
              </NTag>
            </div>
            <div class="candidate-card-meta">
              <span>{{ item.type }}</span>
              <span>前缀 {{ item.keyPrefix }}…</span>
              <span>创建于 {{ new Date(item.createdAt).toLocaleString() }}</span>
            </div>
            <div class="settings-actions" style="margin-top: 10px">
              <NButton
                size="small"
                @click="
                  toggleMutation.mutate({
                    id: item.id,
                    enabled: !item.enabled,
                  })
                "
              >
                {{ item.enabled ? '禁用' : '启用' }}
              </NButton>
            </div>
          </div>
        </div>
      </section>
    </div>
  </AppShell>
</template>
