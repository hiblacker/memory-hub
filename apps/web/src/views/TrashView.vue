<script setup lang="ts">
import MemoryListPanel from '../components/MemoryListPanel.vue'
import AppShell from '../components/AppShell.vue'
import { listTrashedMemories } from '../api'
</script>

<template>
  <AppShell active-nav="trash" title="回收站" context="恢复时会重新写入思源文档">
    <div class="page-stack">
      <div class="page-heading">
        <div>
          <h1>回收站</h1>
          <p>删除时会移除思源文档；恢复时重新同步到思源。</p>
        </div>
      </div>
      <MemoryListPanel
        query-key="trash-list"
        :fetcher="listTrashedMemories"
        :show-status-filter="false"
        :show-date-filter="false"
        :actions="['restore', 'destroy']"
      />
    </div>
  </AppShell>
</template>
