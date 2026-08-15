import { describe, expect, it } from 'vitest'

import { inspectAndRedact } from './index.js'

describe('inspectAndRedact', () => {
  it('passes clean text', () => {
    const result = inspectAndRedact('普通项目决策：使用 PostgreSQL。')
    expect(result.ok).toBe(true)
    expect(result.blockExternal).toBe(false)
    expect(result.findings).toHaveLength(0)
  })

  it('blocks api keys and redacts them', () => {
    const result = inspectAndRedact('api_key=sk_live_1234567890abcdef')
    expect(result.ok).toBe(false)
    expect(result.blockExternal).toBe(true)
    expect(result.findings.some((item) => item.type === 'api_key')).toBe(true)
    expect(result.redactedText).toContain('[REDACTED]')
  })

  it('blocks strict sensitivity even without patterns', () => {
    const result = inspectAndRedact('纯文本', 'strict')
    expect(result.blockExternal).toBe(true)
    expect(result.ok).toBe(false)
  })
})
