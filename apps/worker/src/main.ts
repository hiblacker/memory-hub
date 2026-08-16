import { loadLocalEnvFiles } from './load-env.js'

const loadedEnv = loadLocalEnvFiles()
if (loadedEnv) {
  console.log(`[worker] loaded env file: ${loadedEnv}`)
}

export {
  processArchiveDelivery,
  processSiyuanTest,
} from './runtime.js'

import { startWorker } from './runtime.js'

startWorker().catch((error) => {
  console.error('[worker] fatal', error)
  process.exit(1)
})
