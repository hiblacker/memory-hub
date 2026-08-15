import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto'
import { promisify } from 'node:util'

import type { AuthStore, DatabaseSessionUser } from '@memory-hub/database'

const scrypt = promisify(scryptCallback)

export const SESSION_COOKIE_NAME = 'memoryhub_session'

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer
  return `scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const [algorithm, saltHex, hashHex] = encodedHash.split('$')
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false

  try {
    const expected = Buffer.from(hashHex, 'hex')
    const actual = (await scrypt(
      password,
      Buffer.from(saltHex, 'hex'),
      expected.length,
    )) as Buffer
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    )
  } catch {
    return false
  }
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function ensureAdminUser(
  store: AuthStore,
  username: string,
  password: string,
): Promise<void> {
  const existing = await store.findUserByUsername(username)
  if (existing) return

  await store.createUser({
    id: randomUUID(),
    username,
    passwordHash: await hashPassword(password),
  })
}

export async function createSession(
  store: AuthStore,
  userId: string,
  ttlMs: number,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + ttlMs)
  await store.createSession(userId, hashSessionToken(token), expiresAt)
  return { token, expiresAt }
}

export async function resolveSessionUser(
  store: AuthStore,
  token: string | undefined,
): Promise<DatabaseSessionUser | undefined> {
  if (!token) return undefined
  return store.findSessionUser(hashSessionToken(token), new Date())
}
