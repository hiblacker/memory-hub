import { VueQueryPlugin, type QueryClient } from '@tanstack/vue-query'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App.vue'
import { showApiErrorToast } from './feedback'
import { createQueryClient } from './query-client'
import { createAppRouter } from './router'

vi.mock('./feedback', () => ({
  showApiErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function mountAt(path: string, client?: QueryClient) {
  const queryClient = client ?? createQueryClient()
  const router = createAppRouter(queryClient, true)
  await router.push(path)
  await router.isReady()
  const wrapper = mount(App, {
    global: {
      plugins: [createPinia(), [VueQueryPlugin, { queryClient }], router],
    },
  })
  await flushPromises()
  return { wrapper, router, queryClient }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const demoCandidate = {
  id: 'cand_demo',
  title: '偏好使用 TypeScript',
  body: '## 📌 关键点\n\n长期技术栈偏好使用 **TypeScript** 与 Vue 3。',
  memoryType: 'preference',
  source: 'manual',
  project: 'memory-hub',
  status: 'pending',
  sensitivity: 'normal',
  confidence: 100,
  renderStyle: 'xhs_note',
  emojiEnabled: true,
  rejectionReason: null,
  captureTime: '2026-08-15T10:00:00.000Z',
  updatedAt: '2026-08-15T10:00:00.000Z',
}

describe('MemoryHub Web', () => {
  it('展示登录页', async () => {
    const { wrapper } = await mountAt('/login')
    expect(wrapper.get('h1').text()).toBe('登录管理端')
    expect(wrapper.text()).toContain('MemoryHub')
  })

  it('未登录访问收件箱时返回登录页', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ error: { code: 'AUTH_UNAUTHORIZED' } }, 401),
      ),
    )
    const { router, wrapper } = await mountAt('/inbox')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(wrapper.text()).toContain('登录管理端')
  })

  it('登录成功后进入候选收件箱首页', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/v1/auth/login')) {
        return jsonResponse({ user: { id: 'usr_admin', username: 'admin' } })
      }
      if (url.endsWith('/api/v1/auth/me')) {
        return jsonResponse({ user: { id: 'usr_admin', username: 'admin' } })
      }
      if (url.includes('/api/v1/home')) {
        return jsonResponse({
          user: { id: 'usr_admin', username: 'admin' },
          counts: {
            pendingCandidates: 0,
            queuedDeliveries: 0,
            syncedMemories: 0,
            trashedMemories: 0,
          },
          siyuan: { status: 'unconfigured', notebookName: null, lastTestedAt: null },
        })
      }
      if (url.includes('/api/v1/candidates') && !/\/api\/v1\/candidates\/[^?]+/.test(url)) {
        return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 })
      }
      return jsonResponse({ error: { code: 'NOT_FOUND' } }, 404)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { wrapper, router } = await mountAt('/login')
    await wrapper.get('input[placeholder="请输入用户名"]').setValue('admin')
    await wrapper
      .get('input[placeholder="请输入密码"]')
      .setValue('correct-password')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/inbox')
    expect(wrapper.text()).toContain('候选收件箱')
    expect(wrapper.text()).toContain('还没有候选记忆')
  })

  it('登录失败时保留登录页并通过顶部 toast 显示错误', async () => {
    vi.mocked(showApiErrorToast).mockClear()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          {
            error: {
              code: 'AUTH_INVALID_CREDENTIALS',
              message: '用户名或密码错误。',
            },
          },
          401,
        ),
      ),
    )
    const { wrapper, router } = await mountAt('/login')
    await wrapper.get('input[placeholder="请输入用户名"]').setValue('admin')
    await wrapper
      .get('input[placeholder="请输入密码"]')
      .setValue('wrong-password')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/login')
    expect(wrapper.text()).toContain('登录管理端')
    expect(showApiErrorToast).toHaveBeenCalledWith('用户名或密码错误。')
  })

  it('可从收件箱进入候选详情', async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/v1/auth/me')) {
          return jsonResponse({ user: { id: 'usr_admin', username: 'admin' } })
        }
        if (url.includes('/api/v1/home')) {
          return jsonResponse({
            user: { id: 'usr_admin', username: 'admin' },
            counts: {
              pendingCandidates: 1,
              queuedDeliveries: 0,
              syncedMemories: 0,
            },
          })
        }
        if (
          url.includes('/api/v1/candidates') &&
          !/\/api\/v1\/candidates\/[^?]+/.test(url) &&
          (!init || !init.method || init.method === 'GET')
        ) {
          return jsonResponse({ items: [demoCandidate], page: 1, pageSize: 20, total: 1 })
        }
        if (url.endsWith(`/api/v1/candidates/${demoCandidate.id}`)) {
          return jsonResponse(demoCandidate)
        }
        return jsonResponse({ error: { code: 'NOT_FOUND' } }, 404)
      },
    )
    vi.stubGlobal('fetch', fetchMock)

    const { wrapper, router } = await mountAt('/inbox')
    expect(wrapper.text()).toContain('偏好使用 TypeScript')

    await wrapper.get(`a[href="/inbox/${demoCandidate.id}"]`).trigger('click')
    await router.push(`/inbox/${demoCandidate.id}`)
    await flushPromises()

    expect(router.currentRoute.value.path).toBe(`/inbox/${demoCandidate.id}`)
    expect(wrapper.text()).toContain('候选详情')
    expect(wrapper.text()).toMatch(/长期技术栈偏好使用/)
    expect(wrapper.text()).toContain('批准')
    expect(wrapper.text()).toContain('拒绝')
  })
})


