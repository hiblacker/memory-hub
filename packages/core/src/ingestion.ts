import { createHash } from 'node:crypto'

import { inspectAndRedact, type Sensitivity } from '@memory-hub/security'

export type InferredMemoryType =
  | 'permanent_fact'
  | 'preference'
  | 'project_context'
  | 'decision'
  | 'temporary_state'
  | 'todo'
  | 'sensitive'

export function normalizeMemoryText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .toLowerCase()
}

export function computeContentHash(title: string, body: string): string {
  const normalized = `${normalizeMemoryText(title)}\n${normalizeMemoryText(body)}`
  return createHash('sha256').update(normalized).digest('hex')
}

export function computeCanonicalKey(input: {
  project?: string | null
  title: string
  memoryType?: string
}): string {
  const project = (input.project || 'general').trim().toLowerCase()
  const title = normalizeMemoryText(input.title).slice(0, 120)
  const type = input.memoryType || 'project_context'
  return createHash('sha256').update(`${project}|${type}|${title}`).digest('hex')
}

export function inferMemoryType(
  title: string,
  body: string,
  eventType?: string,
): InferredMemoryType {
  const sample = `${title}\n${body}\n${eventType || ''}`.toLowerCase()
  if (/(password|secret|token|credential|身份证|银行卡)/.test(sample)) {
    return 'sensitive'
  }
  if (/(todo|待办|下一步|next step|action item)/.test(sample)) return 'todo'
  if (/(决定|决策|decision|adopt|选择使用)/.test(sample)) return 'decision'
  if (/(偏好|prefer|喜欢|不喜欢)/.test(sample)) return 'preference'
  if (/(事实|always|长期|permanent)/.test(sample)) return 'permanent_fact'
  if (/(临时|temporary|今天|currently)/.test(sample)) return 'temporary_state'
  return 'project_context'
}

export function evaluateSensitivity(
  title: string,
  body: string,
): { sensitivity: Sensitivity; blockExternal: boolean; findingsCount: number } {
  const result = inspectAndRedact(`${title}\n${body}`, 'normal')
  if (result.findings.length > 0 || result.blockExternal) {
    return {
      sensitivity: 'strict',
      blockExternal: true,
      findingsCount: result.findings.length,
    }
  }
  return { sensitivity: 'normal', blockExternal: false, findingsCount: 0 }
}

/**
 * Conflict when same canonical key already has a candidate with different content hash
 * and status is synced/approved/queued/pending.
 */
export function isContentConflict(
  existingHash: string,
  incomingHash: string,
): boolean {
  return existingHash !== incomingHash
}
