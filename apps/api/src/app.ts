import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import {
  CandidateListSchema,
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

import {
  createSession,
  hashSessionToken,
  resolveSessionUser,
  SESSION_COOKIE_NAME,
  verifyPassword,
} from './auth.js'

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
    return reply.send(HomeSummarySchema.parse({ user, counts }))
  })

  app.get('/api/v1/candidates', async (request, reply) => {
    const user = await resolveSessionUser(
      authStore,
      request.cookies[SESSION_COOKIE_NAME],
    )
    if (!user) return reply.status(401).send(authError)
    const items = (await authStore.listCandidates()).map(toCandidateSummary)
    return reply.send(CandidateListSchema.parse({ items }))
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
    if (!tokenConfigured()) {
      await authStore.updateArchiveTargetTestResult(target.id, {
        status: 'failed',
        message: '未配置 SIYUAN_TOKEN / SIYUAN_TOKEN_FILE。',
      })
      const failed = await authStore.getDefaultArchiveTarget()
      return reply.status(409).send({
        error: {
          code: 'SIYUAN_TOKEN_MISSING',
          message: '未配置思源 Token。',
        },
        settings: failed
          ? SiyuanSettingsSchema.parse(toSiyuanSettings(failed))
          : undefined,
      })
    }

    await authStore.enqueueSiyuanTest(target.id)
    await authStore.updateArchiveTargetTestResult(target.id, {
      status: 'failed',
      message: '测试已排队，等待 Worker 执行…',
    })
    const latest = await authStore.getDefaultArchiveTarget()
    return reply.send(SiyuanSettingsSchema.parse(toSiyuanSettings(latest!)))
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
            message: '归档交付不存在。',
          },
        })
      }
      return reply.send(toDelivery(delivery))
    },
  )

  app.get('/api/v1/archives', async (request, reply) => {
    const user = await resolveSessionUser(
      authStore,
      request.cookies[SESSION_COOKIE_NAME],
    )
    if (!user) return reply.status(401).send(authError)
    const items = (await authStore.listArchivedCandidates()).map(
      toCandidateSummary,
    )
    return reply.send(CandidateListSchema.parse({ items }))
  })

  return app
}

