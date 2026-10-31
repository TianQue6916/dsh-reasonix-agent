/**
 * custom-bash — a Windows-capable `bash` tool that registers under the SAME
 * name (`bash`) as the official persistent bash, with a Minimal-compatible
 * description, but executes through `ctx.subprocess.spawn` instead of a PTY.
 *
 * WHY: DeepSeek's first-request trajectory anchor keys on the tool SCHEMA
 * matching the RL training distribution (issue #11: persistent
 * bash + str_replace_editor anchored 5/5 at maxTokens=256000, pwsh/read
 * 8/8 standard-like). The official persistent bash uses a PTY, and DSH's PTY
 * backend is linux/darwin-only — `subprocess-local` throws "terminal
 * inspection is unsupported on platform win32". A custom tool that presents
 * the same name and a Minimal-like description but spawns Git Bash through
 * the ordinary (cross-platform) subprocess seam keeps the schema anchor
 * without the PTY dependency.
 *
 * Executable resolution (config `bashPath`, issue #24 — no hardcoded install
 * path): an explicit non-empty `bashPath` wins unconditionally. Unset, the
 * Git Bash executable is INFERRED, in probe order:
 *  1. the `git` executable on PATH — its install root carries `bin\bash.exe`
 *     one level up from `cmd\`, beside `bin\`, or two levels up from
 *     `mingw64\bin\` (the standard installer, choco, and winget all resolve
 *     here; a scoop SHIM does not — its directory is the shims root, not the
 *     app — which is what step 2 covers);
 *  2. the well-known Git-for-Windows roots derived from environment variables
 *     (`ProgramFiles`, `ProgramFiles(x86)`, per-user `LOCALAPPDATA\Programs
 *     \Git`, scoop's `~\scoop\apps\git\current` junction);
 *  3. plain `bash` through `ctx.subprocess.resolveExecutable` (PATH lookup —
 *     last resort, since on Windows that may pick the WSL shim; WSL bash is
 *     still true bash, only the filesystem paths shift to /mnt/…).
 *
 * If NOTHING resolves, the tool fails with an actionable error naming the
 * remedies — it does NOT silently execute under a different shell: the
 * schema above promises `bash -c` semantics, and pwsh/cmd are different
 * command languages. PowerShell stays available as its OWN tool (`pwsh`,
 * present in the promoted catalog on Windows, unlockable via
 * dev_tool_search).
 *
 * Semantics mirror the official bash tool: `bash -c <command>` in a fresh
 * process, bounded output, non-zero exit reported not thrown. No sandbox
 * confinement on Windows (the sandbox backend is linux-only); the tool
 * description says so. The bootstrap catalog pairs this with
 * `str_replace_editor` (Minimal's two tools).
 */

import { access, appendFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'custom-bash'

/** The subprocess and tools services must exist before this tool can register. */
export const inject = ['subprocess', 'tools']

const DEFAULT_TIMEOUT_MS = 120000

/**
 * 分级超时规则（2026-10-29）—— **不依赖模型自觉**。
 *
 * 背景：给 bash 加了 `timeout` 参数、也在 concurrency-discipline 的注入里写了用法，
 * 但实测（session-eeb1749b，13:47 创建）schema 有参数、TEXT 是新版，模型仍然**一次都不传**。
 * 「可选参数」永远竞争不过模型的「少写一点」倾向 —— 所以改成工具自己判断。
 *
 * 优先级：模型显式传的 `timeout` > 本表命中 > DEFAULT_TIMEOUT_MS。
 * 顺序敏感：先匹配的赢（网络类最容易挂，放最前）。
 */
/**
 * 超时可观测性（2026-10-31 加）—— 每次 bash 执行都记一行，回答「到底有没有生效」。
 *
 * 为什么需要：分级超时是**自动**套用的，模型不传任何参数也会生效，所以从调用方
 * 完全看不出来。用户只能怀疑「是不是没生效」。写一行 jsonl 就有硬证据。
 *
 * 位置：$DSH_HOME/logs/bash-timeout.jsonl（= ~/.dsh/logs/…）
 * 字段：ts / limitMs / source(model|heuristic:<n>|default) / cmd（截断 120 字）
 * 失败静默：日志写不进去不能影响命令执行。
 */
const TIMEOUT_LOG = join(homedir(), '.dsh', 'logs', 'bash-timeout.jsonl')

function recordTimeout(command, limitMs, source) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    limitMs,
    source,
    cmd: String(command ?? '').slice(0, 120),
  }) + '\n'
  appendFile(TIMEOUT_LOG, line, 'utf8').catch(() => {})
}

