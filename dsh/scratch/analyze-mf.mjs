import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
const buf = readFileSync(process.argv[2])
const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const offs = []
let i = 0
while ((i = buf.indexOf(magic, i)) !== -1) { offs.push(i); i += 4 }
console.log('frames:', offs.length, 'size:', buf.length)
let all = ''
let errs = 0
for (const o of offs) {
  try { all += zstdDecompressSync(buf.subarray(o)).toString('utf8') } catch (e) { errs++ }
}
console.log('frame parse errors:', errs, 'decoded bytes:', all.length)
const ls = all.split('\n').filter((l) => l.trim())
console.log('lines:', ls.length)
const types = {}
let firstTools = null
const walk = (n, p = '$', d = 0) => {
  if (d > 10 || n === null || typeof n !== 'object') return null
  for (const [k, v] of Object.entries(n)) {
    if (k === 'tools' && Array.isArray(v)) return { p: p + '.' + k, names: v.map((t) => t?.name ?? t?.function?.name ?? '?') }
    const r = walk(v, p + '.' + k, d + 1)
    if (r) return r
  }
  return null
}
for (const l of ls) {
  let j
  try { j = JSON.parse(l) } catch { continue }
  types[j.type] = (types[j.type] || 0) + 1
  if (!firstTools) { const r = walk(j); if (r) firstTools = r }
}
console.log('types:', JSON.stringify(types))
if (firstTools) console.log('FIRST tools @', firstTools.p, '(', firstTools.names.length, '):', firstTools.names.join(', '))
else console.log('no tools array found')
