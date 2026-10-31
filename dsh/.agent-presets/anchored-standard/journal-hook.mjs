// journal-hook.mjs — dsh 启动时把日记 sampler 拉起来。
//
// 为什么需要（2026-10-30 事故）：
//   sampler.pyw 是常驻进程，负责前台窗口采样 + 每晚 23:59 触发写日记。
//   它没有开机自启（本机 shell 在 Low Mandatory Level，schtasks / reg / Startup
//   全部 Access denied），所以机器一重启它就消失，10-29 / 10-30 两天直接断档。
//   这里把「拉起」挂到 dsh 自己的启动路径上 —— 用户每天都会开 dsh，
//   于是 sampler 不必依赖任何提权入口。
//
// 设计约束：
//   - 只 import node:* 内建（preset 模块的 loader 不给第三方依赖）。
//   - 全程 try/catch 静默失败：诊断/辅助模块自己绝不能把 boot 弄挂。
//   - 幂等：sampler 自带命名 mutex（Global\dsh-journal-sampler），重复 spawn 会自己退出；
//     另加一层 throttle，1 小时内不重复尝试，避免 patchReload 反复触发。
//   - 不做 detach 等待、不读 stdout：spawn 完立即 unref，绝不阻塞 dsh boot。

import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const name = 'journal-hook';
export const inject = [];

const DEFAULTS = {
  enabled: true,
  throttleMs: 3600 * 1000,
  pythonw: null, // 默认按候选列表探测
  sampler: null, // 默认 $HOME/.dsh/storages/tools/journal/sampler.pyw
};

const PYW_CANDIDATES = [
  join(homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'pythonw.exe'),
  join(homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'pythonw.exe'),
  join(homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'pythonw.exe'),
];

function jroot() {
  return join(homedir(), '.dsh', 'journal');
}

function log(msg) {
  try {
    const d = jroot();
    mkdirSync(d, { recursive: true });
    appendFileSync(join(d, 'hook.log'),
      new Date().toISOString() + ' ' + msg + '\n', 'utf8');
  } catch {
    /* 日志写不了也不能影响 boot */
  }
}

function pickPythonw(cfg) {
  if (cfg.pythonw && existsSync(cfg.pythonw)) return cfg.pythonw;
  for (const p of PYW_CANDIDATES) if (existsSync(p)) return p;
  return null;
}

function throttled(ms) {
  try {
    const f = join(jroot(), '.hook-spawn');
    if (existsSync(f) && Date.now() - statSync(f).mtimeMs < ms) return true;
    mkdirSync(jroot(), { recursive: true });
    writeFileSync(f, String(Date.now()), 'utf8');
    return false;
  } catch {
    return false; // 节流状态读不出来时宁可多spawn一次（mutex 会兜住）
  }
}

function boot(config) {
  const cfg = { ...DEFAULTS, ...(config || {}) };
  if (!cfg.enabled) {
    log('hook: disabled by config');
    return;
  }
  const sampler = cfg.sampler || join(homedir(), '.dsh', 'storages', 'tools', 'journal', 'sampler.pyw');
  if (!existsSync(sampler)) {
    log('hook: sampler not found -> ' + sampler);
    return;
  }
  const pyw = pickPythonw(cfg);
  if (!pyw) {
    log('hook: pythonw not found');
    return;
  }
  if (throttled(cfg.throttleMs)) {
    log('hook: throttled (spawned within ' + cfg.throttleMs + 'ms)');
    return;
  }
  const child = spawn(pyw, [sampler], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  log('hook: spawned sampler pid=' + child.pid + ' via ' + pyw);
}

export function apply(_ctx, config) {
  try {
    boot(config);
  } catch (e) {
    log('hook: boot failed ' + (e && e.message ? e.message : String(e)));
  }
}
