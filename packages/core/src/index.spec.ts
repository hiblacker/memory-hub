import { describe, expect, it, vi } from 'vitest'

import {
  assertArchivable,
  executeSiyuanArchive,
  renderArchiveMarkdown,
  renderArchivePath,
  resolveArchiveGroup,
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

describe('resolveArchiveGroup', () => {
  it('maps manual to 手动归档', () => {
    expect(resolveArchiveGroup('manual')).toBe('手动归档')
  })
  it('maps claude_code to 对话保存', () => {
    expect(resolveArchiveGroup('claude_code')).toBe('对话保存')
  })
  it('defaults unknown sources to 长期记忆', () => {
    expect(resolveArchiveGroup('rest')).toBe('长期记忆')
    expect(resolveArchiveGroup('unknown')).toBe('长期记忆')
  })
})

describe('archive rendering', () => {
  it('renders path templates with title and group', () => {
    expect(
      renderArchivePath('/MemoryHub/20 项目/{project}/决策', sample),
    ).toBe('/MemoryHub/20 项目/memory-hub/决策')
    expect(
      renderArchivePath('/MemoryHub/{group}/{title}', sample),
    ).toBe('/MemoryHub/手动归档/采用 PostgreSQL')
    expect(
      renderArchivePath('/MemoryHub/{group}/{type}/{title}', {
        ...sample,
        source: 'claude_code',
      }),
    ).toBe('/MemoryHub/对话保存/decision/采用 PostgreSQL')
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
      renameDocById: vi.fn(),
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

  it('updates existing document instead of appending', async () => {
    const client = {
      createDocWithMd: vi.fn(),
      appendBlock: vi.fn(),
      getDocExists: vi.fn(async () => true),
      updateBlock: vi.fn(async () => ({ id: 'doc-existing' })),
      renameDoc: vi.fn(),
      renameDocById: vi.fn(),
    }
    const result = await executeSiyuanArchive(
      client as never,
      sample,
      {
        notebookId: 'nb',
        pathTemplate: '/MemoryHub/{group}/{title}',
        documentId: 'doc-existing',
        previousPath: '/MemoryHub/手动归档/旧标题',
      },
    )
    expect(result.documentId).toBe('doc-existing')
    expect(client.updateBlock).toHaveBeenCalledOnce()
    expect(client.appendBlock).not.toHaveBeenCalled()
    expect(client.createDocWithMd).not.toHaveBeenCalled()
    expect(client.renameDocById).toHaveBeenCalledWith({
      id: 'doc-existing',
      title: '采用 PostgreSQL',
    })
  })

  it('recreates the document when SiYuan reports tree not found', async () => {
    const client = {
      createDocWithMd: vi.fn(async () => ({ id: 'doc-rebuilt' })),
      getDocExists: vi.fn(async () => {
        throw new Error('get block failed: tree not found')
      }),
      updateBlock: vi.fn(),
    }
    const result = await executeSiyuanArchive(
      client as never,
      sample,
      {
        notebookId: 'nb',
        pathTemplate: '/MemoryHub/{group}/{title}',
        documentId: '20260816224015-2jb0ga2',
      },
    )
    expect(result.documentId).toBe('doc-rebuilt')
    expect(client.createDocWithMd).toHaveBeenCalledOnce()
    expect(client.updateBlock).not.toHaveBeenCalled()
  })

  it('recreates the document when the previous id is missing', async () => {
    const client = {
      createDocWithMd: vi.fn(async () => ({ id: 'doc-new' })),
      getDocExists: vi.fn(async () => false),
      updateBlock: vi.fn(),
    }
    const result = await executeSiyuanArchive(
      client as never,
      sample,
      {
        notebookId: 'nb',
        pathTemplate: '/MemoryHub/{group}/{title}',
        documentId: 'doc-missing',
      },
    )
    expect(result.documentId).toBe('doc-new')
    expect(client.createDocWithMd).toHaveBeenCalledOnce()
    expect(client.updateBlock).not.toHaveBeenCalled()
  })
})
