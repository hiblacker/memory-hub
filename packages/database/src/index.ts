import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { randomUUID } from 'node:crypto'
import { and, count, eq, gt } from 'drizzle-orm'
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
}

export const schema = {
  archiveDeliveries,
  memoryCandidates,
  sessions,
  users,
}

export function createDatabase(
  databaseUrl: string,
): AuthStore & { close(): Promise<void>; initialize(): Promise<void> } {
  const client = postgres(databaseUrl, { max: 10, prepare: false })
  const db = drizzle(client, { schema })

  return {
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
      if (applied.length > 0) return

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
            created_at timestamptz NOT NULL DEFAULT now()
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
          .from(archiveDeliveries)
          .where(eq(archiveDeliveries.status, 'succeeded')),
      ])
      return {
        pendingCandidates: Number(pending[0]?.value ?? 0),
        queuedDeliveries: Number(queued[0]?.value ?? 0),
        archivedMemories: Number(archived[0]?.value ?? 0),
      }
    },

    async close() {
      await client.end({ timeout: 5 })
    },
  }
}

export function createInMemoryAuthStore(initialPasswordHash = ''): AuthStore {
  const user: DatabaseUser = {
    id: 'usr_local_admin',
    username: 'admin',
    passwordHash: initialPasswordHash,
  }
  const sessionUsers = new Map<string, { userId: string; expiresAt: Date }>()
  return {
    async isReady() {
      return true
    },
    async findUserByUsername(username) {
      return username === user.username ? user : undefined
    },
    async createUser(nextUser) {
      user.id = nextUser.id
      user.username = nextUser.username
      user.passwordHash = nextUser.passwordHash
    },
    async updateLastLogin() {},
    async createSession(userId, tokenHash, expiresAt) {
      sessionUsers.set(tokenHash, { userId, expiresAt })
    },
    async findSessionUser(tokenHash, now) {
      const session = sessionUsers.get(tokenHash)
      if (!session || session.expiresAt <= now || session.userId !== user.id)
        return undefined
      return { id: user.id, username: user.username }
    },
    async deleteSession(tokenHash) {
      sessionUsers.delete(tokenHash)
    },
    async getHomeCounts() {
      return { pendingCandidates: 0, queuedDeliveries: 0, archivedMemories: 0 }
    },
  }
}
