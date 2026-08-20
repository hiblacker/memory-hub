<script setup lang="ts">
import { RotateCcw, Trash2 } from 'lucide-vue-next'
import { NButton, NEmpty, NSpin, NTag, useDialog, useMessage } from 'naive-ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import AppShell from '../components/AppShell.vue'
import { destroyCandidate, listTrashedMemories, restoreCandidate } from '../api'
import { homeQueryKey } from '../queries'

const router = useRouter()
const dialog = useDialog()
const message = useMessage()
const queryClient = useQueryClient()

const trashQuery = useQuery({
  queryKey: ['trash'],
  queryFn: listTrashedMemories,
})
const items = computed(() => trashQuery.data.value?.items ?? [])

const restoreMutation = useMutation({
  mutationFn: restoreCandidate,
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ['trash'] })
    await queryClient.invalidateQueries({ queryKey: homeQueryKey })
    message.success('已恢复，请重新审核并同步。', { duration: 2000 })
  },
})
const destroyMutation = useMutation({
  mutationFn: destroyCandidate,
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ['trash'] })
    await queryClient.invalidateQueries({ queryKey: homeQueryKey })
    message.success('已彻底删除。', { duration: 2000 })
  },
})

function confirmDestroy(id: string) {
  dialog.error({
    title: '彻底删除？',
    content: '不可从产品内恢复。审计记录会保留。',
    positiveText: '彻底删除',
    negativeText: '取消',
    onPositiveClick: () => destroyMutation.mutateAsync(id),
  })
}
</script>

<template>
  <AppShell active-nav="trash" title="回收站" context="软删除的记忆，可恢复或彻底删除">
    <div class="page-stack">
      <div v-if="trashQuery.isLoading.value" class="page-loading">
        <NSpin size="large" />
      </div>
      <NEmpty v-else-if="!items.length" description="回收站是空的" />
      <div v-else class="candidate-list">
        <div v-for="item in items" :key="item.id" class="candidate-card-wrap">
          <button class="candidate-card" type="button" @click="router.push(`/inbox/${item.id}`)">
            <div class="candidate-card-top">
              <strong>{{ item.title }}</strong>
              <NTag size="small" type="warning">回收站</NTag>
            </div>
            <p class="candidate-card-summary">{{ item.body.slice(0, 120) }}</p>
          </button>
          <div class="candidate-card-actions">
            <NButton size="tiny" @click="restoreMutation.mutate(item.id)">
              <template #icon><RotateCcw :size="14" /></template>
              恢复
            </NButton>
            <NButton size="tiny" type="error" tertiary @click="confirmDestroy(item.id)">
              <template #icon><Trash2 :size="14" /></template>
              彻底删除
            </NButton>
          </div>
        </div>
      </div>
    </div>
  </AppShell>
</template>
