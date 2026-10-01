import { readFileSync } from 'node:fs'
const src = readFileSync('thread-edges.mjs', 'utf8')
const line = src.split('\n').find(l => l.includes('const re = '))
console.log('源码里的正则行:', JSON.stringify(line))
const script = 'const a = await agent("Run the bash command `echo PROBE_OK`", { label: \'probe\' })\nconst b = await agent("Reply with exactly: PLAIN_OK", { label: \'plain\' })'
const re = /agent\s*\(\s*(["'\`])/g
let m, c = 0
while ((m = re.exec(script)) !== null) { c++; console.log('  hit:', JSON.stringify(m[0]), 'quote=', JSON.stringify(m[1])) }
console.log('内联正则匹配数:', c)
