/**
 * plan-anchor.mjs 的单元测试。
 * 纪律：不依赖真实 $DSH_HOME/PLAN.md —— 每个用例用 tmp 目录里自己造的文件，
 * 且必须能覆盖 fail-closed 的每条分支（读不到绝不能不报错地悄悄注入）。
 * 跑法：node ~/.dsh/storages/tools/test-plan-anchor.mjs
 */

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

import {
  apply,
  frame,
  headLines,
  name,
  planPath,
  readPlan,
  render,
  stats,
} from '../../.agent-presets/anchored-standard/plan-anchor.mjs'

let passed = 0
let failed = 0
const failures = []

function t(label, fn) {
  try {
    fn()
    passed += 1
    console.log(`  ok   ${label}`)
  } catch (err) {
    failed += 1
    failures.push({ label, err })
    console.log(`  FAIL ${label}\n       ${err.message}`)
  }
}

const root = mkdtempSync(join(tmpdir(), 'plan-anchor-test-'))
const sha16 = (s) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16)

/** 造一个 pre-step 的 mock ctx：抓住 handler 与它的 options。 */
function mockCtx() {
  let handler = null
  let opts = null
  let onCalls = 0
  const ctx = {
    on(event, fn, o) {
      onCalls += 1
      if (event === 'agent/pre-step') {
        handler = fn
        opts = o
      }
    },
  }
  return {
    ctx,
    get handler() {
      return handler
    },
    get opts() {
      return opts
    },
    get onCalls() {
      return onCalls
    },
  }
}

/** 跑一步：next() 返回 decision，handler 处理它。 */
const step = (h, decision) => h({ agent: {} }, async () => decision)

/** 造一条别人（非本行）的 user 消息。 */
const other = (kind, id) => ({
  id,
  role: 'user',
  content: [{ type: 'text', text: `from ${kind}` }],
  source: { kind, form: 'snapshot', sections: [{ name: kind, text: 'x' }] },
})

const baseDecision = (messages) => ({ kind: 'ok', messages })

console.log('== [1] readPlan 的三态 ==')
const realPlan = join(root, 'PLAN.md')
writeFileSync(realPlan, '# 目标\n- [ ] 甲\n- [ ] 乙\n', 'utf8')
t('非空文件 → 原文', () => assert.equal(readPlan(realPlan), '# 目标\n- [ ] 甲\n- [ ] 乙\n'))
t('不存在 → null（fail-closed）', () => assert.equal(readPlan(join(root, 'nope.md')), null))
const emptyPlan = join(root, 'empty.md')
writeFileSync(emptyPlan, '   \n\n  ', 'utf8')
t('只有空白 → null（fail-closed）', () => assert.equal(readPlan(emptyPlan), null))
t('路径是目录 → null（catch 生效）', () => assert.equal(readPlan(root), null))

console.log('== [2] headLines ==')
const six = 'a\nb\nc\nd\ne\nf'
t('取前 3 行', () => assert.equal(headLines(six, 3), 'a\nb\nc'))
t('n > 总行数 → 全给', () => assert.equal(headLines(six, 99), six))
t('CRLF 也算行界', () => assert.equal(headLines('a\r\nb\r\nc', 2), 'a\nb'))

console.log('== [3] frame 的可验证字段 ==')
const f1 = frame({ file: realPlan, text: six, shown: six, headCount: 30, totalLines: 6, maxBytes: 8000 })
t('含 BEGIN-PLAN-DATA', () => assert.match(f1, /^===BEGIN-PLAN-DATA /))
t('含 END-PLAN-DATA', () => assert.match(f1, /\n===END-PLAN-DATA===/))
t('file= 是传入路径', () => assert.ok(f1.includes(`file=${realPlan}`)))
t('bytes= 是全文字节数', () => assert.ok(f1.includes(`bytes=${Buffer.byteLength(six, 'utf8')}`)))
t('lines= 是总行数 6', () => assert.ok(f1.includes('lines=6')))
t('head=30', () => assert.ok(f1.includes('head=30')))
t('sha256= 是*全文*摘要', () => assert.ok(f1.includes(`sha256=${sha16(six)}`)))
t('未截断 → truncated=no', () => assert.ok(f1.includes('truncated=no')))
t('未截断 → 无「要看全文」提示', () => assert.ok(!f1.includes('要看全文')))

const f2 = frame({ file: realPlan, text: six, shown: 'a\nb', headCount: 2, totalLines: 6, maxBytes: 8000 })
t('截断 → truncated=yes', () => assert.ok(f2.includes('truncated=yes')))
t('截断 → 给「要看全文自己 read」提示', () => assert.ok(f2.includes('要看全文')))
t('截断 → 提示里写明 前2行/共6行', () => assert.ok(f2.includes('前 2 行 / 共 6 行')))
t('截断 → sha256 仍是全文摘要（与 f1 相同）', () => assert.ok(f2.includes(`sha256=${sha16(six)}`)))

