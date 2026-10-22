// Read one file's contents out of an asar archive without extracting the archive.
// usage: node asar-read-entry.mjs <archive.asar> <entryPath> [grepNeedle]
import fs from 'node:fs'

const [file, entryPath, needle] = process.argv.slice(2)
if (!file || !entryPath) {
  console.error('usage: node asar-read-entry.mjs <archive.asar> <entryPath> [grepNeedle]')
  process.exit(2)
}
const fd = fs.openSync(file, 'r')
const head = Buffer.alloc(16)
fs.readSync(fd, head, 0, 16, 0)
const jsonStrSize = head.readUInt32LE(12)
const jsonBuf = Buffer.alloc(jsonStrSize)
fs.readSync(fd, jsonBuf, 0, jsonStrSize, 16)
const table = JSON.parse(jsonBuf.toString('utf8'))
const dataStart = 8 + jsonStrSize

const parts = entryPath.replace(/^\/+/, '').split('/')
let node = table
for (const part of parts) {
  node = node?.files?.[part]
  if (!node) { console.error('entry not found: ' + entryPath); process.exit(3) }
}
if (!node.size && node.size !== 0) { console.error('entry is a directory, not a file: ' + entryPath); process.exit(3) }
const size = node.size
// asar stores files 4-byte aligned after the header block
const offset = dataStart + Number(node.offset)
const buf = Buffer.alloc(size)
fs.readSync(fd, buf, 0, size, offset)
fs.closeSync(fd)
const text = buf.toString('utf8')
console.log('archive : ' + file)
console.log('entry   : ' + entryPath)
console.log('size    : ' + size + ' B @ offset ' + offset)
if (needle) {
  const idx = text.indexOf(needle)
  console.log('needle [' + needle + '] -> ' + (idx === -1 ? 'NOT FOUND' : 'FOUND at char ' + idx))
  if (idx !== -1) {
    const s = Math.max(0, idx - 160), e = Math.min(text.length, idx + needle.length + 160)
    console.log('--- context ---')
    console.log(text.slice(s, e))
  }
}
