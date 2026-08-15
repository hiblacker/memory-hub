import { describe, expect, it } from 'vitest'
import { createInMemoryAuthStore } from '@memory-hub/database'
import { processArchiveDelivery } from './runtime.js'

describe('processArchiveDelivery', () => {
  it('marks blocked when body contains secrets', async () => {
    const store = createInMemoryAuthStore('hash')
    const candidate = await store.createCandidate({
      title: '密钥泄露',
      body: 'api_key=sk_live_1234567890abcdef',
      memoryType: 'sensitive',
    })
    const approved = await store.approveCandidate(candidate.id)
    expect(approved.ok).toBe(true)
    if (!approved.ok) return

    await processArchiveDelivery(store as never, approved.delivery.id)
    const delivery = await store.getDelivery(approved.delivery.id)
    expect(delivery?.status).toBe('blocked')
  })
})
