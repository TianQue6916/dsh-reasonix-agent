#!/usr/bin/env node
/**
 * dsh-profile-rollback.mjs — dsh profile 配置备份的盘点与回滚
 *
 * 用法:
 *   node dsh-profile-rollback.mjs --list                     列出所有备份（按时间倒序）
 *   node dsh-profile-rollback.mjs --point <YYYYMMDD-HHMM>     还原该时间点的全部文件
 *   node dsh-profile-rollback.mjs --restore <target> --from <bakPath>   还原单个文件
 *   node dsh-profile-rollback.mjs --list --json               机器可读
 *
 * 备份命名约定（历史遗留，本工具统一识别）：
 *   <target>.bak-<YYYYMMDD>-<HHMM>-pre-<what>
 *   <target>.bak-<YYYYMMDD>-pre-<what>
 *   <target>.bak-<what>-<YYYYMMDD>-<HHMM>
 *   <target>.bak-<what>-<YYYYMMDD>
 *   <target>.bak-<YYYYMMDD>-<HHMM>
 */
import { readdirSync, statSync, copyFileSync, existsSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { homedir } from 'node:os'

const ROOTS = [
  join(homedir(), '.dsh', 'profiles'),
  join(homedir(), '.dsh'),
  join(homedir(), '.mnemon', 'data', 'default'),
]
const argv = process.argv.slice(2)
const opt = { list: false, json: false, point: null, restore: null, from: null, apply: false }
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--list') opt.list = true
  else if (a === '--json') opt.json = true
  else if (a === '--point') opt.point = argv[++i]
  else if (a === '--restore') opt.restore = argv[++i]
  else if (a === '--from') opt.from = argv[++i]
  else if (a === '--apply') opt.apply = true
  else if (a === '-h' || a === '--help') { console.log(readFileSync(new URL(import.meta.url)).toString().split('*/')[0]); process.exit(0) }
}
import { readFileSync } from 'node:fs'

/** 从备份文件名解析：目标文件 + 时间点 */
function parseBak(name) {
  const i = name.indexOf('.bak')
  if (i === -1) return null
  const target = name.slice(0, i)
  const rest = name.slice(i + 4)          // 去掉 ".bak"
  const ts = rest.match(/(\d{8})-(\d{4})/) || rest.match(/(\d{8})/)
  const point = ts ? (ts[2] ? `${ts[1]}-${ts[2]}` : ts[1]) : null
  return { target, point, suffix: rest }
}

function collect() {
  const out = []
  for (const root of ROOTS) {
    if (!existsSync(root)) continue
    const walk = (d, depth) => {
      if (depth > 2) return
      let ents = []
      try { ents = readdirSync(d, { withFileTypes: true }) } catch { return }
      for (const e of ents) {
        const p = join(d, e.name)
        if (e.isDirectory()) { walk(p, depth + 1); continue }
        if (!e.name.includes('.bak')) continue
        const m = parseBak(e.name)
        if (!m) continue
        let size = 0, mtime = null
        try { const st = statSync(p); size = st.size; mtime = new Date(st.mtimeMs).toISOString() } catch {}
        out.push({ ...m, path: p, size, mtime, dir: d })
      }
    }
    walk(root, 0)
  }
  // ROOTS 之间存在包含关系（`~/.dsh/profiles` 在 `~/.dsh` 之下），同一个备份会被
  // 扫到两次 —— 2026-09-28 实测 --list 把每条都打印了两遍。按路径去重。
  const seen = new Set()
  return out
    .filter((x) => (seen.has(x.path) ? false : (seen.add(x.path), true)))
    .sort((a, b) => String(b.point || '').localeCompare(String(a.point || '')))
}

const items = collect()

if (opt.restore) {
  const bak = opt.from
  if (!bak || !existsSync(bak)) { console.error('需要 --from <存在的备份路径>'); process.exit(2) }
  const targetPath = join(dirname(bak), basename(opt.restore))
  if (!opt.apply) { console.log(`[dry-run] 将 ${bak}\n    覆盖 -> ${targetPath}\n    （加 --apply 真正执行）`); process.exit(0) }
  copyFileSync(bak, targetPath)
  console.log(`已还原 ${opt.restore} <- ${basename(bak)}`)
  process.exit(0)
}

if (opt.point) {
  const hit = items.filter(x => x.point === opt.point)
  if (!hit.length) { console.error(`没有时间点为 ${opt.point} 的备份`); process.exit(2) }
  for (const h of hit) {
    const targetPath = join(h.dir, h.target)
    if (!opt.apply) { console.log(`[dry-run] ${basename(h.path)}  ->  ${basename(targetPath)}`); continue }
    copyFileSync(h.path, targetPath)
    console.log(`已还原 ${basename(targetPath)} <- ${basename(h.path)}`)
  }
  if (!opt.apply) console.log('\n（加 --apply 真正执行）')
  process.exit(0)
}

// 默认：列出
if (opt.json) { console.log(JSON.stringify({ count: items.length, items }, null, 1)); process.exit(0) }
console.log(`共 ${items.length} 个备份`)
console.log('')
const byPoint = {}
for (const it of items) (byPoint[it.point || '(无时间戳)'] ||= []).push(it)
for (const [pt, arr] of Object.entries(byPoint)) {
  console.log('● ' + pt)
  for (const it of arr) {
    const alive = existsSync(join(it.dir, it.target))
    const parts = it.dir.split(/[\/]/)
    const where = parts[parts.length - 2] === 'profiles' ? parts[parts.length - 3] : parts[parts.length - 1]
    console.log('    ' + it.target.padEnd(24) + ' ' + String(it.size).padStart(8) + ' B  @' + where.padEnd(10) + ' ' + (alive ? '' : '[孤儿] ') + basename(it.path))
  }
}
const orphan = items.filter(it => !existsSync(join(it.dir, it.target))).length
console.log('')
console.log('其中 ' + orphan + ' 个是孤儿（目标文件已不存在，无法回滚）')
