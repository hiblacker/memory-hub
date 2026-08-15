import { describe, expect, it, vi } from 'vitest'

import {
  assertArchivable,
  executeSiyuanArchive,
  renderArchiveMarkdown,
  renderArchivePath,
} from './index.js'

const sample = {
  memoryId: 'mem-1',
  versionId: 'ver-1',
  versionNumber: 1,
  title: '采用 PostgreSQL',
  body: '## 决策\n\n使用 PostgreSQL 作为唯一事实源。',
  memoryType: 'decision' as const,
  source: 'manual',
  project: 'memory-hub',
  sensitivity: 'normal' as const,
  confidence: 95,
  renderStyle: 'xhs_note' as const,
  emojiEnabled: true,
  captureTime: new Date('2026-08-16T00:00:00.000Z'),
  hubPublicUrl: 'http://localhost:8788',
}

describe('archive rendering', () => {
  it('renders path templates', () => {
    expect(
      renderArchivePath('/MemoryHub/20 项目/{project}/决策', sample),
    ).toBe('/MemoryHub/20 项目/memory-hub/决策')
  })

  it('includes metadata and body', () => {
    const md = renderArchiveMarkdown(sample)
    expect(md).toContain('采用 PostgreSQL')
    expect(md).toContain('mem-1')
    expect(md).toContain('使用 PostgreSQL')
  })

  it('blocks secret content', () => {
    expect(() =>
      assertArchivable({
        title: '密钥',
        body: 'api_key=sk_live_1234567890abcdef',
        sensitivity: 'normal',
      }),
    ).toThrow(/脱敏门禁/)
  })
})

describe('executeSiyuanArchive', () => {
  it('creates a document when none exists', async () => {
    const client = {
      createDocWithMd: vi.fn(async () => ({ id: 'doc-1' })),
      appendBlock: vi.fn(),
    }
    const result = await executeSiyuanArchive(
      client as never,
      sample,
      {
        notebookId: 'nb',
        pathTemplate: '/MemoryHub/10 长期记忆/{type}',
      },
    )
    expect(result.documentId).toBe('doc-1')
    expect(client.createDocWithMd).toHaveBeenCalledOnce()
  })

  it('appends when document exists', async () => {
    const client = {
      createDocWithMd: vi.fn(),
      appendBlock: vi.fn(async () => ({ id: 'block-9' })),
    }
    const result = await executeSiyuanArchive(
      client as never,
      sample,
      {
        notebookId: 'nb',
        pathTemplate: '/MemoryHub/10 长期记忆/{type}',
        documentId: 'doc-existing',
      },
    )
    expect(result.documentId).toBe('doc-existing')
    expect(result.blockId).toBe('block-9')
    expect(client.appendBlock).toHaveBeenCalledOnce()
  })
})
