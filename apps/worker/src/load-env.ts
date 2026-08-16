import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Load key=value pairs from the first existing .env file.
 * Existing process.env values always win (so Docker/systemd inject still works).
 * Never logs secret values.
 */
export function loadLocalEnvFiles(
  candidates: string[] = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
  ],
): string | undefined {
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue
    const text = readFileSync(filePath, 'utf8')
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq <= 0) continue
      const key = line.slice(0, eq).trim()
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
      let value = line.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) {
        process.env[key] = value
      }
    }
    return filePath
  }
  return undefined
}