const TIMEOUT_RULES = [
  // 可能永久挂住：等 stdin / 等网络 / 交互式
  { re: /\b(ssh|scp|sftp|rsync|telnet|ncat|nc|ping|tracert|traceroute)\b/, ms: 30_000 },
  { re: /\b(curl|wget|Invoke-WebRequest|Invoke-RestMethod)\b/, ms: 60_000 },
  // 慢但该等的：装包 / 仓库 / 构建 / 全量测试
  { re: /\b(npm|pnpm|yarn|bun|pip|pip3|apt|apt-get|brew|cargo|gem|composer)\s+(install|add|update|upgrade|sync)\b/, ms: 300_000 },
  { re: /\b(git\s+(clone|fetch|pull)|docker|podman)\b/, ms: 300_000 },
  { re: /\b(vitest|jest|pytest|tsc|webpack|vite|esbuild|rollup|turbo|nx)\b/, ms: 300_000 },
  // 会跑但一般几十秒内结束的
  { re: /\b(dsh\s+--|python3?\s+-c|node\s+-e)\b/, ms: 60_000 },
]

/** 按命令文本挑一个超时（毫秒）。导出以便单元测试。 */
export function heuristicTimeoutMs(command) {
  const cmd = String(command ?? '')
  for (const rule of TIMEOUT_RULES) {
    if (rule.re.test(cmd)) return rule.ms
  }
  return DEFAULT_TIMEOUT_MS
}
const DEFAULT_MAX_OUTPUT_BYTES = 64000

/**
 * Git Bash candidate paths, in probe order (see the header): the `git`
 * executable's install root first, then the well-known env-derived roots.
 * Exported for tests; pure — existence probing happens at the call site.
 */