console.log('== [4] sha256 绑全文而非 head（关键性质）==')
const sameHead = 'a\nb\nZZZ-different-tail'
const fA = frame({ file: realPlan, text: six, shown: 'a\nb', headCount: 2, totalLines: 6, maxBytes: 8000 })
const fB = frame({ file: realPlan, text: sameHead, shown: 'a\nb', headCount: 2, totalLines: 3, maxBytes: 8000 })
t('head 相同但全文不同 → sha256 不同', () => assert.notEqual(fA.split('sha256=')[1].split(' ')[0], fB.split('sha256=')[1].split(' ')[0]))

console.log('== [5] render 的外层与字节兜底 ==')
const r1 = render(six, { path: realPlan })
t('有 <plan-anchor> 开标签', () => assert.match(r1, /^<plan-anchor>\n/))
t('有 </plan-anchor> 闭标签', () => assert.ok(r1.endsWith('</plan-anchor>')))
t('默认 head=30（此处未截断）', () => assert.ok(r1.includes('head=30')))
t('含默认中文引导语', () => assert.ok(r1.includes('当前计划（每步重注入')))
const r2 = render('x'.repeat(5000), { path: realPlan, maxBytes: 200 })
t('maxBytes=200 → 输出远小于全文', () => assert.ok(Buffer.byteLength(r2, 'utf8') < 2000))
t('maxBytes 生效后 truncated=yes', () => assert.ok(r2.includes('truncated=yes')))
t('maxBytes 提示里出现「按字节上限再裁」', () => assert.ok(r2.includes('按字节上限再裁')))
const multi = '中'.repeat(300)
const r3 = render(multi, { path: realPlan, maxBytes: 100 })
t('多字节字符不被切坏（无 U+FFFD）', () => assert.ok(!r3.includes('\uFFFD')))
t('多字节裁剪后仍在字节上限内', () => {
  const inner = (r3.split('truncated=yes===\n')[1] ?? '').split('\n===END-PLAN-DATA===')[0]
  return assert.ok(Buffer.byteLength(inner, 'utf8') <= 100)
})
t('overByteLimit 默认 false 时无「按字节上限再裁」', () => assert.ok(!f1.includes('按字节上限再裁')))
t('overByteLimit=true 时出现「按字节上限再裁」', () => {
  const f = frame({ file: realPlan, text: six, shown: 'a', headCount: 1, totalLines: 6, overByteLimit: true })
  return assert.ok(f.includes('按字节上限再裁'))
})
const r4 = render(six, { path: realPlan, prefix: '自定义引导' })
t('cfg.prefix 覆盖默认引导语', () => assert.ok(r4.includes('自定义引导')))

console.log('== [6] apply：注入形状 ==')
const m1 = mockCtx()
apply(m1.ctx, { path: realPlan, headLines: 2 })
t('注册了 agent/pre-step', () => assert.equal(typeof m1.handler, 'function'))
t('ctx.on 第三参数存在', () => assert.ok(m1.opts !== null && m1.opts !== undefined))
t('prepend === true', () => assert.equal(m1.opts.prepend, true))
t('只有一个注册点', () => assert.equal(m1.onCalls, 1))

const before = { ...stats }
const out1 = await step(m1.handler, baseDecision([other('user', 'u1')]))
t('返回新的 decision 对象', () => assert.notEqual(out1, undefined))
t('消息数 1 → 2', () => assert.equal(out1.messages.length, 2))
const inj1 = out1.messages[1]
t('注入在最后一位（贴采样点）', () => assert.equal(inj1.source.kind, name))
t('role 是 user', () => assert.equal(inj1.role, 'user'))
t('id 是 uuid 形状', () => assert.match(inj1.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/))
t('source.form = snapshot', () => assert.equal(inj1.source.form, 'snapshot'))
t('source.sections[0].text 与 content 一致', () =>
  assert.equal(inj1.source.sections[0].text, inj1.content[0].text))
t('content[0].type = text', () => assert.equal(inj1.content[0].type, 'text'))
t('注入文本含 <plan-anchor>', () => assert.ok(inj1.content[0].text.includes('<plan-anchor>')))
t('stats.injected 增加', () => assert.ok(stats.injected > before.injected))

console.log('== [7] apply：去重（habituation 防线）==')
const m2 = mockCtx()
apply(m2.ctx, { path: realPlan, headLines: 2 })
const twoOld = [other('user', 'u2'), other(name, 'p1'), other('git-context', 'g1'), other(name, 'p2')]
const out2 = await step(m2.handler, baseDecision(twoOld))
t('两条旧 plan-anchor 被剪掉', () =>
  assert.equal(out2.messages.filter((m) => m.source?.kind === name).length, 1))
