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

async function loginCookie() {
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: 'admin', password: 'correct-password' },
  })
  const cookie = login.cookies.find((item) => item.name === 'memoryhub_session')
  return cookie?.value ?? ''
}

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

  it('登录后可读取首页并退出', async () => {
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

  it('创建手动候选后可在列表和首页统计中看到', async () => {
    const cookie = await loginCookie()
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/candidates',
      cookies: { memoryhub_session: cookie },
      payload: {
        title: '偏好使用 TypeScript',
        body: '长期技术栈偏好使用 TypeScript 与 Vue 3。',
        memoryType: 'preference',
        project: 'memory-hub',
      },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({
      title: '偏好使用 TypeScript',
      memoryType: 'preference',
      source: 'manual',
      status: 'pending',
      project: 'memory-hub',
      confidence: 100,
      rejectionReason: null,
    })

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/candidates',
      cookies: { memoryhub_session: cookie },
    })
    expect(list.statusCode).toBe(200)
    expect(list.json().items.length).toBeGreaterThanOrEqual(1)
    expect(
      list.json().items.some(
        (item: { title: string }) => item.title === '偏好使用 TypeScript',
      ),
    ).toBe(true)

    const home = await app.inject({
      method: 'GET',
      url: '/api/v1/home',
      cookies: { memoryhub_session: cookie },
    })
    expect(home.json().counts.pendingCandidates).toBeGreaterThanOrEqual(1)
  })

  it('可读取候选详情并保存草稿、批准与拒绝', async () => {
    const cookie = await loginCookie()
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/candidates',
      cookies: { memoryhub_session: cookie },
      payload: {
        title: '原始标题',
        body: '原始正文',
        memoryType: 'decision',
        project: 'memory-hub',
      },
    })
    const candidateId = created.json().id as string

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/candidates/${candidateId}`,
      cookies: { memoryhub_session: cookie },
    })
    expect(detail.statusCode).toBe(200)
    expect(detail.json()).toMatchObject({
      id: candidateId,
      title: '原始标题',
      status: 'pending',
    })

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/candidates/${candidateId}`,
      cookies: { memoryhub_session: cookie },
      payload: {
        title: '修订标题',
        body: '修订后的正文',
        memoryType: 'decision',
        project: 'memory-hub',
      },
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.json()).toMatchObject({
      title: '修订标题',
      body: '修订后的正文',
      status: 'pending',
    })

    const approved = await app.inject({
      method: 'POST',
      url: `/api/v1/candidates/${candidateId}/approve`,
      cookies: { memoryhub_session: cookie },
    })
    expect(approved.statusCode).toBe(200)
    expect(approved.json().status).toBe('approved')

    const rejectCreated = await app.inject({
      method: 'POST',
      url: '/api/v1/candidates',
      cookies: { memoryhub_session: cookie },
      payload: {
        title: '应被拒绝',
        body: '不需要保留的内容',
        memoryType: 'temporary_state',
      },
    })
    const rejectId = rejectCreated.json().id as string
    const rejected = await app.inject({
      method: 'POST',
      url: `/api/v1/candidates/${rejectId}/reject`,
      cookies: { memoryhub_session: cookie },
      payload: { reason: '内容过时' },
    })
    expect(rejected.statusCode).toBe(200)
    expect(rejected.json()).toMatchObject({
      status: 'rejected',
      rejectionReason: '内容过时',
    })

    const illegal = await app.inject({
      method: 'POST',
      url: `/api/v1/candidates/${candidateId}/approve`,
      cookies: { memoryhub_session: cookie },
    })
    expect(illegal.statusCode).toBe(409)
    expect(illegal.json().error.code).toBe('CANDIDATE_INVALID_STATE')
  })

  it('查询不存在的候选返回 404', async () => {
    const cookie = await loginCookie()
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/candidates/cand_missing',
      cookies: { memoryhub_session: cookie },
    })
    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('CANDIDATE_NOT_FOUND')
  })

  it('拒绝无效的候选输入', async () => {
    const cookie = await loginCookie()
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/candidates',
      cookies: { memoryhub_session: cookie },
      payload: {
        title: '',
        body: '',
        memoryType: 'unknown',
      },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('VALIDATION_ERROR')
  })
})
