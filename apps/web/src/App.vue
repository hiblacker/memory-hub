<script setup lang="ts">
import { NCard, NDescriptions, NDescriptionsItem, NTag } from 'naive-ui'

import AppProviders from './AppProviders.vue'

const phase = '方案已确认'
</script>

<template>
  <AppProviders>
    <main class="shell">
      <NCard class="panel" :bordered="true">
        <div class="heading-row">
          <p class="eyebrow">MemoryHub</p>
          <NTag type="warning" size="small" :bordered="false">{{ phase }}</NTag>
        </div>
        <h1>可审核的 AI 长期记忆中枢</h1>
        <p class="summary">
          面向 ChatGPT、Claude Code 与思源笔记。技术方案与 V1
          范围已经确认，准备进入业务开发。
        </p>
        <NDescriptions label-placement="left" :column="1" bordered>
          <NDescriptionsItem label="前端"
            >Vue 3 + Vite + TypeScript</NDescriptionsItem
          >
          <NDescriptionsItem label="组件库">Naive UI</NDescriptionsItem>
          <NDescriptionsItem label="归档目标">思源笔记</NDescriptionsItem>
        </NDescriptions>
      </NCard>
    </main>
  </AppProviders>
</template>
