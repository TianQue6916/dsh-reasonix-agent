#!/usr/bin/env node
/**
 * thinking-language — client-half self-test.
 *
 * WHY a React shim instead of a DOM
 *   The client half runs in the browser, where `require("react")` is answered by the
 *   dsh ModuleLoader's module table — nothing on the host side can resolve it, and
 *   shipping a bundler to test one radio group is disproportionate. A ~40-line hook
 *   runtime covering exactly the four hooks this component uses (createElement,
 *   useState, useEffect, useCallback) exercises the real component body: the fetch
 *   contract, the loading/ready/error states, and the click → POST → re-render path.
 *
 * What it pins (2026-09-30):
 *   1. the module registers via window.__ModuleLoader__ and declares inject: ["slots"]
 *   2. it contributes `settings.section` with a unique id, a label and an order
 *   3. mount issues GET /api/thinking-language and shows a loading line
 *   4. the active option is the one the host reported
 *   5. clicking the other option POSTs JSON to the same path and adopts the host's answer
 *   6. a failing host renders the error line instead of throwing
 *
 * Usage: node test-client.mjs
 */
import { readFileSync } from 'node:fs'

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === '' ? '' : `  -- ${detail}`}`)
}

// ── minimal React ──────────────────────────────────────────────────────────────
const cells = []
let cursor = 0
let effectQueue = []

const h = (type, props, children) => {
  const merged = { ...(props ?? {}) }
  if (children !== undefined) merged.children = children
  return { type, props: merged }
}

const React = {
  createElement: h,
  useState(initial) {
    const index = cursor++
    if (cells.length <= index) cells.push(typeof initial === 'function' ? initial() : initial)
    const set = (value) => {
      cells[index] = typeof value === 'function' ? value(cells[index]) : value
    }
    return [cells[index], set]
  },
  useEffect(fn) {
    effectQueue.push(fn)
  },
  useCallback(fn) {
    return fn
  }
}

const render = (Component, props) => {
  cursor = 0
  effectQueue = []
  const tree = Component(props ?? {})
  const cleanups = effectQueue.map((fn) => fn())
  return { tree, cleanups }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const texts = (node, out = []) => {
  if (node === null || node === undefined || node === false) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) texts(child, out)
    return out
  }
  if (node.props !== undefined) texts(node.props.children, out)
  return out
}

const findAll = (node, predicate, out = []) => {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, predicate, out)
    return out
  }
  if (predicate(node)) out.push(node)
  findAll(node.props?.children, predicate, out)
  return out
}

// ── fake host: window.ModuleLoader + fetch ─────────────────────────────────────
let loaded
globalThis.window = { __ModuleLoader__: { load: (spec) => { loaded = spec } } }

const calls = []
let language = 'zh'
let failing = false

globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, method: options.method ?? 'GET', body: options.body, headers: options.headers })
  if (failing) return { ok: false, status: 500, json: async () => ({}) }
  if ((options.method ?? 'GET') === 'POST') language = JSON.parse(options.body).thinking
  return { ok: true, status: 200, json: async () => ({ thinking: language }) }
}

// ── load the real client bundle ────────────────────────────────────────────────
const source = readFileSync(new URL('./lib/client.js', import.meta.url), 'utf8')
// eslint-disable-next-line no-new-func -- the bundle targets a browser global; the shim supplies it.
new Function('window', 'require', source)(globalThis.window, (id) => {
  if (id === 'react') return React
  throw new Error(`unexpected require(${id})`)
})

check('通过 __ModuleLoader__ 注册', loaded !== undefined && loaded.id === '@local/dsh-thinking-language')
check('有 factory', typeof loaded?.factory === 'function')

const client = loaded.factory((id) => {
  if (id === 'react') return React
  throw new Error(`unexpected require(${id})`)
})

check('声明 inject: ["slots"]', Array.isArray(client.inject) && client.inject.includes('slots'))

let registration
let registeredComponent
const ctx = {
  slots: {
    inject(slot, factory) {
      registration = { slot }
      const registered = factory()
      registeredComponent = registered.component ?? registered.render ?? registered
      registration.options = registered.options ?? registered
    },
    register(options, component) {
      return { options, component }
    }
  }
}
client.apply(ctx)

check('贡献到 settings.section', registration?.slot === 'settings.section', `slot=${registration?.slot}`)
const options = registration?.options ?? {}
check('id 唯一且稳定', options.id === 'thinking-language', `id=${options.id}`)
check('order 是数字', typeof options.order === 'number', `order=${options.order}`)
check('label 可解析', String(typeof options.label === 'function' ? options.label() : options.label).length > 0)

// ── mount + load ───────────────────────────────────────────────────────────────
const Section = registeredComponent
let view = render(Section, { close: () => {} })
check('挂载即 GET 同源路径', calls[0]?.url === '/api/thinking-language' && calls[0]?.method === 'GET',
  JSON.stringify(calls[0]))
check('初始显示读取中', texts(view.tree).some((t) => t.includes('读取中')))
await flush()
view = render(Section, { close: () => {} })

const radios = () => findAll(view.tree, (n) => n.props?.['role'] === 'radio')
const activeId = () => radios().find((r) => r.props['aria-checked'] === true)
  ?.props.children?.find?.((c) => c?.props?.children)
// aria-checked lives next to the option's own text; recover which one is active by text.
const radioLabel = (node) => texts(node).join(' ')

check('渲染两个选项', radios().length === 2, `count=${radios().length}`)
const active = radios().find((r) => r.props['aria-checked'] === true)
check('host 报的 zh 被选中', active !== undefined && radioLabel(active).includes('中文思考'),
  active === undefined ? 'no active radio' : radioLabel(active))

// ── click → POST → adopt host answer ──────────────────────────────────────────
const enRadio = radios().find((r) => radioLabel(r).includes('English reasoning'))
enRadio.props.onClick()
view = render(Section, { close: () => {} })
const post = calls.find((c) => c.method === 'POST')
check('点击触发 POST', post !== undefined, 'no POST issued')
check('POST 目标同源路径', post?.url === '/api/thinking-language', `url=${post?.url}`)
check('POST body 是 {"thinking":"en"}', post?.body === JSON.stringify({ thinking: 'en' }), `body=${post?.body}`)
check('POST 带 JSON content-type', String(post?.headers?.['content-type'] ?? '').includes('application/json'),
  JSON.stringify(post?.headers))

await flush()
view = render(Section, { close: () => {} })
const activeAfter = radios().find((r) => r.props['aria-checked'] === true)
check('宿主返回后 en 被选中', activeAfter !== undefined && radioLabel(activeAfter).includes('English'),
  activeAfter === undefined ? 'no active radio' : radioLabel(activeAfter))
check('显示已生效提示', texts(view.tree).some((t) => t.includes('下一条消息即生效')))

// ── failure path (fresh mount against a failing host) ──────────────────────────
// Two ordering constraints, both artifacts of this harness rather than the plugin:
//   * the hook shim keeps state at module scope, so a fresh mount means clearing the
//     cells — otherwise this render reuses the previous (successful) state;
//   * every render re-runs effects here (no dependency diffing), so GET promises from
//     earlier renders are still in flight. They must be allowed to SETTLE against the
//     old cells before the clear, or one of them lands afterwards and repaints a
//     success state over the failure.
failing = true
await flush()
await flush()
cells.length = 0
view = render(Section, { close: () => {} })
await flush()
await flush()
view = render(Section, { close: () => {} })
check('host 失败时渲染错误行而非抛异常',
  texts(view.tree).some((t) => t.includes('切换失败')), texts(view.tree).join(' | ').slice(0, 200))
check('错误提示里给了 /thinklang 兜底',
  texts(view.tree).some((t) => t.includes('/thinklang')))

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
