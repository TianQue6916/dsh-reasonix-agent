/**
 * fetch-file — the host half registers ONE model-facing tool, `fetch_file`,
 * that downloads an HTTP(S) URL through `ariafetch.py` (Range fan-out with a
 * runtime saturation probe).
 *
 * WHY a tool and not a rule in the agent instructions
 *   Measured on this machine 2026-11-12: the whole link tops out at ~3.4 MB/s
 *   (27 Mbps).  Domestic CDNs are already saturated by one stream (npmmirror
 *   3.05 MB/s single vs 3.79 MB/s across 4 ranges, and 4 *different* packages
 *   in parallel also summed to 3.44 MB/s), so fanning out there wastes sockets
 *   and buys nothing.  Cross-border sources are BDP-limited instead
 *   (registry.ollama.ai, RTT 330 ms: 0.10 MB/s on one stream, 1.89 MB/s on 16),
 *   where fan-out is worth 19x.  That decision depends on the URL, the route
 *   and the time of day -- a static instruction cannot make it, a tool can.
 *
 * WHY no dependency on @deepseek-ai/* here
 *   Local plugins are installed as `file:` links living outside the profile's
 *   node_modules tree, so importing dsh packages from them is a resolution
 *   hazard.  `ctx.tools.register()` validates only what it needs (output +
 *   render + a supported JSON Schema), so this plugin declares plain JSON
 *   Schema and stays import-free apart from node builtins.  Same discipline as
 *   the sibling local plugins (dsh-thinking-language, dsh-plugin-local-search).
 *
 * WHY a Python sidecar instead of native fetches
 *   A wrong Range/offset implementation silently corrupts multi-GB downloads,
 *   and this tool gets edited often.  Python + per-segment files + a final
 *   size/sha256 check turns that class of bug into an exception.
 */
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-fetch-file'

/** The registry seam this plugin consumes. */
export const inject = ['tools']

/** Absolute path of the downloader sidecar (override with DSH_ARIAFETCH). */
const SCRIPT =
  process.env.DSH_ARIAFETCH ??
  join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'storages', 'tools', 'ariafetch.py')

/** Interpreter used for the sidecar (override with DSH_PYTHON). */
const PYTHON = process.env.DSH_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3')

const STDOUT_CAP = 64 * 1024
const STDERR_CAP = 4 * 1024

/**
 * Run the sidecar and resolve with its single stdout JSON object.
 *
 * stderr is our own progress channel, not the model's: it is capped and only
 * surfaces when the sidecar fails to produce JSON.
 *
 * @param {string[]} argv - sidecar arguments (already validated by the schema).
 * @param {AbortSignal|undefined} signal - the tool call's cancellation signal.
 * @returns {Promise<object>} the parsed sidecar result.
 */
function runSidecar(argv, signal) {
  return new Promise((resolve, reject) => {
    let out = ''
    let err = ''
    const child = spawn(PYTHON, argv, {
      windowsHide: true, // never flash a console window (background-by-default rule)
      signal,
      env: process.env,
    })
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      out = (out + chunk).slice(-STDOUT_CAP)
    })
    child.stderr.on('data', (chunk) => {
      err = (err + chunk).slice(-STDERR_CAP)
    })
    child.on('error', (e) => {
      reject(new Error(`fetch_file: cannot start ${PYTHON} (${e.message}); set DSH_PYTHON`))
    })
    child.on('close', (code) => {
      const line = out.trim().split('\n').filter(Boolean).pop() ?? ''
      try {
        resolve(JSON.parse(line))
      } catch {
        reject(new Error(`fetch_file: sidecar exited ${code} without JSON: ${(err || out).slice(-800)}`))
      }
    })
  })
}

/** Drop null/undefined members so the declared output schema stays exact. */
function compact(value) {
  const out = {}
  for (const [k, v] of Object.entries(value)) {
    if (v !== null && v !== undefined) out[k] = v
  }
  return out
}

