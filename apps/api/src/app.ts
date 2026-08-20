import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import {
  CandidateListSchema,
  CandidateListQuerySchema,
  CandidateSummarySchema,
  CreateCandidateRequestSchema,
  HomeSummarySchema,
  LoginRequestSchema,
  LoginResponseSchema,
  RejectCandidateRequestSchema,
  UpdateCandidateRequestSchema,
  ArchiveDeliveryListSchema,
  SiyuanSettingsSchema,
  UpdateSiyuanSettingsSchema,
  type CandidateSummary,
} from '@memory-hub/contracts'
import type {
  AuthStore,
  ApproveCandidateResult,
  CandidateMutationResult,
  CandidateRecord,
  ArchiveDeliveryRecord,
  ArchiveTargetRecord,
} from '@memory-hub/database'
import Fastify from 'fastify'
import { ZodError } from 'zod'

import {
  createSession,
  hashSessionToken,
  resolveSessionUser,
  SESSION_COOKIE_NAME,
  verifyPassword,
} from './auth.js'
import { registerIngestionRoutes } from './ingestion-routes.js'
import { runSiyuanConnectionTest } from './siyuan-test.js'

interface BuildAppOptions {
  authStore: AuthStore
  corsOrigin?: string
  secureCookies?: boolean
  sessionTtlMs?: number
}

const authError = {
  error: {
    code: 'AUTH_UNAUTHORIZED',
    message: '请先登录。',
  },
}

function toCandidateSummary(record: CandidateRecord): CandidateSummary {
  return CandidateSummarySchema.parse({
    id: record.id,
    title: record.title,
    body: record.body,
    memoryType: record.memoryType,
    source: record.source,
    project: record.project,
    status: record.status,
    sensitivity: record.sensitivity,
    confidence: record.confidence,
    renderStyle: record.renderStyle,
    emojiEnabled: record.emojiEnabled,
    rejectionReason: record.rejectionReason,
    captureTime: record.captureTime.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  })
}

function mutationError(
  result: Extract<CandidateMutationResult | ApproveCandidateResult, { ok: false }>,
) {
  if (result.code === 'NOT_FOUND') {
    return {
      status: 404 as const,
      body: {
        error: {
          code: 'CANDIDATE_NOT_FOUND',
          message: result.message,
        },
      },
    }
  }

  if (result.code === 'NO_TARGET') {
    return {
      status: 409 as const,
      body: {
        error: {
          code: 'ARCHIVE_TARGET_NOT_READY',
          message: result.message,
        },
      },
    }
  }

  if (result.code === 'NO_CHANGES') {
    return {
      status: 409 as const,
      body: {
        error: {
          code: 'CANDIDATE_NO_CHANGES',
          message: result.message,
        },
      },
    }
  }

  return {
    status: 409 as const,
    body: {
      error: {
        code: 'CANDIDATE_INVALID_STATE',
        message: result.message,
      },
    },
  }
}

