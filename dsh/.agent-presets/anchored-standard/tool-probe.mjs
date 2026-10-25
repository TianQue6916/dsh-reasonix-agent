// tool-probe.mjs — tool-call 探针 + 实时面板。
//
// 两件事，共用同一次 `tools/execute` 包裹：
//   ① 落盘：$DSH_HOME/logs/tool-calls.jsonl（一行一次调用，历史留档）
//   ② 实时：本地 SSE 服务器 http://127.0.0.1:<port>/，浏览器打开就是「调用了什么哪里就亮」
//
// 生命周期**完全绑在 dsh 进程上**（用户 2026-10-23 明确要求「伴随 dsh 启动和关闭」）：
//   - 服务器在 `apply()` 里 listen，随插件加载而启动
//   - `ctx.effect()` 注册 teardown，随插件卸载而 close
//   - `server.unref()` 保证服务器句柄不吊住 event loop —— 否则 dsh 退不干净
//   - 进程被强杀时端口随进程释放，不需要额外清理
//
// 为什么要 host-plane（2026-10-23 13:30 实测，别再踩）：
//   tools/execute 的分发点是 dsh-tools/lib/index.js:3427
//     const carrier = scopeTarget(this, exec.agent);
//     await this.ctx.waterfall(carrier, "tools/execute", mutableExec, ...)
//   carrier 是 ToolRuntime 的 scope 目标。放进 preset 的 plugins 列表（agent-plane）时
//   apply() 会正常跑、日志文件会被建出来，但**一条记录都不会写** —— listener 静默地
//   永远收不到。整个依赖树里唯二用 ctx.on("tools/execute") 的两个插件
//   （dsh-tool-call-timeout-policy / dsh-session-checkpoint-policy）都声明在
//   dsh-base/cordis.patch.yml（host-plane）。profile patch 里新增必须用 `- insert:`，
//   顶层 `- id: X` 是「修改已存在 entry」，会报 entry not found。
//
// 设计纪律（改这个文件前先读）：
//   - 只能 import node:* 内建（preset 模块的 loader 不给第三方依赖）
//   - 全程 try/catch 静默失败：诊断模块自己绝不能把 tool call 弄挂
//   - 必须 `const r = await next()` 后**原样返回** r；next() 抛错时原样 rethrow
//   - 任何 HTTP/写盘动作都在 `await next()` **之后**，不进关键路径
//   - SSE 广播要过背压闸：res.writableLength 超阈值就丢这个 client 的这条事件，
//     而不是让它把 buffer 涨到把 process 拖垮
//   - 端口被占 / 建 server 失败时静默降级为「只有 jsonl」，不影响 boot
//   - 不记录 arguments / content 正文：可能含密钥与隐私，只记 key 列表与字节数

