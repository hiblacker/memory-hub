import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { createHash, randomUUID } from 'node:crypto'
import { and, asc, count, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm'

import {
  archiveDeliveries,
  archiveTargets,
  auditLogs,
  memoryCandidates,
  memoryVersions,
  outboxMessages,
  sessions,
  users,
} from './schema.js'
import { DEVELOPMENT_DEMO_MEMORIES } from './demo-memories.js'
import {
  applySourceEventsMigration,
  createSourceEventOperations,
  type ConnectorRecord,
  type ConnectorType,
  type IngestSourceEventInput,
  type SourceEventRecord,
} from './source-events.js'
import { computeCanonicalKey, computeContentHash } from '@memory-hub/core'

export interface DatabaseUser {
  id: string
  username: string
  passwordHash: string
}

export interface DatabaseSessionUser {
  id: string
  username: string
}

export interface HomeCounts {
  pendingCandidates: number
  queuedDeliveries: number
  archivedMemories: number
}

export type MemoryType =
  | 'permanent_fact'
  | 'preference'
  | 'project_context'
  | 'decision'
  | 'temporary_state'
  | 'todo'
  | 'sensitive'

export type CandidateStatus =
  | 'pending'
  | 'approved'
  | 'queued'
  | 'archived'
  | 'rejected'
  | 'conflict'

export type Sensitivity = 'normal' | 'private' | 'strict'
export type RenderStyle = 'xhs_note' | 'tech_clean'
export type DeliveryStatus =
  | 'queued'
  | 'processing'
  | 'succeeded'
  | 'retrying'
  | 'dead_letter'
  | 'blocked'

export interface CandidateRecord {
  id: string
  title: string
  body: string
  memoryType: MemoryType
  source: string
  project: string | null
  status: CandidateStatus
  sensitivity: Sensitivity
  confidence: number
  renderStyle: RenderStyle
  emojiEnabled: boolean
  rejectionReason: string | null
  currentVersionId: string | null
  captureTime: Date
  updatedAt: Date
}

export interface MemoryVersionRecord {
  id: string
  candidateId: string
  versionNumber: number
  title: string
  body: string
  memoryType: MemoryType
  source: string
  project: string | null
  sensitivity: Sensitivity
  confidence: number
  renderStyle: RenderStyle
  emojiEnabled: boolean
  contentHash: string
  captureTime: Date
  createdAt: Date
}

export interface ArchiveTargetRecord {
  id: string
  name: string
  enabled: boolean
  baseUrl: string
  authHeader: string
  notebookId: string | null
  notebookName: string | null
  pathTemplate: string
  allowedHosts: string | null
  lastTestStatus: string | null
  lastTestMessage: string | null
  lastTestedAt: Date | null
  updatedAt: Date
}

export interface ArchiveDeliveryRecord {
  id: string
  candidateId: string
  memoryVersionId: string
  targetId: string
  status: DeliveryStatus
  attemptCount: number
  documentId: string | null
  blockId: string | null
  path: string | null
  requestFingerprint: string | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
  nextAttemptAt: Date | null
  succeededAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface OutboxMessageRecord {
  id: string
  topic: string
  payload: Record<string, unknown>
  createdAt: Date
  publishedAt: Date | null
  publishAttempts: number
  lastError: string | null
}

export interface CreateCandidateInput {
  title: string
  body: string
  memoryType: MemoryType
  project?: string | undefined
  captureTime?: Date | undefined
  renderStyle?: RenderStyle | undefined
  emojiEnabled?: boolean | undefined
}

export interface UpdateCandidateInput {
  title: string
  body: string
  memoryType: MemoryType
  project?: string | undefined
  renderStyle: RenderStyle
  emojiEnabled: boolean
}

export type CandidateMutationResult =
  | { ok: true; candidate: CandidateRecord }
  | { ok: false; code: 'NOT_FOUND' | 'INVALID_STATE'; message: string }

export type ApproveCandidateResult =
  | {
      ok: true
      candidate: CandidateRecord
      delivery: ArchiveDeliveryRecord
      version: MemoryVersionRecord
    }
  | {
      ok: false
      code: 'NOT_FOUND' | 'INVALID_STATE' | 'NO_TARGET'
      message: string
    }

export interface UpsertArchiveTargetInput {
  name?: string
  enabled?: boolean
  baseUrl: string
  authHeader?: string
  notebookId?: string | null
  notebookName?: string | null
  pathTemplate?: string
  allowedHosts?: string | null
}

export interface AuthStore {
  isReady(): Promise<boolean>
  findUserByUsername(username: string): Promise<DatabaseUser | undefined>
  createUser(user: DatabaseUser): Promise<void>
  updateLastLogin(userId: string): Promise<void>
  createSession(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void>
  findSessionUser(
    tokenHash: string,
    now: Date,
  ): Promise<DatabaseSessionUser | undefined>
  deleteSession(tokenHash: string): Promise<void>
  getHomeCounts(): Promise<HomeCounts>
  createCandidate(input: CreateCandidateInput): Promise<CandidateRecord>
  listCandidates(): Promise<CandidateRecord[]>
  getCandidate(id: string): Promise<CandidateRecord | undefined>
  updateCandidate(
    id: string,
    input: UpdateCandidateInput,
  ): Promise<CandidateMutationResult>
  approveCandidate(id: string): Promise<ApproveCandidateResult>
  rejectCandidate(
    id: string,
    reason?: string | undefined,
  ): Promise<CandidateMutationResult>
  getDefaultArchiveTarget(): Promise<ArchiveTargetRecord | undefined>
  upsertDefaultArchiveTarget(
    input: UpsertArchiveTargetInput,
  ): Promise<ArchiveTargetRecord>
  updateArchiveTargetTestResult(
    targetId: string,
    result: {
      status: 'succeeded' | 'failed'
      message: string
      notebookName?: string | null
    },
  ): Promise<void>
  listDeliveriesForCandidate(
    candidateId: string,
  ): Promise<ArchiveDeliveryRecord[]>
  getDelivery(id: string): Promise<ArchiveDeliveryRecord | undefined>
  getMemoryVersion(id: string): Promise<MemoryVersionRecord | undefined>
  claimOutboxBatch(limit: number): Promise<OutboxMessageRecord[]>
  markOutboxPublished(id: string): Promise<void>
  markOutboxPublishFailed(id: string, error: string): Promise<void>
  markDeliveryProcessing(id: string): Promise<ArchiveDeliveryRecord | undefined>
  markDeliverySucceeded(
    id: string,
    input: {
      documentId: string
      blockId: string | null
      path: string
      requestFingerprint: string
    },
  ): Promise<ArchiveDeliveryRecord | undefined>
  markDeliveryFailure(
    id: string,
    input: {
      errorCode: string
      errorMessage: string
      deadLetter?: boolean
      blocked?: boolean
    },
  ): Promise<ArchiveDeliveryRecord | undefined>
  listArchivedCandidates(): Promise<CandidateRecord[]>
  enqueueDeliveryRetry(
    deliveryId: string,
  ): Promise<ArchiveDeliveryRecord | undefined>
  writeAudit(input: {
    actorType: string
    actorId?: string | null
    action: string
    entityType: string
    entityId: string
    summary: string
    detail?: Record<string, unknown> | undefined
  }): Promise<void>
  seedDevelopmentMemories(): Promise<number>
  enqueueSiyuanTest(targetId: string): Promise<void>
  listConnectors(): Promise<ConnectorRecord[]>
  createConnector(input: {
    name: string
    type: ConnectorType
  }): Promise<{ connector: ConnectorRecord; apiKey: string }>
  setConnectorEnabled(
    id: string,
    enabled: boolean,
  ): Promise<ConnectorRecord | undefined>
  findConnectorByApiKey(apiKey: string): Promise<ConnectorRecord | undefined>
  ingestSourceEvent(
    input: IngestSourceEventInput,
  ): Promise<{ event: SourceEventRecord; duplicate: boolean }>
  getSourceEvent(id: string): Promise<SourceEventRecord | undefined>
  processSourceEvent(eventId: string): Promise<SourceEventRecord | undefined>
}

export const schema = {
  archiveDeliveries,
  archiveTargets,
  auditLogs,
  memoryCandidates,
  memoryVersions,
  outboxMessages,
  sessions,
  users,
}

const DEFAULT_TARGET_ID = 'default-siyuan-target'
export const OUTBOX_TOPIC_ARCHIVE_DELIVERY = 'archive.delivery'
export const OUTBOX_TOPIC_SIYUAN_TEST = 'siyuan.test'
export { OUTBOX_TOPIC_PROCESS_SOURCE_EVENT } from './source-events.js'
export type {
  ConnectorRecord,
  ConnectorType,
  IngestSourceEventInput,
  SourceEventRecord,
} from './source-events.js'

function contentHash(title: string, body: string): string {
  return createHash('sha256').update(title + String.fromCharCode(10) + body).digest('hex')
}

function mapCandidate(row: {
  id: string
  status: string
  title: string
  body: string
  memoryType: string
  source: string
  project: string | null
  sensitivity: string
  confidence: number
  renderStyle: string
  emojiEnabled: boolean
  rejectionReason: string | null
  currentVersionId?: string | null
  captureTime: Date
  updatedAt: Date
}): CandidateRecord {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    memoryType: row.memoryType as MemoryType,
    source: row.source,
    project: row.project,
    status: row.status as CandidateStatus,
    sensitivity: row.sensitivity as Sensitivity,
    confidence: row.confidence,
    renderStyle: (row.renderStyle as RenderStyle) || 'xhs_note',
    emojiEnabled: row.emojiEnabled ?? true,
    rejectionReason: row.rejectionReason,
    currentVersionId: row.currentVersionId ?? null,
    captureTime: row.captureTime,
    updatedAt: row.updatedAt,
  }
}

function mapVersion(row: typeof memoryVersions.$inferSelect): MemoryVersionRecord {
  return {
    id: row.id,
    candidateId: row.candidateId,
    versionNumber: row.versionNumber,
    title: row.title,
    body: row.body,
    memoryType: row.memoryType as MemoryType,
    source: row.source,
    project: row.project,
    sensitivity: row.sensitivity as Sensitivity,
    confidence: row.confidence,
    renderStyle: row.renderStyle as RenderStyle,
    emojiEnabled: row.emojiEnabled,
    contentHash: row.contentHash,
    captureTime: row.captureTime,
    createdAt: row.createdAt,
  }
}

function mapTarget(row: typeof archiveTargets.$inferSelect): ArchiveTargetRecord {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    baseUrl: row.baseUrl,
    authHeader: row.authHeader,
    notebookId: row.notebookId,
    notebookName: row.notebookName,
    pathTemplate: row.pathTemplate,
    allowedHosts: row.allowedHosts,
    lastTestStatus: row.lastTestStatus,
    lastTestMessage: row.lastTestMessage,
    lastTestedAt: row.lastTestedAt,
    updatedAt: row.updatedAt,
  }
}

function mapDelivery(
  row: typeof archiveDeliveries.$inferSelect,
): ArchiveDeliveryRecord {
  return {
    id: row.id,
    candidateId: row.candidateId,
    memoryVersionId: row.memoryVersionId,
    targetId: row.targetId,
    status: row.status as DeliveryStatus,
    attemptCount: row.attemptCount,
    documentId: row.documentId,
    blockId: row.blockId,
    path: row.path,
    requestFingerprint: row.requestFingerprint,
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage,
    nextAttemptAt: row.nextAttemptAt,
    succeededAt: row.succeededAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function mapOutbox(row: typeof outboxMessages.$inferSelect): OutboxMessageRecord {
  return {
    id: row.id,
    topic: row.topic,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
    publishedAt: row.publishedAt,
    publishAttempts: row.publishAttempts,
    lastError: row.lastError,
  }
}

const candidateSelect = {
  id: memoryCandidates.id,
  status: memoryCandidates.status,
  title: memoryCandidates.title,
  body: memoryCandidates.body,
  memoryType: memoryCandidates.memoryType,
  source: memoryCandidates.source,
  project: memoryCandidates.project,
  sensitivity: memoryCandidates.sensitivity,
  confidence: memoryCandidates.confidence,
  renderStyle: memoryCandidates.renderStyle,
  emojiEnabled: memoryCandidates.emojiEnabled,
  rejectionReason: memoryCandidates.rejectionReason,
  currentVersionId: memoryCandidates.currentVersionId,
  captureTime: memoryCandidates.captureTime,
  updatedAt: memoryCandidates.updatedAt,
}

function pendingOnly(
  candidate: CandidateRecord | undefined,
): CandidateMutationResult | undefined {
  if (!candidate) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: '候选记忆不存在。',
    }
  }
  if (candidate.status !== 'pending') {
    return {
      ok: false,
      code: 'INVALID_STATE',
      message: '仅待审核候选可执行该操作。',
    }
  }
  return undefined
}

export function createDatabase(databaseUrl: string): AuthStore & {
  initialize(): Promise<void>
  close(): Promise<void>
} {
  const client = postgres(databaseUrl, { max: 10 })
  const db = drizzle(client)
  const sourceOps = createSourceEventOperations(db, client)

  async function writeAuditInternal(input: {
    actorType: string
    actorId?: string | null
    action: string
    entityType: string
    entityId: string
    summary: string
    detail?: Record<string, unknown> | undefined
  }) {
    await db.insert(auditLogs).values({
      id: randomUUID(),
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      detail: input.detail ?? null,
    })
  }

  return {
    async close() {
      await client.end({ timeout: 5 })
    },

    async isReady() {
      try {
        await client`SELECT 1`
        return true
      } catch {
        return false
      }
    },

    async initialize() {
      await client.unsafe(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version integer PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        );
      `)

      const applied = await client<{ version: number }[]>`
        SELECT version FROM schema_migrations WHERE version = 1
      `
      if (applied.length === 0) {
        await client.begin(async (transaction) => {
          await transaction.unsafe(`
            CREATE TABLE IF NOT EXISTS users (
              id text PRIMARY KEY,
              username text NOT NULL UNIQUE,
              password_hash text NOT NULL,
              created_at timestamptz NOT NULL DEFAULT now(),
              last_login_at timestamptz
            );
            CREATE TABLE IF NOT EXISTS sessions (
              id text PRIMARY KEY,
              user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              token_hash text NOT NULL UNIQUE,
              expires_at timestamptz NOT NULL,
              created_at timestamptz NOT NULL DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions(token_hash);
            CREATE TABLE IF NOT EXISTS memory_candidates (
              id text PRIMARY KEY,
              status text NOT NULL,
              title text NOT NULL DEFAULT '',
              body text NOT NULL DEFAULT '',
              memory_type text NOT NULL DEFAULT 'project_context',
              source text NOT NULL DEFAULT 'manual',
              project text,
              sensitivity text NOT NULL DEFAULT 'normal',
              confidence integer NOT NULL DEFAULT 100,
              render_style text NOT NULL DEFAULT 'xhs_note',
              emoji_enabled boolean NOT NULL DEFAULT true,
              rejection_reason text,
              capture_time timestamptz NOT NULL DEFAULT now(),
              created_at timestamptz NOT NULL DEFAULT now(),
              updated_at timestamptz NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS archive_deliveries (
              id text PRIMARY KEY,
              status text NOT NULL,
              created_at timestamptz NOT NULL DEFAULT now()
            );
            INSERT INTO schema_migrations (version) VALUES (1)
            ON CONFLICT (version) DO NOTHING;
          `)
        })
      }

      const appliedV2 = await client<{ version: number }[]>`
        SELECT version FROM schema_migrations WHERE version = 2
      `
      if (appliedV2.length === 0) {
        await client.begin(async (transaction) => {
          await transaction.unsafe(`
            ALTER TABLE memory_candidates
              ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '',
              ADD COLUMN IF NOT EXISTS body text NOT NULL DEFAULT '',
              ADD COLUMN IF NOT EXISTS memory_type text NOT NULL DEFAULT 'project_context',
              ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
              ADD COLUMN IF NOT EXISTS project text,
              ADD COLUMN IF NOT EXISTS sensitivity text NOT NULL DEFAULT 'normal',
              ADD COLUMN IF NOT EXISTS confidence integer NOT NULL DEFAULT 100,
              ADD COLUMN IF NOT EXISTS capture_time timestamptz NOT NULL DEFAULT now(),
              ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
            CREATE INDEX IF NOT EXISTS memory_candidates_status_idx
              ON memory_candidates(status);
            CREATE INDEX IF NOT EXISTS memory_candidates_updated_at_idx
              ON memory_candidates(updated_at DESC);
            INSERT INTO schema_migrations (version) VALUES (2)
            ON CONFLICT (version) DO NOTHING;
          `)
        })
      }

      const appliedV3 = await client<{ version: number }[]>`
        SELECT version FROM schema_migrations WHERE version = 3
      `
      if (appliedV3.length === 0) {
        await client.begin(async (transaction) => {
          await transaction.unsafe(`
            ALTER TABLE memory_candidates
              ADD COLUMN IF NOT EXISTS rejection_reason text;
            INSERT INTO schema_migrations (version) VALUES (3)
            ON CONFLICT (version) DO NOTHING;
          `)
        })
      }

      const appliedV4 = await client<{ version: number }[]>`
        SELECT version FROM schema_migrations WHERE version = 4
      `
      if (appliedV4.length === 0) {
        await client.begin(async (transaction) => {
          await transaction.unsafe(`
            ALTER TABLE memory_candidates
              ADD COLUMN IF NOT EXISTS render_style text NOT NULL DEFAULT 'xhs_note',
              ADD COLUMN IF NOT EXISTS emoji_enabled boolean NOT NULL DEFAULT true;
            INSERT INTO schema_migrations (version) VALUES (4)
            ON CONFLICT (version) DO NOTHING;
          `)
        })
      }

      const appliedV5 = await client<{ version: number }[]>`
        SELECT version FROM schema_migrations WHERE version = 5
      `
      if (appliedV5.length === 0) {
        await client.begin(async (transaction) => {
          await transaction.unsafe(`
            ALTER TABLE memory_candidates
              ADD COLUMN IF NOT EXISTS current_version_id text;

            CREATE TABLE IF NOT EXISTS memory_versions (
              id text PRIMARY KEY,
              candidate_id text NOT NULL REFERENCES memory_candidates(id) ON DELETE CASCADE,
              version_number integer NOT NULL,
              title text NOT NULL,
              body text NOT NULL,
              memory_type text NOT NULL,
              source text NOT NULL,
              project text,
              sensitivity text NOT NULL,
              confidence integer NOT NULL,
              render_style text NOT NULL,
              emoji_enabled boolean NOT NULL,
              content_hash text NOT NULL,
              capture_time timestamptz NOT NULL,
              created_at timestamptz NOT NULL DEFAULT now()
            );
            CREATE UNIQUE INDEX IF NOT EXISTS memory_versions_candidate_version_uidx
              ON memory_versions(candidate_id, version_number);

            CREATE TABLE IF NOT EXISTS archive_targets (
              id text PRIMARY KEY,
              name text NOT NULL,
              enabled boolean NOT NULL DEFAULT true,
              base_url text NOT NULL,
              auth_header text NOT NULL DEFAULT 'X-Auth-Token',
              notebook_id text,
              notebook_name text,
              path_template text NOT NULL DEFAULT '/MemoryHub/10 长期记忆/{type}',
              allowed_hosts text,
              last_test_status text,
              last_test_message text,
              last_tested_at timestamptz,
              created_at timestamptz NOT NULL DEFAULT now(),
              updated_at timestamptz NOT NULL DEFAULT now()
            );

            ALTER TABLE archive_deliveries
              ADD COLUMN IF NOT EXISTS candidate_id text,
              ADD COLUMN IF NOT EXISTS memory_version_id text,
              ADD COLUMN IF NOT EXISTS target_id text,
              ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
              ADD COLUMN IF NOT EXISTS document_id text,
              ADD COLUMN IF NOT EXISTS block_id text,
              ADD COLUMN IF NOT EXISTS path text,
              ADD COLUMN IF NOT EXISTS request_fingerprint text,
              ADD COLUMN IF NOT EXISTS last_error_code text,
              ADD COLUMN IF NOT EXISTS last_error_message text,
              ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
              ADD COLUMN IF NOT EXISTS succeeded_at timestamptz,
              ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

            CREATE TABLE IF NOT EXISTS audit_logs (
              id text PRIMARY KEY,
              actor_type text NOT NULL,
              actor_id text,
              action text NOT NULL,
              entity_type text NOT NULL,
              entity_id text NOT NULL,
              summary text NOT NULL,
              detail jsonb,
              created_at timestamptz NOT NULL DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
              ON audit_logs(entity_type, entity_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS outbox_messages (
              id text PRIMARY KEY,
              topic text NOT NULL,
              payload jsonb NOT NULL,
              created_at timestamptz NOT NULL DEFAULT now(),
              published_at timestamptz,
              publish_attempts integer NOT NULL DEFAULT 0,
              last_error text
            );
            CREATE INDEX IF NOT EXISTS outbox_messages_unpublished_idx
              ON outbox_messages(created_at)
              WHERE published_at IS NULL;

            INSERT INTO archive_targets (
              id, name, enabled, base_url, auth_header, path_template, allowed_hosts
            ) VALUES (
              'default-siyuan-target',
              '默认思源目标',
              true,
              'http://192.168.1.10:1166',
              'X-Auth-Token',
              '/MemoryHub/10 长期记忆/{type}',
              '192.168.1.10,127.0.0.1,localhost'
            ) ON CONFLICT (id) DO NOTHING;

            INSERT INTO schema_migrations (version) VALUES (5)
            ON CONFLICT (version) DO NOTHING;
          `)
        })

        await client.unsafe(`
          DELETE FROM archive_deliveries
          WHERE memory_version_id IS NULL OR target_id IS NULL OR candidate_id IS NULL;
        `)
        await client.unsafe(`
          CREATE UNIQUE INDEX IF NOT EXISTS archive_deliveries_version_target_uidx
            ON archive_deliveries(memory_version_id, target_id);
        `)
      }

      await applySourceEventsMigration(client)
    },

    async findUserByUsername(username) {
      const rows = await db
        .select({
          id: users.id,
          username: users.username,
          passwordHash: users.passwordHash,
        })
        .from(users)
        .where(eq(users.username, username))
        .limit(1)
      return rows[0]
    },

    async createUser(user) {
      await db.insert(users).values({
        id: user.id,
        username: user.username,
        passwordHash: user.passwordHash,
      })
    },

    async updateLastLogin(userId) {
      await db
        .update(users)
        .set({ lastLoginAt: new Date() })
        .where(eq(users.id, userId))
    },

    async createSession(userId, tokenHash, expiresAt) {
      await db.insert(sessions).values({
        id: randomUUID(),
        userId,
        tokenHash,
        expiresAt,
      })
    },

    async findSessionUser(tokenHash, now) {
      const rows = await db
        .select({
          id: users.id,
          username: users.username,
        })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
        .limit(1)
      return rows[0]
    },

    async deleteSession(tokenHash) {
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash))
    },

    async getHomeCounts() {
      const [pending, queued, archived] = await Promise.all([
        db
          .select({ value: count() })
          .from(memoryCandidates)
          .where(eq(memoryCandidates.status, 'pending')),
        db
          .select({ value: count() })
          .from(archiveDeliveries)
          .where(
            inArray(archiveDeliveries.status, ['queued', 'processing', 'retrying']),
          ),
        db
          .select({ value: count() })
          .from(memoryCandidates)
          .where(eq(memoryCandidates.status, 'archived')),
      ])
      return {
        pendingCandidates: Number(pending[0]?.value ?? 0),
        queuedDeliveries: Number(queued[0]?.value ?? 0),
        archivedMemories: Number(archived[0]?.value ?? 0),
      }
    },

    async createCandidate(input) {
      const now = new Date()
      const record = {
        id: randomUUID(),
        status: 'pending' as const,
        title: input.title,
        body: input.body,
        memoryType: input.memoryType,
        source: 'manual',
        project: input.project ?? null,
        sensitivity: 'normal' as const,
        confidence: 100,
        renderStyle: input.renderStyle ?? 'xhs_note',
        emojiEnabled: input.emojiEnabled ?? true,
        rejectionReason: null,
        currentVersionId: null,
        captureTime: input.captureTime ?? now,
        createdAt: now,
        updatedAt: now,
      }
      await db.insert(memoryCandidates).values(record)
      return mapCandidate(record)
    },

    async listCandidates() {
      const rows = await db
        .select(candidateSelect)
        .from(memoryCandidates)
        .orderBy(desc(memoryCandidates.updatedAt))
      return rows.map(mapCandidate)
    },

    async getCandidate(id) {
      const rows = await db
        .select(candidateSelect)
        .from(memoryCandidates)
        .where(eq(memoryCandidates.id, id))
        .limit(1)
      return rows[0] ? mapCandidate(rows[0]) : undefined
    },

    async updateCandidate(id, input) {
      const current = await this.getCandidate(id)
      const blocked = pendingOnly(current)
      if (blocked) return blocked

      const now = new Date()
      await db
        .update(memoryCandidates)
        .set({
          title: input.title,
          body: input.body,
          memoryType: input.memoryType,
          project: input.project ?? null,
          renderStyle: input.renderStyle,
          emojiEnabled: input.emojiEnabled,
          updatedAt: now,
        })
        .where(eq(memoryCandidates.id, id))

      const updated = await this.getCandidate(id)
      return { ok: true, candidate: updated! }
    },

    async approveCandidate(id) {
      const current = await this.getCandidate(id)
      if (!current) {
        return { ok: false, code: 'NOT_FOUND', message: '候选记忆不存在。' }
      }
      if (current.status !== 'pending') {
        return {
          ok: false,
          code: 'INVALID_STATE',
          message: '仅待审核候选可批准归档。',
        }
      }

      const target = await this.getDefaultArchiveTarget()
      if (!target || !target.enabled) {
        return {
          ok: false,
          code: 'NO_TARGET',
          message: '未配置可用的思源归档目标。',
        }
      }
      if (!target.notebookId) {
        return {
          ok: false,
          code: 'NO_TARGET',
          message: '请先在设置中选择思源笔记本并完成连接测试。',
        }
      }

      const now = new Date()
      const versionId = randomUUID()
      const deliveryId = randomUUID()
      const versionNumber = 1
      const hash = contentHash(current.title, current.body)

      await client.begin(async (tx) => {
        await tx`
          INSERT INTO memory_versions (
            id, candidate_id, version_number, title, body, memory_type, source,
            project, sensitivity, confidence, render_style, emoji_enabled,
            content_hash, capture_time, created_at
          ) VALUES (
            ${versionId}, ${current.id}, ${versionNumber}, ${current.title},
            ${current.body}, ${current.memoryType}, ${current.source},
            ${current.project}, ${current.sensitivity}, ${current.confidence},
            ${current.renderStyle}, ${current.emojiEnabled}, ${hash},
            ${current.captureTime}, ${now}
          )
        `
        await tx`
          INSERT INTO archive_deliveries (
            id, candidate_id, memory_version_id, target_id, status, attempt_count,
            created_at, updated_at
          ) VALUES (
            ${deliveryId}, ${current.id}, ${versionId}, ${target.id}, 'queued', 0,
            ${now}, ${now}
          )
        `
        await tx`
          UPDATE memory_candidates
          SET status = 'queued',
              current_version_id = ${versionId},
              rejection_reason = NULL,
              updated_at = ${now}
          WHERE id = ${current.id}
        `
        await tx`
          INSERT INTO audit_logs (
            id, actor_type, action, entity_type, entity_id, summary, detail, created_at
          ) VALUES (
            ${randomUUID()}, 'user', 'candidate.approve', 'memory_candidate',
            ${current.id}, ${'批准候选并进入归档队列'},
            ${tx.json({ deliveryId, versionId, targetId: target.id })},
            ${now}
          )
        `
        await tx`
          INSERT INTO outbox_messages (id, topic, payload, created_at, publish_attempts)
          VALUES (
            ${randomUUID()},
            ${OUTBOX_TOPIC_ARCHIVE_DELIVERY},
            ${tx.json({ deliveryId })},
            ${now},
            0
          )
        `
      })

      const candidate = (await this.getCandidate(id))!
      const delivery = (await this.getDelivery(deliveryId))!
      const version = (await this.getMemoryVersion(versionId))!
      return { ok: true, candidate, delivery, version }
    },

    async rejectCandidate(id, reason) {
      const current = await this.getCandidate(id)
      const blocked = pendingOnly(current)
      if (blocked) return blocked
      const now = new Date()
      await db
        .update(memoryCandidates)
        .set({
          status: 'rejected',
          rejectionReason: reason ?? null,
          updatedAt: now,
        })
        .where(eq(memoryCandidates.id, id))
      await writeAuditInternal({
        actorType: 'user',
        action: 'candidate.reject',
        entityType: 'memory_candidate',
        entityId: id,
        summary: '拒绝候选记忆',
        ...(reason ? { detail: { reason } as Record<string, unknown> } : {}),
      })
      const updated = await this.getCandidate(id)
      return { ok: true, candidate: updated! }
    },

    async getDefaultArchiveTarget() {
      const rows = await db
        .select()
        .from(archiveTargets)
        .where(eq(archiveTargets.id, DEFAULT_TARGET_ID))
        .limit(1)
      return rows[0] ? mapTarget(rows[0]) : undefined
    },

    async upsertDefaultArchiveTarget(input) {
      const now = new Date()
      const existing = await this.getDefaultArchiveTarget()
      if (!existing) {
        const record = {
          id: DEFAULT_TARGET_ID,
          name: input.name ?? '默认思源目标',
          enabled: input.enabled ?? true,
          baseUrl: input.baseUrl,
          authHeader: input.authHeader ?? 'X-Auth-Token',
          notebookId: input.notebookId ?? null,
          notebookName: input.notebookName ?? null,
          pathTemplate:
            input.pathTemplate ?? '/MemoryHub/10 长期记忆/{type}',
          allowedHosts: input.allowedHosts ?? null,
          lastTestStatus: null,
          lastTestMessage: null,
          lastTestedAt: null,
          createdAt: now,
          updatedAt: now,
        }
        await db.insert(archiveTargets).values(record)
        return mapTarget(record)
      }

      await db
        .update(archiveTargets)
        .set({
          name: input.name ?? existing.name,
          enabled: input.enabled ?? existing.enabled,
          baseUrl: input.baseUrl,
          authHeader: input.authHeader ?? existing.authHeader,
          notebookId:
            input.notebookId === undefined
              ? existing.notebookId
              : input.notebookId,
          notebookName:
            input.notebookName === undefined
              ? existing.notebookName
              : input.notebookName,
          pathTemplate: input.pathTemplate ?? existing.pathTemplate,
          allowedHosts:
            input.allowedHosts === undefined
              ? existing.allowedHosts
              : input.allowedHosts,
          updatedAt: now,
        })
        .where(eq(archiveTargets.id, DEFAULT_TARGET_ID))
      return (await this.getDefaultArchiveTarget())!
    },

    async updateArchiveTargetTestResult(targetId, result) {
      await db
        .update(archiveTargets)
        .set({
          lastTestStatus: result.status,
          lastTestMessage: result.message,
          lastTestedAt: new Date(),
          notebookName:
            result.notebookName === undefined
              ? undefined
              : result.notebookName,
          updatedAt: new Date(),
        })
        .where(eq(archiveTargets.id, targetId))
    },

    async listDeliveriesForCandidate(candidateId) {
      const rows = await db
        .select()
        .from(archiveDeliveries)
        .where(eq(archiveDeliveries.candidateId, candidateId))
        .orderBy(desc(archiveDeliveries.createdAt))
      return rows.map(mapDelivery)
    },

    async getDelivery(id) {
      const rows = await db
        .select()
        .from(archiveDeliveries)
        .where(eq(archiveDeliveries.id, id))
        .limit(1)
      return rows[0] ? mapDelivery(rows[0]) : undefined
    },

    async getMemoryVersion(id) {
      const rows = await db
        .select()
        .from(memoryVersions)
        .where(eq(memoryVersions.id, id))
        .limit(1)
      return rows[0] ? mapVersion(rows[0]) : undefined
    },

    async claimOutboxBatch(limit) {
      const rows = await db
        .select()
        .from(outboxMessages)
        .where(isNull(outboxMessages.publishedAt))
        .orderBy(asc(outboxMessages.createdAt))
        .limit(limit)
      return rows.map(mapOutbox)
    },

    async markOutboxPublished(id) {
      await db
        .update(outboxMessages)
        .set({
          publishedAt: new Date(),
          lastError: null,
          publishAttempts: sql`${outboxMessages.publishAttempts} + 1`,
        })
        .where(eq(outboxMessages.id, id))
    },

    async markOutboxPublishFailed(id, error) {
      await db
        .update(outboxMessages)
        .set({
          lastError: error.slice(0, 1000),
          publishAttempts: sql`${outboxMessages.publishAttempts} + 1`,
        })
        .where(eq(outboxMessages.id, id))
    },

    async markDeliveryProcessing(id) {
      const current = await this.getDelivery(id)
      if (!current) return undefined
      if (current.status === 'succeeded') return current
      const now = new Date()
      await db
        .update(archiveDeliveries)
        .set({
          status: 'processing',
          attemptCount: current.attemptCount + 1,
          updatedAt: now,
          lastErrorCode: null,
          lastErrorMessage: null,
        })
        .where(eq(archiveDeliveries.id, id))
      return this.getDelivery(id)
    },

    async markDeliverySucceeded(id, input) {
      const now = new Date()
      await client.begin(async (tx) => {
        const rows = await tx<{ candidate_id: string }[]>`
          UPDATE archive_deliveries
          SET status = 'succeeded',
              document_id = ${input.documentId},
              block_id = ${input.blockId},
              path = ${input.path},
              request_fingerprint = ${input.requestFingerprint},
              succeeded_at = ${now},
              updated_at = ${now},
              last_error_code = NULL,
              last_error_message = NULL
          WHERE id = ${id}
          RETURNING candidate_id
        `
        const candidateId = rows[0]?.candidate_id
        if (candidateId) {
          await tx`
            UPDATE memory_candidates
            SET status = 'archived', updated_at = ${now}
            WHERE id = ${candidateId}
          `
          await tx`
            INSERT INTO audit_logs (
              id, actor_type, action, entity_type, entity_id, summary, detail, created_at
            ) VALUES (
              ${randomUUID()}, 'worker', 'delivery.succeeded', 'archive_delivery',
              ${id}, ${'思源归档成功'},
              ${tx.json({ documentId: input.documentId, blockId: input.blockId })},
              ${now}
            )
          `
        }
      })
      return this.getDelivery(id)
    },

    async markDeliveryFailure(id, input) {
      const now = new Date()
      const status = input.blocked
        ? 'blocked'
        : input.deadLetter
          ? 'dead_letter'
          : 'retrying'
      await db
        .update(archiveDeliveries)
        .set({
          status,
          lastErrorCode: input.errorCode,
          lastErrorMessage: input.errorMessage.slice(0, 1000),
          updatedAt: now,
          nextAttemptAt:
            input.deadLetter || input.blocked
              ? null
              : new Date(now.getTime() + 30_000),
        })
        .where(eq(archiveDeliveries.id, id))
      await writeAuditInternal({
        actorType: 'worker',
        action: `delivery.${status}`,
        entityType: 'archive_delivery',
        entityId: id,
        summary: input.errorMessage.slice(0, 200),
        detail: { errorCode: input.errorCode },
      })
      return this.getDelivery(id)
    },

    async listArchivedCandidates() {
      const rows = await db
        .select(candidateSelect)
        .from(memoryCandidates)
        .where(eq(memoryCandidates.status, 'archived'))
        .orderBy(desc(memoryCandidates.updatedAt))
      return rows.map(mapCandidate)
    },

    async enqueueDeliveryRetry(deliveryId) {
      const delivery = await this.getDelivery(deliveryId)
      if (!delivery) return undefined
      if (delivery.status === 'succeeded') return delivery
      const now = new Date()
      await client.begin(async (tx) => {
        await tx`
          UPDATE archive_deliveries
          SET status = 'queued', updated_at = ${now}, next_attempt_at = NULL
          WHERE id = ${deliveryId}
        `
        await tx`
          INSERT INTO outbox_messages (id, topic, payload, created_at, publish_attempts)
          VALUES (
            ${randomUUID()},
            ${OUTBOX_TOPIC_ARCHIVE_DELIVERY},
            ${tx.json({ deliveryId })},
            ${now},
            0
          )
        `
      })
      return this.getDelivery(deliveryId)
    },

    async writeAudit(input) {
      await writeAuditInternal(input)
    },

    async enqueueSiyuanTest(targetId) {
      const now = new Date()
      await client`
        INSERT INTO outbox_messages (id, topic, payload, created_at, publish_attempts)
        VALUES (
          ${randomUUID()},
          ${OUTBOX_TOPIC_SIYUAN_TEST},
          ${client.json({ targetId })},
          ${now},
          0
        )
      `
      await writeAuditInternal({
        actorType: 'user',
        action: 'settings.siyuan.test_queued',
        entityType: 'archive_target',
        entityId: targetId,
        summary: '思源连接测试已进入 outbox',
      })
    },

    listConnectors: () => sourceOps.listConnectors(),
    createConnector: (input) => sourceOps.createConnector(input),
    setConnectorEnabled: (id, enabled) => sourceOps.setConnectorEnabled(id, enabled),
    findConnectorByApiKey: (apiKey) => sourceOps.findConnectorByApiKey(apiKey),
    ingestSourceEvent: (input) => sourceOps.ingestSourceEvent(input),
    getSourceEvent: (id) => sourceOps.getSourceEvent(id),
    processSourceEvent: (eventId) => sourceOps.processSourceEvent(eventId),
    async seedDevelopmentMemories() {
      let seeded = 0
      for (const item of DEVELOPMENT_DEMO_MEMORIES) {
        const existing = await db
          .select({ id: memoryCandidates.id })
          .from(memoryCandidates)
          .where(eq(memoryCandidates.title, item.title))
          .limit(1)
        if (existing.length > 0) continue
        await this.createCandidate({
          title: item.title,
          body: item.body,
          memoryType: item.memoryType,
          project: item.project,
          renderStyle: item.renderStyle,
          emojiEnabled: item.emojiEnabled,
        })
        seeded += 1
      }
      return seeded
    },
  }
}

export function createMemoryStore(): AuthStore {
  const userMap = new Map<string, DatabaseUser>()
  const sessionMap = new Map<
    string,
    { userId: string; tokenHash: string; expiresAt: Date }
  >()
  const candidates: CandidateRecord[] = []
  const versions = new Map<string, MemoryVersionRecord>()
  const deliveries = new Map<string, ArchiveDeliveryRecord>()
  const outbox: OutboxMessageRecord[] = []
  let target: ArchiveTargetRecord = {
    id: DEFAULT_TARGET_ID,
    name: '默认思源目标',
    enabled: true,
    baseUrl: 'http://192.168.1.10:1166',
    authHeader: 'X-Auth-Token',
    notebookId: 'notebook-dev',
    notebookName: 'Dev Notebook',
    pathTemplate: '/MemoryHub/10 长期记忆/{type}',
    allowedHosts: '192.168.1.10,127.0.0.1,localhost',
    lastTestStatus: 'succeeded',
    lastTestMessage: 'ok',
    lastTestedAt: new Date(),
    updatedAt: new Date(),
  }

  return {
    async isReady() {
      return true
    },
    async findUserByUsername(username) {
      return [...userMap.values()].find((item) => item.username === username)
    },
    async createUser(user) {
      userMap.set(user.id, user)
    },
    async updateLastLogin() {},
    async createSession(userId, tokenHash, expiresAt) {
      sessionMap.set(tokenHash, { userId, tokenHash, expiresAt })
    },
    async findSessionUser(tokenHash, now) {
      const session = sessionMap.get(tokenHash)
      if (!session || session.expiresAt <= now) return undefined
      const user = userMap.get(session.userId)
      return user ? { id: user.id, username: user.username } : undefined
    },
    async deleteSession(tokenHash) {
      sessionMap.delete(tokenHash)
    },
    async getHomeCounts() {
      return {
        pendingCandidates: candidates.filter((item) => item.status === 'pending')
          .length,
        queuedDeliveries: [...deliveries.values()].filter((item) =>
          ['queued', 'processing', 'retrying'].includes(item.status),
        ).length,
        archivedMemories: candidates.filter((item) => item.status === 'archived')
          .length,
      }
    },
    async createCandidate(input) {
      const now = new Date()
      const record: CandidateRecord = {
        id: randomUUID(),
        title: input.title,
        body: input.body,
        memoryType: input.memoryType,
        source: 'manual',
        project: input.project ?? null,
        status: 'pending',
        sensitivity: 'normal',
        confidence: 100,
        renderStyle: input.renderStyle ?? 'xhs_note',
        emojiEnabled: input.emojiEnabled ?? true,
        rejectionReason: null,
        currentVersionId: null,
        captureTime: input.captureTime ?? now,
        updatedAt: now,
      }
      candidates.unshift(record)
      return record
    },
    async listCandidates() {
      return [...candidates].sort(
        (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
      )
    },
    async getCandidate(id) {
      return candidates.find((item) => item.id === id)
    },
    async updateCandidate(id, input) {
      const index = candidates.findIndex((item) => item.id === id)
      if (index < 0) {
        return { ok: false, code: 'NOT_FOUND', message: '候选记忆不存在。' }
      }
      const current = candidates[index]!
      const blocked = pendingOnly(current)
      if (blocked) return blocked
      const updated: CandidateRecord = {
        ...current,
        title: input.title,
        body: input.body,
        memoryType: input.memoryType,
        project: input.project ?? null,
        renderStyle: input.renderStyle,
        emojiEnabled: input.emojiEnabled,
        updatedAt: new Date(),
      }
      candidates[index] = updated
      return { ok: true, candidate: updated }
    },
    async approveCandidate(id) {
      const index = candidates.findIndex((item) => item.id === id)
      if (index < 0) {
        return { ok: false, code: 'NOT_FOUND', message: '候选记忆不存在。' }
      }
      const current = candidates[index]!
      if (current.status !== 'pending') {
        return {
          ok: false,
          code: 'INVALID_STATE',
          message: '仅待审核候选可批准归档。',
        }
      }
      if (!target.enabled || !target.notebookId) {
        return {
          ok: false,
          code: 'NO_TARGET',
          message: '未配置可用的思源归档目标。',
        }
      }
      const now = new Date()
      const version: MemoryVersionRecord = {
        id: randomUUID(),
        candidateId: current.id,
        versionNumber: 1,
        title: current.title,
        body: current.body,
        memoryType: current.memoryType,
        source: current.source,
        project: current.project,
        sensitivity: current.sensitivity,
        confidence: current.confidence,
        renderStyle: current.renderStyle,
        emojiEnabled: current.emojiEnabled,
        contentHash: contentHash(current.title, current.body),
        captureTime: current.captureTime,
        createdAt: now,
      }
      versions.set(version.id, version)
      const delivery: ArchiveDeliveryRecord = {
        id: randomUUID(),
        candidateId: current.id,
        memoryVersionId: version.id,
        targetId: target.id,
        status: 'queued',
        attemptCount: 0,
        documentId: null,
        blockId: null,
        path: null,
        requestFingerprint: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        nextAttemptAt: null,
        succeededAt: null,
        createdAt: now,
        updatedAt: now,
      }
      deliveries.set(delivery.id, delivery)
      outbox.push({
        id: randomUUID(),
        topic: OUTBOX_TOPIC_ARCHIVE_DELIVERY,
        payload: { deliveryId: delivery.id },
        createdAt: now,
        publishedAt: null,
        publishAttempts: 0,
        lastError: null,
      })
      const updated: CandidateRecord = {
        ...current,
        status: 'queued',
        currentVersionId: version.id,
        updatedAt: now,
      }
      candidates[index] = updated
      return { ok: true, candidate: updated, delivery, version }
    },
    async rejectCandidate(id, reason) {
      const index = candidates.findIndex((item) => item.id === id)
      if (index < 0) {
        return { ok: false, code: 'NOT_FOUND', message: '候选记忆不存在。' }
      }
      const current = candidates[index]!
      const blocked = pendingOnly(current)
      if (blocked) return blocked
      const updated: CandidateRecord = {
        ...current,
        status: 'rejected',
        rejectionReason: reason ?? null,
        updatedAt: new Date(),
      }
      candidates[index] = updated
      return { ok: true, candidate: updated }
    },
    async getDefaultArchiveTarget() {
      return target
    },
    async upsertDefaultArchiveTarget(input) {
      target = {
        ...target,
        name: input.name ?? target.name,
        enabled: input.enabled ?? target.enabled,
        baseUrl: input.baseUrl,
        authHeader: input.authHeader ?? target.authHeader,
        notebookId:
          input.notebookId === undefined ? target.notebookId : input.notebookId,
        notebookName:
          input.notebookName === undefined
            ? target.notebookName
            : input.notebookName,
        pathTemplate: input.pathTemplate ?? target.pathTemplate,
        allowedHosts:
          input.allowedHosts === undefined
            ? target.allowedHosts
            : input.allowedHosts,
        updatedAt: new Date(),
      }
      return target
    },
    async updateArchiveTargetTestResult(targetId, result) {
      if (target.id !== targetId) return
      target = {
        ...target,
        lastTestStatus: result.status,
        lastTestMessage: result.message,
        lastTestedAt: new Date(),
        notebookName:
          result.notebookName === undefined
            ? target.notebookName
            : result.notebookName,
        updatedAt: new Date(),
      }
    },
    async listDeliveriesForCandidate(candidateId) {
      return [...deliveries.values()]
        .filter((item) => item.candidateId === candidateId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    },
    async getDelivery(id) {
      return deliveries.get(id)
    },
    async getMemoryVersion(id) {
      return versions.get(id)
    },
    async claimOutboxBatch(limit) {
      return outbox.filter((item) => !item.publishedAt).slice(0, limit)
    },
    async markOutboxPublished(id) {
      const item = outbox.find((row) => row.id === id)
      if (!item) return
      item.publishedAt = new Date()
      item.publishAttempts += 1
      item.lastError = null
    },
    async markOutboxPublishFailed(id, error) {
      const item = outbox.find((row) => row.id === id)
      if (!item) return
      item.publishAttempts += 1
      item.lastError = error
    },
    async markDeliveryProcessing(id) {
      const item = deliveries.get(id)
      if (!item) return undefined
      if (item.status === 'succeeded') return item
      const updated = {
        ...item,
        status: 'processing' as const,
        attemptCount: item.attemptCount + 1,
        updatedAt: new Date(),
      }
      deliveries.set(id, updated)
      return updated
    },
    async markDeliverySucceeded(id, input) {
      const item = deliveries.get(id)
      if (!item) return undefined
      const updated: ArchiveDeliveryRecord = {
        ...item,
        status: 'succeeded',
        documentId: input.documentId,
        blockId: input.blockId,
        path: input.path,
        requestFingerprint: input.requestFingerprint,
        succeededAt: new Date(),
        updatedAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
      }
      deliveries.set(id, updated)
      const index = candidates.findIndex((row) => row.id === item.candidateId)
      if (index >= 0) {
        candidates[index] = {
          ...candidates[index]!,
          status: 'archived',
          updatedAt: new Date(),
        }
      }
      return updated
    },
    async markDeliveryFailure(id, input) {
      const item = deliveries.get(id)
      if (!item) return undefined
      const status: DeliveryStatus = input.blocked
        ? 'blocked'
        : input.deadLetter
          ? 'dead_letter'
          : 'retrying'
      const updated: ArchiveDeliveryRecord = {
        ...item,
        status,
        lastErrorCode: input.errorCode,
        lastErrorMessage: input.errorMessage,
        updatedAt: new Date(),
      }
      deliveries.set(id, updated)
      return updated
    },
    async listArchivedCandidates() {
      return candidates.filter((item) => item.status === 'archived')
    },
    async enqueueDeliveryRetry(deliveryId) {
      const item = deliveries.get(deliveryId)
      if (!item) return undefined
      const updated = {
        ...item,
        status: 'queued' as const,
        updatedAt: new Date(),
      }
      deliveries.set(deliveryId, updated)
      outbox.push({
        id: randomUUID(),
        topic: OUTBOX_TOPIC_ARCHIVE_DELIVERY,
        payload: { deliveryId },
        createdAt: new Date(),
        publishedAt: null,
        publishAttempts: 0,
        lastError: null,
      })
      return updated
    },
    async listConnectors() { return [] },
    async createConnector(input) {
      const now = new Date()
      const connector: ConnectorRecord = {
        id: randomUUID(),
        name: input.name,
        type: input.type,
        apiKeyHash: 'hash',
        keyPrefix: 'mh_test',
        enabled: true,
        lastUsedAt: null,
        createdAt: now,
        updatedAt: now,
      }
      return { connector, apiKey: 'mh_test_key_for_memory_store' }
    },
    async setConnectorEnabled() { return undefined },
    async findConnectorByApiKey() { return undefined },
    async ingestSourceEvent() {
      throw new Error('in-memory ingest not implemented')
    },
    async getSourceEvent() { return undefined },
    async processSourceEvent() { return undefined },
    async writeAudit() {},
    async enqueueSiyuanTest(targetId) {
      outbox.push({
        id: randomUUID(),
        topic: OUTBOX_TOPIC_SIYUAN_TEST,
        payload: { targetId },
        createdAt: new Date(),
        publishedAt: null,
        publishAttempts: 0,
        lastError: null,
      })
    },
    async seedDevelopmentMemories() {
      return 0
    },
  }
}

export function createInMemoryAuthStore(passwordHash: string): AuthStore {
  const store = createMemoryStore()
  // In-memory createUser writes to Map before returning; no need to await.
  void store.createUser({
    id: 'usr_local_admin',
    username: 'admin',
    passwordHash,
  })
  return store
}
