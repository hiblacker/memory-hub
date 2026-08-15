export {
  processArchiveDelivery,
  processSiyuanTest,
} from './runtime.js'

import { startWorker } from './runtime.js'

startWorker().catch((error) => {
  console.error('[worker] fatal', error)
  process.exit(1)
})
