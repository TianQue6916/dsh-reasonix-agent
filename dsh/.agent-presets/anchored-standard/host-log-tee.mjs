// host-log-tee.mjs — 把 dsh 进程的 stdout/stderr tee 到文件，并上报 event loop 延迟。
//
// 为什么需要它（2026-10-04 定位 turn 卡死时发现的盲区）：
//   打包版 desktop 由 Electron main 用
//     spawn(node, [...], { stdio: ["ignore", "pipe", "pipe", "ipc"] })
//   拉起 host（app.asar/lib__main.js:3667-3704）。main 侧只把 stderr 存进内存
//   （this.stderr = (this.stderr + chunk).slice(-65536)，从不落盘），stdout 则
//   child.stdout.pipe(process.stdout) —— 而从 explorer 双击启动的 Electron
//   process.stdout 是个黑洞。结果：host 里所有 ctx.logger.warn(...)、
//   console.error(...)、未捕获异常，全部丢失。加上本机无 crash log（最近一条
//   仍是更早的 startup 阶段），卡死现场等于零证据。
//   DSH_DESKTOP_HOST_INSPECT_PORT 这条路走不通：developmentHostInspectPort(enabled)
//   在打包版（enabled === development 为 false）直接 return undefined（:11045-11052）。
//
// 这个模块跑在 host 主进程里（preset 由 @deepseek-ai/dsh-agent-preset 加载），
// 在一切 logger 被创建之前就把两个 stream 的 write 劫持掉，因此能拿到第一手文本。
//
// 三件产物同写一个文件：
//   1. stdout / stderr 原文（带 [out] / [err] 前缀，保持原样不加工，便于 grep 原始报错）
//   2. 心跳行，每 heartbeatMs 一条：[hb] t=... elu=... 内存 + 活跃 handle 数
//      —— 卡死时若心跳停止 ⇒ event loop 被同步阻塞/自旋
//      —— 卡死时若心跳继续但请求不发 ⇒ async 卡在永不 settle 的 promise 上
//      这一条区分就是整次排查最想要的信息。
//   3. 进程级异常（uncaughtException / unhandledRejection / warning）
//
// 设计约束（很重要，改这个文件前先读）：
//   - 全程 try/catch 静默失败：诊断模块自己绝不能把 boot 弄挂。
//   - 写盘走 fs.writeSync(fd, buf)，绝不用 console.log（否则递归）。
//   - 不覆盖 stream 的其它属性，只换 write，且原样转发 (chunk, encoding, callback)
//     并返回原方法的返回值 —— Node 内部依赖 write() 的 boolean 回值做背压判断。
//   - 超过 maxBytes 时 rename 到 .1 再重开，避免长跑把磁盘写满。
//   - 只能 import node:* 内建（preset 模块的 loader 不给第三方依赖）。

