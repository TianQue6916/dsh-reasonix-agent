import { readFileSync } from 'node:fs'
const ls = readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.trim())
console.log('lines:', ls.length)
const types = {}
let firstTools = null
const walk = (n, p = '$', d = 0) => {
  if (d > 8 || n === null || typeof n !== 'object') return null
  for (const [k, v] of Object.entries(n)) {
    if (k === 'tools' && Array.isArray(v)) return { p: p + '.' + k, names: v.map((t) => t?.name ?? t?.function?.name ?? '?') }
    const r = walk(v, p + '.' + k, d + 1)
    if (r) return r
  }
  return null
}
for (const l of ls) {
  const j = JSON.parse(l)
  types[j.type] = (types[j.type] || 0) + 1
  if (!firstTools) {
    const r = walk(j)
    if (r) firstTools = r
  }
}
console.log('types:', JSON.stringify(types))
if (firstTools) console.log('FIRST tools @', firstTools.p, '(', firstTools.names.length, '):', firstTools.names.join(', '))
else console.log('no tools array found')
