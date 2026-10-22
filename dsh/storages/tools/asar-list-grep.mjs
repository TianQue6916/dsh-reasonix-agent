// Read an asar archive's directory table WITHOUT extracting, and grep entry names.
// asar format: [uint32 headerPickleSize][uint32 headerSize][uint32 jsonSize][uint32 jsonStrSize]
//              then a Pickle-wrapped JSON directory table, then the file data.
// We only need the JSON: at offset 12 the uint32 is the JSON string length,
// and the JSON itself starts at offset 16.
import fs from 'node:fs'

const file = process.argv[2]
const patterns = process.argv.slice(3)
if (!file || patterns.length === 0) {
  console.error('usage: node asar-list-grep.mjs <archive.asar> <pattern> [pattern...]')
  process.exit(2)
}
const fd = fs.openSync(file, 'r')
const head = Buffer.alloc(16)
const read = fs.readSync(fd, head, 0, 16, 0)
if (read < 16) { console.error('file too small to be an asar'); process.exit(2) }
const jsonStrSize = head.readUInt32LE(12)
const jsonBuf = Buffer.alloc(jsonStrSize)
fs.readSync(fd, jsonBuf, 0, jsonStrSize, 16)
fs.closeSync(fd)
let table
try { table = JSON.parse(jsonBuf.toString('utf8')) } catch (e) {
  console.error('failed to parse directory table: ' + e.message); process.exit(2)
}
const paths = []
;(function walk(node, prefix) {
  for (const [name, entry] of Object.entries(node.files ?? {})) {
    const p = prefix + '/' + name
    if (entry.files) walk(entry, p)
    else paths.push({ p, size: entry.size ?? 0, offset: entry.offset })
  }
})(table, '')
console.log('archive      : ' + file)
console.log('total entries: ' + paths.length + '  (bytes on disk: ' + fs.statSync(file).size + ')')
for (const pat of patterns) {
  const hits = paths.filter((e) => e.p.includes(pat))
  console.log('')
  console.log('pattern [' + pat + '] -> ' + hits.length + ' hit(s)')
  for (const h of hits.slice(0, 25)) console.log('    ' + h.p + '  (' + h.size + ' B @ ' + h.offset + ')')
}