t('只注入一条', () => assert.equal(out2.messages.length, 3))
t('真实 user 消息保留', () => assert.ok(out2.messages.some((m) => m.id === 'u2')))
t('git-context 消息未被越权删', () => assert.ok(out2.messages.some((m) => m.id === 'g1')))
t('末条仍是本行的新注入', () => assert.equal(out2.messages.at(-1).source.kind, name))
t('stats.pruned 增加了 2', () => assert.ok(stats.pruned >= 2))

const m3 = mockCtx()
apply(m3.ctx, { path: realPlan, headLines: 2, pruneHistory: false })
const out3 = await step(m3.handler, baseDecision([other(name, 'p3'), other(name, 'p4')]))
t('pruneHistory:false → 不剪（累加）', () => assert.equal(out3.messages.length, 3))

console.log('== [8] apply：fail-closed ==')
const m4 = mockCtx()
apply(m4.ctx, { path: join(root, 'absent.md') })
const skipBefore = stats.skipped
const dec4 = baseDecision([other('user', 'u4')])
const out4 = await step(m4.handler, dec4)
t('plan 不存在 → 消息数不变', () => assert.equal(out4.messages.length, 1))
t('plan 不存在 → 返回原 decision 对象本身', () => assert.equal(out4, dec4))
t('plan 不存在 → stats.skipped 增加', () => assert.ok(stats.skipped > skipBefore))
t('plan 不存在 → 不注入任何 plan-anchor', () => assert.ok(!out4.messages.some((m) => m.source?.kind === name)))

const m5 = mockCtx()
apply(m5.ctx, { path: emptyPlan })
const out5 = await step(m5.handler, baseDecision([other('user', 'u5')]))
t('空文件 → 不注入', () => assert.equal(out5.messages.length, 1))

console.log('== [9] apply：边界与异常路径 ==')
const m6 = mockCtx()
apply(m6.ctx, { path: realPlan })
const rej = { kind: 'reject', reason: 'nope' }
const out6 = await step(m6.handler, rej)
t('decision.kind === reject → 原样返回', () => assert.equal(out6, rej))

const m7 = mockCtx()
apply(m7.ctx, { path: realPlan })
const noMsg = { kind: 'ok' }
const out7 = await step(m7.handler, noMsg)
t('decision.messages 缺失 → 原样返回', () => assert.equal(out7, noMsg))

const m8 = mockCtx()
apply(m8.ctx, { path: realPlan })
const nullEl = baseDecision([null, other('user', 'u8')])
const out8 = await step(m8.handler, nullEl)
t('messages 含 null 不崩', () => assert.ok(Array.isArray(out8.messages)))
t('含 null 时长度正确（2 + 1）', () => assert.equal(out8.messages.length, 3))
t('null 被当作非本行消息保留', () => assert.equal(out8.messages[0], null))

const m9 = mockCtx()
apply(m9.ctx, { path: realPlan })
const noSource = baseDecision([{ id: 'x', role: 'user', content: [] }])
const out9 = await step(m9.handler, noSource)
t('无 source 字段的消息不被删', () => assert.ok(out9.messages.some((m) => m?.id === 'x')))

const m10 = mockCtx()
apply(m10.ctx, { path: realPlan })
const weird = baseDecision([{ id: 'y', role: 'user', content: [], source: null }])
const out10 = await step(m10.handler, weird)
t('source===null 不崩且不被删', () => assert.ok(out10.messages.some((m) => m?.id === 'y')))

console.log('== [10] thinking-anchor 的消息不被误删 ==')
const m11 = mockCtx()
apply(m11.ctx, { path: realPlan })
const withAnchor = baseDecision([other('thinking-anchor', 'ta1'), other(name, 'p5')])
const out11 = await step(m11.handler, withAnchor)
t('thinking-anchor 保留', () => assert.ok(out11.messages.some((m) => m.id === 'ta1')))
t('自己的旧 plan-anchor 被剪', () => assert.equal(out11.messages.length, 2))

console.log('== [11] enabled:false 与 planPath ==')
const m12 = mockCtx()
apply(m12.ctx, { enabled: false, path: realPlan })
t('enabled:false → 不注册 handler', () => assert.equal(m12.onCalls, 0))
t('cfg.path 生效', () => assert.equal(planPath({ path: '/tmp/x.md' }), '/tmp/x.md'))
t('无 cfg.path → 落在 DSH_HOME/PLAN.md', () =>
  assert.ok(planPath({}).endsWith(join('.dsh', 'PLAN.md'))))
t('cfg 为 null 不炸', () => assert.ok(planPath(null).endsWith('PLAN.md')))

rmSync(root, { recursive: true, force: true })

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\n失败的用例：')
  for (const f of failures) console.log(` - ${f.label}: ${f.err.message}`)
  process.exit(1)
}
