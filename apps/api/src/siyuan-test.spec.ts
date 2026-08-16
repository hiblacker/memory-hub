import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  resolveNotebookSelection,
  runSiyuanConnectionTest,
} from './siyuan-test.js'

const baseTarget = {
  id: 'default-siyuan-target',
  name: '默认思源目标',
  enabled: true,
  baseUrl: 'http://192.168.1.10:1166',
  authHeader: 'Authorization',
  notebookId: null as string | null,
  notebookName: null as string | null,
  pathTemplate: '/MemoryHub/长期记忆/{type}',
  allowedHosts: '192.168.1.10,127.0.0.1,localhost',
  lastTestStatus: null,
  lastTestMessage: null,
  lastTestedAt: null,
  updatedAt: new Date(),
}

const notebooks = [
  { id: 'nb-work', name: 'WorkSpace', closed: false },
  { id: 'nb-hub', name: 'MemoryHub', closed: false },
  { id: 'nb-memo', name: '备忘', closed: false },
]

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('resolveNotebookSelection', () => {
  it('matches notebook by name before id', () => {
    const result = resolveNotebookSelection(notebooks, {
      notebookId: 'nb-work',
      notebookName: 'MemoryHub',
    })
    expect(result).toEqual({
      ok: true,
      notebook: notebooks[1],
      source: 'name',
    })
  })

  it('does not fall back to first notebook when name is missing', () => {
    const result = resolveNotebookSelection(notebooks, {
      notebookId: null,
      notebookName: '不存在',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toMatch(/未找到笔记本「不存在」/)
      expect(result.message).toMatch(/MemoryHub/)
    }
  })

  it('auto-selects first notebook only when both empty', () => {
    const result = resolveNotebookSelection(notebooks, {
      notebookId: null,
      notebookName: null,
    })
    expect(result).toEqual({
      ok: true,
      notebook: notebooks[0],
      source: 'auto',
    })
  })
})

describe('runSiyuanConnectionTest', () => {
  it('returns missing-token error without SIYUAN_TOKEN', async () => {
    vi.stubEnv('SIYUAN_TOKEN', '')
    vi.stubEnv('SIYUAN_TOKEN_FILE', '')
    delete process.env.SIYUAN_TOKEN
    delete process.env.SIYUAN_TOKEN_FILE

    const result = await runSiyuanConnectionTest(baseTarget)
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/SIYUAN_TOKEN/)
  })

  it('succeeds with Authorization and auto-selects first notebook', async () => {
    vi.stubEnv('SIYUAN_TOKEN', 'demo-token-1234')
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe('Token demo-token-1234')
      return Response.json({
        code: 0,
        data: {
          notebooks: [
            { id: 'nb-work', name: 'WorkSpace', closed: false },
            { id: 'nb-memo', name: '备忘', closed: false },
          ],
        },
      })
    })
    vi.stubGlobal('fetch', fetchImpl)

    const result = await runSiyuanConnectionTest(baseTarget)
    expect(result.ok).toBe(true)
    expect(result.notebookId).toBe('nb-work')
    expect(result.notebookName).toBe('WorkSpace')
    expect(result.authHeader).toBe('Authorization')
    expect(result.message).toMatch(/连接成功/)
  })

  it('keeps requested notebook name instead of first notebook', async () => {
    vi.stubEnv('SIYUAN_TOKEN', 'demo-token-1234')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          code: 0,
          data: { notebooks },
        }),
      ),
    )

    const result = await runSiyuanConnectionTest({
      ...baseTarget,
      notebookId: 'nb-work',
      notebookName: 'MemoryHub',
    })
    expect(result.ok).toBe(true)
    expect(result.notebookId).toBe('nb-hub')
    expect(result.notebookName).toBe('MemoryHub')
    expect(result.message).toMatch(/按名称匹配/)
  })

  it('falls back from X-Auth-Token to Authorization after 401', async () => {
    vi.stubEnv('SIYUAN_TOKEN', 'demo-token-1234')
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      if (headers.get('X-Auth-Token')) {
        return new Response('unauthorized', { status: 401 })
      }
      if (headers.get('Authorization') === 'Token demo-token-1234') {
        return Response.json({
          code: 0,
          data: {
            notebooks: [{ id: 'nb1', name: 'Main', closed: false }],
          },
        })
      }
      return new Response('bad', { status: 500 })
    })
    vi.stubGlobal('fetch', fetchImpl)

    const result = await runSiyuanConnectionTest({
      ...baseTarget,
      authHeader: 'X-Auth-Token',
    })
    expect(result.ok).toBe(true)
    expect(result.authHeader).toBe('Authorization')
    expect(result.notebookName).toBe('Main')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
