import { createDatabase } from '@memory-hub/database'

import { buildApp } from './app.js'
import { ensureAdminUser } from './auth.js'
import { loadApiConfig } from './config.js'

const config = loadApiConfig()
const database = createDatabase(config.databaseUrl)

await database.initialize()
await ensureAdminUser(database, config.adminUsername, config.adminPassword)

if (config.nodeEnv === 'development') {
  const seeded = await database.seedDevelopmentMemories()
  console.log(`[memory-hub-api] seeded ${seeded} development demo memories`)
}

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
