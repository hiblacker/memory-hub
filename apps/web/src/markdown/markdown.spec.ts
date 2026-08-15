import { describe, expect, it } from 'vitest'

import { renderMarkdownPreview } from './render'
import { stripMarkdown } from './strip'
import { buildMemoryTemplate } from './templates'

describe('markdown helpers', () => {
  it('strips markdown markers for list summaries', () => {
    expect(
      stripMarkdown('## 📌 关键点\n\n**长期**偏好使用 TypeScript'),
    ).toContain('长期偏好使用 TypeScript')
    expect(stripMarkdown('## 📌 关键点')).not.toContain('##')
  })

  it('sanitizes script tags in preview', () => {
    const result = renderMarkdownPreview(
      'hello <script>alert(1)</script> [x](javascript:alert(1))',
    )
    expect(result.html).not.toContain('<script>')
    expect(result.html.toLowerCase()).not.toContain('javascript:')
  })

  it('flags unsupported image markdown', () => {
    const result = renderMarkdownPreview('text ![cover](https://example.com/a.png)')
    expect(result.hasUnsupportedImages).toBe(true)
    expect(result.html).not.toContain('<img')
  })

  it('builds templates with emoji for both styles', () => {
    const xhs = buildMemoryTemplate({
      title: '偏好 TypeScript',
      memoryType: 'preference',
      renderStyle: 'xhs_note',
      emojiEnabled: true,
    })
    const tech = buildMemoryTemplate({
      title: '偏好 TypeScript',
      memoryType: 'preference',
      renderStyle: 'tech_clean',
      emojiEnabled: true,
    })
    expect(xhs).toContain('🌟')
    expect(tech).toContain('🧩')
  })
})
