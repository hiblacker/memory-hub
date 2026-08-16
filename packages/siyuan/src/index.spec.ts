import { describe, expect, it, vi } from 'vitest'

import { SiyuanClient, SiyuanError } from './index.js'

describe('SiyuanClient', () => {
  it('lists notebooks with Authorization Token by default', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        code: 0,
        data: {
          notebooks: [{ id: 'nb1', name: 'Main', closed: false }],
        },
      }),
    ) as unknown as typeof fetch

    const client = new SiyuanClient({
      baseUrl: 'http://192.168.1.10:1166',
      token: 'secret-token',
      fetchImpl,
    })

    const notebooks = await client.listNotebooks()
    expect(notebooks).toEqual([{ id: 'nb1', name: 'Main', closed: false }])
    expect(fetchImpl).toHaveBeenCalledOnce()
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Token secret-token',
    )
  })

  it('maps 401 to non-retryable unauthorized', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('nope', { status: 401 }),
    ) as unknown as typeof fetch
    const client = new SiyuanClient({
      baseUrl: 'http://127.0.0.1:6806',
      token: 'x',
      fetchImpl,
      allowedHosts: ['127.0.0.1'],
    })
    await expect(client.listNotebooks()).rejects.toMatchObject({
      code: 'SIYUAN_UNAUTHORIZED',
      retryable: false,
    } satisfies Partial<SiyuanError>)
  })

  it('blocks hosts outside allow-list', () => {
    expect(
      () =>
        new SiyuanClient({
          baseUrl: 'http://evil.example:1166',
          token: 'x',
          allowedHosts: ['192.168.1.10'],
        }),
    ).toThrowError(/允许列表/)
  })

  it('treats timeouts as retryable', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const signal = (init as RequestInit).signal
      return await new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })
    }) as unknown as typeof fetch

    const client = new SiyuanClient({
      baseUrl: 'http://192.168.1.10:1166',
      token: 'x',
      timeoutMs: 20,
      fetchImpl,
    })

    await expect(client.listNotebooks()).rejects.toMatchObject({
      code: 'SIYUAN_TIMEOUT',
      retryable: true,
    })
  })
})
