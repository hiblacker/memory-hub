import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createInMemoryAuthStore } from '@memory-hub/database'

import { buildApp } from './app.js'
import { hashPassword } from './auth.js'

// In-memory store lacks full ingest; use a lightweight fake for connector+event path via real DB is ideal.
// Here we unit-test validation and auth boundaries with inject against in-memory by monkey-patching methods.

describe('ingestion API boundaries', () => {
  let app: ReturnType<typeof buildApp>
  let store: ReturnType<typeof createInMemoryAuthStore>
  const events = new Map<string, any>()
  const connectors = new Map<string, any>()

  beforeAll(async () => {
    store = createInMemoryAuthStore(await hashPassword('correct-password'))
    store.listConnectors = async () => [...connectors.values()]
    store.createConnector = async (input) => {
      const connector = {
        id: randomUUID(),
        name: input.name,
        type: input.type,
        apiKeyHash: createHash('sha256').update('mh_test_secret').digest('hex'),
        keyPrefix: 'mh_test',
        enabled: true,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      connectors.set(connector.id, connector)
      return { connector, apiKey: 'mh_test_secret' }
    }
    store.findConnectorByApiKey = async (apiKey) => {
      if (apiKey !== 'mh_test_secret') return undefined
      return [...connectors.values()][0]
    }
    store.setConnectorEnabled = async (id, enabled) => {
      const c = connectors.get(id)
      if (!c) return undefined
      c.enabled = enabled
      return c
    }
    store.ingestSourceEvent = async (input) => {
      const existing = [...events.values()].find(
        (item) =>
          item.connectorId === input.connectorId &&
          item.externalConversationId === input.externalConversationId &&
          item.externalEventId === input.externalEventId,
      )
      if (existing) return { event: existing, duplicate: true }
      const event = {
        id: randomUUID(),
        connectorId: input.connectorId,
        schemaVersion: input.schemaVersion,
        source: input.source,
        eventType: input.eventType,
        externalConversationId: input.externalConversationId,
        externalEventId: input.externalEventId,
        occurredAt: input.occurredAt,
        projectName: input.projectName ?? null,
        projectRepository: input.projectRepository ?? null,
        projectBranch: input.projectBranch ?? null,
        title: input.title,
        body: input.body,
        contentHash: 'x',
        canonicalKey: 'y',
        metadata: input.metadata ?? null,
        status: 'received' as const,
        candidateId: null,
        errorSummary: null,
        idempotencyKey: input.idempotencyKey ?? null,
        createdAt: new Date(),
        processedAt: null,
      }
      events.set(event.id, event)
      return { event, duplicate: false }
    }

    app = buildApp({ authStore: store })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  async function loginCookie() {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'admin', password: 'correct-password' },
    })
    return login.cookies.find((item) => item.name === 'memoryhub_session')?.value ?? ''
  }

  it('creates connector and accepts source events with api key', async () => {
    const cookie = await loginCookie()
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/connectors',
      cookies: { memoryhub_session: cookie },
      payload: { name: 'rest-local', type: 'rest' },
    })
    expect(created.statusCode).toBe(201)
    const apiKey = created.json().apiKey as string
    expect(apiKey).toBeTruthy()

    const payload = {
      schemaVersion: 1,
      source: 'rest',
      eventType: 'session_summary',
      externalConversationId: 'conv-1',
      externalEventId: 'evt-1',
      occurredAt: new Date().toISOString(),
      project: { name: 'memory-hub' },
      content: { title: 'REST 事件', text: '这是一条通过 REST 接入的记忆候选。' },
      metadata: {},
    }
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      headers: { authorization: `Bearer ${apiKey}` },
      payload,
    })
    expect(first.statusCode).toBe(202)
    expect(first.json().duplicate).toBe(false)

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      headers: { authorization: `Bearer ${apiKey}` },
      payload,
    })
    expect(second.statusCode).toBe(200)
    expect(second.json().duplicate).toBe(true)
  })

  it('rejects events without api key', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      payload: {
        schemaVersion: 1,
        source: 'rest',
        eventType: 'x',
        externalConversationId: 'c',
        externalEventId: 'e',
        occurredAt: new Date().toISOString(),
        content: { title: 't', text: 'body text' },
        metadata: {},
      },
    })
    expect(response.statusCode).toBe(401)
  })
})
