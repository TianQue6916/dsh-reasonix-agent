import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
const s = zstdDecompressSync(readFileSync(process.argv[2])).toString('utf8')
const ls = s.split('\n').filter((l) => l.trim())
console.log('lines:', ls.length)
for (const l of ls) {
  const j = JSON.parse(l)
  const t = JSON.stringify(j)
  const m = t.match(/"tools"/g)
  console.log('-', j.type, '| keys:', Object.keys(j).join(','), m ? `| tools x${m.length}` : '')
}
