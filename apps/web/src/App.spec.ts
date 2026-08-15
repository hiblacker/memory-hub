import { VueQueryPlugin, type QueryClient } from '@tanstack/vue-query'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App.vue'
import { createQueryClient } from './query-client'
import { createAppRouter } from './router'

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
      if (url.endsWith('/api/v1/home')) {
        return jsonResponse({
          user: { id: 'usr_admin', username: 'admin' },
          counts: {
            pendingCandidates: 0,
            queuedDeliveries: 0,
            archivedMemories: 0,
          },
        })
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

  it('登录失败时保留登录页并显示错误', async () => {
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
    expect(wrapper.text()).toContain('用户名或密码错误。')
  })
})