import { openSync, writeSync, closeSync, renameSync, statSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

export const name = 'tool-probe';
export const inject = [];

const DEFAULTS = {
  enabled: true,
  path: null,
  maxBytes: 16 * 1024 * 1024,
  dumpFirstShape: true,
  includeArgsKeys: true,
  live: true,
  port: 8770,
  host: '127.0.0.1',
  backlog: 200,
  panelPath: null,
};

const RING_MAX = 200;
const CLIENT_BACKLOG_LIMIT = 256 * 1024; // 单个 SSE client 积压上限，超了就丢事件
const HEARTBEAT_MS = 15000;

function resolvePath(cfg) {
  if (typeof cfg.path === 'string' && cfg.path.length > 0) return cfg.path;
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh');
  return join(home, 'logs', 'tool-calls.jsonl');
}

function resolvePanel(cfg) {
  if (typeof cfg.panelPath === 'string' && cfg.panelPath.length > 0) return cfg.panelPath;
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh');
  return join(home, '.agent-presets', 'anchored-standard', 'tool-probe-panel.html');
}

/** Agent 上挂着 `session: Session`（runtime-types.d.ts:143），但字段名没有面向插件的保证，
 *  全走防御性取值。2026-10-23 实测 session.id 可读。 */
function sessionIdOf(agent) {
  try {
    const s = agent && agent.session;
    if (!s || typeof s !== 'object') return null;
    for (const k of ['id', 'sessionId', 'key']) {
      const v = s[k];
      if (typeof v === 'string' && v.length > 0) return v;
    }
    return null;
  } catch {
    return null;
  }
}

function keysOf(obj) {
  try {
    if (!obj || typeof obj !== 'object') return null;
    const ks = Object.keys(obj);
    return ks.length > 0 ? ks : null;
  } catch {
    return null;
  }
}

function jsonBytes(v) {
  try {
    const s = JSON.stringify(v);
    return typeof s === 'string' ? s.length : null;
  } catch {
    return null;
  }
}

function safeStr(v) {
  try {
    return typeof v === 'string' && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

function safeName(exec) {
  try {
    return safeStr(exec?.name) ?? '<unknown>';
  } catch {
    return '<unknown>';
  }
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}

const FALLBACK_PANEL =
  '<!DOCTYPE html><meta charset="utf-8"><title>tool-probe</title>' +
  '<body style="background:#05080d;color:#7f95af;font:13px monospace;padding:40px">' +
  '<h1 style="color:#00e5ff;font-size:15px">tool-probe live</h1>' +
  '<p>面板文件缺失，但 SSE 端点可用：<code>/events</code></p>' +
  '<p style="color:#33465c">期望位置见 config.panelPath，或 ' +
  '~/.dsh/.agent-presets/anchored-standard/tool-probe-panel.html</p>' +
  '<script>const e=new EventSource("/events");e.onmessage=m=>{' +
  'const d=document.createElement("div");d.textContent=m.data.slice(0,160);' +
  'document.body.appendChild(d)};<\/script>';

export function apply(ctx, config) {
  const cfg = { ...DEFAULTS, ...(config ?? {}) };
  if (cfg.enabled === false) return;

  const logPath = resolvePath(cfg);
  const panelPath = resolvePanel(cfg);
  const ring = [];
  const clients = new Set();

  // ── 落盘 ────────────────────────────────────────────────────────────────
  let fd = null;
  let wroteShape = false;
  let openErr = null;
  let complained = false;

  function reopen() {
    try {
      mkdirSync(dirname(logPath), { recursive: true });
    } catch {
      /* 目录已存在或不可建：下面 open 会再失败一次 */
    }
    try {
      fd = openSync(logPath, 'a');
      openErr = null;
    } catch (err) {
      fd = null;
      openErr = err;
    }
  }

  function maybeRotate() {
    if (fd === null) return;
    try {
      if (statSync(logPath).size <= cfg.maxBytes) return;
      closeSync(fd);
      fd = null;
      renameSync(logPath, logPath + '.1');
    } catch {
      /* 轮转失败继续写原文件，不能因为轮转把探针弄停 */
    }
    if (fd === null) reopen();
  }

  function emit(obj) {
    if (fd === null) {
      // 静默失败的代价是「出问题查不到」——首次写不出去时往 stderr 吐一行，
      // host-log-tee 已经把 stderr tee 进 host-stdio.log，所以这条一定看得见。
      if (!complained) {
        complained = true;
        try {
          process.stderr.write(
            '[tool-probe] 无法打开日志文件，jsonl 已丢弃 path=' +
              logPath +
              ' err=' +
              (openErr && openErr.message ? openErr.message : String(openErr)) +
              '\n',
          );
        } catch {
          /* 连 stderr 都写不了就算了 */
        }
      }
      return;
    }
    try {
      writeSync(fd, JSON.stringify(obj) + '\n');
    } catch {
      /* 写失败静默 */
    }
    maybeRotate();
  }

  reopen();

  // ── 实时推送 ────────────────────────────────────────────────────────────
  function broadcast(ev) {
    ring.push(ev);
    if (ring.length > RING_MAX) ring.shift();

    if (clients.size === 0) return;
    let line;
    try {
      line = 'data: ' + JSON.stringify(ev) + '\n\n';
    } catch {
      return;
    }
    for (const res of clients) {
      try {
        // 背压闸：慢 client 直接丢这条，绝不把 socket buffer 涨爆
        if (res.writableLength > CLIENT_BACKLOG_LIMIT) continue;
        res.write(line);
      } catch {
        clients.delete(res);
      }
    }
  }

  let server = null;

  function startServer() {
    if (!cfg.live) return;
    const port = Number.isFinite(cfg.port) ? cfg.port : 8770;

    let panelCache = null;
    const loadPanel = () => {
      if (panelCache !== null) return panelCache;
      try {
        panelCache = readFileSync(panelPath, 'utf8');
      } catch {
        panelCache = FALLBACK_PANEL;
      }
      return panelCache;
    };

    try {
      server = createServer((req, res) => {
        let url = '/';
        try {
          url = (req.url || '/').split('?')[0];
        } catch {
          /* 畸形 url 当根路径处理 */
        }

        if (url === '/events') {
          try {
            res.writeHead(200, {
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache, no-transform',
              Connection: 'keep-alive',
              'X-Accel-Buffering': 'no',
            });
            // 先给一条 hello + 历史，让刚打开的页面不是空的
            res.write(
              'data: ' +
                JSON.stringify({ t: 'hello', backlog: ring.length, port }) +
                '\n\n',
            );
            for (const ev of ring) {
              try {
                res.write('data: ' + JSON.stringify(ev) + '\n\n');
              } catch {
                break;
              }
            }
            clients.add(res);
            res.on('close', () => clients.delete(res));
            res.on('error', () => clients.delete(res));
          } catch {
            try {
              res.destroy();
            } catch {
              /* 忽略 */
            }
          }
          return;
        }

        if (url === '/' || url === '/index.html') {
          try {
            const body = loadPanel();
            res.writeHead(200, {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-store',
            });
            res.end(body);
          } catch {
            try {
              res.destroy();
            } catch {
              /* 忽略 */
            }
          }
          return;
        }

        try {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('not found');
        } catch {
          /* 忽略 */
        }
      });

      // 端口被占 / EACCES：静默降级成「只有 jsonl」，绝不影响 boot
      server.on('error', () => {
        server = null;
      });

      server.listen(port, cfg.host, () => {
        // unref：服务器句柄不参与 event loop 存活判定，dsh 才退得干净
        try {
          server.unref();
        } catch {
          /* 忽略 */
        }
        try {
          const addr = server.address();
          process.stderr.write(
            '[tool-probe] live panel http://' +
              (cfg.host || '127.0.0.1') +
              ':' +
              (addr && addr.port ? addr.port : port) +
              '/\n',
          );
        } catch {
          /* 忽略 */
        }
      });
    } catch {
      server = null;
    }
  }

  startServer();

  // 心跳：防止浏览器/中间层把空闲的 SSE 连接掐掉
  let hb = null;
  if (clients.size >= 0 && cfg.live) {
    try {
      hb = setInterval(() => {
        for (const res of clients) {
          try {
            if (res.writableLength > CLIENT_BACKLOG_LIMIT) continue;
            res.write(': ping\n\n');
          } catch {
            clients.delete(res);
          }
        }
      }, HEARTBEAT_MS);
      if (typeof hb.unref === 'function') hb.unref();
    } catch {
      hb = null;
    }
  }

  // teardown：随插件卸载关服务器、断 SSE、关 fd
  ctx.effect(() => () => {
    try {
      if (hb !== null) clearInterval(hb);
    } catch {
      /* 忽略 */
    }
    try {
      for (const res of clients) {
        try {
          res.end();
        } catch {
          /* 忽略 */
        }
      }
      clients.clear();
    } catch {
      /* 忽略 */
    }
    try {
      if (server !== null) server.close();
    } catch {
      /* 忽略 */
    }
    try {
      if (fd !== null) closeSync(fd);
    } catch {
      /* 忽略 */
    }
  });

  // ── 核心：包住 tools/execute ────────────────────────────────────────────
  ctx.on('tools/execute', async (exec, next) => {
    // 计时起点在 await next() 之前；emit 放在拿到 result 之后，
    // 这样 durMs 反映工具本身，写盘/广播成本单列，不会被算进工具耗时。
    let t0 = 0;
    try {
      t0 = performance.now();
    } catch {
      t0 = 0;
    }

    let result;
    try {
      result = await next();
    } catch (err) {
      try {
        const t1 = performance.now();
        const ts = new Date().toISOString();
        emit({
          ts,
          name: safeName(exec),
          callId: safeStr(exec?.callId),
          rootCallId: safeStr(exec?.rootCallId),
          sessionId: sessionIdOf(exec?.agent),
          durMs: t0 > 0 ? round(t1 - t0) : null,
          isError: true,
          thrown: true,
          errMessage: safeStr(err && err.message),
        });
        if (cfg.live) {
          broadcast({
            t: 'tool',
            name: safeName(exec),
            dur: t0 > 0 ? round(t1 - t0) : 0,
            ok: false,
            nested: false,
            callId: safeStr(exec?.callId),
          });
        }
      } catch {
        /* 静默 */
      }
      throw err; // 探针不改变失败语义
    }

    let t1 = 0;
    try {
      t1 = performance.now();
    } catch {
      t1 = 0;
    }

    try {
      const w0 = t1 > 0 ? performance.now() : 0;

      if (cfg.dumpFirstShape && !wroteShape) {
        wroteShape = true;
        emit({
          ts: new Date().toISOString(),
          _shape: 'exec',
          name: safeName(exec),
          execKeys: keysOf(exec),
          agentKeys: keysOf(exec?.agent),
          sessionKeys: keysOf(exec?.agent?.session),
          resultKeys: keysOf(result),
          signalOk: (() => {
            try {
              return !!(exec && exec.signal && typeof exec.signal.aborted === 'boolean');
            } catch {
              return false;
            }
          })(),
          argsBytes: cfg.includeArgsKeys ? jsonBytes(exec?.arguments) : null,
          argsKeys: cfg.includeArgsKeys ? keysOf(exec?.arguments) : null,
        });
      }

      const rid = safeStr(exec?.rootCallId);
      const cid = safeStr(exec?.callId);
      const nested = rid !== null && rid !== cid;

      emit({
        ts: new Date().toISOString(),
        name: safeName(exec),
        callId: cid,
        rootCallId: rid,
        nested,
        sessionId: sessionIdOf(exec?.agent),
        durMs: t0 > 0 && t1 > 0 ? round(t1 - t0) : null,
        isError: !!(result && result.isError),
        contentBlocks: (() => {
          try {
            return Array.isArray(result?.content) ? result.content.length : null;
          } catch {
            return null;
          }
        })(),
        argsBytes: cfg.includeArgsKeys ? jsonBytes(exec?.arguments) : null,
        wroteMs: w0 > 0 ? round(performance.now() - w0) : null,
      });

      if (cfg.live) {
        broadcast({
          t: 'tool',
          name: safeName(exec),
          dur: t0 > 0 && t1 > 0 ? round(t1 - t0) : 0,
          ok: !(result && result.isError),
          nested,
          callId: cid,
          argsBytes: cfg.includeArgsKeys ? jsonBytes(exec?.arguments) : null,
        });
      }
    } catch {
      /* 记录/推送失败静默 */
    }

    return result;
  });
}
