#!/usr/bin/env node
/**
 * key-health-watch.mjs —— Command Code key 失效检测与告警（2026-10-29）
 *
 * 为什么需要它：
 *   Command Code 的 API key 是 Studio 手动生成的静态凭据，**没有 refresh API**
 *   （实测 /alpha/keys、/alpha/api-keys、/internal/keys、/alpha/auth/refresh 全 404）。
 *   官方会做整批吊销（例：2026-10-29 因蒸馏攻击预防性 revoke 全部 key），
 *   而本地网关只会静默 401 + 冷却 30 分钟，不告警。
 *   所以「自动刷新」做不了，能做的是「第一时间知道它死了」。
 *
 * 用法：
 *   node key-health-watch.mjs                        # 常驻，默认 10 分钟一次
 *   node key-health-watch.mjs --once                 # 探测一次，退出码 = 失效 key 数
 *   node key-health-watch.mjs --once --auto-disable  # 失效的自动 enabled:false
 *   node key-health-watch.mjs --interval 300         # 5 分钟
 */
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const KEYS = join(HERE, 'keys.json')
const LOG = join(HERE, 'key-health.log')
const ALERT = join(HERE, 'KEY-ALERT.md')
const PROBE = 'https://api.commandcode.ai/provider/v1/models'

const argv = process.argv.slice(2)
const flag = (n) => argv.includes(n)
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d }
const INTERVAL = Number(opt('--interval', 600)) * 1000
const ONCE = flag('--once')
const AUTO_DISABLE = flag('--auto-disable')

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  try { writeFileSync(LOG, (existsSync(LOG) ? readFileSync(LOG, 'utf8') : '') + line + '\n') } catch {}
}

async function probe(key) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch(PROBE, { headers: { Authorization: `Bearer ${key}`, 'User-Agent': 'goat-key-health/1.0' }, signal: ctrl.signal })
    return { status: res.status, ok: res.ok }
  } catch (e) {
    return { status: 0, ok: false, error: String(e?.message || e) }
  } finally { clearTimeout(t) }
}

function notify(title, body) {
  try {
    const q = (s) => String(s).replace(/'/g, "''")
    const ps = "[reflection.assembly]::LoadWithPartialName('System.Windows.Forms')|Out-Null;" +
      "$n=New-Object System.Windows.Forms.NotifyIcon;" +
      "[reflection.assembly]::LoadWithPartialName('System.Drawing')|Out-Null;" +
      "$n.Icon=[System.Drawing.SystemIcons]::Warning;$n.Visible=$true;" +
      `$n.ShowBalloonTip(10000,'${q(title)}','${q(body)}',2);Start-Sleep -Seconds 11;$n.Dispose()`
    execFile('powershell', ['-NoProfile', '-Command', ps], () => {})
  } catch {}
}

async function checkOnce() {
  const doc = JSON.parse(readFileSync(KEYS, 'utf8'))
  const list = Array.isArray(doc.keys) ? doc.keys : []
  const results = []
  let dirty = false

  for (const entry of list) {
    if (!entry || !entry.key) continue
    if (entry.enabled === false) { results.push({ name: entry.name, skipped: true }); continue }
    const r = await probe(entry.key)
    const dead = r.status === 401 || r.status === 403
    results.push({ name: entry.name, status: r.status, dead, ok: r.ok })
    if (dead) {
      log(`[DEAD] key "${entry.name}" 失效（HTTP ${r.status}）—— 去 https://commandcode.ai Studio 生成新 key`)
      if (AUTO_DISABLE) { entry.enabled = false; entry.note = `${entry.note || ''} | auto-disabled ${new Date().toISOString()} (HTTP ${r.status})`.trim(); dirty = true }
    } else if (r.ok) {
      log(`[OK]   key "${entry.name}" 健康（HTTP ${r.status}）`)
    } else {
      log(`[WARN] key "${entry.name}" 探测异常 HTTP ${r.status} ${r.error || ''} —— 不计入失效`)
    }
  }
  if (dirty) { writeFileSync(KEYS + '.tmp', JSON.stringify(doc, null, 2) + '\n'); renameSync(KEYS + '.tmp', KEYS); log('keys.json 已更新') }

  const dead = results.filter((r) => r.dead)
  const alive = results.filter((r) => r.ok)
  if (dead.length > 0) {
    const md = ['# Command Code key 失效告警', '', `检测时间：${new Date().toISOString()}`, '',
      ...dead.map((r) => `- \`${r.name}\` → HTTP ${r.status}`), '',
      alive.length === 0 ? '**所有 key 都已失效 —— 现在所有请求都会 401。**' : `仍在工作：${alive.map((r) => `\`${r.name}\``).join('、')}`, '',
      '## 怎么修', '1. 打开 https://commandcode.ai 登录 Studio → API Keys',
      '2. 生成新 key（已过期那条可以删）', '3. `node key-set.mjs user_xxxx…`（会自动探测有效性再写入）', '',
      '> Command Code 没有 key refresh API，key 是一次性静态凭据。',
      '> 官方会整批吊销（2026-10-29 因蒸馏攻击 revoke 全部 key）。',
      '> 网关遇到 401/403 只静默冷却 30 分钟 —— 所以需要这个 watcher。'].join('\n')
    writeFileSync(ALERT, md)
    notify('Command Code key 失效', `${dead.map((r) => r.name).join(',')} 已 401/403`)
  } else if (existsSync(ALERT)) {
    writeFileSync(ALERT, `# 全部正常\n\n最近探测：${new Date().toISOString()}\n`)
  }
  return dead.length
}

// 注意：**不要用 process.exit()** —— Node 22 的 fetch(undici) 连接池在和 exit 竞态时
// 会崩 `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\winsync.c:76`（2026-10-29 实测）。
// 设 exitCode 让事件循环自然排空即可。
if (ONCE) {
  process.exitCode = (await checkOnce()) > 0 ? 1 : 0
}
else {
  log(`key-health-watch 启动，每 ${INTERVAL / 1000}s 探测（Ctrl-C 退出）`)
  await checkOnce()
  setInterval(() => { checkOnce().catch((e) => log('探测失败：' + e.message)) }, INTERVAL)
}
