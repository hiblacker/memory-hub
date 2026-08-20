import { describe, expect, it } from 'vitest'

import { createMemoryStore } from './index.js'

describe('memory revision', () => {
  it('lets a synced memory be edited back to pending and approved as v2', async () => {
    const store = createMemoryStore()
    const created = await store.createCandidate({
      title: '原标题',
      body: '原正文',
      memoryType: 'decision',
      project: 'memory-hub',
    })

    const approved = await store.approveCandidate(created.id)
    expect(approved.ok).toBe(true)
    if (!approved.ok) return

    await store.markDeliverySucceeded(approved.delivery.id, {
      documentId: 'doc-1',
      blockId: 'doc-1',
      path: '/MemoryHub/手动归档/原标题',
      requestFingerprint: 'fp-1',
    })

    const synced = await store.getCandidate(created.id)
    expect(synced?.status).toBe('synced')
    expect(synced?.currentVersionId).toBe(approved.version.id)

    const revised = await store.updateCandidate(created.id, {
      title: '新标题',
      body: '新正文',
      memoryType: 'decision',
      project: 'memory-hub',
      renderStyle: 'xhs_note',
      emojiEnabled: true,
    })
    expect(revised.ok).toBe(true)
    if (!revised.ok) return
    expect(revised.candidate.status).toBe('pending')

    const second = await store.approveCandidate(created.id)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.version.versionNumber).toBe(2)
    expect(second.delivery.documentId).toBe('doc-1')
    expect(second.candidate.status).toBe('queued')
  })

  it('rejects approve when synced content has not changed', async () => {
    const store = createMemoryStore()
    const created = await store.createCandidate({
      title: '稳定标题',
      body: '稳定正文',
      memoryType: 'preference',
    })
    const approved = await store.approveCandidate(created.id)
    if (!approved.ok) throw new Error('approve failed')
    await store.markDeliverySucceeded(approved.delivery.id, {
      documentId: 'doc-2',
      blockId: 'doc-2',
      path: '/MemoryHub/手动归档/稳定标题',
      requestFingerprint: 'fp-2',
    })
    const unchanged = await store.updateCandidate(created.id, {
      title: '稳定标题',
      body: '稳定正文',
      memoryType: 'preference',
      renderStyle: 'xhs_note',
      emojiEnabled: true,
    })
    expect(unchanged.ok).toBe(true)
    if (!unchanged.ok) return
    expect(unchanged.candidate.status).toBe('synced')

    const again = await store.approveCandidate(created.id)
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.code).toBe('INVALID_STATE')
  })
})
