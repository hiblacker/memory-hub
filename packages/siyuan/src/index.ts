import { readFileSync } from 'node:fs'

export type SiyuanAuthMode = 'x_auth_token' | 'authorization_token'

export interface SiyuanClientOptions {
  baseUrl: string
  token: string
  authMode?: SiyuanAuthMode
  timeoutMs?: number
  fetchImpl?: typeof fetch
  /**
   * Explicit network allow-list for SSRF protection.
   * Hostnames or IPv4 addresses. Defaults to the host of baseUrl only.
   */
  allowedHosts?: string[]
}

export interface SiyuanNotebook {
  id: string
  name: string
  closed: boolean
}

export interface CreateDocResult {
  id: string
}

export interface BlockMutationResult {
  id?: string
  doOperations?: Array<{ id?: string }>
}

export class SiyuanError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message)
    this.name = 'SiyuanError'
  }
}

export function isMissingSiyuanDocument(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /tree not found|block not found|document not found|文档不存在|块不存在/i.test(
    message,
  )
}

function normalizeBaseUrl(raw: string): URL {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new SiyuanError('思源地址无效。', 'SIYUAN_INVALID_URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SiyuanError('思源地址仅允许 http/https。', 'SIYUAN_INVALID_PROTOCOL')
  }
  // strip trailing slash
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || ''
  return parsed
}

function assertAllowedHost(url: URL, allowedHosts: string[]): void {
  const host = url.hostname.toLowerCase()
  const ok = allowedHosts.some((item) => item.toLowerCase() === host)
  if (!ok) {
    throw new SiyuanError(
      `思源主机不在允许列表中：${host}`,
      'SIYUAN_SSRF_BLOCKED',
    )
  }
}

export function loadSiyuanToken(environment: NodeJS.ProcessEnv = process.env): string {
  const file = environment.SIYUAN_TOKEN_FILE?.trim()
  if (file) {
    return readFileSync(file, 'utf8').trim()
  }
  const direct = environment.SIYUAN_TOKEN?.trim()
  if (direct) return direct
  throw new SiyuanError(
    '未配置思源 Token（SIYUAN_TOKEN 或 SIYUAN_TOKEN_FILE）。',
    'SIYUAN_TOKEN_MISSING',
  )
}

export function resolveAuthMode(
  headerName: string | undefined,
): SiyuanAuthMode {
  const normalized = (headerName ?? 'Authorization').trim().toLowerCase()
  if (normalized === 'authorization' || normalized === 'authorization: token') {
    return 'authorization_token'
  }
  return 'x_auth_token'
}

export class SiyuanClient {
  private readonly baseUrl: URL
  private readonly token: string
  private readonly authMode: SiyuanAuthMode
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch
  private readonly allowedHosts: string[]

