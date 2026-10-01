/**
 * git-context.mjs — 把**本地 git 状态**注入每一轮的上下文
 * ---------------------------------------------------------------------------
 * 为什么需要它
 *   用户的要求是「每次改动和上下文记忆能记得自己 git（本地 git）」。
 *   此前 dsh 侧的两半都缺：session header 只有 cwd，fact frontmatter 没有任何
 *   git 字段；而 ~/.dsh 本身直到 2026-09-28 才建起本地 git 仓库。
 *   这个模块补上「当前处在哪个 git 状态」这一半，让每一轮对话都知道：
 *   在哪几个仓库、什么分支、哪个 HEAD、有多少未提交改动、最近几条 commit。
 *
 * 注入方式（照抄官方 @deepseek-ai/dsh-time-context 的做法）
 *   在 `agent/pre-step` waterfall 里往 decision.messages 追加一条 user 消息，
 *   source = { kind: name, form: 'snapshot', sections: [...] }。
 *   注意 preset 模块只能 import node 内建模块（解析根是 preset 目录，没有
 *   node_modules），所以这里手写 message 形状，不能 import dsh-llm 的
 *   createUserMessage。
 *
 * 与 context-gate 的关系
 *   本行没有 chal 到 allowKinds，所以在「未 promote」的第一轮会被
 *   anchored-context-gate 连同其它第三方注入一起剥掉，第二轮起才可见 ——
 *   这与官方 dsh-time-context / AGENTS.md digest 的待遇完全一致，是设计而非缺陷。
 *
 * 静默原则
 *   拿不到 git 信息（不是仓库 / git 不在 PATH / 超时）时**返回空字符串、不注入**，
 *   绝不产生噪音。
 *
 * 去重（2026-10-01 加，与 thinking-anchor.mjs 同一根因）
 *   transcript 只增不改，而本行每步都追加一条，于是上下文里会累积 N 条 git 快照。
 *   实测 session-10ca9bfe（root）：本行注入 **195 条**、59884 B，占该 session 正文
 *   的 **47.1%**（同期 thinking-anchor 136 条 / 25.6%，真实 user 消息只有 15 条）。
 *   这有两重害处：
 *     ① 「当前 HEAD / 未提交改动」是**时变**信息，旧快照是过期的错误状态，
 *        留着不仅无用，还会给出旧的 HEAD hash 误导模型；
 *     ② 195 条纯英文文本长期占据上下文，对 reasoning 语言是被持续施加的英文压力。
 *   改为「先删掉本行此前注入的全部快照，再追加唯一一条」：始终只有最新状态，
 *   且永远贴着尾部。回滚开关：config.pruneHistory: false。
 */

import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

export const name = 'git-context'
export const inject = []

const GIT_TIMEOUT_MS = 3000
const CACHE_TTL_MS = 4000

/** 进程级缓存：同一 cwd 在 TTL 内复用，避免每步都 spawn git。 */
let cache = { at: 0, key: '', text: '' }

function tryGit(cwd, args) {
  try {
    const out = execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    })
    return String(out).replace(/\r/g, '').trim()
  } catch {
    return null
  }
}

/** 取会话工作目录；agent.session 的形状在不同版本间有差异，逐级兜底。 */
function resolveCwd(agent) {
  const candidates = [
    agent && agent.session && agent.session.cwd,
    agent && agent.session && agent.session.header && agent.session.header.cwd,
    agent && agent.cwd,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c
  }
  return process.cwd()
}

function describeRepo(dir, maxCommits) {
  const root = tryGit(dir, ['rev-parse', '--show-toplevel'])
  if (root === null || root === '') return null
  const branch = tryGit(dir, ['rev-parse', '--abbrev-ref', 'HEAD']) || '(unknown)'
  const head = tryGit(dir, ['rev-parse', '--short', 'HEAD']) || '(no commits)'
  const porcelain = tryGit(dir, ['status', '--porcelain']) || ''
  const dirty = porcelain === '' ? 0 : porcelain.split('\n').filter((l) => l !== '').length
  const commits = tryGit(dir, ['log', '-' + String(maxCommits), '--pretty=%h %ad %s', '--date=short']) || ''
  return { root, branch, head, dirty, commits }
}

