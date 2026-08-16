import { createHash } from 'node:crypto'

import { inspectAndRedact, type Sensitivity } from '@memory-hub/security'
import type { SiyuanClient } from '@memory-hub/siyuan'
import { SiyuanError } from '@memory-hub/siyuan'

export type MemoryType =
  | 'permanent_fact'
  | 'preference'
  | 'project_context'
  | 'decision'
  | 'temporary_state'
  | 'todo'
  | 'sensitive'

export type RenderStyle = 'xhs_note' | 'tech_clean'

export interface ArchiveMemoryInput {
  memoryId: string
  versionId: string
  versionNumber: number
  title: string
  body: string
  memoryType: MemoryType
  source: string
  project: string | null
  sensitivity: Sensitivity
  confidence: number
  renderStyle: RenderStyle
  emojiEnabled: boolean
  captureTime: Date
  hubPublicUrl?: string
}

export interface ArchiveTargetConfig {
  notebookId: string
  pathTemplate: string
  /** Document id previously created for this path, if any */
  documentId?: string | null
}

export interface ArchiveExecutionResult {
  documentId: string
  blockId: string | null
  requestFingerprint: string
  path: string
  markdown: string
}

const typeLabels: Record<MemoryType, string> = {
  permanent_fact: '长期事实',
  preference: '偏好',
  project_context: '项目上下文',
  decision: '决策',
  temporary_state: '临时状态',
  todo: '待办',
  sensitive: '敏感',
}

const typeEmoji: Record<MemoryType, string> = {
  permanent_fact: '📌',
  preference: '✨',
  project_context: '🧩',
  decision: '🧭',
  temporary_state: '⏳',
  todo: '✅',
  sensitive: '🛡️',
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function renderArchivePath(
  template: string,
  input: Pick<ArchiveMemoryInput, 'memoryType' | 'project' | 'captureTime'>,
): string {
  const capture = input.captureTime
  const project = (input.project || 'general').replace(/[\\/:*?"<>|]/g, '-').trim()
  return template
    .replaceAll('{yyyy}', String(capture.getUTCFullYear()))
    .replaceAll('{MM}', pad(capture.getUTCMonth() + 1))
    .replaceAll('{dd}', pad(capture.getUTCDate()))
    .replaceAll('{type}', input.memoryType)
    .replaceAll('{project}', project)
}

export function renderArchiveMarkdown(input: ArchiveMemoryInput): string {
  const emoji = input.emojiEnabled ? `${typeEmoji[input.memoryType]} ` : ''
  const heading =
    input.renderStyle === 'tech_clean'
      ? `# ${emoji}${input.title}`
      : `# ${emoji}${input.title}`

  const metaLines = [
    `- 类型：${typeLabels[input.memoryType]} (\`${input.memoryType}\`)`,
    `- 来源：${input.source}`,
    `- 项目：${input.project || '—'}`,
    `- 置信度：${input.confidence}%`,
    `- 敏感级别：${input.sensitivity}`,
    `- 捕获时间：${input.captureTime.toISOString()}`,
    `- MemoryHub ID：\`${input.memoryId}\``,
    `- 版本：\`v${input.versionNumber}\` (\`${input.versionId}\`)`,
  ]
  if (input.hubPublicUrl) {
    metaLines.push(`- 回链：${input.hubPublicUrl.replace(/\/$/, '')}/inbox/${input.memoryId}`)
  }

  const divider = input.renderStyle === 'xhs_note' ? '\n\n---\n\n' : '\n\n'
  const bodyTitle = input.emojiEnabled ? '## 📝 正文' : '## 正文'
  const metaTitle = input.emojiEnabled ? '## 🏷️ 元数据' : '## 元数据'

  return [
    heading,
    '',
    metaTitle,
    ...metaLines,
    divider.trimEnd(),
    bodyTitle,
    '',
    input.body.trim(),
    '',
  ].join('\n')
}

export function fingerprintContent(markdown: string): string {
  return createHash('sha256').update(markdown).digest('hex')
}

export function assertArchivable(
  input: Pick<ArchiveMemoryInput, 'body' | 'title' | 'sensitivity'>,
): void {
  const combined = `${input.title}\n${input.body}`
  const inspection = inspectAndRedact(combined, input.sensitivity)
  if (inspection.blockExternal) {
    const detail = inspection.findings.map((item) => item.message).join('；')
    throw new Error(
      detail
        ? `内容未通过脱敏门禁，禁止外发归档：${detail}`
        : '内容未通过脱敏门禁，禁止外发归档。',
    )
  }
}

/**
 * Idempotent archive: if documentId known, append block; else create doc with markdown.
 * Caller must persist returned identifiers and skip when delivery already succeeded.
 */
export async function executeSiyuanArchive(
  client: SiyuanClient,
  input: ArchiveMemoryInput,
  target: ArchiveTargetConfig,
): Promise<ArchiveExecutionResult> {
  assertArchivable(input)
  const path = renderArchivePath(target.pathTemplate, input)
  const markdown = renderArchiveMarkdown(input)
  const requestFingerprint = fingerprintContent(markdown)

  if (target.documentId) {
    const append = await client.appendBlock({
      parentID: target.documentId,
      data: markdown,
      dataType: 'markdown',
    })
    const blockId =
      append.id ||
      append.doOperations?.find((item) => item.id)?.id ||
      null
    return {
      documentId: target.documentId,
      blockId,
      requestFingerprint,
      path,
      markdown,
    }
  }

  try {
    const created = await client.createDocWithMd({
      notebook: target.notebookId,
      path,
      markdown,
    })
    return {
      documentId: created.id,
      blockId: created.id,
      requestFingerprint,
      path,
      markdown,
    }
  } catch (error) {
    // If create fails because path exists, surface retryable conflict for operator
    if (error instanceof SiyuanError) throw error
    throw error
  }
}

export * from './ingestion.js'

