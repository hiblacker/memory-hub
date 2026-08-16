import { describe, expect, it } from 'vitest'

import {
  computeCanonicalKey,
  computeContentHash,
  inferMemoryType,
  isContentConflict,
  normalizeMemoryText,
} from './ingestion.js'

describe('ingestion helpers', () => {
  it('normalizes and hashes stably', () => {
    const a = computeContentHash('Title', 'Body  \n\n\ntext')
    const b = computeContentHash('title', 'body\n\ntext')
    expect(a).toBe(b)
    expect(normalizeMemoryText('A  \n\n\nB')).toBe('a\n\nb')
  })

  it('infers decision type', () => {
    expect(inferMemoryType('技术决策', '我们决定使用 PostgreSQL', 'session_summary')).toBe(
      'decision',
    )
  })

  it('detects content conflicts', () => {
    expect(isContentConflict('aaa', 'bbb')).toBe(true)
    expect(isContentConflict('aaa', 'aaa')).toBe(false)
  })

  it('canonical key is project scoped', () => {
    const left = computeCanonicalKey({ project: 'memory-hub', title: '决策' })
    const right = computeCanonicalKey({ project: 'other', title: '决策' })
    expect(left).not.toBe(right)
  })
})
