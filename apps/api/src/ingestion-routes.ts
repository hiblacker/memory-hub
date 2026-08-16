import type { FastifyInstance } from 'fastify'
import {
  ConnectorListSchema,
  CreateConnectorRequestSchema,
  CreateConnectorResponseSchema,
  IngestEventResponseSchema,
  SourceEventSchema,
  ConnectorSummarySchema,
} from '@memory-hub/contracts'
import type { AuthStore } from '@memory-hub/database'

import {
  resolveSessionUser,
  SESSION_COOKIE_NAME,
} from './auth.js'

const authError = {
  error: {
    code: 'AUTH_UNAUTHORIZED',
    message: '请先登录。',
  },
}

function extractApiKey(headers: Record<string, string | string[] | undefined>): string | undefined {
  const xApiKey = headers['x-api-key']
  if (typeof xApiKey === 'string' && xApiKey.trim()) return xApiKey.trim()
  const auth = headers.authorization
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim()
  }
  return undefined
}

function toConnectorSummary(connector: {
  id: string
  name: string
  type: string
  enabled: boolean
  keyPrefix: string
  lastUsedAt: Date | null
  createdAt: Date
}) {
  return ConnectorSummarySchema.parse({
    id: connector.id,
    name: connector.name,
    type: connector.type,
    enabled: connector.enabled,
    keyPrefix: connector.keyPrefix,
    lastUsedAt: connector.lastUsedAt?.toISOString() ?? null,
    createdAt: connector.createdAt.toISOString(),
  })
}

export function registerIngestionRoutes(
  app: FastifyInstance,
  authStore: AuthStore,
) {
  app.get('/api/v1/connectors', async (request, reply) => {
    const user = await resolveSessionUser(
      authStore,
      request.cookies[SESSION_COOKIE_NAME],
    )
    if (!user) return reply.status(401).send(authError)
    const items = (await authStore.listConnectors()).map(toConnectorSummary)
    return reply.send(ConnectorListSchema.parse({ items }))
  })

  app.post('/api/v1/connectors', async (request, reply) => {
    const user = await resolveSessionUser(
      authStore,
      request.cookies[SESSION_COOKIE_NAME],
    )
    if (!user) return reply.status(401).send(authError)
    const parsed = CreateConnectorRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: '请提供有效的连接器名称和类型。',
        },
      })
    }
    const created = await authStore.createConnector(parsed.data)
    await authStore.writeAudit({
      actorType: 'user',
      actorId: user.id,
      action: 'connector.create',
      entityType: 'source_connector',
      entityId: created.connector.id,
      summary: `创建连接器 ${created.connector.name}`,
    })
    return reply.status(201).send(
      CreateConnectorResponseSchema.parse({
        connector: toConnectorSummary(created.connector),
        apiKey: created.apiKey,
      }),
    )
  })

  app.post('/api/v1/connectors/:connectorId/disable', async (request, reply) => {
    const user = await resolveSessionUser(
      authStore,
      request.cookies[SESSION_COOKIE_NAME],
    )
    if (!user) return reply.status(401).send(authError)
    const { connectorId } = request.params as { connectorId: string }
    const updated = await authStore.setConnectorEnabled(connectorId, false)
    if (!updated) {
      return reply.status(404).send({
        error: { code: 'CONNECTOR_NOT_FOUND', message: '连接器不存在。' },
      })
    }
    return reply.send(toConnectorSummary(updated))
  })

  app.post('/api/v1/connectors/:connectorId/enable', async (request, reply) => {
    const user = await resolveSessionUser(
      authStore,
      request.cookies[SESSION_COOKIE_NAME],
    )
    if (!user) return reply.status(401).send(authError)
    const { connectorId } = request.params as { connectorId: string }
    const updated = await authStore.setConnectorEnabled(connectorId, true)
    if (!updated) {
      return reply.status(404).send({
        error: { code: 'CONNECTOR_NOT_FOUND', message: '连接器不存在。' },
      })
    }
    return reply.send(toConnectorSummary(updated))
  })

  app.post('/api/v1/events', async (request, reply) => {
    const apiKey = extractApiKey(
      request.headers as Record<string, string | string[] | undefined>,
    )
    if (!apiKey) {
      return reply.status(401).send({
        error: {
          code: 'CONNECTOR_UNAUTHORIZED',
          message: '请提供连接器 API Key（Authorization: Bearer 或 X-Api-Key）。',
        },
      })
    }
    const connector = await authStore.findConnectorByApiKey(apiKey)
    if (!connector) {
      return reply.status(401).send({
        error: {
          code: 'CONNECTOR_UNAUTHORIZED',
          message: '连接器 API Key 无效或已禁用。',
        },
      })
    }

    const parsed = SourceEventSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'SourceEvent 校验失败。',
          details: parsed.error.flatten(),
        },
      })
    }

    // size already limited by zod max; reject oversized raw payloads softly
    const idempotencyKeyHeader = request.headers['idempotency-key']
    const idempotencyKey =
      typeof idempotencyKeyHeader === 'string' && idempotencyKeyHeader.trim()
        ? idempotencyKeyHeader.trim().slice(0, 200)
        : null

    const event = parsed.data
    const result = await authStore.ingestSourceEvent({
      connectorId: connector.id,
      schemaVersion: event.schemaVersion,
      source: event.source,
      eventType: event.eventType,
      externalConversationId: event.externalConversationId,
      externalEventId: event.externalEventId,
      occurredAt: new Date(event.occurredAt),
      projectName: event.project?.name ?? null,
      projectRepository: event.project?.repository ?? null,
      projectBranch: event.project?.branch ?? null,
      title: event.content.title,
      body: event.content.text,
      metadata: event.metadata,
      idempotencyKey,
    })

    return reply.status(result.duplicate ? 200 : 202).send(
      IngestEventResponseSchema.parse({
        accepted: true,
        duplicate: result.duplicate,
        eventId: result.event.id,
        status: result.duplicate
          ? result.event.status === 'processed'
            ? 'processed'
            : 'duplicate'
          : 'received',
        candidateId: result.event.candidateId,
      }),
    )
  })
}
