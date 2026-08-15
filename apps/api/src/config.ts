import { readFileSync } from 'node:fs'

import { z } from 'zod'

const ConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']),
  port: z.number().int().min(1).max(65_535),
  databaseUrl: z.string().min(1),
  publicUrl: z.string().url(),
  adminUsername: z.string().trim().min(1).max(80),
  adminPassword: z.string().min(8),
  sessionTtlMs: z.number().int().positive(),
})

function readSecret(path: string | undefined): string | undefined {
  if (!path) return undefined
  return readFileSync(path, 'utf8').trim()
}

function databaseUrlWithSecret(
  databaseUrl: string,
  password: string | undefined,
): string {
  if (!password) return databaseUrl
  const url = new URL(databaseUrl)
  if (!url.password) url.password = password
  return url.toString()
}

export type ApiConfig = z.infer<typeof ConfigSchema>

export function loadApiConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ApiConfig {
  const nodeEnv = environment.NODE_ENV ?? 'development'
  const filePassword = readSecret(environment.MEMORY_HUB_ADMIN_PASSWORD_FILE)
  const databasePassword = readSecret(environment.POSTGRES_PASSWORD_FILE)
  const developmentPassword =
    nodeEnv === 'development' ? 'memoryhub-dev' : undefined

  return ConfigSchema.parse({
    nodeEnv,
    port: Number.parseInt(environment.MEMORY_HUB_API_PORT ?? '8787', 10),
    databaseUrl: databaseUrlWithSecret(
      environment.DATABASE_URL ??
        'postgresql://memoryhub:memoryhub@localhost:5432/memoryhub',
      databasePassword,
    ),
    publicUrl: environment.MEMORY_HUB_PUBLIC_URL ?? 'http://localhost:8788',
    adminUsername: environment.MEMORY_HUB_ADMIN_USERNAME ?? 'admin',
    adminPassword:
      filePassword ??
      environment.MEMORY_HUB_ADMIN_PASSWORD ??
      developmentPassword,
    sessionTtlMs: Number.parseInt(
      environment.MEMORY_HUB_SESSION_TTL_MS ?? String(7 * 24 * 60 * 60 * 1000),
      10,
    ),
  })
}
