import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

function loadEnv(p) {
  if (!existsSync(p)) return false
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i <= 0) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (process.env[k] === undefined) process.env[k] = v
  }
  return true
}

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../..')
loadEnv(resolve(root, '.env'))

const mod = await import(pathToFileURL(resolve(root, 'packages/siyuan/src/index.ts')).href)
const { loadSiyuanToken, SiyuanClient } = mod

try {
  const token = loadSiyuanToken()
  console.log('token_length=' + token.length)
} catch (e) {
  console.log('token_error=' + e.message)
}

const base = process.env.SIYUAN_BASE_URL || 'http://192.168.1.10:1166'
const hosts = ['192.168.1.10', '127.0.0.1', 'localhost']
const token = process.env.SIYUAN_TOKEN || ''

for (const mode of ['authorization_token', 'x_auth_token']) {
  try {
    const client = new SiyuanClient({
      baseUrl: base,
      token,
      authMode: mode,
      allowedHosts: hosts,
      timeoutMs: 12000,
    })
    const notebooks = await client.listNotebooks()
    console.log(mode + '_ok count=' + notebooks.length)
    console.log(
      JSON.stringify(
        notebooks.slice(0, 5).map((x) => ({
          id: x.id,
          name: x.name,
          closed: x.closed,
        })),
      ),
    )
  } catch (e) {
    console.log(mode + '_fail code=' + (e.code || '') + ' msg=' + e.message)
  }
}