/** One-line, model-facing description of a finished download. */
function describe(value) {
  const mb = (value.bytes / 1048576).toFixed(1)
  const total = value.totalBytes ? `/${(value.totalBytes / 1048576).toFixed(1)}` : ''
  const sha = value.sha256 ? `, sha256=${value.sha256}` : ''
  return (
    `fetch_file ${value.ok ? 'ok' : 'FAILED'}: ${value.out} — ${mb}${total} MB in ` +
    `${value.seconds}s (${value.mbps} MB/s, mode=${value.mode}, parts=${value.parts}` +
    `${value.resumed ? ', resumed' : ''}${sha})` +
    (value.error ? ` error=${value.error}` : '')
  )
}

/** Register the tool. */
export function apply(ctx) {
  ctx.tools.register({
    name: 'fetch_file',
    description:
      'Download an HTTP(S) URL to a local path with adaptive multi-connection transfer ' +
      '(大文件下载 / 跨境源提速 / 断点续传 / 下载驱动或模型). ' +
      'Probes one stream first and fans out only when the link is BDP-limited ' +
      '(cross-border sources), so it is never slower than curl and up to 19x faster ' +
      'on slow international routes. Resumes interrupted downloads and verifies size ' +
      'plus an optional sha256. Prefer this over curl/bash for any file above a few MB.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        url: { type: 'string', description: 'HTTP(S) URL to download.' },
        out: {
          type: 'string',
          description:
            'Destination file path. Relative paths resolve against the session working directory; parent directories are created.',
        },
        sha256: { type: 'string', description: 'Expected lowercase hex sha256; a mismatch fails the call.' },
        parts: {
          type: 'integer',
          minimum: 1,
          maximum: 32,
          description: 'Maximum connections when fanning out (default 16).',
        },
        parallel: { type: 'boolean', description: 'Force fan-out even if one stream looks fast.' },
        single: { type: 'boolean', description: 'Force a single stream (servers that dislike Range).' },
        probeSecs: {
          type: 'number',
          minimum: 0.2,
          maximum: 10,
          description: 'Seconds to probe one stream before deciding (default 2).',
        },
        fastMbps: {
          type: 'number',
          minimum: 0.05,
          description:
            'One-stream MB/s at or above which fan-out is skipped (default 2). Lower it to fan out more eagerly.',
        },
      },
      required: ['url', 'out'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean' },
          out: { type: 'string' },
          url: { type: 'string' },
          finalUrl: { type: 'string' },
          bytes: { type: 'integer' },
          totalBytes: { type: 'integer' },
          seconds: { type: 'number' },
          mbps: { type: 'number' },
          probeMbps: { type: 'number' },
          mode: { type: 'string' },
          parts: { type: 'integer' },
          rangeSupported: { type: 'boolean' },
          resumed: { type: 'boolean' },
          sha256: { type: 'string' },
          error: { type: 'string' },
        },
        required: ['ok', 'out', 'bytes', 'seconds', 'mbps', 'mode', 'parts'],
      },
      render: (_args, value) => [{ type: 'text', text: describe(value) }],
    },
    async execute(args, exec) {
      const argv = [SCRIPT, args.url, '-o', args.out]
      if (args.sha256 !== undefined) argv.push('--sha256', args.sha256)
      if (args.parts !== undefined) argv.push('--parts', String(args.parts))
      if (args.probeSecs !== undefined) argv.push('--probe-secs', String(args.probeSecs))
      if (args.fastMbps !== undefined) argv.push('--fast-mbps', String(args.fastMbps))
      if (args.parallel) argv.push('--parallel')
      if (args.single) argv.push('--single')
      const r = await runSidecar(argv, exec.signal)
      return compact({
        ok: r.ok === true,
        out: r.out ?? args.out,
        url: r.url ?? args.url,
        finalUrl: r.finalUrl,
        bytes: r.bytes ?? 0,
        totalBytes: r.totalBytes ?? undefined,
        seconds: r.seconds ?? 0,
        mbps: r.mbps ?? 0,
        probeMbps: r.probeMbps ?? undefined,
        mode: r.mode ?? (r.ok === true ? 'single' : 'failed'),
        parts: r.parts ?? 1,
        rangeSupported: r.rangeSupported,
        resumed: r.resumed,
        sha256: r.sha256 ?? undefined,
        error: r.error ?? undefined,
      })
    },
  })
}
