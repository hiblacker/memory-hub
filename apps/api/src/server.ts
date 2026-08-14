import { buildApp } from './app.js'

const port = Number.parseInt(process.env.MEMORY_HUB_API_PORT ?? '8787', 10)
const app = buildApp()

await app.listen({ host: '0.0.0.0', port })
