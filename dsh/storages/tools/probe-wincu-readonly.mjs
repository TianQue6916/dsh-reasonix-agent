/**
 * probe-wincu-readonly.mjs — 对 dsh-computer-use-win 的只读能力验证。
 *
 * 只调用 READ_ONLY 集合里的工具（health / list_windows / snapshot / find /
 * element_info / accessibility_tree / ocr），**绝不调用输入类工具**。
 * 目的：证明 PowerShell UIA 后端真的能起来并读到桌面状态
 * （因为 cordis.patch.yml 里 failOnStartupError: false 会静默降级，
 *  不主动验证就不知道它有没有挂）。
 *
 * 用法：node probe-wincu-readonly.mjs <server.mjs> [--snapshot=<窗口标题子串>]
 */
import { spawn } from 'node:child_process'

const server = process.argv[2]
if (!server) {
  console.error('用法: node probe-wincu-readonly.mjs <server.mjs> [--snapshot=<标题子串>]')
  process.exit(2)
}
const snapshotArg = process.argv.find((a) => a.startsWith('--snapshot='))
const snapshotTarget = snapshotArg ? snapshotArg.slice('--snapshot='.length) : null

const child = spawn(process.execPath, [server], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, NODE_OPTIONS: '' },
})

let buf = ''
let id = 0
const pending = new Map()

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
      continue
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
  stderrTail = (stderrTail + d.toString('utf8')).slice(-4096)
})

function call(method, params, timeoutMs = 60000) {
  const msg = { jsonrpc: '2.0', id: ++id, method, params }
  child.stdin.write(JSON.stringify(msg) + '\n')
  return new Promise((res, rej) => {
    const t = setTimeout(() => {
      pending.delete(msg.id)
      rej(new Error(`timeout after ${timeoutMs}ms: ${method}`))
    }, timeoutMs)
    pending.set(msg.id, {
      res: (v) => {
        clearTimeout(t)
        res(v)
      },
    })
  })
}

function show(title, result) {
  console.log(`\n=== ${title} ===`)
  const c = result?.content
  if (Array.isArray(c)) {
    for (const part of c) {
      if (part.type === 'text') console.log(part.text.slice(0, 3000))
      else console.log(`[${part.type}]`)
    }
  } else {
    console.log(JSON.stringify(result, null, 1).slice(0, 3000))
  }
}

try {
  const init = await call('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'probe-readonly', version: '0.1.0' },
  })
  console.log('initialize ok:', JSON.stringify(init.result?.serverInfo))

  child.stdin.write(
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n',
  )

  const health = await call('tools/call', { name: 'windows_computer_use_health', arguments: {} })
  show('health', health.result)

  const wins = await call('tools/call', {
    name: 'windows_computer_use_list_windows',
    arguments: {},
  })
  show('list_windows', wins.result)

  // 只对显式指定的窗口做 snapshot（默认不做，避免误抓敏感窗口）
  if (snapshotTarget) {
    const snap = await call('tools/call', {
      name: 'windows_computer_use_snapshot',
      arguments: { title: snapshotTarget },
    })
    show(`snapshot(title~${snapshotTarget})`, snap.result)
  } else {
    console.log('\n(snapshot 未执行 —— 用 --snapshot=<标题子串> 指定目标窗口)')
  }
} catch (e) {
  console.error('ERROR:', e.message)
  if (stderrTail) console.error('stderr tail:\n' + stderrTail)
  process.exitCode = 1
} finally {
  child.kill()
  setTimeout(() => process.exit(process.exitCode ?? 0), 100)
}
