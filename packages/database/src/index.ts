import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { randomUUID } from 'node:crypto'
import { and, count, desc, eq, gt } from 'drizzle-orm'
import {
  archiveDeliveries,
  memoryCandidates,
  sessions,
  users,
} from './schema.js'

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
  captureTime: Date
  updatedAt: Date
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
  approveCandidate(id: string): Promise<CandidateMutationResult>
  rejectCandidate(
    id: string,
    reason?: string | undefined,
  ): Promise<CandidateMutationResult>
}

export const schema = {
  archiveDeliveries,
  memoryCandidates,
  sessions,
  users,
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
    captureTime: row.captureTime,
    updatedAt: row.updatedAt,
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

export function createDatabase(
  databaseUrl: string,
): AuthStore & { close(): Promise<void>; initialize(): Promise<void> } {
  const client = postgres(databaseUrl, { max: 10, prepare: false })
  const db = drizzle(client, { schema })

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
      await db
        .insert(users)
        .values(user)
        .onConflictDoNothing({ target: users.username })
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
        .where(
          and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)),
        )
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
          .where(eq(archiveDeliveries.status, 'queued')),
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
      const row = {
        id: `cand_${randomUUID().replaceAll('-', '')}`,
        status: 'pending',
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
        captureTime: input.captureTime ?? now,
        createdAt: now,
        updatedAt: now,
      }
      await db.insert(memoryCandidates).values(row)
      return mapCandidate(row)
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

      const updatedAt = new Date()
      await db
        .update(memoryCandidates)
        .set({
          title: input.title,
          body: input.body,
          memoryType: input.memoryType,
          project: input.project ?? null,
          renderStyle: input.renderStyle,
          emojiEnabled: input.emojiEnabled,
          updatedAt,
        })
        .where(eq(memoryCandidates.id, id))

      const candidate = await this.getCandidate(id)
      if (!candidate) {
        return {
          ok: false,
          code: 'NOT_FOUND',
          message: '候选记忆不存在。',
        }
      }
      return { ok: true, candidate }
    },

    async approveCandidate(id) {
      const current = await this.getCandidate(id)
      const blocked = pendingOnly(current)
      if (blocked) return blocked

      const updatedAt = new Date()
      await db
        .update(memoryCandidates)
        .set({
          status: 'approved',
          updatedAt,
        })
        .where(eq(memoryCandidates.id, id))

      const candidate = await this.getCandidate(id)
      if (!candidate) {
        return {
          ok: false,
          code: 'NOT_FOUND',
          message: '候选记忆不存在。',
        }
      }
      return { ok: true, candidate }
    },

    async rejectCandidate(id, reason) {
      const current = await this.getCandidate(id)
      const blocked = pendingOnly(current)
      if (blocked) return blocked

      const updatedAt = new Date()
      await db
        .update(memoryCandidates)
        .set({
          status: 'rejected',
          rejectionReason: reason ?? null,
          updatedAt,
        })
        .where(eq(memoryCandidates.id, id))

      const candidate = await this.getCandidate(id)
      if (!candidate) {
        return {
          ok: false,
          code: 'NOT_FOUND',
          message: '候选记忆不存在。',
        }
      }
      return { ok: true, candidate }
    },
  }
}

export function createInMemoryAuthStore(passwordHash: string): AuthStore {
  const storeUsers = new Map<string, DatabaseUser>([
    [
      'admin',
      {
        id: 'usr_local_admin',
        username: 'admin',
        passwordHash,
      },
    ],
  ])
  const storeSessions = new Map<string, { userId: string; expiresAt: Date }>()
  const candidates: CandidateRecord[] = []
  const deliveries: Array<{ id: string; status: string }> = []

  return {
    async isReady() {
      return true
    },
    async findUserByUsername(username) {
      return storeUsers.get(username)
    },
    async createUser(user) {
      if (!storeUsers.has(user.username)) storeUsers.set(user.username, user)
    },
    async updateLastLogin() {},
    async createSession(userId, tokenHash, expiresAt) {
      storeSessions.set(tokenHash, { userId, expiresAt })
    },
    async findSessionUser(tokenHash, now) {
      const session = storeSessions.get(tokenHash)
      if (!session || session.expiresAt <= now) return undefined
      const user = [...storeUsers.values()].find(
        (item) => item.id === session.userId,
      )
      return user ? { id: user.id, username: user.username } : undefined
    },
    async deleteSession(tokenHash) {
      storeSessions.delete(tokenHash)
    },
    async getHomeCounts() {
      return {
        pendingCandidates: candidates.filter(
          (item) => item.status === 'pending',
        ).length,
        queuedDeliveries: deliveries.filter((item) => item.status === 'queued')
          .length,
        archivedMemories: candidates.filter(
          (item) => item.status === 'archived',
        ).length,
      }
    },
    async createCandidate(input) {
      const now = new Date()
      const record: CandidateRecord = {
        id: `cand_${randomUUID().replaceAll('-', '')}`,
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
        return {
          ok: false,
          code: 'NOT_FOUND',
          message: '候选记忆不存在。',
        }
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
        return {
          ok: false,
          code: 'NOT_FOUND',
          message: '候选记忆不存在。',
        }
      }
      const current = candidates[index]!
      const blocked = pendingOnly(current)
      if (blocked) return blocked

      const updated: CandidateRecord = {
        ...current,
        status: 'approved',
        updatedAt: new Date(),
      }
      candidates[index] = updated
      return { ok: true, candidate: updated }
    },
    async rejectCandidate(id, reason) {
      const index = candidates.findIndex((item) => item.id === id)
      if (index < 0) {
        return {
          ok: false,
          code: 'NOT_FOUND',
          message: '候选记忆不存在。',
        }
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
  }
}
