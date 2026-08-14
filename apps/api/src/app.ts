import Fastify from 'fastify'

export function buildApp() {
  const app = Fastify({ logger: false })

  app.get('/healthz', async () => ({
    status: 'ok',
    phase: 'design',
    service: 'memory-hub-api',
  }))

  return app
}
