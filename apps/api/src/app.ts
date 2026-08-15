import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import {
  CandidateListSchema,
  CandidateSummarySchema,
  CreateCandidateRequestSchema,
  HomeSummarySchema,
  LoginRequestSchema,
  LoginResponseSchema,
  type CandidateSummary,
} from '@memory-hub/contracts'
import type { AuthStore, CandidateRecord } from '@memory-hub/database'
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
    captureTime: record.captureTime.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  })
}

export function buildApp({
  authStore,
  corsOrigin = 'http://localhost:8788',
  secureCookies = false,
  sessionTtlMs = 7 * 24 * 60 * 60 * 1000,
}: BuildAppOptions) {
  const app = Fastify({ logger: false })

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
      ...(parsed.data.project ? { project: parsed.data.project } : {}),
      ...(parsed.data.captureTime
        ? { captureTime: new Date(parsed.data.captureTime) }
        : {}),
    })

    return reply.status(201).send(toCandidateSummary(created))
  })

  return app
}
