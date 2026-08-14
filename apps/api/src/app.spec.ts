import { afterAll, describe, expect, it } from 'vitest'

import { buildApp } from './app.js'

const app = buildApp()

afterAll(async () => {
  await app.close()
})

describe('GET /healthz', () => {
  it('返回设计阶段健康状态', async () => {
    const response = await app.inject({ method: 'GET', url: '/healthz' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      status: 'ok',
      phase: 'design',
      service: 'memory-hub-api',
    })
  })
})