function toDelivery(record: ArchiveDeliveryRecord) {
  return {
    id: record.id,
    candidateId: record.candidateId,
    memoryVersionId: record.memoryVersionId,
    targetId: record.targetId,
    status: record.status,
    attemptCount: record.attemptCount,
    documentId: record.documentId,
    blockId: record.blockId,
    path: record.path,
    requestFingerprint: record.requestFingerprint,
    lastErrorCode: record.lastErrorCode,
    lastErrorMessage: record.lastErrorMessage,
    nextAttemptAt: record.nextAttemptAt?.toISOString() ?? null,
    succeededAt: record.succeededAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

function toListQuery(parsed: any, forcedStatuses?: string[]) {
  return buildListQuery(parsed, forcedStatuses)
}
function buildListQuery(parsed: {
  q?: string
  status?: string
  type?: string
  source?: string
  project?: string
  from?: string
  to?: string
  sort: 'updated_at_desc' | 'updated_at_asc' | 'capture_time_desc'
  page: number
  pageSize: number
}, forcedStatuses?: string[]) {
  const query: {
    q?: string
    statuses?: string[]
    types?: string[]
    source?: string
    project?: string
    from?: Date
    to?: Date
    sort: 'updated_at_desc' | 'updated_at_asc' | 'capture_time_desc'
    page: number
    pageSize: number
  } = {
    sort: parsed.sort,
    page: parsed.page,
    pageSize: parsed.pageSize,
  }
  if (parsed.q) query.q = parsed.q
  if (forcedStatuses) query.statuses = forcedStatuses
  else if (parsed.status) query.statuses = parsed.status.split(',').filter(Boolean)
  if (parsed.type) query.types = parsed.type.split(',').filter(Boolean)
  if (parsed.source) query.source = parsed.source
  if (parsed.project) query.project = parsed.project
  if (parsed.from) query.from = new Date(parsed.from)
  if (parsed.to) query.to = new Date(parsed.to)
  return query
}

function tokenConfigured(): boolean {
  return Boolean(
    process.env.SIYUAN_TOKEN?.trim() || process.env.SIYUAN_TOKEN_FILE?.trim(),
  )
}

function toSiyuanSettings(target: ArchiveTargetRecord) {
  return {
    id: target.id,
    name: target.name,
    enabled: target.enabled,
    baseUrl: target.baseUrl,
    authHeader: target.authHeader,
    notebookId: target.notebookId,
    notebookName: target.notebookName,
    pathTemplate: target.pathTemplate,
    allowedHosts: target.allowedHosts,
    lastTestStatus: target.lastTestStatus,
    lastTestMessage: target.lastTestMessage,
    lastTestedAt: target.lastTestedAt?.toISOString() ?? null,
    updatedAt: target.updatedAt.toISOString(),
    tokenConfigured: tokenConfigured(),
  }
}

export function buildApp({
  authStore,
  corsOrigin = 'http://localhost:8788',
  secureCookies = false,
  sessionTtlMs = 7 * 24 * 60 * 60 * 1000,
}: BuildAppOptions) {
  const app = Fastify({ logger: false })
  // Browsers often POST logout with application/json and an empty body.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (request, body, done) => {
      const text = typeof body === 'string' ? body : ''
      if (!text) {
        done(null, {})
        return
      }
      try {
        done(null, JSON.parse(text) as unknown)
      } catch (error) {
        done(error as Error, undefined)
      }
    },
  )

  void app.register(cookie)
  void app.register(cors, {
    origin: corsOrigin,
    credentials: true,
  })

  app.get('/healthz', async () => ({
    status: 'ok',
    phase: 'runtime',
    service: 'memory-hub-api',
  }))

  app.get('/readyz', async (_request, reply) => {
    const ready = await authStore.isReady()
    return reply.status(ready ? 200 : 503).send({
      status: ready ? 'ready' : 'not_ready',
      service: 'memory-hub-api',
      database: ready ? 'available' : 'unavailable',
    })
  })

  app.post('/api/v1/auth/login', async (request, reply) => {
    const parsed = LoginRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: '请提供有效的用户名和密码。',
        },
      })
    }

    const user = await authStore.findUserByUsername(parsed.data.username)
    const valid =
      user && (await verifyPassword(parsed.data.password, user.passwordHash))
    if (!user || !valid) {
      return reply.status(401).send({
        error: {
          code: 'AUTH_INVALID_CREDENTIALS',
          message: '用户名或密码错误。',
        },
      })
    }

    const session = await createSession(authStore, user.id, sessionTtlMs)
    await authStore.updateLastLogin(user.id)
    reply.setCookie(SESSION_COOKIE_NAME, session.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookies,
      path: '/',
      expires: session.expiresAt,
    })

    return reply.send(
      LoginResponseSchema.parse({
        user: { id: user.id, username: user.username },
      }),
    )
  })

  app.get('/api/v1/auth/me', async (request, reply) => {
    const user = await resolveSessionUser(
      authStore,
      request.cookies[SESSION_COOKIE_NAME],
    )
    if (!user) return reply.status(401).send(authError)
    return reply.send({ user })
  })

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE_NAME]
    if (token) await authStore.deleteSession(hashSessionToken(token))
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' })
    return reply.status(204).send()
  })

  app.get('/api/v1/home', async (request, reply) => {
    const user = await resolveSessionUser(
      authStore,
      request.cookies[SESSION_COOKIE_NAME],
    )
    if (!user) return reply.status(401).send(authError)
    const counts = await authStore.getHomeCounts()
    const target = await authStore.getDefaultArchiveTarget()
    const siyuan = (() => {
      if (!tokenConfigured() || !target?.notebookId) {
        return {
          status: 'unconfigured' as const,
          notebookName: target?.notebookName ?? null,
          lastTestedAt: target?.lastTestedAt?.toISOString() ?? null,
        }
      }
      if (target.lastTestStatus === 'succeeded') {
        return {
          status: 'connected' as const,
          notebookName: target.notebookName,
          lastTestedAt: target.lastTestedAt?.toISOString() ?? null,
        }
      }
      if (target.lastTestStatus === 'failed') {
        return {
          status: 'failed' as const,
          notebookName: target.notebookName,
          lastTestedAt: target.lastTestedAt?.toISOString() ?? null,
        }
      }
      return {
        status: 'unconfigured' as const,
        notebookName: target.notebookName,
        lastTestedAt: target.lastTestedAt?.toISOString() ?? null,
      }
    })()
    return reply.send(HomeSummarySchema.parse({ user, counts, siyuan }))
  })

  app.get('/api/v1/candidates', async (request, reply) => {
    const user = await resolveSessionUser(
      authStore,
      request.cookies[SESSION_COOKIE_NAME],
    )
    if (!user) return reply.status(401).send(authError)
    const parsed = CandidateListQuerySchema.safeParse(request.query ?? {})
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: '列表筛选参数无效。' },
      })
    }
    const result = await authStore.listCandidates(toListQuery(parsed.data))
    return reply.send(
      CandidateListSchema.parse({
        items: result.items.map(toCandidateSummary),
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      }),
    )
  })

  app.get('/api/v1/candidates/:candidateId', async (request, reply) => {
    const user = await resolveSessionUser(
      authStore,
      request.cookies[SESSION_COOKIE_NAME],
    )
    if (!user) return reply.status(401).send(authError)

    const { candidateId } = request.params as { candidateId: string }
    const candidate = await authStore.getCandidate(candidateId)
    if (!candidate) {
      return reply.status(404).send({
        error: {
          code: 'CANDIDATE_NOT_FOUND',
          message: '候选记忆不存在。',
        },
      })
    }

    return reply.send(toCandidateSummary(candidate))
  })

  app.post('/api/v1/candidates', async (request, reply) => {
    const user = await resolveSessionUser(
      authStore,
      request.cookies[SESSION_COOKIE_NAME],
    )
    if (!user) return reply.status(401).send(authError)

    const parsed = CreateCandidateRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: '请提供有效的候选标题、类型和正文。',
        },
      })
    }

    const created = await authStore.createCandidate({
      title: parsed.data.title,
      body: parsed.data.body,
      memoryType: parsed.data.memoryType,
      renderStyle: parsed.data.renderStyle,
      emojiEnabled: parsed.data.emojiEnabled,
      ...(parsed.data.project ? { project: parsed.data.project } : {}),
      ...(parsed.data.captureTime
        ? { captureTime: new Date(parsed.data.captureTime) }
        : {}),
    })

    return reply.status(201).send(toCandidateSummary(created))
  })

  app.patch('/api/v1/candidates/:candidateId', async (request, reply) => {
    const user = await resolveSessionUser(
      authStore,
      request.cookies[SESSION_COOKIE_NAME],
    )
    if (!user) return reply.status(401).send(authError)

    const parsed = UpdateCandidateRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: '请提供有效的候选标题、类型和正文。',
        },
      })
    }

    const { candidateId } = request.params as { candidateId: string }
    const result = await authStore.updateCandidate(candidateId, {
      title: parsed.data.title,
      body: parsed.data.body,
      memoryType: parsed.data.memoryType,
      renderStyle: parsed.data.renderStyle,
      emojiEnabled: parsed.data.emojiEnabled,
      ...(parsed.data.project ? { project: parsed.data.project } : {}),
    })
    if (!result.ok) {
      const error = mutationError(result)
      return reply.status(error.status).send(error.body)
    }

    return reply.send(toCandidateSummary(result.candidate))
  })

  app.post(
    '/api/v1/candidates/:candidateId/approve',
    async (request, reply) => {
      const user = await resolveSessionUser(
        authStore,
        request.cookies[SESSION_COOKIE_NAME],
      )
      if (!user) return reply.status(401).send(authError)

      const { candidateId } = request.params as { candidateId: string }
      const result = await authStore.approveCandidate(candidateId)
      if (!result.ok) {
        const error = mutationError(result)
        return reply.status(error.status).send(error.body)
      }

      return reply.send(toCandidateSummary(result.candidate))
    },
  )

  app.post(
    '/api/v1/candidates/:candidateId/reject',
    async (request, reply) => {
      const user = await resolveSessionUser(
        authStore,
        request.cookies[SESSION_COOKIE_NAME],
      )
      if (!user) return reply.status(401).send(authError)

      const parsed = RejectCandidateRequestSchema.safeParse(request.body ?? {})
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: '请提供有效的拒绝原因。',
          },
        })
      }

      const { candidateId } = request.params as { candidateId: string }
      const result = await authStore.rejectCandidate(
        candidateId,
        parsed.data.reason,
      )
      if (!result.ok) {
        const error = mutationError(result)
        return reply.status(error.status).send(error.body)
      }

      return reply.send(toCandidateSummary(result.candidate))
    },
  )

  app.get('/api/v1/settings/siyuan', async (request, reply) => {
    const user = await resolveSessionUser(
      authStore,
      request.cookies[SESSION_COOKIE_NAME],
    )
    if (!user) return reply.status(401).send(authError)
    const target = await authStore.getDefaultArchiveTarget()
    if (!target) {
      return reply.status(404).send({
        error: {
          code: 'ARCHIVE_TARGET_NOT_FOUND',
          message: '未找到思源归档目标。',
        },
      })
    }
    return reply.send(SiyuanSettingsSchema.parse(toSiyuanSettings(target)))
  })

  app.put('/api/v1/settings/siyuan', async (request, reply) => {
    const user = await resolveSessionUser(
      authStore,
      request.cookies[SESSION_COOKIE_NAME],
    )
    if (!user) return reply.status(401).send(authError)
    const parsed = UpdateSiyuanSettingsSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: '请提供有效的思源配置。',
        },
      })
    }
    const updated = await authStore.upsertDefaultArchiveTarget({
      baseUrl: parsed.data.baseUrl,
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.enabled !== undefined
        ? { enabled: parsed.data.enabled }
        : {}),
      ...(parsed.data.authHeader !== undefined
        ? { authHeader: parsed.data.authHeader }
        : {}),
      ...(parsed.data.notebookId !== undefined
        ? { notebookId: parsed.data.notebookId }
        : {}),
      ...(parsed.data.notebookName !== undefined
        ? { notebookName: parsed.data.notebookName }
        : {}),
      ...(parsed.data.pathTemplate !== undefined
        ? { pathTemplate: parsed.data.pathTemplate }
        : {}),
      ...(parsed.data.allowedHosts !== undefined
        ? { allowedHosts: parsed.data.allowedHosts }
        : {}),
    })
    await authStore.writeAudit({
      actorType: 'user',
      actorId: user.id,
      action: 'settings.siyuan.update',
      entityType: 'archive_target',
      entityId: updated.id,
      summary: '更新思源归档目标配置',
    })
    return reply.send(SiyuanSettingsSchema.parse(toSiyuanSettings(updated)))
  })

  app.post('/api/v1/settings/siyuan/test', async (request, reply) => {
    const user = await resolveSessionUser(
      authStore,
      request.cookies[SESSION_COOKIE_NAME],
    )
    if (!user) return reply.status(401).send(authError)
    const target = await authStore.getDefaultArchiveTarget()
    if (!target) {
      return reply.status(404).send({
        error: {
          code: 'ARCHIVE_TARGET_NOT_FOUND',
          message: '未找到思源归档目标。',
        },
      })
    }

    // Optional draft settings from the form so unsaved notebook name/id are respected.
    const draft =
      request.body && typeof request.body === 'object' && Object.keys(request.body as object).length > 0
        ? UpdateSiyuanSettingsSchema.safeParse(request.body)
        : null
    if (draft && !draft.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: '请提供有效的思源配置后再测试连接。',
        },
      })
    }

    const testTarget: ArchiveTargetRecord = {
      ...target,
      baseUrl: draft?.success ? draft.data.baseUrl : target.baseUrl,
      authHeader:
        draft?.success && draft.data.authHeader !== undefined
          ? draft.data.authHeader
          : target.authHeader,
      notebookId:
        draft?.success && draft.data.notebookId !== undefined
          ? draft.data.notebookId
          : target.notebookId,
      notebookName:
        draft?.success && draft.data.notebookName !== undefined
          ? draft.data.notebookName
          : target.notebookName,
      pathTemplate:
        draft?.success && draft.data.pathTemplate !== undefined
          ? draft.data.pathTemplate
          : target.pathTemplate,
      allowedHosts:
        draft?.success && draft.data.allowedHosts !== undefined
          ? draft.data.allowedHosts
          : target.allowedHosts,
    }

    if (!tokenConfigured()) {
      await authStore.updateArchiveTargetTestResult(target.id, {
        status: 'failed',
        message: '未配置 SIYUAN_TOKEN / SIYUAN_TOKEN_FILE。',
      })
      const failed = await authStore.getDefaultArchiveTarget()
      return reply.status(409).send({
        error: {
          code: 'SIYUAN_TOKEN_MISSING',
          message: '未配置思源 Token。请在仓库根目录 .env 设置 SIYUAN_TOKEN 后重启 API/Worker。',
        },
        settings: failed
          ? SiyuanSettingsSchema.parse(toSiyuanSettings(failed))
          : undefined,
      })
    }

    // Server-side immediate test: Token never leaves the API process / never reaches Web.
    const result = await runSiyuanConnectionTest(testTarget)
    if (result.ok) {
      // Persist working auth mode + resolved notebook; keep other draft fields if provided.
      await authStore.upsertDefaultArchiveTarget({
        baseUrl: testTarget.baseUrl,
        notebookId: result.notebookId ?? testTarget.notebookId,
        notebookName: result.notebookName ?? testTarget.notebookName,
        authHeader: result.authHeader ?? testTarget.authHeader,
        ...(draft?.success && draft.data.name !== undefined
          ? { name: draft.data.name }
          : {}),
        ...(draft?.success && draft.data.enabled !== undefined
          ? { enabled: draft.data.enabled }
          : {}),
        ...(draft?.success && draft.data.pathTemplate !== undefined
          ? { pathTemplate: draft.data.pathTemplate }
          : {}),
        ...(draft?.success && draft.data.allowedHosts !== undefined
          ? { allowedHosts: draft.data.allowedHosts }
          : {}),
      })
      await authStore.updateArchiveTargetTestResult(target.id, {
        status: 'succeeded',
        message: result.message,
        notebookName: result.notebookName ?? null,
      })
      await authStore.writeAudit({
        actorType: 'user',
        actorId: user.id,
        action: 'settings.siyuan.test_succeeded',
        entityType: 'archive_target',
        entityId: target.id,
        summary: result.message,
      })
      const latest = await authStore.getDefaultArchiveTarget()
      return reply.send(SiyuanSettingsSchema.parse(toSiyuanSettings(latest!)))
    }

    await authStore.updateArchiveTargetTestResult(target.id, {
      status: 'failed',
      message: result.message,
    })
    await authStore.writeAudit({
      actorType: 'user',
      actorId: user.id,
      action: 'settings.siyuan.test_failed',
      entityType: 'archive_target',
      entityId: target.id,
      summary: result.message,
    })
    const failed = await authStore.getDefaultArchiveTarget()
    return reply.status(502).send({
      error: {
        code: 'SIYUAN_TEST_FAILED',
        message: result.message,
      },
      settings: failed
        ? SiyuanSettingsSchema.parse(toSiyuanSettings(failed))
        : undefined,
    })
  })

  app.get('/api/v1/candidates/:candidateId/deliveries', async (request, reply) => {
    const user = await resolveSessionUser(
      authStore,
      request.cookies[SESSION_COOKIE_NAME],
    )
    if (!user) return reply.status(401).send(authError)
    const { candidateId } = request.params as { candidateId: string }
    const candidate = await authStore.getCandidate(candidateId)
    if (!candidate) {
      return reply.status(404).send({
        error: {
          code: 'CANDIDATE_NOT_FOUND',
          message: '候选记忆不存在。',
        },
      })
    }
    const items = (await authStore.listDeliveriesForCandidate(candidateId)).map(
      toDelivery,
    )
    return reply.send(ArchiveDeliveryListSchema.parse({ items }))
  })

  app.post(
    '/api/v1/deliveries/:deliveryId/retry',
    async (request, reply) => {
      const user = await resolveSessionUser(
        authStore,
        request.cookies[SESSION_COOKIE_NAME],
      )
      if (!user) return reply.status(401).send(authError)
      const { deliveryId } = request.params as { deliveryId: string }
      const delivery = await authStore.enqueueDeliveryRetry(deliveryId)
      if (!delivery) {
        return reply.status(404).send({
          error: {
            code: 'DELIVERY_NOT_FOUND',
            message: '同步交付不存在。',
          },
        })
      }
      return reply.send(toDelivery(delivery))
    },
  )

  app.post('/api/v1/candidates/:candidateId/trash', async (request, reply) => {
    const user = await resolveSessionUser(
      authStore,
      request.cookies[SESSION_COOKIE_NAME],
    )
    if (!user) return reply.status(401).send(authError)
    const { candidateId } = request.params as { candidateId: string }
    const result = await authStore.trashCandidate(candidateId)
    if (!result.ok) {
      const error = mutationError(result)
      return reply.status(error.status).send(error.body)
    }
    return reply.send(toCandidateSummary(result.candidate))
  })

  app.post('/api/v1/candidates/:candidateId/restore', async (request, reply) => {
    const user = await resolveSessionUser(
      authStore,
      request.cookies[SESSION_COOKIE_NAME],
    )
    if (!user) return reply.status(401).send(authError)
    const { candidateId } = request.params as { candidateId: string }
    const result = await authStore.restoreCandidate(candidateId)
    if (!result.ok) {
      const error = mutationError(result)
      return reply.status(error.status).send(error.body)
    }
    const synced = await authStore.approveCandidate(candidateId)
    if (synced.ok) {
      return reply.send(toCandidateSummary(synced.candidate))
    }
    return reply.send(toCandidateSummary(result.candidate))
  })

  app.post('/api/v1/candidates/:candidateId/destroy', async (request, reply) => {
    const user = await resolveSessionUser(
      authStore,
      request.cookies[SESSION_COOKIE_NAME],
    )
    if (!user) return reply.status(401).send(authError)
    const { candidateId } = request.params as { candidateId: string }
    const result = await authStore.destroyCandidate(candidateId)
    if (!result.ok) {
      const error = mutationError(result)
      return reply.status(error.status).send(error.body)
    }
    return reply.status(204).send()
  })

  app.get('/api/v1/trash', async (request, reply) => {
    const user = await resolveSessionUser(
      authStore,
      request.cookies[SESSION_COOKIE_NAME],
    )
    if (!user) return reply.status(401).send(authError)
    const items = (await authStore.listTrashedCandidates()).map(toCandidateSummary)
    return reply.send(CandidateListSchema.parse({ items, page: 1, pageSize: items.length || 20, total: items.length }))
  })

  app.get('/api/v1/archives', async (request, reply) => {
    const user = await resolveSessionUser(
      authStore,
      request.cookies[SESSION_COOKIE_NAME],
    )
    if (!user) return reply.status(401).send(authError)
    const result = await authStore.listCandidates({ statuses: ['synced'] })
    return reply.send(
      CandidateListSchema.parse({
        items: result.items.map(toCandidateSummary),
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      }),
    )
  })

  app.get('/api/v1/synced', async (request, reply) => {
    const user = await resolveSessionUser(
      authStore,
      request.cookies[SESSION_COOKIE_NAME],
    )
    if (!user) return reply.status(401).send(authError)
    const parsed = CandidateListQuerySchema.safeParse(request.query ?? {})
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: '列表筛选参数无效。' },
      })
    }
    const result = await authStore.listCandidates(toListQuery(parsed.data, ['synced']))
    return reply.send(
      CandidateListSchema.parse({
        items: result.items.map(toCandidateSummary),
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      }),
    )
  })

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(500).send({
        error: {
          code: 'RESPONSE_VALIDATION_ERROR',
          message: '服务返回了无法识别的数据，请刷新后重试。',
        },
      })
    }
    const err = error as { statusCode?: number; message?: string }
    return reply.status(err.statusCode && err.statusCode >= 400 ? err.statusCode : 500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务暂时不可用，请稍后重试。',
      },
    })
  })

  registerIngestionRoutes(app, authStore)
  return app
}

