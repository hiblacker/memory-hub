import {
  loadSiyuanToken,
  resolveAuthMode,
  SiyuanClient,
  SiyuanError,
  type SiyuanAuthMode,
  type SiyuanNotebook,
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

function availableNotebookSummary(notebooks: SiyuanNotebook[]): string {
  if (notebooks.length === 0) return '（无）'
  return notebooks.map((item) => item.name).join('、')
}

/**
 * Resolve notebook preference without silently overwriting user intent.
 * Priority:
 * 1) exact notebookName match when name is provided
 * 2) notebookId match when id is provided
 * 3) first notebook only when neither name nor id is configured
 */
export function resolveNotebookSelection(
  notebooks: SiyuanNotebook[],
  target: Pick<ArchiveTargetRecord, 'notebookId' | 'notebookName'>,
):
  | { ok: true; notebook: SiyuanNotebook; source: 'name' | 'id' | 'auto' }
  | { ok: false; message: string } {
  const wantedName = target.notebookName?.trim() || ''
  const wantedId = target.notebookId?.trim() || ''

  if (wantedName) {
    const byName = notebooks.find((item) => item.name === wantedName)
    if (byName) {
      return { ok: true, notebook: byName, source: 'name' }
    }
    return {
      ok: false,
      message: `连接成功，但未找到笔记本「${wantedName}」。可用笔记本：${availableNotebookSummary(notebooks)}。请先在思源中创建，或改成已有名称后再测试。`,
    }
  }

  if (wantedId) {
    const byId = notebooks.find((item) => item.id === wantedId)
    if (byId) {
      return { ok: true, notebook: byId, source: 'id' }
    }
    return {
      ok: false,
      message: `连接成功，但笔记本 ID 不存在：${wantedId}。可用笔记本：${availableNotebookSummary(notebooks)}。`,
    }
  }

  const first = notebooks[0]
  if (!first) {
    return {
      ok: false,
      message: '连接成功，但未发现可用笔记本。请先在思源中创建笔记本。',
    }
  }
  return { ok: true, notebook: first, source: 'auto' }
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
      const selected = resolveNotebookSelection(notebooks, target)
      if (!selected.ok) {
        return {
          ok: false,
          message: selected.message,
          notebookCount: notebooks.length,
          authHeader: attempt.header,
        }
      }

      const modeLabel =
        attempt.mode === 'authorization_token'
          ? 'Authorization: Token'
          : 'X-Auth-Token'
      const sourceLabel =
        selected.source === 'name'
          ? '按名称匹配'
          : selected.source === 'id'
            ? '按 ID 匹配'
            : '自动选择首个'
      return {
        ok: true,
        message: `连接成功（${modeLabel}，${sourceLabel}），共 ${notebooks.length} 个笔记本。当前笔记本「${selected.notebook.name}」。`,
        notebookId: selected.notebook.id,
        notebookName: selected.notebook.name,
        notebookCount: notebooks.length,
        authHeader: attempt.header,
      }
    } catch (error) {
      if (error instanceof SiyuanError) {
        errors.push(`${attempt.header}: ${error.message}`)
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