export function bashCandidates(env, gitExe) {
  const candidates = []
  // git at <root>\cmd\git.exe (installer/scoop) or <root>\bin\git.exe →
  // <root>\bin\bash.exe; <root>\mingw64\bin\git.exe (portable) → two up.
  // A bare relative name means `git` did not actually resolve to a path.
  if (typeof gitExe === 'string' && /[/\\]/.test(gitExe)) {
    const dir = dirname(gitExe)
    const root = dirname(dir)
    candidates.push(
      join(root, 'bin', 'bash.exe'),
      join(dir, 'bash.exe'),
      join(dirname(root), 'bin', 'bash.exe'),
    )
  }
  if (env.ProgramFiles) candidates.push(join(env.ProgramFiles, 'Git', 'bin', 'bash.exe'))
  if (env['ProgramFiles(x86)']) candidates.push(join(env['ProgramFiles(x86)'], 'Git', 'bin', 'bash.exe'))
  if (env.LOCALAPPDATA) candidates.push(join(env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe'))
  if (env.USERPROFILE) candidates.push(join(env.USERPROFILE, 'scoop', 'apps', 'git', 'current', 'bin', 'bash.exe'))
  // Layouts overlap (a `bin` git.exe derives the same bash twice) — probe
  // order survives the dedupe, insertion order is preserved.
  return [...new Set(candidates)]
}

/**
 * Git Bash / MSYS drive path (`/e/foo`) → Windows path (`E:\foo`).
 * Unix paths like `/usr/bin` or `/tmp` are left unchanged. Exported for tests.
 */
export function normalizeGitBashWorkdir(workdir, platform = process.platform) {
  if (typeof workdir !== 'string' || workdir.length === 0) return workdir
  if (platform !== 'win32') return workdir
  const match = workdir.match(/^\/([a-zA-Z])(?:\/(.*))?$/)
  if (!match) return workdir
  const rest = match[2] ? match[2].replace(/\//g, '\\') : ''
  return rest ? `${match[1].toUpperCase()}:\\${rest}` : `${match[1].toUpperCase()}:\\`
}

function isWorkdirEnoent(error) {
  return /\bENOENT\b/.test(String((error && error.message) || error || ''))
}

/** Tool parameter schema for the model-facing command. */
const commandSchema = {
  type: 'object',
  properties: {
    command: {
      type: 'string',
      description: 'The bash command to execute (`bash -c` string domain).',
    },
    workdir: {
      type: 'string',
      description: 'Optional working directory; defaults to the session cwd. On Windows, Git Bash paths like /e/foo are accepted and converted to E:\\foo.',
    },
    timeout: {
      type: 'number',
      description: 'OPTIONAL hard wall-clock limit in SECONDS (clamped to the plugin ceiling). Do not bother setting it for routine commands — the tool already applies a graded default (ssh/ping 30s, curl 60s, installs/builds 300s, everything else 120s). Set it only when you know better than those defaults (e.g. a CLI you expect to answer in 5s).',
    },
  },
  required: ['command'],
  additionalProperties: false,
}

/** Register the model-facing `bash` tool. */
export function apply(ctx, config) {
  // 启动标记（2026-10-31）：每加载一次插件就写一行，回答「新会话到底拿到的是哪版代码」。
  // 用户不需要跑任何命令，开个会话然后 `tail ~/.dsh/logs/bash-timeout.jsonl` 就能看到。
  recordTimeout('(apply)', 0, `apply:v2026-10-31-recordingTimeout, timeoutMs=${String(config?.timeoutMs ?? DEFAULT_TIMEOUT_MS)}`)
  const explicitBashPath = typeof config?.bashPath === 'string' && config.bashPath.length > 0 ? config.bashPath : undefined
  const timeoutMs = Number.isSafeInteger(config?.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : DEFAULT_TIMEOUT_MS
  const maxOutputBytes = Number.isSafeInteger(config?.maxOutputBytes) && config.maxOutputBytes > 0 ? config.maxOutputBytes : DEFAULT_MAX_OUTPUT_BYTES

  // The inferred executable is memoized per plugin instance: candidate probing
  // walks the filesystem, and the answer cannot change within a mount. A
  // failed inference is NOT memoized — the plain `bash` fallback resolves
  // fresh on every execute until some probe succeeds.
  let inferredShell
  const exists = (path) => access(path).then(() => true, () => false)
  const resolveShell = async (signal) => {
    if (explicitBashPath !== undefined) {
      // A misconfigured explicit path must fail as itself, not as a
      // discovery miss — the raw resolution error says which path failed.
      return ctx.subprocess.resolveExecutable(explicitBashPath, undefined, signal)
    }
    if (inferredShell !== undefined) {
      return ctx.subprocess.resolveExecutable(inferredShell, undefined, signal)
    }
    let gitExe
    try {
      gitExe = await ctx.subprocess.resolveExecutable('git', undefined, signal)
    } catch {
      // git unresolvable → the env-derived candidates below still apply
    }
    for (const candidate of bashCandidates(process.env, gitExe)) {
      if (!(await exists(candidate))) continue
      try {
        inferredShell = await ctx.subprocess.resolveExecutable(candidate, undefined, signal)
        return inferredShell
      } catch {
        // Exists but unresolvable (EPERM, a broken scoop junction): keep
        // probing — one bad root must not block the rest of the chain, and
        // nothing is memoized so later executes can still find a good one.
        continue
      }
    }
    try {
      return await ctx.subprocess.resolveExecutable('bash', undefined, signal)
    } catch (error) {
      // Total discovery failure (no Git Bash root, no env root, no bash on
      // PATH): name the remedies instead of leaking a raw ENOENT. Never
      // fall back to pwsh/cmd here — the schema promises `bash -c`
      // semantics; a different shell would silently break every command.
      throw new Error(`bash executable not found — install Git for Windows, expose a bash on PATH, or set the custom-bash \`bashPath\` config (${String((error && error.message) || error)})`)
    }
  }

  ctx.tools.register({
    name: 'bash',
    description: [
      'Run commands in a bash shell (Git Bash on Windows)',
      '* When invoking this tool, the contents of the "command" parameter does NOT need to be XML-escaped.',
      "* You don't have access to the internet via this tool.",
      '* You do have access to a mirror of common linux and python packages via apt and pip.',
      '* State does NOT persist across command calls: each call runs in a fresh shell.',
      "* To inspect a particular line range of a file, e.g. lines 10-25, try 'sed -n 10,25p /path/to/the/file'.",
      '* Please avoid commands that may produce a very large amount of output.',
      '* NOTE: runs without OS sandbox confinement on Windows (no landlock); treat output as untrusted.',
      '* workdir accepts a Windows path or a Git Bash drive path (/e/foo).',
    ].join('\n'),
    parameters: commandSchema,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string' },
        },
        required: ['text'],
      },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    async execute(args, exec) {
      const shell = await resolveShell(exec?.signal)
      const sessionCwd = exec?.agent?.session?.header?.cwd
      const requested = typeof args.workdir === 'string' && args.workdir.length > 0
        ? args.workdir
        : sessionCwd
      const workdir = normalizeGitBashWorkdir(requested)
      const signal = exec?.signal
      // ── 硬超时（2026-10-29）────────────────────────────────────────────
      // 以前 `timeoutMs` 只被读进变量、**从未使用** ⇒ 配置是死的，命令能无限挂住。
      // 现在：模型可用 `timeout` 参数（秒）指定，被 timeoutMs 上限夹紧；
      // 到点 abort，spawn 拿合并后的 signal 杀掉整棵进程树。
      // 额外注入标记 = 极短，用于测「超时到底有没有生效」
      const modelMs = typeof args.timeout === 'number' && Number.isFinite(args.timeout) && args.timeout > 0
        ? args.timeout * 1000
        : undefined
      const heurMs = heuristicTimeoutMs(args.command)
      const requestedMs = modelMs !== undefined ? modelMs : Math.min(heurMs, timeoutMs)
      const limitMs = Math.min(requestedMs, timeoutMs)
      recordTimeout(args.command, limitMs, modelMs !== undefined ? 'model' : (heurMs !== DEFAULT_TIMEOUT_MS ? `heuristic:${heurMs}` : 'default'))
      const timeoutController = new AbortController()
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        timeoutController.abort(new Error(`bash timed out after ${limitMs}ms`))
      }, limitMs)
      // 注意：**不要 unref()** —— unref 让定时器不阻止事件循环退出，事件循环一空
      // 它就永远不触发，超时形同虚设（2026-10-29 单元测试实测：unsettled await）。
      // 代价是必须保证每条路径都 clearTimeout（正常路径 / 两个 catch 都已清理）。
      const effectiveSignal = signal !== undefined
        ? AbortSignal.any([signal, timeoutController.signal])
        : timeoutController.signal
      const timeoutMessage = () => `bash timed out after ${limitMs}ms — aborted: ${String(args.command).slice(0, 160)}`
      const spawnOnce = (cwd) => ctx.subprocess.spawn({
        argv: [shell, '-c', args.command],
        ...cwd !== undefined ? { cwd } : {},
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: maxOutputBytes },
          stderr: { maxBytes: maxOutputBytes },
        },
        signal: effectiveSignal,
        graceMs: 3000,
      })
      let handle
      let outcome
      let usedFallback = false
      try {
        handle = spawnOnce(workdir)
        outcome = await handle.done
      } catch (error) {
        if (timedOut) { clearTimeout(timer); throw new Error(timeoutMessage()) }
        const fallback = sessionCwd !== undefined ? normalizeGitBashWorkdir(sessionCwd) : undefined
        if (
          requested !== undefined
          && fallback !== undefined
          && fallback !== workdir
          && isWorkdirEnoent(error)
        ) {
          usedFallback = true
          try {
            handle = spawnOnce(fallback)
            outcome = await handle.done
          } catch (retryError) {
            if (timedOut) { clearTimeout(timer); throw new Error(timeoutMessage()) }
            throw new Error(`bash spawn failed: ${String(retryError)}`)
          }
        } else {
          // A spawn-level failure (bad executable, EPERM) surfaces as a throw,
          // which the runtime turns into an isError result.
          throw new Error(`bash spawn failed: ${String(error)}`)
        }
      }
      clearTimeout(timer)
      let stdout = ''
      let stderr = ''
      try {
        stdout = handle.collected.stdout.readFrom(0).text
        stderr = handle.collected.stderr.readFrom(0).text
      } catch {
        // Collected readers may be unavailable on some backends; tolerate.
      }
      const note = usedFallback
        ? `[custom-bash] workdir ${requested} was unusable (ENOENT); fell back to session cwd\n`
        : ''
      const text = [stdout, stderr].filter((part) => part.length > 0).join('\n')
      const tail = note + (text.length > 0 ? text : `exit code: ${outcome.exitCode} (no output)`)
      if (outcome.exitCode !== 0) {
        // Non-zero exit is a reported failure, not a throw: the model sees the
        // command output plus the exit code.
        throw new Error(tail)
      }
      return { text: tail }
    },
  })
}
