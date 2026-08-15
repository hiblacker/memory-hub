import { createDatabase } from '@memory-hub/database'

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://memoryhub:memoryhub@localhost:5432/memoryhub'

const db = createDatabase(databaseUrl)
await db.initialize()
const seeded = await db.seedDevelopmentMemories()
console.log(`seeded ${seeded} demo memories`)
await db.close()