function render(repos) {
  const blocks = []
  for (const r of repos) {
    const lines = [
      r.root + '  [branch ' + r.branch + '  HEAD ' + r.head +
        (r.dirty > 0 ? '  ' + r.dirty + ' uncommitted' : '  clean') + ']',
    ]
    if (r.commits !== '') {
      for (const c of r.commits.split('\n')) {
        if (c !== '') lines.push('    ' + c)
      }
    }
    blocks.push(lines.join('\n'))
  }
  return blocks.join('\n')
}

function snapshot(cwd, configured, maxCommits) {
  const roots = []
  const push = (dir) => {
    if (typeof dir !== 'string' || dir === '') return
    const key = dir.toLowerCase()
    if (!roots.some((x) => x.toLowerCase() === key)) roots.push(dir)
  }
  // 顺序：会话 cwd 优先，随后是配置里显式声明的仓库（例如 ~/.dsh 自己）。
  push(cwd)
  for (const dir of configured) push(dir)

  const out = []
  const seen = new Set()
  for (const dir of roots) {
    const info = describeRepo(dir, maxCommits)
    if (info === null) continue
    const key = info.root.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(info)
  }
  if (out.length === 0) return ''
  return [
    'LOCAL GIT STATE (injected by git-context; uncommitted = working tree changes)',
    render(out),
  ].join('\n')
}

/** 观测计数（自测与现场诊断用；每个进程各自持有一份）。 */
export const stats = { injected: 0, pruned: 0 }

/** 判定一条消息是不是本行此前注入的快照（只认自己的 source.kind）。 */
const isOwnMessage = (message) =>
  message !== null &&
  typeof message === 'object' &&
  message.source !== null &&
  typeof message.source === 'object' &&
  message.source.kind === name

export function apply(ctx, config) {
  const cfg = config && typeof config === 'object' ? config : {}
  const enabled = cfg.enabled !== false
  if (!enabled) return
  const configured = Array.isArray(cfg.repos) ? cfg.repos.filter((x) => typeof x === 'string') : []
  const maxCommits = Number.isInteger(cfg.maxCommits) && cfg.maxCommits > 0 ? cfg.maxCommits : 3

  ctx.on('agent/pre-step', async ({ agent }, next) => {
    const decision = await next()
    try {
      if (decision && decision.kind === 'reject') return decision
      const cwd = resolveCwd(agent)
      const key = cwd + '|' + configured.join(',') + '|' + String(maxCommits)
      const now = Date.now()
      let text = cache.text
      if (cache.key !== key || now - cache.at > CACHE_TTL_MS) {
        text = snapshot(cwd, configured, maxCommits)
        cache = { at: now, key, text }
      }
      const existing = Array.isArray(decision?.messages) ? decision.messages : null
      if (existing === null) return decision
      // 先剪掉本行此前注入的快照：只增不改的 transcript 会让它们堆成过期状态 + 英文噪声。
      const kept = cfg.pruneHistory === false ? existing : existing.filter((m) => !isOwnMessage(m))
      stats.pruned += existing.length - kept.length
      if (text === '') {
        // 拿不到 git 信息：不注入新快照，但**仍然清掉旧快照** —— 过期状态比没有状态更坏。
        return kept.length === existing.length ? decision : { ...decision, messages: kept }
      }
      stats.injected += 1
      return {
        ...decision,
        messages: [
          ...kept,
          {
            // ★ 必须有 id。缺它会让 DSH 的 session validator 报
            //   "session event at seq N lacks an identified message"，
            //   整个 session 被判为 corrupt（历史加载失败）。
            //   官方 @deepseek-ai/dsh-time-context 用 createUserMessage() 生成这个 id，
            //   而 preset 模块不能 import dsh-llm（解析根是 preset 目录、没有 node_modules），
            //   所以形状是手写的 —— 2026-09-29 实测：漏掉 id 直接毁掉 87 条事件。
            id: randomUUID(),
            role: 'user',
            content: [{ type: 'text', text }],
            source: { kind: name, form: 'snapshot', sections: [{ name, text }] },
          },
        ],
      }
    } catch {
      // 注入失败绝不能吃掉用户上下文 —— 原样放行
      return decision
    }
  })
}
