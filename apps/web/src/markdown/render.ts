import DOMPurify from 'dompurify'
import { marked } from 'marked'

import { hasUnsupportedImageMarkdown } from './strip'

marked.setOptions({
  gfm: true,
  breaks: true,
})

function neutralizeUnsafeHtml(raw: string): string {
  return raw
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
}

export function renderMarkdownPreview(source: string): {
  html: string
  hasUnsupportedImages: boolean
} {
  const hasUnsupportedImages = hasUnsupportedImageMarkdown(source)
  const withoutImages = source.replace(/!\[[^\]]*]\([^)]*\)/g, '')
  const raw = marked.parse(withoutImages, { async: false }) as string
  const neutralized = neutralizeUnsafeHtml(raw)
  const html = DOMPurify.sanitize(neutralized, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      'style',
      'script',
      'iframe',
      'object',
      'embed',
      'form',
      'input',
    ],
    FORBID_ATTR: ['style', 'onerror', 'onclick', 'onload'],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  })
  return { html, hasUnsupportedImages }
}