  constructor(options: SiyuanClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl)
    this.token = options.token.trim()
    if (!this.token) {
      throw new SiyuanError('思源 Token 不能为空。', 'SIYUAN_TOKEN_MISSING')
    }
    this.authMode = options.authMode ?? 'authorization_token'
    this.timeoutMs = options.timeoutMs ?? 15_000
    this.fetchImpl = options.fetchImpl ?? fetch
    this.allowedHosts =
      options.allowedHosts && options.allowedHosts.length > 0
        ? options.allowedHosts
        : [this.baseUrl.hostname]
    assertAllowedHost(this.baseUrl, this.allowedHosts)
  }

  async testConnection(): Promise<{ ok: true; notebookCount: number }> {
    const notebooks = await this.listNotebooks()
    return { ok: true, notebookCount: notebooks.length }
  }

  async listNotebooks(): Promise<SiyuanNotebook[]> {
    const payload = await this.request<{ notebooks?: SiyuanNotebook[] }>(
      '/api/notebook/lsNotebooks',
      {},
    )
    return (payload.notebooks ?? []).map((item) => ({
      id: String(item.id),
      name: String(item.name),
      closed: Boolean(item.closed),
    }))
  }

  async createDocWithMd(input: {
    notebook: string
    path: string
    markdown: string
  }): Promise<CreateDocResult> {
    const id = await this.request<string | CreateDocResult>(
      '/api/filetree/createDocWithMd',
      {
        notebook: input.notebook,
        path: input.path,
        markdown: input.markdown,
      },
    )
    if (typeof id === 'string') return { id }
    if (id && typeof id === 'object' && 'id' in id) return { id: String(id.id) }
    throw new SiyuanError('创建文档未返回 ID。', 'SIYUAN_UNEXPECTED_RESPONSE')
  }

  async appendBlock(input: {
    data: string
    dataType?: 'markdown' | 'dom'
    parentID: string
  }): Promise<BlockMutationResult> {
    return this.request<BlockMutationResult>('/api/block/appendBlock', {
      data: input.data,
      dataType: input.dataType ?? 'markdown',
      parentID: input.parentID,
    })
  }

  async updateBlock(input: {
    id: string
    data: string
    dataType?: 'markdown' | 'dom'
  }): Promise<BlockMutationResult> {
    return this.request<BlockMutationResult>('/api/block/updateBlock', {
      id: input.id,
      data: input.data,
      dataType: input.dataType ?? 'markdown',
    })
  }

  async getDocExists(id: string): Promise<boolean> {
    try {
      await this.request('/api/block/getBlockKramdown', { id })
      return true
    } catch (error) {
      if (isMissingSiyuanDocument(error)) return false
      throw error
    }
  }

  async renameDoc(input: {
    notebook: string
    path: string
    title: string
  }): Promise<void> {
    await this.request('/api/filetree/renameDoc', {
      notebook: input.notebook,
      path: input.path,
      title: input.title,
    })
  }

  async removeDocById(id: string): Promise<void> {
    try {
      await this.request('/api/filetree/removeDocByID', { id })
    } catch (error) {
      if (isMissingSiyuanDocument(error)) return
      throw error
    }
  }

  async renameDocById(input: { id: string; title: string }): Promise<void> {
    await this.request('/api/filetree/renameDocByID', {
      id: input.id,
      title: input.title,
    })
  }

  private authHeaders(): Record<string, string> {
    if (this.authMode === 'authorization_token') {
      return { Authorization: `Token ${this.token}` }
    }
    return { 'X-Auth-Token': this.token }
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const url = new URL(
      `${this.baseUrl.pathname.replace(/\/$/, '')}${path}`,
      this.baseUrl,
    )
    assertAllowedHost(url, this.allowedHosts)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeaders(),
        },
        body: JSON.stringify(body ?? {}),
        signal: controller.signal,
      })

      if (response.status === 401 || response.status === 403) {
        throw new SiyuanError('思源鉴权失败。', 'SIYUAN_UNAUTHORIZED', response.status, false)
      }
      if (response.status >= 500) {
        throw new SiyuanError(
          `思源服务异常（HTTP ${response.status}）。`,
          'SIYUAN_SERVER_ERROR',
          response.status,
          true,
        )
      }
      if (!response.ok) {
        throw new SiyuanError(
          `思源请求失败（HTTP ${response.status}）。`,
          'SIYUAN_HTTP_ERROR',
          response.status,
          response.status === 429,
        )
      }

      const json = (await response.json()) as {
        code?: number
        msg?: string
        data?: T
      }

      // SiYuan kernel style: { code: 0, msg, data }
      if (typeof json.code === 'number' && json.code !== 0) {
        throw new SiyuanError(
          json.msg || '思源返回业务错误。',
          'SIYUAN_API_ERROR',
          response.status,
          false,
        )
      }
      return json.data as T
    } catch (error) {
      if (error instanceof SiyuanError) throw error
      if (error instanceof Error && error.name === 'AbortError') {
        throw new SiyuanError('思源请求超时。', 'SIYUAN_TIMEOUT', undefined, true)
      }
      throw new SiyuanError(
        error instanceof Error ? error.message : '思源网络错误。',
        'SIYUAN_NETWORK_ERROR',
        undefined,
        true,
      )
    } finally {
      clearTimeout(timer)
    }
  }
}
