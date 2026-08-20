import { createDatabase, OUTBOX_TOPIC_ARCHIVE_DELIVERY, OUTBOX_TOPIC_SIYUAN_TEST, OUTBOX_TOPIC_PROCESS_SOURCE_EVENT, type AuthStore } from '@memory-hub/database'
import { assertArchivable, executeSiyuanArchive } from '@memory-hub/core'
import {
  loadSiyuanToken,
  resolveAuthMode,
  SiyuanClient,
  SiyuanError,
} from '@memory-hub/siyuan'
import PgBoss from 'pg-boss'

const QUEUE_ARCHIVE = 'archive-delivery'
const QUEUE_SIYUAN_TEST = 'siyuan-test'
const QUEUE_SOURCE_EVENT = 'source-event-process'
const MAX_ATTEMPTS = 5

function loadDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    'postgresql://memoryhub:memoryhub@localhost:5432/memoryhub'
  )
}

function parseAllowedHosts(raw: string | null | undefined, baseUrl: string): string[] {
  if (raw && raw.trim()) {
    return raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  try {
    return [new URL(baseUrl).hostname]
  } catch {
    return []
  }
}

function createClientForTarget(target: {
  baseUrl: string
  authHeader: string
  allowedHosts: string | null
}): SiyuanClient {
  const token = loadSiyuanToken(process.env)
  return new SiyuanClient({
    baseUrl: target.baseUrl,
    token,
    authMode: resolveAuthMode(target.authHeader),
    allowedHosts: parseAllowedHosts(target.allowedHosts, target.baseUrl),
    timeoutMs: 20_000,
  })
}

export async function processArchiveDelivery(
  store: AuthStore,
  deliveryId: string,
): Promise<void> {
  const delivery = await store.getDelivery(deliveryId)
  if (!delivery) {
    console.warn(`[worker] delivery not found: ${deliveryId}`)
    return
  }
  if (delivery.status === 'succeeded') {
    return
  }

  const processing = await store.markDeliveryProcessing(deliveryId)
  if (!processing) return

  const version = await store.getMemoryVersion(delivery.memoryVersionId)
  const target = await store.getDefaultArchiveTarget()
  if (!version || !target || target.id !== delivery.targetId) {
    await store.markDeliveryFailure(deliveryId, {
      errorCode: 'DELIVERY_CONTEXT_MISSING',
      errorMessage: '归档上下文缺失（版本或目标）。',
      deadLetter: true,
    })
    return
  }
  if (!target.notebookId) {
    await store.markDeliveryFailure(deliveryId, {
      errorCode: 'NOTEBOOK_MISSING',
      errorMessage: '思源笔记本未配置。',
      blocked: true,
    })
    return
  }

  try {
    assertArchivable({
      title: version.title,
      body: version.body,
      sensitivity: version.sensitivity,
    })
    const client = createClientForTarget(target)
    const result = await executeSiyuanArchive(
      client,
      {
        memoryId: delivery.candidateId,
        versionId: version.id,
        versionNumber: version.versionNumber,
        title: version.title,
        body: version.body,
        memoryType: version.memoryType,
        source: version.source,
        project: version.project,
        sensitivity: version.sensitivity,
        confidence: version.confidence,
        renderStyle: version.renderStyle,
        emojiEnabled: version.emojiEnabled,
        captureTime: version.captureTime,
        ...(process.env.MEMORY_HUB_PUBLIC_URL ? { hubPublicUrl: process.env.MEMORY_HUB_PUBLIC_URL } : {}),
      },
      {
        notebookId: target.notebookId,
        pathTemplate: target.pathTemplate,
        documentId: delivery.documentId,
        previousPath: delivery.path,
      },
    )
    await store.markDeliverySucceeded(deliveryId, {
      documentId: result.documentId,
      blockId: result.blockId,
      path: result.path,
      requestFingerprint: result.requestFingerprint,
    })
    console.info(`[worker] synced delivery ${deliveryId} -> ${result.documentId}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    const code = error instanceof SiyuanError ? error.code : 'ARCHIVE_FAILED'
    const retryable = error instanceof SiyuanError ? error.retryable : false
    const blocked =
      message.includes('脱敏门禁') || code === 'SIYUAN_UNAUTHORIZED'
    const deadLetter =
      blocked ||
      !retryable ||
      processing.attemptCount >= MAX_ATTEMPTS

    await store.markDeliveryFailure(deliveryId, {
      errorCode: code,
      errorMessage: message,
      blocked,
      deadLetter,
    })

    if (!deadLetter && !blocked) {
      // Re-queue via outbox for bounded retry
      await store.enqueueDeliveryRetry(deliveryId)
    }
    console.error(`[worker] delivery ${deliveryId} failed: ${code} ${message}`)
  }
}

export async function processSiyuanTest(
  store: AuthStore,
  targetId: string,
): Promise<void> {
  const target = await store.getDefaultArchiveTarget()
  if (!target || target.id !== targetId) {
    return
  }
  try {
    const client = createClientForTarget(target)
    const result = await client.testConnection()
    const notebooks = await client.listNotebooks()
    const selected =
      notebooks.find((item) => item.id === target.notebookId) ?? notebooks[0]
    await store.updateArchiveTargetTestResult(targetId, {
      status: 'succeeded',
      message: `连接成功，笔记本 ${result.notebookCount} 个。`,
      notebookName: selected?.name ?? target.notebookName,
    })
    if (!target.notebookId && selected) {
      await store.upsertDefaultArchiveTarget({
        baseUrl: target.baseUrl,
        notebookId: selected.id,
        notebookName: selected.name,
      })
    }
    console.info(`[worker] siyuan test ok target=${targetId}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : '连接失败'
    await store.updateArchiveTargetTestResult(targetId, {
      status: 'failed',
      message,
    })
    console.error(`[worker] siyuan test failed: ${message}`)
  }
}

async function publishOutbox(
  store: AuthStore,
  boss: PgBoss,
): Promise<void> {
  const batch = await store.claimOutboxBatch(50)
  for (const message of batch) {
    try {
      if (message.topic === OUTBOX_TOPIC_ARCHIVE_DELIVERY) {
        const deliveryId = String(message.payload.deliveryId ?? '')
        if (!deliveryId) throw new Error('outbox payload missing deliveryId')
        await boss.send(QUEUE_ARCHIVE, { deliveryId }, {
          retryLimit: 0,
          expireInSeconds: 60 * 30,
        })
      } else if (message.topic === OUTBOX_TOPIC_PROCESS_SOURCE_EVENT) {
        const eventId = String(message.payload.eventId ?? '')
        if (!eventId) throw new Error('outbox payload missing eventId')
        await boss.send(QUEUE_SOURCE_EVENT, { eventId }, {
          retryLimit: 3,
          expireInSeconds: 60 * 30,
        })
      } else if (message.topic === OUTBOX_TOPIC_SIYUAN_TEST) {
        const targetId = String(message.payload.targetId ?? '')
        if (!targetId) throw new Error('outbox payload missing targetId')
        await boss.send(QUEUE_SIYUAN_TEST, { targetId }, {
          retryLimit: 0,
          expireInSeconds: 60 * 10,
        })
      } else {
        throw new Error(`unknown outbox topic: ${message.topic}`)
      }
      await store.markOutboxPublished(message.id)
    } catch (error) {
      const text = error instanceof Error ? error.message : 'publish failed'
      await store.markOutboxPublishFailed(message.id, text)
      console.error(`[worker] outbox publish failed ${message.id}: ${text}`)
    }
  }
}

export async function processSourceEventJob(
  store: AuthStore,
  eventId: string,
): Promise<void> {
  const result = await store.processSourceEvent(eventId)
  if (!result) {
    console.warn(`[worker] source event not found: ${eventId}`)
    return
  }
  console.info(
    `[worker] source event ${eventId} -> ${result.status} candidate=${result.candidateId ?? '-'}`,
  )
}

export async function startWorker() {
  const databaseUrl = loadDatabaseUrl()
  const store = createDatabase(databaseUrl)
  await store.initialize()

  const boss = new PgBoss({
    connectionString: databaseUrl,
    retryLimit: 0,
  })
  boss.on('error', (error) => {
    console.error('[worker] pg-boss error', error)
  })
  await boss.start()
  await boss.createQueue(QUEUE_ARCHIVE)
  await boss.createQueue(QUEUE_SIYUAN_TEST)
  await boss.createQueue(QUEUE_SOURCE_EVENT)

  await boss.work(QUEUE_ARCHIVE, async (jobs) => {
    for (const job of jobs) {
      const deliveryId = String((job.data as { deliveryId?: string }).deliveryId ?? '')
      if (!deliveryId) continue
      await processArchiveDelivery(store, deliveryId)
    }
  })

  await boss.work(QUEUE_SOURCE_EVENT, async (jobs) => {
    for (const job of jobs) {
      const eventId = String((job.data as { eventId?: string }).eventId ?? '')
      if (!eventId) continue
      await processSourceEventJob(store, eventId)
    }
  })

  await boss.work(QUEUE_SIYUAN_TEST, async (jobs) => {
    for (const job of jobs) {
      const targetId = String((job.data as { targetId?: string }).targetId ?? '')
      if (!targetId) continue
      await processSiyuanTest(store, targetId)
    }
  })

  // Transactional outbox publisher
  const publish = async () => {
    try {
      await publishOutbox(store, boss)
    } catch (error) {
      console.error('[worker] outbox loop error', error)
    }
  }
  await publish()
  const timer = setInterval(publish, 2000)

  console.info('[worker] MemoryHub worker started')

  const shutdown = async (signal: string) => {
    console.info(`[worker] shutting down on ${signal}`)
    clearInterval(timer)
    await boss.stop({ graceful: true, timeout: 10_000 })
    await store.close()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

