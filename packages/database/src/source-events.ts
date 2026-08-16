import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type postgres from 'postgres'

import {
  computeCanonicalKey,
  computeContentHash,
  evaluateSensitivity,
  inferMemoryType,
  isContentConflict,
} from '@memory-hub/core'

import {
  memoryCandidates,
  sourceConnectors,
  sourceEvents,
} from './schema.js'

export const OUTBOX_TOPIC_PROCESS_SOURCE_EVENT = 'source.event.process'

export type ConnectorType =
  | 'claude_code'
  | 'chatgpt_export'
  | 'chatgpt_extension'
  | 'rest'

export type SourceEventStatus =
  | 'received'
  | 'processing'
  | 'processed'
  | 'duplicate'
  | 'failed'

export interface ConnectorRecord {
  id: string
  name: string
  type: ConnectorType
  apiKeyHash: string
  keyPrefix: string
  enabled: boolean
  lastUsedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface SourceEventRecord {
  id: string
  connectorId: string
  schemaVersion: number
  source: string
  eventType: string
  externalConversationId: string
  externalEventId: string
  occurredAt: Date
  projectName: string | null
  projectRepository: string | null
  projectBranch: string | null
  title: string
  body: string
  contentHash: string
  canonicalKey: string
  metadata: Record<string, unknown> | null
  status: SourceEventStatus
  candidateId: string | null
  errorSummary: string | null
  idempotencyKey: string | null
  createdAt: Date
  processedAt: Date | null
}

export interface IngestSourceEventInput {
  connectorId: string
  schemaVersion: number
  source: string
  eventType: string
  externalConversationId: string
  externalEventId: string
  occurredAt: Date
  projectName?: string | null
  projectRepository?: string | null
  projectBranch?: string | null
  title: string
  body: string
  metadata?: Record<string, unknown>
  idempotencyKey?: string | null
}

export function hashConnectorApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex')
}

export function generateConnectorApiKey(): { apiKey: string; prefix: string; hash: string } {
  const apiKey = `mh_${randomBytes(24).toString('base64url')}`
  return {
    apiKey,
    prefix: apiKey.slice(0, 10),
    hash: hashConnectorApiKey(apiKey),
  }
}