import { openSync, writeSync, closeSync, renameSync, statSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';

export const name = 'host-log-tee';
export const inject = [];

const DEFAULTS = {
  enabled: true,
  path: null,
  heartbeatMs: 5000,
  maxBytes: 32 * 1024 * 1024,
  teeStdout: true,
  teeStderr: true,
};

function resolvePath(cfg) {
  if (typeof cfg.path === 'string' && cfg.path.length > 0) return cfg.path;
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh');
  return join(home, 'logs', 'host-stdio.log');
}

export function apply(ctx, config) {
  const cfg = { ...DEFAULTS, ...(config ?? {}) };
  if (cfg.enabled === false) return;

  const logPath = resolvePath(cfg);
  let fd = null;

  function reopen() {
    try {
      mkdirSync(dirname(logPath), { recursive: true });
    } catch {
      /* 目录已存在或不可建：下面 open 会再失败一次，静默退出 */
    }
    try {
      fd = openSync(logPath, 'a');
    } catch {
      fd = null;
    }
  }

  function maybeRotate() {
    if (fd === null) return;
    try {
      const size = statSync(logPath).size;
      if (size <= cfg.maxBytes) return;
      closeSync(fd);
      fd = null;
      renameSync(logPath, `${logPath}.1`);
      reopen();
    } catch {
      /* 轮转失败就继续往原 fd 写，不做二次处理 */
    }
  }

  reopen();
  if (fd === null) return; // 拿不到 fd 就彻底放弃，不要影响 boot

  // 单次写：同步、静默、绝不过 console。
  function raw(kind, text) {
    if (fd === null) return;
    try {
      writeSync(fd, kind + text);
    } catch {
      /* 磁盘满 / fd 失效：放弃这一条，不抛 */
    }
  }

  // 安装时间戳与 pid，作为「本进程启动」的锚 —— 之后对着 session 时间线看很关键。
  raw('[tee] ', `installed pid=${String(process.pid)} ppid=${String(process.ppid)} plat=`
    + `${process.platform} node=${process.version} log=${logPath}\n`);

  // ---- 1. tee stdout / stderr -------------------------------------------------
  let writes = 0;

  function install(stream, label) {
    if (stream === undefined || stream === null) return;
    if (typeof stream.write !== 'function') return;
    const original = stream.write.bind(stream);
    stream.write = function patchedWrite(chunk, encoding, callback) {
      writes += 1;
      try {
        const buf = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(String(chunk), typeof encoding === 'string' ? encoding : 'utf8');
        raw(`[${label}] `, buf.toString('utf8'));
        maybeRotate();
      } catch {
        /* tee 失败不影响原写入 */
      }
      return original(chunk, encoding, callback);
    };
  }

  if (cfg.teeStdout) install(process.stdout, 'out');
  if (cfg.teeStderr) install(process.stderr, 'err');

  // ---- 2. event loop 延迟心跳 -------------------------------------------------
  let histogram = null;
  try {
    histogram = monitorEventLoopDelay({ resolution: 20 });
    histogram.enable();
  } catch {
    histogram = null;
  }

  const timer = setInterval(() => {
    const ms = (ns) => (Number.isFinite(ns) ? (ns / 1e6).toFixed(1) : 'n/a');
    let elu = 'n/a';
    if (histogram !== null) {
      try {
        elu = `p50=${ms(histogram.percentile(50))} p99=${ms(histogram.percentile(99))} max=${ms(histogram.max)}`;
      } catch {
        elu = 'err';
      }
    }
    let mem = 'n/a';
    try {
      const m = process.memoryUsage();
      mem = `rss=${(m.rss / 1048576).toFixed(0)}MB heap=${(m.heapUsed / 1048576).toFixed(0)}MB`;
    } catch {
      /* 忽略 */
    }
    let handles = 'n/a';
    try {
      handles = String(process.getActiveResourcesInfo().length);
    } catch {
      /* 忽略 */
    }
    raw('[hb] ', `t=${new Date().toISOString()} elu[ms] ${elu} ${mem} res=${handles} writes=${writes}\n`);
    try {
      histogram?.reset();
    } catch {
      /* 忽略 */
    }
  }, Math.max(500, cfg.heartbeatMs));

  if (typeof timer.unref === 'function') timer.unref();

  // ---- 3. 进程级异常（这些原本全进黑洞）--------------------------------------
  process.on('uncaughtException', (error) => {
    raw('[fatal] ', `uncaughtException: ${error?.stack ?? String(error)}\n`);
  });
  process.on('unhandledRejection', (reason) => {
    raw('[fatal] ', `unhandledRejection: ${reason?.stack ?? String(reason)}\n`);
  });
  process.on('warning', (warning) => {
    raw('[warn] ', `${warning?.name}: ${warning?.message}\n${warning?.stack ?? ''}\n`);
  });

  // teardown：preset 卸载时把原来的 write 装回去并关 fd。
  ctx.effect(() => () => {
    try {
      clearInterval(timer);
      histogram?.disable();
    } catch {
      /* 忽略 */
    }
    raw('[tee] ', `disposed pid=${String(process.pid)}\n`);
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        /* 忽略 */
      }
      fd = null;
    }
  }, 'host-log-tee: stdout/stderr tee + event-loop heartbeat');
}
