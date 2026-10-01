#!/usr/bin/env node
/**
 * migrate-reasonix-wechat-credentials.mjs
 *
 * 把 reasonix 侧微信 bot 的 iLink 凭据**无损转换**成 @lanbaolu/dsh-wechat-bridge 的
 * schema，让 dsh 侧无需重新扫码即可复用同一个 bot 登录。
 *
 * WHY 需要转换（读源码得出，不是猜的）
 *   reasonix  <reasonix-bot>/weixin/accounts/<accountId>.json
 *             { token, base_url, user_id, saved_at }        ← accountId 只体现在文件名
 *   插件      <DATA_DIR>/accounts/<accountId>.json
 *             { botToken, accountId, baseUrl, userId }      ← login.js:72-75 从 iLink
 *                                                             QR 响应造的字段名
 *   两侧协议同一个官方端点（constants.js: DEFAULT_BASE_URL = https://ilinkai.weixin.qq.com），
 *   所以这只是改名与补字段，**不需要重新登录**。
 *
 * context-tokens 同样要转
 *   reasonix  weixin/accounts/default.context-tokens.json  扁平 map { "<wxid>@im.wechat": "<tok>" }
 *   插件      <DATA_DIR>/context-tokens.json               包一层 { tokens: {...}, updatedAt }
 *   （main.js:117-124 读 parsed.tokens。该文件缺失属正常，首条消息会重建 —— 转换只是锦上添花。）
 *
 * 安全边界
 *   - 只**写** dsh 自己的 <DATA_DIR>；对 reasonix 侧只读，绝不写/删
 *   - 不打印任何凭据值，只打印字段名与长度
 *   - --dry-run 只报告将要做什么
 *
 * 用法
 *   node migrate-reasonix-wechat-credentials.mjs --dry-run
 *   node migrate-reasonix-wechat-credentials.mjs
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const SRC =
  process.env.REASONIX_WECHAT_DIR ?? join(homedir(), 'AppData', 'Roaming', 'reasonix-bot', 'weixin')
const DST = process.env.DSH_BRIDGE_DATA_DIR ?? join(homedir(), '.dsh', 'wechat-bridge')
const DRY = process.argv.includes('--dry-run')

const len = (v) => (typeof v === 'string' ? `len=${v.length}` : typeof v)
const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'))
const writeJson = async (p, obj) => {
  await mkdir(dirname(p), { recursive: true })
  if (DRY) return
  await writeFile(p, JSON.stringify(obj, null, 2) + '\n', 'utf8')
}

const ACCOUNTS_SRC = join(SRC, 'accounts')
console.log(`source : ${SRC}`)
console.log(`target : ${DST}`)
console.log(`mode   : ${DRY ? 'DRY-RUN (no writes)' : 'MIGRATE'}\n`)

let files
try {
  files = await readdir(ACCOUNTS_SRC)
} catch (error) {
  console.error(`cannot read ${ACCOUNTS_SRC}: ${error.message}`)
  process.exit(1)
}

const skipped = []

// ── dedupe first ────────────────────────────────────────────────────────────────────────
// reasonix keeps the SAME bot account twice: `default.json` and `<ilink_bot_id>.json` are
// byte-identical copies (same token, same mtime). The plugin's loadLatestAccount() picks by
// mtime and breaks ties by readdir order — undefined here. If it landed on `default.json`,
// accountId would become the literal "default" instead of the real iLink bot id, and
// main.js:485/493 feeds that id into the session store and the sender. So keep exactly ONE
// file per distinct token, preferring the id that looks like an iLink bot id.
const seen = new Map()
for (const f of files.filter((x) => x.endsWith('.json')).sort()) {
  if (f.includes('context-tokens')) continue
  const raw = await readJson(join(ACCOUNTS_SRC, f))
  if (typeof raw?.token !== 'string') {
    skipped.push(`${f} (no 'token' field)`)
    continue
  }
  const record = { f, accountId: f.replace(/\.json$/, ''), raw }
  const sha = createHash('sha256').update(raw.token).digest('hex')
  const prior = seen.get(sha)
  if (prior === undefined) {
    seen.set(sha, record)
    continue
  }
  const isBotId = (c) => /@im\.bot$/.test(c.accountId)
  const keep = isBotId(record) && !isBotId(prior) ? record : prior
  seen.set(sha, keep)
  skipped.push(`${keep === record ? prior.f : record.f} (byte-identical token to ${keep.f})`)
}

let migrated = 0
for (const { f, accountId, raw } of seen.values()) {
  const out = {
    accountId,
    botToken: raw.token,
    baseUrl: raw.base_url || 'https://ilinkai.weixin.qq.com',
    userId: raw.user_id || '',
    savedAt: raw.saved_at || new Date().toISOString(),
    migratedFrom: 'reasonix',
  }
  console.log(`account ${accountId}`)
  console.log(`   botToken <- token      ${len(raw.token)}`)
  console.log(`   baseUrl  <- base_url   ${len(out.baseUrl)}`)
  console.log(`   userId   <- user_id    ${len(out.userId)}`)
  console.log(`   accountId <- filename  (reasonix kept it only in the name)`)
  console.log(`   -> ${join(DST, 'accounts', f)}`)
  await writeJson(join(DST, 'accounts', f), out)
  migrated += 1
}

const ctxFile = files.find((f) => f.includes('context-tokens') && f.endsWith('.json'))
let ctxCount = 0
if (ctxFile) {
  const flat = await readJson(join(ACCOUNTS_SRC, ctxFile))
  const tokens = {}
  for (const [k, v] of Object.entries(flat)) if (typeof v === 'string' && v) tokens[k] = v
  ctxCount = Object.keys(tokens).length
  console.log(`\ncontext-tokens ${ctxFile}`)
  console.log(`   flat map -> { tokens, updatedAt }  (${ctxCount} entries)`)
  for (const k of Object.keys(tokens)) console.log(`      ${k}  ${len(tokens[k])}`)
  await writeJson(join(DST, 'context-tokens.json'), { tokens, updatedAt: Date.now() })
}

if (skipped.length) {
  console.log('\nskipped:')
  for (const s of skipped) console.log(`   - ${s}`)
}

// Read back and verify the contract the plugin actually consumes (main.js:478-493).
let verified = 'not checked (dry-run)'
if (!DRY) {
  const names = await readdir(join(DST, 'accounts'))
  const ready = []
  for (const f of names.filter((x) => x.endsWith('.json'))) {
    const a = await readJson(join(DST, 'accounts', f))
    const ok =
      typeof a.accountId === 'string' && a.accountId.length > 0 &&
      typeof a.botToken === 'string' && a.botToken.length > 0 &&
      typeof a.baseUrl === 'string' && a.baseUrl.startsWith('http') &&
      typeof a.userId === 'string'
    ready.push(`${a.accountId || f}:${ok ? 'ok' : 'INCOMPLETE'}`)
  }
  verified = ready.join(' ')
}

console.log(`\nmigrated accounts: ${migrated}   context entries: ${ctxCount}`)
console.log(`plugin contract (accountId/botToken/baseUrl/userId): ${verified}`)
console.log(DRY ? 'dry-run complete — nothing was written.' : 'done. reasonix side was NOT modified.')
