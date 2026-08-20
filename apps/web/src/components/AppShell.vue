<script setup lang="ts">
import {
  Bot,
  BookOpenCheck,
  ChevronDown,
  CirclePlus,
  FileInput,
  Inbox,
  LogOut,
  ShieldCheck,
} from 'lucide-vue-next'
import {
  NButton,
  NLayout,
  NLayoutContent,
  NLayoutHeader,
  NLayoutSider,
  NTag,
} from 'naive-ui'
import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import { getHomeSummary } from '../api'
import { homeQueryKey, useLogoutMutation } from '../queries'

defineProps<{
  activeNav: 'inbox' | 'capture' | 'archives' | 'synced' | 'settings' | 'sources' | 'trash'
  title: string
  context: string
}>()

const router = useRouter()
const logoutMutation = useLogoutMutation()
const homeQuery = useQuery({
  queryKey: homeQueryKey,
  queryFn: getHomeSummary,
})

const siyuanStatus = computed(() => homeQuery.data.value?.siyuan.status ?? 'unconfigured')
const siyuanLabel = computed(() => {
  switch (siyuanStatus.value) {
    case 'connected':
      return homeQuery.data.value?.siyuan.notebookName
        ? `思源已连接 · ${homeQuery.data.value.siyuan.notebookName}`
        : '思源已连接'
    case 'failed':
      return '思源连接失败'
    default:
      return '思源待配置'
  }
})
const siyuanTagType = computed(() => {
  switch (siyuanStatus.value) {
    case 'connected':
      return 'success' as const
    case 'failed':
      return 'error' as const
    default:
      return 'warning' as const
  }
})

async function signOut() {
  await logoutMutation.mutateAsync()
  await router.replace('/login')
}
</script>

<template>
  <NLayout has-sider position="absolute" class="app-shell">
    <NLayoutSider
      bordered
      collapse-mode="width"
      :width="248"
      :native-scrollbar="false"
      class="app-sider"
    >
      <div class="sider-inner">
        <div class="brand-lockup compact">
          <span class="brand-mark" aria-hidden="true">M</span>
          <div class="brand-copy">
            <strong>MemoryHub</strong>
            <small>记忆收件箱</small>
          </div>
        </div>

        <nav class="side-nav" aria-label="主导航">
          <p class="nav-section">工作区</p>
          <RouterLink
            class="nav-item"
            :class="{ active: activeNav === 'inbox' }"
            to="/inbox">
          >
            <Inbox :size="17" aria-hidden="true" />
            <span>候选收件箱</span>
            <em
              v-if="(homeQuery.data.value?.counts.pendingCandidates ?? 0) > 0"
              class="nav-count"
            >
              {{ homeQuery.data.value?.counts.pendingCandidates }}
            </em>
          </RouterLink>
          <RouterLink
            class="nav-item"
            :class="{ active: activeNav === 'capture' }"
            to="/capture">
          >
            <CirclePlus :size="17" aria-hidden="true" />
            <span>手动录入</span>
          </RouterLink>
                    <RouterLink
            class="nav-item"
            :class="{ active: activeNav === 'synced' }"
            to="/synced">
            <BookOpenCheck :size="17" aria-hidden="true" />
            <span>已同步记忆</span>
          </RouterLink>
          <RouterLink
            class="nav-item"
            :class="{ active: activeNav === 'trash' }"
            to="/trash"
          >
            <Inbox :size="17" aria-hidden="true" />
            <span>回收站</span>
            <em
              v-if="(homeQuery.data.value?.counts.trashedMemories ?? 0) > 0"
              class="nav-count"
            >
              {{ homeQuery.data.value?.counts.trashedMemories }}
            </em>
          </RouterLink>

          <p class="nav-section">配置</p>
                    <RouterLink
            class="nav-item"
            :class="{ active: activeNav === 'settings' }"
            to="/settings/siyuan">
            <ShieldCheck :size="17" aria-hidden="true" />
            <span>思源连接</span>
          </RouterLink>
          <div class="nav-item disabled" title="后续版本开放">
            <ShieldCheck :size="17" aria-hidden="true" />
            <span>自动归档规则</span>
          </div>
                    <RouterLink
            class="nav-item"
            :class="{ active: activeNav === 'sources' }"
            to="/settings/connectors">
          >
            <FileInput :size="17" aria-hidden="true" />
            <span>来源与连接器</span>
          </RouterLink>
          <div class="nav-item disabled" title="后续版本开放">
            <Bot :size="17" aria-hidden="true" />
            <span>系统设置</span>
          </div>
        </nav>

        <div class="sider-footer">
          <NTag size="small" type="success" :bordered="false">服务运行正常</NTag>
          <span>PostgreSQL 已连接</span>
        </div>
      </div>
    </NLayoutSider>

    <NLayout class="app-main">
      <NLayoutHeader class="app-header" bordered>
        <div>
          <strong>{{ title }}</strong>
          <span class="header-context">{{ context }}</span>
        </div>
        <div class="header-actions">
          <slot name="header-actions" />
          <NTag
            size="small"
            :type="siyuanTagType"
            :bordered="false"
            style="cursor: pointer"
            @click="router.push('/settings/siyuan')"
          >
            <template #icon><BookOpenCheck :size="14" /></template>
            {{ siyuanLabel }}
          </NTag>
          <NButton
            quaternary
            size="small"
            :loading="logoutMutation.isPending.value"
            @click="signOut"
          >
            <template #icon><LogOut :size="16" /></template>
            退出
          </NButton>
          <button class="user-chip" type="button" aria-label="当前管理员">
            <span class="user-avatar">{{
              homeQuery.data.value?.user.username.slice(0, 1).toUpperCase() ??
              'A'
            }}</span>
            <span>{{ homeQuery.data.value?.user.username ?? 'admin' }}</span>
            <ChevronDown :size="14" aria-hidden="true" />
          </button>
        </div>
      </NLayoutHeader>

      <NLayoutContent
        class="workspace-content"
        :native-scrollbar="true"
        content-style="min-height: 100%;"
      >
        <slot />
      </NLayoutContent>
    </NLayout>
  </NLayout>
</template>
