#!/usr/bin/env node
/**
 * key-set.mjs —— 把新 key 写进 keys.json（key-health-watch 告警后的快速修复）
 *
 *   node key-set.mjs --list                 # 列出条目（脱敏）
 *   node key-set.mjs --test user_xxx…       # 只探测不写
 *   node key-set.mjs user_xxx…              # 替换 qq
 *   node key-set.mjs user_xxx… --name 163   # 替换指定条目
 *   node key-set.mjs user_xxx… --add work   # 新增条目
 *
 * 写入前先探测：无效的 key 拒绝写入（防止把错字打进去）。
 */
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const KEYS = join(HERE, 'keys.json')
const PROBE = 'https://api.commandcode.ai/provider/v1/models'
const argv = process.argv.slice(2)
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d }
const mask = (k) => (k && k.length > 14 ? `${k.slice(0, 9)}…${k.slice(-6)}` : '<格式异常>')

async function probe(key) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 20000)
  try { const r = await fetch(PROBE, { headers: { Authorization: `Bearer ${key}`, 'User-Agent': 'goat-key-set/1.0' }, signal: ctrl.signal }); return r.status }
  catch { return 0 } finally { clearTimeout(t) }
}

const doc = JSON.parse(readFileSync(KEYS, 'utf8'))
const list = Array.isArray(doc.keys) ? doc.keys : []

if (argv.includes('--list')) {
  for (const e of list) console.log(`${e.enabled === false ? 'x' : 'v'} ${String(e.name).padEnd(6)} ${mask(e.key)}  weight=${e.weight ?? 1}  ${e.note ? '- ' + String(e.note).slice(0, 55) : ''}`)
  process.exit(0)
}

const key = argv.find((a) => a.startsWith('user_'))
if (!key) { console.error('用法：node key-set.mjs user_xxxx… [--name qq | --add work] [--test]'); process.exit(2) }

const status = await probe(key)
console.log(`探测：HTTP ${status}`)
if (status !== 200) { console.error(`[FAIL] key 无效（HTTP ${status}），拒绝写入。`); process.exit(1) }
if (argv.includes('--test')) { console.log('[OK] 有效（--test，未写入）'); process.exit(0) }

const addName = opt('--add', null)
const target = opt('--name', 'qq')
if (addName) {
  if (list.some((e) => e.name === addName)) { console.error(`[FAIL] 条目 "${addName}" 已存在`); process.exit(1) }
  list.push({ name: addName, key, enabled: true, note: `added ${new Date().toISOString()}`, weight: 1 })
  console.log(`[OK] 新增条目 "${addName}"`)
} else {
  const e = list.find((x) => x.name === target)
  if (!e) { console.error(`[FAIL] 找不到 "${target}"，用 --add <name> 新增`); process.exit(1) }
  const old = mask(e.key)
  e.note = `${e.note ? e.note + ' | ' : ''}replaced ${new Date().toISOString()} (old ${old})`
  e.key = key
  e.enabled = true
  console.log(`[OK] 替换 "${target}" 的 key（旧 ${old}）`)
}
writeFileSync(KEYS + '.tmp', JSON.stringify(doc, null, 2) + '\n')
renameSync(KEYS + '.tmp', KEYS)
console.log('     keys.json 已原子更新（网关按 mtime 热加载，无需重启）')