export async function applySourceEventsMigration(
  client: postgres.Sql,
): Promise<void> {
  const applied = await client<{ version: number }[]>`
    SELECT version FROM schema_migrations WHERE version = 6
  `
  if (applied.length > 0) return

  await client.begin(async (tx) => {
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS source_connectors (
        id text PRIMARY KEY,
        name text NOT NULL,
        type text NOT NULL,
        api_key_hash text NOT NULL UNIQUE,
        key_prefix text NOT NULL,
        enabled boolean NOT NULL DEFAULT true,
        last_used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS source_events (
        id text PRIMARY KEY,
        connector_id text NOT NULL REFERENCES source_connectors(id) ON DELETE RESTRICT,
        schema_version integer NOT NULL,
        source text NOT NULL,
        event_type text NOT NULL,
        external_conversation_id text NOT NULL,
        external_event_id text NOT NULL,
        occurred_at timestamptz NOT NULL,
        project_name text,
        project_repository text,
        project_branch text,
        title text NOT NULL,
        body text NOT NULL,
        content_hash text NOT NULL,
        canonical_key text NOT NULL,
        metadata jsonb,
        status text NOT NULL,
        candidate_id text,
        error_summary text,
        idempotency_key text,
        created_at timestamptz NOT NULL DEFAULT now(),
        processed_at timestamptz
      );

      CREATE UNIQUE INDEX IF NOT EXISTS source_events_natural_key_uidx
        ON source_events(connector_id, external_conversation_id, external_event_id);

      CREATE UNIQUE INDEX IF NOT EXISTS source_events_idempotency_uidx
        ON source_events(connector_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL;

      CREATE INDEX IF NOT EXISTS source_events_status_idx ON source_events(status);
      CREATE INDEX IF NOT EXISTS source_events_content_hash_idx ON source_events(content_hash);
      CREATE INDEX IF NOT EXISTS memory_candidates_content_hash_idx
        ON memory_candidates((md5(title || E'\\n' || body)));

      ALTER TABLE memory_candidates
        ADD COLUMN IF NOT EXISTS content_hash text,
        ADD COLUMN IF NOT EXISTS canonical_key text,
        ADD COLUMN IF NOT EXISTS source_event_id text,
        ADD COLUMN IF NOT EXISTS duplicate_of_id text;

      INSERT INTO schema_migrations (version) VALUES (6)
      ON CONFLICT (version) DO NOTHING;
    `)
  })
}

function mapConnector(row: typeof sourceConnectors.$inferSelect): ConnectorRecord {
  return {
    id: row.id,
    name: row.name,
    type: row.type as ConnectorType,
    apiKeyHash: row.apiKeyHash,
    keyPrefix: row.keyPrefix,
    enabled: row.enabled,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function mapEvent(row: typeof sourceEvents.$inferSelect): SourceEventRecord {
  return {
    id: row.id,
    connectorId: row.connectorId,
    schemaVersion: row.schemaVersion,
    source: row.source,
    eventType: row.eventType,
    externalConversationId: row.externalConversationId,
    externalEventId: row.externalEventId,
    occurredAt: row.occurredAt,
    projectName: row.projectName,
    projectRepository: row.projectRepository,
    projectBranch: row.projectBranch,
    title: row.title,
    body: row.body,
    contentHash: row.contentHash,
    canonicalKey: row.canonicalKey,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    status: row.status as SourceEventStatus,
    candidateId: row.candidateId,
    errorSummary: row.errorSummary,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
    processedAt: row.processedAt,
  }
}

export function createSourceEventOperations(
  db: PostgresJsDatabase<any>,
  client: postgres.Sql,
) {
  return {
    async listConnectors(): Promise<ConnectorRecord[]> {
      const rows = await db
        .select()
        .from(sourceConnectors)
        .orderBy(desc(sourceConnectors.createdAt))
      return rows.map(mapConnector)
    },

    async createConnector(input: {
      name: string
      type: ConnectorType
    }): Promise<{ connector: ConnectorRecord; apiKey: string }> {
      const now = new Date()
      const generated = generateConnectorApiKey()
      const id = randomUUID()
      await db.insert(sourceConnectors).values({
        id,
        name: input.name,
        type: input.type,
        apiKeyHash: generated.hash,
        keyPrefix: generated.prefix,
        enabled: true,
        lastUsedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      const connector = (await this.getConnector(id))!
      return { connector, apiKey: generated.apiKey }
    },

    async getConnector(id: string): Promise<ConnectorRecord | undefined> {
      const rows = await db
        .select()
        .from(sourceConnectors)
        .where(eq(sourceConnectors.id, id))
        .limit(1)
      return rows[0] ? mapConnector(rows[0]) : undefined
    },

    async findConnectorByApiKey(
      apiKey: string,
    ): Promise<ConnectorRecord | undefined> {
      const hash = hashConnectorApiKey(apiKey)
      const rows = await db
        .select()
        .from(sourceConnectors)
        .where(
          and(
            eq(sourceConnectors.apiKeyHash, hash),
            eq(sourceConnectors.enabled, true),
          ),
        )
        .limit(1)
      return rows[0] ? mapConnector(rows[0]) : undefined
    },

    async touchConnector(id: string): Promise<void> {
      await db
        .update(sourceConnectors)
        .set({ lastUsedAt: new Date(), updatedAt: new Date() })
        .where(eq(sourceConnectors.id, id))
    },

    async setConnectorEnabled(id: string, enabled: boolean): Promise<ConnectorRecord | undefined> {
      await db
        .update(sourceConnectors)
        .set({ enabled, updatedAt: new Date() })
        .where(eq(sourceConnectors.id, id))
      return this.getConnector(id)
    },

    async getSourceEvent(id: string): Promise<SourceEventRecord | undefined> {
      const rows = await db
        .select()
        .from(sourceEvents)
        .where(eq(sourceEvents.id, id))
        .limit(1)
      return rows[0] ? mapEvent(rows[0]) : undefined
    },

    async ingestSourceEvent(
      input: IngestSourceEventInput,
    ): Promise<{ event: SourceEventRecord; duplicate: boolean }> {
      const contentHash = computeContentHash(input.title, input.body)
      const canonicalKey = computeCanonicalKey({
        project: input.projectName ?? null,
        title: input.title,
      })
      const id = randomUUID()
      const now = new Date()

      try {
        await client.begin(async (tx) => {
          await tx`
            INSERT INTO source_events (
              id, connector_id, schema_version, source, event_type,
              external_conversation_id, external_event_id, occurred_at,
              project_name, project_repository, project_branch,
              title, body, content_hash, canonical_key, metadata,
              status, idempotency_key, created_at
            ) VALUES (
              ${id}, ${input.connectorId}, ${input.schemaVersion}, ${input.source},
              ${input.eventType}, ${input.externalConversationId}, ${input.externalEventId},
              ${input.occurredAt}, ${input.projectName ?? null},
              ${input.projectRepository ?? null}, ${input.projectBranch ?? null},
              ${input.title}, ${input.body}, ${contentHash}, ${canonicalKey},
              ${tx.json((input.metadata ?? {}) as never)}, 'received',
              ${input.idempotencyKey ?? null}, ${now}
            )
          `
          await tx`
            INSERT INTO outbox_messages (id, topic, payload, created_at, publish_attempts)
            VALUES (
              ${randomUUID()},
              ${OUTBOX_TOPIC_PROCESS_SOURCE_EVENT},
              ${tx.json({ eventId: id })},
              ${now},
              0
            )
          `
        })
        await this.touchConnector(input.connectorId)
        const event = (await this.getSourceEvent(id))!
        return { event, duplicate: false }
      } catch (error) {
        // Unique violation -> return existing
        const existingByNatural = await db
          .select()
          .from(sourceEvents)
          .where(
            and(
              eq(sourceEvents.connectorId, input.connectorId),
              eq(sourceEvents.externalConversationId, input.externalConversationId),
              eq(sourceEvents.externalEventId, input.externalEventId),
            ),
          )
          .limit(1)
        if (existingByNatural[0]) {
          return { event: mapEvent(existingByNatural[0]), duplicate: true }
        }
        if (input.idempotencyKey) {
          const existingByIdem = await db
            .select()
            .from(sourceEvents)
            .where(
              and(
                eq(sourceEvents.connectorId, input.connectorId),
                eq(sourceEvents.idempotencyKey, input.idempotencyKey),
              ),
            )
            .limit(1)
          if (existingByIdem[0]) {
            return { event: mapEvent(existingByIdem[0]), duplicate: true }
          }
        }
        throw error
      }
    },

    async processSourceEvent(eventId: string): Promise<SourceEventRecord | undefined> {
      const event = await this.getSourceEvent(eventId)
      if (!event) return undefined
      if (
        event.status === 'processed' ||
        event.status === 'duplicate'
      ) {
        return event
      }

      await db
        .update(sourceEvents)
        .set({ status: 'processing' })
        .where(eq(sourceEvents.id, eventId))

      try {
        const memoryType = inferMemoryType(event.title, event.body, event.eventType)
        const sensitivity = evaluateSensitivity(event.title, event.body)

        // Exact content dedupe
        const sameHash = await db
          .select({
            id: memoryCandidates.id,
            status: memoryCandidates.status,
            contentHash: memoryCandidates.contentHash,
            canonicalKey: memoryCandidates.canonicalKey,
          })
          .from(memoryCandidates)
          .where(eq(memoryCandidates.contentHash, event.contentHash))
          .limit(1)

        if (sameHash[0]) {
          const now = new Date()
          await client.begin(async (tx) => {
            await tx`
              UPDATE source_events
              SET status = 'duplicate',
                  candidate_id = ${sameHash[0]!.id},
                  processed_at = ${now},
                  error_summary = NULL
              WHERE id = ${eventId}
            `
            await tx`
              INSERT INTO audit_logs (
                id, actor_type, action, entity_type, entity_id, summary, detail, created_at
              ) VALUES (
                ${randomUUID()}, 'worker', 'source_event.duplicate', 'source_event',
                ${eventId}, ${'精确内容重复，复用已有候选'},
                ${tx.json({ candidateId: sameHash[0]!.id })}, ${now}
              )
            `
          })
          return this.getSourceEvent(eventId)
        }

        // Canonical conflict: same key, different content
        const sameKey = await db
          .select({
            id: memoryCandidates.id,
            contentHash: memoryCandidates.contentHash,
            status: memoryCandidates.status,
          })
          .from(memoryCandidates)
          .where(eq(memoryCandidates.canonicalKey, event.canonicalKey))
          .limit(1)

        const now = new Date()
        const candidateId = randomUUID()
        let status: 'pending' | 'conflict' = 'pending'
        if (
          sameKey[0]?.contentHash &&
          isContentConflict(sameKey[0].contentHash, event.contentHash)
        ) {
          status = 'conflict'
        }

        await client.begin(async (tx) => {
          await tx`
            INSERT INTO memory_candidates (
              id, status, title, body, memory_type, source, project,
              sensitivity, confidence, render_style, emoji_enabled,
              capture_time, created_at, updated_at,
              content_hash, canonical_key, source_event_id, duplicate_of_id
            ) VALUES (
              ${candidateId}, ${status}, ${event.title}, ${event.body},
              ${memoryType}, ${event.source}, ${event.projectName},
              ${sensitivity.sensitivity}, ${sensitivity.blockExternal ? 40 : 80},
              'xhs_note', true, ${event.occurredAt}, ${now}, ${now},
              ${event.contentHash}, ${event.canonicalKey}, ${eventId},
              ${status === 'conflict' ? sameKey[0]!.id : null}
            )
          `
          await tx`
            UPDATE source_events
            SET status = 'processed',
                candidate_id = ${candidateId},
                processed_at = ${now},
                error_summary = NULL
            WHERE id = ${eventId}
          `
          await tx`
            INSERT INTO audit_logs (
              id, actor_type, action, entity_type, entity_id, summary, detail, created_at
            ) VALUES (
              ${randomUUID()}, 'worker', 'source_event.processed', 'source_event',
              ${eventId}, ${status === 'conflict' ? '处理完成（冲突）' : '处理完成'},
              ${tx.json({ candidateId, status, memoryType })}, ${now}
            )
          `
        })
        return this.getSourceEvent(eventId)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'process failed'
        await db
          .update(sourceEvents)
          .set({
            status: 'failed',
            errorSummary: message.slice(0, 1000),
            processedAt: new Date(),
          })
          .where(eq(sourceEvents.id, eventId))
        return this.getSourceEvent(eventId)
      }
    },
  }
}

export type SourceEventOperations = ReturnType<typeof createSourceEventOperations>
