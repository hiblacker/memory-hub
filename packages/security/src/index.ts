export type Sensitivity = 'normal' | 'private' | 'strict'

export interface Finding {
  type:
    | 'password'
    | 'api_key'
    | 'private_key'
    | 'bearer_token'
    | 'connection_string'
    | 'credit_card'
    | 'identity_document'
  message: string
  /** Inclusive start index in original text when available */
  start?: number
  end?: number
}

export interface RedactionResult {
  ok: boolean
  findings: Finding[]
  /** Text with secrets replaced by placeholders; only used when ok or for audit summaries */
  redactedText: string
  /** True when content is too sensitive to send to models or SiYuan without human override */
  blockExternal: boolean
}

const patterns: Array<{
  type: Finding['type']
  message: string
  regex: RegExp
  blockExternal: boolean
}> = [
  {
    type: 'private_key',
    message: '检测到私钥材料',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    blockExternal: true,
  },
  {
    type: 'password',
    message: '检测到疑似密码赋值',
    regex: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"\n]{6,}['"]/gi,
    blockExternal: true,
  },
  {
    type: 'api_key',
    message: '检测到疑似 API Key',
    regex: /(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}['"]?/gi,
    blockExternal: true,
  },
  {
    type: 'bearer_token',
    message: '检测到 Bearer Token',
    regex: /Bearer\s+[A-Za-z0-9\-._~+\/]+=*/g,
    blockExternal: true,
  },
  {
    type: 'connection_string',
    message: '检测到数据库连接串',
    regex: /(?:postgres|mysql|mongodb|redis):\/\/[^\s'"]+/gi,
    blockExternal: true,
  },
  {
    type: 'credit_card',
    message: '检测到疑似银行卡号',
    regex: /\b(?:\d[ -]*?){13,19}\b/g,
    blockExternal: true,
  },
]

function mask(match: string): string {
  if (match.length <= 8) return '[REDACTED]'
  return `${match.slice(0, 2)}…[REDACTED]…${match.slice(-2)}`
}

/**
 * Detect secrets and produce a redacted copy.
 * Strict sensitivity always blocks external delivery even without pattern hits
 * when the caller marks content as strict.
 */
export function inspectAndRedact(
  text: string,
  sensitivity: Sensitivity = 'normal',
): RedactionResult {
  const findings: Finding[] = []
  let redactedText = text
  let blockExternal = sensitivity === 'strict'

  for (const pattern of patterns) {
    const matches = text.match(pattern.regex)
    if (!matches) continue
    for (const match of matches) {
      findings.push({ type: pattern.type, message: pattern.message })
      if (pattern.blockExternal) blockExternal = true
      redactedText = redactedText.replaceAll(match, mask(match))
    }
  }

  // private: allow archive after redaction only when no blocking findings remain unredacted
  // Any finding blocks automatic external send; human may still force later (V1: block).
  if (findings.length > 0) {
    blockExternal = true
  }

  return {
    ok: findings.length === 0 && !blockExternal,
    findings,
    redactedText,
    blockExternal,
  }
}

export function summarizeFindings(findings: Finding[]): string {
  if (findings.length === 0) return ''
  const types = [...new Set(findings.map((item) => item.type))]
  return `敏感内容检测命中：${types.join(', ')}`
}
