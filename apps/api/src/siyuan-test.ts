import {
  loadSiyuanToken,
  resolveAuthMode,
  SiyuanClient,
  SiyuanError,
  type SiyuanAuthMode,
} from '@memory-hub/siyuan'
import type { ArchiveTargetRecord } from '@memory-hub/database'

function parseAllowedHosts(
  raw: string | null | undefined,
  baseUrl: string,
): string[] {
  if (raw && raw.trim()) {
    return raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  try {
    return [new URL(baseUrl).hostname]
  } catch {
    return []
  }
}

function modesToTry(authHeader: string): Array<{
  header: string
  mode: SiyuanAuthMode
}> {
  const primaryHeader = authHeader?.trim() || 'Authorization'
  const primary = {
    header: primaryHeader,
    mode: resolveAuthMode(primaryHeader),
  }
  const secondary =
    primary.mode === 'authorization_token'
      ? { header: 'X-Auth-Token', mode: 'x_auth_token' as const }
      : { header: 'Authorization', mode: 'authorization_token' as const }
  return [primary, secondary]
}

export async function runSiyuanConnectionTest(target: ArchiveTargetRecord): Promise<{
  ok: boolean
  message: string
  notebookId?: string
  notebookName?: string | null
  notebookCount?: number
  authHeader?: string
}> {
  let token: string
  try {
    token = loadSiyuanToken(process.env)
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : '未配置 SIYUAN_TOKEN / SIYUAN_TOKEN_FILE。',
    }
  }

  const hosts = parseAllowedHosts(target.allowedHosts, target.baseUrl)
  const attempts = modesToTry(target.authHeader)
  const errors: string[] = []

  for (const attempt of attempts) {
    try {
      const client = new SiyuanClient({
        baseUrl: target.baseUrl,
        token,
        authMode: attempt.mode,
        allowedHosts: hosts,
        timeoutMs: 12_000,
      })
      const notebooks = await client.listNotebooks()
      const selected =
        notebooks.find((item) => item.id === target.notebookId) ?? notebooks[0]
      if (!selected) {
        return {
          ok: false,
          message: '连接成功，但未发现可用笔记本。请先在思源中创建笔记本。',
          notebookCount: 0,
          authHeader: attempt.header,
        }
      }
      const modeLabel =
        attempt.mode === 'authorization_token'
          ? 'Authorization: Token'
          : 'X-Auth-Token'
      return {
        ok: true,
        message: `连接成功（${modeLabel}），共 ${notebooks.length} 个笔记本。已选择「${selected.name}」。`,
        notebookId: selected.id,
        notebookName: selected.name,
        notebookCount: notebooks.length,
        authHeader: attempt.header,
      }
    } catch (error) {
      if (error instanceof SiyuanError) {
        errors.push(`${attempt.header}: ${error.message}`)
        // try fallback on unauthorized only
        if (error.code !== 'SIYUAN_UNAUTHORIZED') {
          return {
            ok: false,
            message: `${error.message}（${error.code}）`,
          }
        }
        continue
      }
      return {
        ok: false,
        message: error instanceof Error ? error.message : '思源连接测试失败。',
      }
    }
  }

  return {
    ok: false,
    message: `思源鉴权失败。已尝试 X-Auth-Token 与 Authorization: Token。${errors.join('；')}`,
  }
}
