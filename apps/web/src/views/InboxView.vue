<script setup lang="ts">
import { CirclePlus, ShieldCheck } from 'lucide-vue-next'
import { NButton } from 'naive-ui'
import { useQuery } from '@tanstack/vue-query'
import { useRouter } from 'vue-router'

import AppShell from '../components/AppShell.vue'
import MemoryListPanel from '../components/MemoryListPanel.vue'
import { getHomeSummary, listCandidates } from '../api'
import { homeQueryKey } from '../queries'

const router = useRouter()
const homeQuery = useQuery({
  queryKey: homeQueryKey,
  queryFn: getHomeSummary,
})
</script>

<template>
  <AppShell active-nav="inbox" title="候选收件箱" context="默认工作区">
    <div class="page-heading">
      <div>
        <h1>候选收件箱</h1>
        <p>集中审核、整理并同步长期记忆候选。</p>
      </div>
      <div class="page-actions">
        <NButton type="primary" @click="router.push('/capture')">
          <template #icon><CirclePlus :size="17" /></template>
          新建候选
        </NButton>
      </div>
    </div>

    <section class="queue-summary" aria-label="队列摘要">
      <div>
        <span>待审核</span>
        <strong>{{ homeQuery.data.value?.counts.pendingCandidates ?? 0 }}</strong>
      </div>
      <div>
        <span>排队中</span>
        <strong>{{ homeQuery.data.value?.counts.queuedDeliveries ?? 0 }}</strong>
      </div>
      <div>
        <span>已同步</span>
        <strong>{{ homeQuery.data.value?.counts.syncedMemories ?? 0 }}</strong>
      </div>
    </section>

    <section class="inbox-surface" aria-label="候选记忆列表">
      <MemoryListPanel
        query-key="inbox-list"
        :fetcher="listCandidates"
        :actions="['delete']"
      />
    </section>

    <footer class="workspace-footer">
      <ShieldCheck :size="15" aria-hidden="true" />
      <span>自动同步默认关闭，所有候选均保留来源与审计记录。</span>
    </footer>
  </AppShell>
</template>
