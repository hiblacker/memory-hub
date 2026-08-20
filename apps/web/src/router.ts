import type { QueryClient } from '@tanstack/vue-query'
import { createRouter, createWebHistory, createMemoryHistory } from 'vue-router'

import { getCurrentUser } from './api'
import { authQueryKey } from './queries'
import { queryClient } from './query-client'
import SettingsView from './views/SettingsView.vue'
import SyncedView from './views/ArchivesView.vue'
import ConnectorsView from './views/ConnectorsView.vue'
import CandidateDetailView from './views/CandidateDetailView.vue'
import InboxView from './views/InboxView.vue'
import TrashView from './views/TrashView.vue'
import LoginView from './views/LoginView.vue'

export function createAppRouter(
  client: QueryClient = queryClient,
  memory = false,
) {
  const router = createRouter({
    history: memory ? createMemoryHistory() : createWebHistory(),
    routes: [
      { path: '/', redirect: '/inbox' },
      { path: '/login', name: 'login', component: LoginView },
      {
        path: '/inbox',
        name: 'inbox',
        component: InboxView,
        meta: { requiresAuth: true },
      },
      {
        path: '/inbox/:candidateId',
        name: 'candidate-detail',
        component: CandidateDetailView,
        meta: { requiresAuth: true },
      },
      {
        path: '/archives',
        redirect: '/synced',
      },
      {
        path: '/trash',
        name: 'trash',
        component: TrashView,
        meta: { requiresAuth: true },
      },
      {
        path: '/synced',
        name: 'synced',
        component: SyncedView,
        meta: { requiresAuth: true },
      },
      {
        path: '/settings/connectors',
        name: 'settings-connectors',
        component: ConnectorsView,
        meta: { requiresAuth: true },
      },
      {
        path: '/settings/siyuan',
        name: 'settings-siyuan',
        component: SettingsView,
        meta: { requiresAuth: true },
      },
    ],
  })

  router.beforeEach(async (to) => {
    if (!to.meta.requiresAuth) return true
    try {
      await client.ensureQueryData({
        queryKey: authQueryKey,
        queryFn: getCurrentUser,
        staleTime: 60_000,
      })
      return true
    } catch {
      return { name: 'login', query: { redirect: to.fullPath } }
    }
  })

  return router
}

export const router = createAppRouter()
