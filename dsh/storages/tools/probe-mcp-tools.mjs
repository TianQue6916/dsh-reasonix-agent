/**
 * probe-mcp-tools.mjs — 安全地探测一个 stdio MCP server 的工具清单。
 *
 * 为什么需要它：`dsh-computer-use-win` 的 `npm run selftest` 是【全栈自检】，
 * 包含 Notepad E2E —— 会真的动鼠标键盘。我们**不能拿用户的桌面做实验**。
 * 这个探针只做 MCP 协议握手 + tools/list，全程只读、不发送任何输入。
 *
 * 用法：
 *   node probe-mcp-tools.mjs <server.mjs 路径> [超时秒数]
 */
import { spawn } from 'node:child_process'

const server = process.argv[2]
const timeoutSec = Number(process.argv[3] ?? 30)
if (!server) {
  console.error('用法: node probe-mcp-tools.mjs <server.mjs> [timeoutSec]')
  process.exit(2)
}

const child = spawn(process.execPath, [server], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, NODE_OPTIONS: '' }, // 清掉 --use-system-ca，避免影响子进程行为
})

let buf = ''
let id = 0
const pending = new Map()
const log = (...a) => console.log(...a)

function send(method, params) {
  const msg = { jsonrpc: '2.0', id: ++id, method, params }
  child.stdin.write(JSON.stringify(msg) + '\n')
  return new Promise((res, rej) => pending.set(msg.id, { res, rej }))
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
}

child.stdout.on('data', (d) => {
  buf += d.toString('utf8')
  let i
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).replace(/\r$/, '')
    buf = buf.slice(i + 1)
    if (line.trim() === '') continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      continue // 非协议行（日志等）忽略
    }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { res } = pending.get(msg.id)
      pending.delete(msg.id)
      res(msg)
    }
  }
})

let stderrTail = ''
child.stderr.on('data', (d) => {
  stderrTail = (stderrTail + d.toString('utf8')).slice(-800)
})

const timer = setTimeout(() => {
  log(`\n!! 超时 ${timeoutSec}s，强制退出`)
  try { child.kill() } catch {}
  process.exit(1)
}, timeoutSec * 1000)

try {
  const init = await send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'dsh-probe', version: '0.0.1' },
  })
  log('=== initialize 响应 ===')
  log(JSON.stringify(init.result ?? init.error, null, 1).slice(0, 600))

  notify('notifications/initialized', {})

  const list = await send('tools/list', {})
  const tools = list.result?.tools ?? []
  log(`\n=== tools/list：共 ${tools.length} 个工具 ===`)
  for (const t of tools) {
    log(`  - ${t.name}`)
  }

  // 只读工具，绝不发输入类调用
  const READONLY = /health|snapshot|list|find|info|ocr|tree|accessibility/i
  const safe = tools.filter((t) => READONLY.test(t.name))
  log(`\n=== 只读子集（${safe.length} 个，本探针只列出、不调用）===`)
  for (const t of safe) log(`  - ${t.name}`)

  const INPUT = /click|type|key|mouse|move|scroll|drag|write|press/i
  const risky = tools.filter((t) => INPUT.test(t.name))
  log(`\n=== 输入类工具（${risky.length} 个 —— 会真的操作鼠标键盘）===`)
  for (const t of risky) log(`  ! ${t.name}`)
} catch (e) {
  log('!! 探针异常:', String(e?.message ?? e))
  if (stderrTail) log('--- server stderr 尾部 ---\n' + stderrTail)
} finally {
  clearTimeout(timer)
  try { child.kill() } catch {}
}
