import { createDatabase } from '@memory-hub/database'

import { buildApp } from './app.js'
import { ensureAdminUser } from './auth.js'
import { loadApiConfig } from './config.js'

const config = loadApiConfig()
const database = createDatabase(config.databaseUrl)

await database.initialize()
await ensureAdminUser(database, config.adminUsername, config.adminPassword)

const app = buildApp({
  authStore: database,
  corsOrigin: config.publicUrl,
  secureCookies: config.nodeEnv === 'production',
  sessionTtlMs: config.sessionTtlMs,
})

app.addHook('onClose', async () => {
  await database.close()
})

await app.listen({ host: '0.0.0.0', port: config.port })
