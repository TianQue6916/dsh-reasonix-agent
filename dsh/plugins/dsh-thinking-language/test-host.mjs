#!/usr/bin/env node
/**
 * thinking-language — host-half self-test.
 *
 * WHY a fake ctx instead of booting a profile
 *   The three things this plugin does (assemble transform, switch route, text command)
 *   are all pure functions of the injected ctx. Booting a real profile to test them
 *   means a restart per edit and a dependency on the whole plugin stack; wiring a fake
 *   ctx exercises the same code paths in milliseconds and pins the exact contract the
 *   dsh runtime hands over (`system-prompt/assemble` waterfall + `ctx.connection.fetch
 *   .register` + `ctx.commands.register`, all three copied from dsh-session-log-export).
 *
 * What it pins (2026-09-30):
 *   1. default state is `zh`, and the static persona text is preserved byte-for-byte
 *   2. the directive survives repeated assemblies with exactly one marker (idempotence)
 *   3. a POST switches the language, and the NEXT assembly reflects it — no restart
 *   4. a delegated child's persona (contract appended by subagent-language) also gets it
 *   5. GET/POST validation, and the /thinklang fallback command
 *
 * Usage: node test-host.mjs
 */
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Must precede the import: the module resolves DSH_HOME when it reads state.
const HOME = mkdtempSync(join(tmpdir(), 'thinklang-test-'))
process.env.DSH_HOME = HOME

const mod = await import('./lib/index.js')

const STATIC_PERSONA = [
  'You are the personal AI assistant of a Chinese undergraduate.',
  '',
  '语言契约（最高优先级）：',
  '1. 正文以中文为主，但**技术术语保留英文原文**。',
  '5. 思考链（reasoning / thinking）的语言由部署的 thinking-language directive 指定（默认中文）；',
  '   英文术语原样保留，不要在 thinking 里输出完整英文句子。'
].join('\n')

const MARKER = /\[thinking-language: (?:zh|en)\]/g

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === '' ? '' : `  -- ${detail}`}`)
}

// ── fake runtime ────────────────────────────────────────────────────────────────
let assembleHandler
let route
let command

const ctx = {
  on(event, handler) {
    if (event === 'system-prompt/assemble') assembleHandler = handler
  },
  effect(factory) {
    return factory()
  },
  connection: {
    fetch: {
      register(spec) {
        route = spec
        return () => {}
      }
    }
  },
  commands: {
    register(spec) {
      command = spec
      return () => {}
    }
  }
}

mod.apply(ctx)

check('注册了 system-prompt/assemble handler', typeof assembleHandler === 'function')
check('注册了 HTTP route', route !== undefined && route.path === mod.PATH,
  route === undefined ? 'route undefined' : `path=${route.path}`)
check('注册了 /thinklang 命令', command !== undefined && command.name === 'thinklang')

/** Assemble once through the real handler with a synthetic upstream layer. */
const assemble = async (sections) => {
  const assembly = { sections }
  const upstream = async () => assembly
  return assembleHandler(assembly, { agent: { session: { header: {} } } }, upstream)
}

const personaSection = () => ({ name: 'deployment:persona-prefix', text: STATIC_PERSONA })

// ── 1. default state ────────────────────────────────────────────────────────────
check('默认语言是 zh', mod.readLanguage() === 'zh', `got ${mod.readLanguage()}`)

const first = await assemble([personaSection()])
const firstText = first.sections[0].text
check('静态 persona 正文保真', firstText.startsWith(STATIC_PERSONA))
check('默认追加 zh directive', firstText.includes('[thinking-language: zh]'))
check('directive 只出现一次', (firstText.match(MARKER) || []).length === 1)

// ── 2. idempotence across repeated assemblies ───────────────────────────────────
const twice = await assemble([personaSection()])
check('重复 assemble 逐字节稳定', twice.sections[0].text === firstText)

const fromTransformed = await assemble([{ name: 'deployment:persona-prefix', text: firstText }])
check('对已含 directive 的输入幂等', fromTransformed.sections[0].text === firstText)

// ── 3. live switch via the route ────────────────────────────────────────────────
const get = async () =>
  JSON.parse(await (await route.fetch(new Request(`http://localhost${mod.PATH}`))).text())
