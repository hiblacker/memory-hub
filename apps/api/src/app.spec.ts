import { createInMemoryAuthStore } from '@memory-hub/database'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from './app.js'
import { hashPassword } from './auth.js'

let app: ReturnType<typeof buildApp>

beforeAll(async () => {
  const store = createInMemoryAuthStore(await hashPassword('correct-password'))
  app = buildApp({ authStore: store })
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

describe('MemoryHub API', () => {
  it('返回运行阶段健康状态', async () => {
    const response = await app.inject({ method: 'GET', url: '/healthz' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      status: 'ok',
      phase: 'runtime',
      service: 'memory-hub-api',
    })
  })

  it('数据库可用时返回就绪状态', async () => {
    const response = await app.inject({ method: 'GET', url: '/readyz' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      status: 'ready',
      service: 'memory-hub-api',
      database: 'available',
    })
  })

  it('拒绝错误凭据', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'admin', password: 'wrong-password' },
    })
    expect(response.statusCode).toBe(401)
    expect(response.json().error.code).toBe('AUTH_INVALID_CREDENTIALS')
  })

  it('登录后可以读取首页并退出', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'admin', password: 'correct-password' },
    })
    expect(login.statusCode).toBe(200)
    const cookie = login.cookies.find(
      (item) => item.name === 'memoryhub_session',
    )
    expect(cookie?.httpOnly).toBe(true)

    const home = await app.inject({
      method: 'GET',
      url: '/api/v1/home',
      cookies: { memoryhub_session: cookie?.value ?? '' },
    })
    expect(home.statusCode).toBe(200)
    expect(home.json()).toEqual({
      user: { id: 'usr_local_admin', username: 'admin' },
      counts: {
        pendingCandidates: 0,
        queuedDeliveries: 0,
        archivedMemories: 0,
      },
    })

    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: { memoryhub_session: cookie?.value ?? '' },
    })
    expect(logout.statusCode).toBe(204)
  })

  it('未登录时拒绝首页请求', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/home' })
    expect(response.statusCode).toBe(401)
    expect(response.json().error.code).toBe('AUTH_UNAUTHORIZED')
  })
})
