import fs from 'node:fs'
let d = fs.readFileSync('apps/web/src/views/CandidateDetailView.vue', 'utf8')
d = d.replace("  conflict: '冲突',\r\n}", "  conflict: '冲突',\r\n  trashed: '回收站',\r\n}")
if (!d.includes("trashed: '回收站'")) {
  d = d.replace("  conflict: '冲突',\n}", "  conflict: '冲突',\n  trashed: '回收站',\n}")
}
fs.writeFileSync('apps/web/src/views/CandidateDetailView.vue', d)

let a = fs.readFileSync('apps/api/src/app.ts', 'utf8')
a = a.replace(
  'function toListQuery(parsed: {',
  'function toListQuery(parsed: any, forcedStatuses?: string[]): Parameters<AuthStore["listCandidates"]>[0] {\n  const _forced = forcedStatuses\n  const src = parsed\n  return toListQueryInner(src, _forced)\n}\nfunction toListQueryInner(parsed: {',
)
# too messy if replace failed partially. simpler: change first param type to any only
