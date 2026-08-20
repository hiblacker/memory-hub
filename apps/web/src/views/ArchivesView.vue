<script setup lang="ts">
import MemoryListPanel from '../components/MemoryListPanel.vue'
import AppShell from '../components/AppShell.vue'
import { listSyncedMemories } from '../api'
</script>

<template>
  <AppShell active-nav="synced" title="已同步记忆" context="已成功同步到思源的记忆">
    <div class="page-stack">
      <div class="page-heading">
        <div>
          <h1>已同步记忆</h1>
          <p>已写入思源的记忆，可继续修订或删除。</p>
        </div>
      </div>
      <MemoryListPanel
        query-key="synced-list"
        :fetcher="listSyncedMemories"
        :show-status-filter="false"
        :actions="['delete']"
      />
    </div>
  </AppShell>
</template>
