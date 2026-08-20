<script setup lang="ts">
import { NEmpty, NSpin, NTag } from 'naive-ui'
import { useQuery } from '@tanstack/vue-query'
import { useRouter } from 'vue-router'

import { listSyncedMemories } from '../api'
import AppShell from '../components/AppShell.vue'

const router = useRouter()
const syncedQuery = useQuery({
  queryKey: ['synced'],
  queryFn: listSyncedMemories,
})

const typeLabels: Record<string, string> = {
  permanent_fact: '长期事实',
  preference: '偏好',
  project_context: '项目上下文',
  decision: '决策',
  temporary_state: '临时状态',
  todo: '待办',
  sensitive: '敏感',
}
</script>

<template>
  <AppShell active-nav="synced" title="已同步记忆" context="已成功同步到思源的记忆">
    <div class="page-stack">
      <div v-if="syncedQuery.isLoading.value" class="page-loading">
        <NSpin size="large" />
      </div>

      <NEmpty
        v-else-if="!(syncedQuery.data.value?.items.length)"
        description="还没有已同步记忆"
      />

      <div v-else class="candidate-list">
        <button
          v-for="item in syncedQuery.data.value?.items"
          :key="item.id"
          type="button"
          class="candidate-card"
          @click="router.push(`/inbox/${item.id}`)"
        >
          <div class="candidate-card-top">
            <strong>{{ item.title }}</strong>
            <NTag size="small" type="success">已同步</NTag>
          </div>
          <p class="candidate-card-summary">{{ item.body.slice(0, 120) }}</p>
          <div class="candidate-card-meta">
            <span>{{ typeLabels[item.memoryType] || item.memoryType }}</span>
            <span>{{ item.project || '未指定项目' }}</span>
          </div>
        </button>
      </div>
    </div>
  </AppShell>
</template>
