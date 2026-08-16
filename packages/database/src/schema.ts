import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
})

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const memoryCandidates = pgTable('memory_candidates', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  memoryType: text('memory_type').notNull(),
  source: text('source').notNull(),
  project: text('project'),
  sensitivity: text('sensitivity').notNull(),
  confidence: integer('confidence').notNull(),
  renderStyle: text('render_style').notNull().default('xhs_note'),
  emojiEnabled: boolean('emoji_enabled').notNull().default(true),
  rejectionReason: text('rejection_reason'),
  contentHash: text('content_hash'),
  canonicalKey: text('canonical_key'),
  sourceEventId: text('source_event_id'),
  duplicateOfId: text('duplicate_of_id'),
  currentVersionId: text('current_version_id'),
  captureTime: timestamp('capture_time', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const memoryVersions = pgTable(
  'memory_versions',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => memoryCandidates.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    memoryType: text('memory_type').notNull(),
    source: text('source').notNull(),
    project: text('project'),
    sensitivity: text('sensitivity').notNull(),
    confidence: integer('confidence').notNull(),
    renderStyle: text('render_style').notNull(),
    emojiEnabled: boolean('emoji_enabled').notNull(),
    contentHash: text('content_hash').notNull(),
    captureTime: timestamp('capture_time', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    candidateVersionUnique: uniqueIndex('memory_versions_candidate_version_uidx').on(
      table.candidateId,
      table.versionNumber,
    ),
  }),
)

export const archiveTargets = pgTable('archive_targets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  baseUrl: text('base_url').notNull(),
  authHeader: text('auth_header').notNull().default('Authorization'),
  notebookId: text('notebook_id'),
  notebookName: text('notebook_name'),
  pathTemplate: text('path_template')
    .notNull()
    .default('/MemoryHub/10 长期记忆/{type}'),
  allowedHosts: text('allowed_hosts'),
  lastTestStatus: text('last_test_status'),
  lastTestMessage: text('last_test_message'),
  lastTestedAt: timestamp('last_tested_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const archiveDeliveries = pgTable(
  'archive_deliveries',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => memoryCandidates.id, { onDelete: 'cascade' }),
    memoryVersionId: text('memory_version_id')
      .notNull()
      .references(() => memoryVersions.id, { onDelete: 'cascade' }),
    targetId: text('target_id')
      .notNull()
      .references(() => archiveTargets.id, { onDelete: 'restrict' }),
    status: text('status').notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    documentId: text('document_id'),
    blockId: text('block_id'),
    path: text('path'),
    requestFingerprint: text('request_fingerprint'),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    succeededAt: timestamp('succeeded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    versionTargetUnique: uniqueIndex('archive_deliveries_version_target_uidx').on(
      table.memoryVersionId,
      table.targetId,
    ),
  }),
)

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  actorType: text('actor_type').notNull(),
  actorId: text('actor_id'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  summary: text('summary').notNull(),
  detail: jsonb('detail'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const outboxMessages = pgTable('outbox_messages', {
  id: text('id').primaryKey(),
  topic: text('topic').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  publishAttempts: integer('publish_attempts').notNull().default(0),
  lastError: text('last_error'),
})

export const sourceConnectors = pgTable('source_connectors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  apiKeyHash: text('api_key_hash').notNull().unique(),
  keyPrefix: text('key_prefix').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const sourceEvents = pgTable(
  'source_events',
  {
    id: text('id').primaryKey(),
    connectorId: text('connector_id')
      .notNull()
      .references(() => sourceConnectors.id, { onDelete: 'restrict' }),
    schemaVersion: integer('schema_version').notNull(),
    source: text('source').notNull(),
    eventType: text('event_type').notNull(),
    externalConversationId: text('external_conversation_id').notNull(),
    externalEventId: text('external_event_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    projectName: text('project_name'),
    projectRepository: text('project_repository'),
    projectBranch: text('project_branch'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    contentHash: text('content_hash').notNull(),
    canonicalKey: text('canonical_key').notNull(),
    metadata: jsonb('metadata'),
    status: text('status').notNull(),
    candidateId: text('candidate_id'),
    errorSummary: text('error_summary'),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => ({
    naturalKey: uniqueIndex('source_events_natural_key_uidx').on(
      table.connectorId,
      table.externalConversationId,
      table.externalEventId,
    ),
    idempotencyUnique: uniqueIndex('source_events_idempotency_uidx').on(
      table.connectorId,
      table.idempotencyKey,
    ),
  }),
)