const post = async (body) => route.fetch(new Request(`http://localhost${mod.PATH}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body)
}))

check('GET 默认返回 zh', (await get()).thinking === 'zh')

const postResponse = await post({ thinking: 'en' })
check('POST en 返回 200', postResponse.status === 200, `status=${postResponse.status}`)
check('POST en 落盘', mod.readLanguage() === 'en', `got ${mod.readLanguage()}`)
check('GET 读到 en', (await get()).thinking === 'en')

const afterSwitch = await assemble([personaSection()])
const afterText = afterSwitch.sections[0].text
check('切换后下一次 assemble 立即用英文', afterText.includes('[thinking-language: en]'))
check('切换后仍只有一个标记', (afterText.match(MARKER) || []).length === 1)
check('切换未污染静态正文', afterText.startsWith(STATIC_PERSONA))

// Set the state to zh first, then feed an EN-saturated text in: the directive must
// converge on the ACTIVE language, not on whatever the incoming text carried.
await post({ thinking: 'zh' })
const backZh = await assemble([{ name: 'deployment:persona-prefix', text: afterText }])
const backText = backZh.sections[0].text
check('en 文本 + zh 状态 → 收敛到 zh', backText.includes('[thinking-language: zh]')
  && !backText.includes('[thinking-language: en]'))
check('en → zh 往返只有一个标记', (backText.match(MARKER) || []).length === 1)
check('en → zh 往返保留静态正文', backText.startsWith(STATIC_PERSONA))

// ── 4. delegated child ─────────────────────────────────────────────────────────
const childText = STATIC_PERSONA + '\n\n' + STATIC_PERSONA
const child = await assemble([{ name: 'deployment:persona-prefix', text: childText }])
check('delegated child 也拿到 directive', child.sections[0].text.includes('[thinking-language:'))
check('child 只加一个标记', (child.sections[0].text.match(MARKER) || []).length === 1)

// ── 5. validation + fallback command ───────────────────────────────────────────
const badLanguage = await post({ thinking: 'ja' })
check('非法语言 400', badLanguage.status === 400, `status=${badLanguage.status}`)

const badJson = await route.fetch(new Request(`http://localhost${mod.PATH}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{not json'
}))
check('非法 body 400', badJson.status === 400, `status=${badJson.status}`)

await post({ thinking: 'zh' })
check('/thinklang 无参回报当前值', command.handler({ rawInput: '' }).text === 'thinking-language: zh')
check('/thinklang en 写入', command.handler({ rawInput: ' en ' }).text === 'thinking-language: en'
  && mod.readLanguage() === 'en')
check('/thinklang 非法参数报错', command.handler({ rawInput: 'xx' }).kind === 'error')

// ── 6. section absence must not throw ──────────────────────────────────────────
const noPersona = await assemble([{ name: 'something-else', text: 'x' }])
check('无 persona section 时原样返回', noPersona.sections[0].name === 'something-else'
  && noPersona.sections[0].text === 'x')
const noSections = await assembleHandler({}, { agent: { session: { header: {} } } }, async () => ({}))
check('assembled 无 sections 时不炸', typeof noSections === 'object')

// ── 7. the state file is where we say it is ────────────────────────────────────
check('state 落在 $DSH_HOME/storages', mod.statePath() === join(HOME, 'storages', 'thinking-language.json'),
  mod.statePath())
const onDisk = JSON.parse(readFileSync(mod.statePath(), 'utf8'))
check('磁盘内容形如 {"thinking":"en"}', onDisk.thinking === 'en', JSON.stringify(onDisk))

rmSync(HOME, { recursive: true, force: true })
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
