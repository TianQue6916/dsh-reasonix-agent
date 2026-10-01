#!/usr/bin/env node
/**
 * memory-index-heal.mjs — 让 MEMORY.md 索引自愈（补录未被索引的 fact）
 *
 * 背景：memory.mjs 只维护 "## 十一、dsh 侧新增（自动维护）" 一节，
 * 且只在 memory_remember 被调用时更新。**其他 agent 直接写 fact 文件、
 * 或双机同步进来的 fact，索引不会更新** —— 这就是 round 1 那 8% 缺失的成因。
 *
 * 用法:
 *   node memory-index-heal.mjs [--dir <global 目录>] [--dry-run]
 *
 * 行为：扫 *.md（排除 MEMORY.md / *.bak* / *.conflict.*），
 *       找出索引里没有 "(文件名)" 引用的 fact，追加到 dsh 自动维护段。
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const argv = process.argv.slice(2)
const opt = { dir: join(homedir(), '.reasonix', 'memory', 'global'), apply: false }
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--dir') opt.dir = argv[++i]
  else if (a === '--apply') opt.apply = true
  else if (a === '-h' || a === '--help') { console.log(readFileSync(new URL(import.meta.url)).toString().split('*/')[0]); process.exit(0) }
}

const DIR = opt.dir
const MEM = join(DIR, 'MEMORY.md')
if (!existsSync(MEM)) { console.error('找不到 ' + MEM); process.exit(2) }

const files = readdirSync(DIR).filter(f =>
  f.endsWith('.md') && f !== 'MEMORY.md' && !f.includes('.bak') && !f.includes('.conflict.'))
const mem = readFileSync(MEM, 'utf8')
const missing = files.filter(f => !mem.includes('(' + f + ')')).sort()

console.log(`扫描 ${files.length} 个 fact，未被索引: ${missing.length}`)
if (!missing.length) { console.log('索引已完整，无需动作。'); process.exit(0) }

function descOf(f) {
  try {
    const t = readFileSync(join(DIR, f), 'utf8')
    const m = t.match(/^description:\s*"?([^"\n]+)/m)
    const s = (m ? m[1].trim() : '').slice(0, 110)
    return s || '(无 description)'
  } catch { return '(读取失败)' }
}
const lines = missing.map(f => `- [${f.replace(/\.md$/, '')}](${f}) — ${descOf(f)}`)

if (!opt.apply) {
  console.log('\n[dry-run] 将补录:')
  for (const l of lines) console.log('  ' + l.slice(0, 120))
  console.log('\n（加 --apply 真正写入）')
  process.exit(0)
}

const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').slice(0, 12)
copyFileSync(MEM, MEM + '.bak-' + stamp + '-pre-index-heal')
const marker = '## 归档说明'
const block = '### 补录（' + stamp + '，memory-index-heal）\n\n' + lines.join('\n') + '\n\n'
const out = mem.includes(marker) ? mem.replace(marker, block + marker) : mem + '\n' + block
writeFileSync(MEM, out, 'utf8')
console.log(`\n已补录 ${missing.length} 条到 MEMORY.md（旧版存 .bak-${stamp}-pre-index-heal）`)
