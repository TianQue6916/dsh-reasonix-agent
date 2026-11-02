// fluxscope-launcher.mjs — 把 fluxscope 大屏的 server 绑到 dsh 的生命周期上。
//
// 用户 2026-11-02 要求：「让这个工作流随着 dsh 一起启动」。
// 不做成计划任务/启动文件夹，因为那和 dsh 无关；做成 cordis 插件才能真正跟着 dsh 起落。
//
// 生命周期：
//   - `ctx.effect()` 回调里启动，返回的 teardown 里停止
//   - 子进程 `unref()`，不吊住 dsh 的 event loop
//   - Windows 上 `child.kill()` 只杀直接子进程，server.mjs 还会再 spawn
//     powershell(sysprobe) / python(extract) —— 所以停机走 `taskkill /T /F`
//
// 幂等：启动前先探 `GET /health`。已经是 200 就不重复起
//      （比如手动开着一个，或者两个 dsh 进程同时加载了这个插件）。
//
// 纪律（与 tool-probe.mjs 一致，改之前先读）：
//   - 只 import node:* 内建
//   - 任何异常都吞掉：诊断/展示类插件绝不能把 dsh 弄挂
//   - 端口被占 / spawn 失败 → 静默降级，dsh 照常启动

import { spawn, spawnSync } from 'node:child_process';
import { request } from 'node:http';
import { join } from 'node:path';

export const name = 'fluxscope-launcher';
export const inject = [];

const DEFAULTS = {
  enabled: true,
  dir: 'C:/Users/27063/fluxscope',
  port: 3921,
  host: '127.0.0.1',
  retries: 3,
  retryMs: 5000,
};

export function apply(ctx, config) {
  const cfg = { ...DEFAULTS, ...(config ?? {}) };
  if (cfg.enabled === false) return;

  let child = null;
  let stopped = false;
  let tries = 0;
  let timer = null;

  const alive = () => new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done){ done = true; resolve(v); } };
    try {
      const req = request(
        { host: cfg.host, port: cfg.port, path: '/health', timeout: 700 },
        res => { res.resume(); finish(res.statusCode === 200); },
      );
      req.on('error', () => finish(false));
      req.on('timeout', () => { try { req.destroy(); } catch (_){} finish(false); });
      req.end();
    } catch (_) { finish(false); }
  });

  const start = async () => {
    if (stopped || child) return;
    if (await alive()) return;                    // 已经在跑，什么都不做
    if (tries >= cfg.retries) return;             // 反复失败就别再试了
    tries++;
    try {
      child = spawn(process.execPath, [join(cfg.dir, 'server.mjs')], {
        cwd: cfg.dir, stdio: 'ignore', windowsHide: true, detached: false,
      });
      child.unref?.();
      child.on('error', () => { child = null; });
      child.on('exit', () => {
        child = null;
        if (!stopped) timer = setTimeout(() => { void start(); }, cfg.retryMs);
      });
    } catch (_) {
      child = null;
    }
  };

  const stop = () => {
    stopped = true;
    if (timer){ clearTimeout(timer); timer = null; }
    if (!child) return;
    const pid = child.pid;
    child = null;
    try {
      if (process.platform === 'win32') {
        // /T kills the children too: sysprobe.ps1 and any in-flight extract
        spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
      } else {
        process.kill(pid, 'SIGTERM');
      }
    } catch (_) { /* 已经退出了 */ }
  };

  ctx.effect(() => {
    void start();
    return stop;
  });
}
