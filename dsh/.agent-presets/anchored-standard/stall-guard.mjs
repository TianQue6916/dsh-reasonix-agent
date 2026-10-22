/*
 * stall-guard.mjs —— 让「turn 永久冻住」在结构上不可能发生。
 *
 * ── 为什么需要它（事实，不是推测） ─────────────────────────────────────────
 * agent-loop 的 `step()` 用 `for await (const chunk of stream)` 等 LLM 的 chunk。
 * 这条 await **没有任何超时**：dsh-llm / dsh-agent-loop / pi-ai 里搜不到 stream 级
 * timeout（dsh-llm 只 import 了 MAX_TIMER_DELAY_MS，不是超时闸门）。
 * 而 `@deepseek-ai/dsh-session-checkpoint-policy` 还会在每次请求前插一道 fail-closed
 * 的 flush barrier（`await ctx.sessions.flush(session)` 之后才 next()）。
 * 于是只要上游建连后永不吐 chunk，或这条链上任何一条 await 永不 settle，整个 step 就
 * 永久 pending：进程活着、host 零写入、gateway 零日志、无 crash、turn/end 只能
 * 等下次重启由 interruptedTurnClosers() 补记（复用最后一条真实事件的 time）。
 * 本机实测已发生 11 次，10-03 一天 6 次（全在晚间）。
 *
 * ── 本模块做什么 ──────────────────────────────────────────────────────────
 * 不猜根因在哪条 await，而是给「turn 有进展」建立独立的活性判据：
 *
 *   agent/pre-step 触发         → 记 step 开始时刻（计时起点在这里，不在 stream start：
 *                                 真卡死恰好发生在「注入落盘之后、请求发出之前」，
 *                                 那时还没有任何 start frame）
 *   agent/assistant-stream 每帧 → 刷新 lastActivity（reasoning-delta / text-delta /
 *                                 tool-call-delta / block-start 都算进展）
 *   每 15s 扫一次               → 若某 session 已 idle 超过 stallMs，就 agent.cancel()
 *                                 让 turn 以 aborted 干净收尾，而不是永久冻住。
 *
 * stallMs 默认 240000：gateway 的 firstChunkTimeoutMs 是 180000，正常情况下它先兜住
 * 上游首 chunk 超时；本模块留 60s 余量，兜住「gateway 也没响应 / 请求根本没发出 /
 * flush barrier 挂住」这些 gateway 看不见的路径。实测正常单步 33-57s，4 分钟不会误伤。
 *
 * 故意不做 autoContinue（这是与 dsh-thinking-guard 的关键区别）：thinking-guard
 * 熔断后注入「继续」→ 新 attempt → 又空转 → 又熔断，形成死循环并让问题看起来更严重。
 * 本模块熔断后只写日志、把控制权交还用户。
 *
 * 另含工具失败熔断：同一 session 同一工具连续失败达阈值 → 在下一步注入一条可见提示，
 * 要求换策略或停下来汇报（只在触发时注入，常态零开销）。
 *
 * 约束：只能 import node:*；任何异常都不得拖倒 boot（全文件 try/catch）。
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export const name = 'stall-guard';
export const inject = [];

/* tick 的硬下限：低于这个值只是在空转，不会让判定更及时
 * （判定的分辨率受 stallMs 约束，且每 tick 都要遍历活跃 session）。 */
const MIN_TICK_MS = 250;
const DEFAULT_TICK_MS = 15000;

const DEFAULTS = {
  stallGuard: {
    enabled: true,
    stallMs: 240000,
    tickMs: DEFAULT_TICK_MS
  },
  toolBreaker: {
    enabled: true,
    maxConsecutiveFailures: 3
  },
  logPath: null
};

let logSink = null;

function log(line) {
  try {
    if (logSink !== null) logSink(line);
  } catch {
    /* 诊断代码绝不抛 */
  }
}

function resolveLogPath(cfg) {
  if (typeof cfg.logPath === 'string' && cfg.logPath !== '') return cfg.logPath;
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh');
  return join(home, 'logs', 'stall-guard.log');
}

function makeLogSink(path) {
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {
    /* 目录建不出来就静默降级 */
  }
  return (line) => {
    try {
      appendFileSync(path, `[${new Date().toISOString()}] ${line}\n`);
    } catch {
      /* 写不进去就算了 */
    }
  };
}

function sessionIdOf(source) {
  const id =
    source?.session?.id ??
    source?.agent?.session?.id ??
    source?.sessionId ??
    source?.session?.sessionId;
  return typeof id === 'string' && id !== '' ? id : null;
}

// tools/post-execute 的 exec.agent 是可选字段（dsh-tools ToolExecutionInput: "The agent
// on whose behalf the call runs (set by the agent loop)"），exec 上没有顶层 session 字段。
// 记账 key 优先用 session id，退化为 agent 对象本身（同一 agent 引用跨 step 稳定，可作 Map key）。
function breakerKeyOf(exec) {
  const id = sessionIdOf(exec);
  if (id !== null) return id;
  const agent = exec?.agent;
  return agent === void 0 || agent === null ? null : agent;
}

// 日志里把 Map key 还原成可读标签（退化 key 是 agent 对象，直接模板插值会打印 [object Object]）。
function breakerLabelOf(key) {
  if (typeof key === 'string') return key;
  const id = sessionIdOf(key);
  return id === null ? '(agent-without-session)' : id;
}

function toolNameOf(exec) {
  const candidate = exec?.name ?? exec?.tool?.name ?? exec?.call?.name ?? exec?.toolName;
  return typeof candidate === 'string' && candidate !== '' ? candidate : 'unknown';
}

// 失败判据不能只看 result.isError。dsh-tool-pwsh/lib/index.js:128-135 与
// dsh-tool-bash/lib/index.js:141-143 的注释逐字写着：「Non-zero exits are reported,
// not errored — the model decides how to react; only infrastructure failures
// (spawn errors, aborts) surface as isError results.」⇒ 命令跑失败（exit != 0）
// 时 isError 仍然是 false，只在模型可见文本里留下 marker。所以必须读文本。
const FAILURE_MARKERS = [
  /\[exit code: /,
  /\[sandbox: file access denied/,
  /\[timed out after /,
  /\[killed by signal: /,
  /\[stopped: /,
  /^Error:/m
];

function resultText(result) {
  const blocks = Array.isArray(result?.content) ? result.content : [];
  let text = '';
  for (const block of blocks) {
    if (typeof block?.text === 'string') text += `\n${block.text}`;
  }
  return text;
}

function failedOf(result) {
  if (result?.isError === true) return true;
  const text = resultText(result);
  if (text === '') return false;
  for (const marker of FAILURE_MARKERS) {
    if (marker.test(text)) return true;
  }
  return false;
}

/* ── section 1: 无进展 watchdog（活性兜底） ─────────────────────────────── */

function installStallGuard(ctx, cfg) {
  const g = cfg.stallGuard;
  if (!g.enabled) return;

  const states = new Map();

  function arm(agent, phase) {
    const sessionId = sessionIdOf(agent);
    if (sessionId === null) return;
    const now = Date.now();
    states.set(sessionId, {
      agent,
      sessionId,
      phase,
      startedAt: now,
      lastActivity: now,
      frames: 0,
      cancelled: false
    });
  }

  function touch(agent, frame) {
    const sessionId = sessionIdOf(agent);
    if (sessionId === null) return;
    const st = states.get(sessionId);
    if (st === undefined) {
      // pre-step 没记上（例如插件热装）时，用第一帧自建 state，不自暴自弃。
      arm(agent, 'stream-start');
      const fresh = states.get(sessionId);
      if (fresh === undefined) return;
      fresh.frames = 1;
      return;
    }
    st.lastActivity = Date.now();
    st.frames += 1;
    if (frame?.type === 'end') {
      states.delete(sessionId);
    }
  }

  ctx.on('agent/pre-step', async ({ agent } = {}, next) => {
    const decision = await next();
    try {
      arm(agent, 'pre-step');
    } catch (error) {
      log(`arm failed: ${String(error?.message ?? error)}`);
    }
    return decision;
  });

  ctx.on('agent/assistant-stream', (payload) => {
    try {
      const agent = payload?.agent;
      const frame = payload?.frame;
      if (agent === undefined || frame === undefined) return;
      touch(agent, frame);
    } catch (error) {
      log(`touch failed: ${String(error?.message ?? error)}`);
    }
  }, { global: true });

  ctx.on('agent/disposed', ({ agent } = {}) => {
    try {
      const sessionId = sessionIdOf(agent);
      if (sessionId !== null) states.delete(sessionId);
    } catch {
      /* 清理失败无副作用 */
    }
  }, { global: true });

  ctx.effect(() => {
    const timer = setInterval(() => {
      try {
        const now = Date.now();
        for (const [sessionId, st] of states) {
          if (st.cancelled) continue;
          const idle = now - st.lastActivity;
          if (idle < g.stallMs) continue;
          st.cancelled = true;
          states.delete(sessionId);
          const detail = {
            phase: st.phase,
            idleMs: idle,
            limitMs: g.stallMs,
            frames: st.frames,
            stepElapsedMs: now - st.startedAt
          };
          log(
            `STALL-CANCEL sess=${sessionId} ${JSON.stringify(detail)} — 该 step 在 ${Math.round(idle / 1000)}s 内没有任何 stream 帧，主动中止 turn（dsh 层无 stream 超时，此处是唯一兜底）`
          );
          try {
            st.agent.cancel({
              kind: 'stall-guard',
              reason: 'no-stream-activity',
              detail,
              sessionId
            });
            log(`cancel dispatched sess=${sessionId}`);
          } catch (error) {
            log(`cancel failed sess=${sessionId}: ${String(error?.message ?? error)}`);
          }
        }
      } catch (error) {
        log(`tick failed: ${String(error?.message ?? error)}`);
      }
    }, Math.max(MIN_TICK_MS, Number(g.tickMs) || DEFAULT_TICK_MS));
    if (typeof timer.unref === 'function') timer.unref();
    return () => {
      clearInterval(timer);
      states.clear();
    };
  }, 'stall-guard.watchdog');

  log(
    `stallGuard armed stallMs=${Math.max(0, Number(g.stallMs) || 240000)} tickMs=${Math.max(MIN_TICK_MS, Number(g.tickMs) || DEFAULT_TICK_MS)}`
  );
}

/* ── section 2: 工具失败熔断 ────────────────────────────────────────────── */

function breakerText(toolName, count) {
  return [
    '<stall-guard>',
    '你已连续 ' + count + ' 次调用工具 ' + toolName + ' 失败。停止重试同一种写法。',
    '二选一：（a）换一个本质不同的策略 —— 换命令 / 换工具 / 先读源码或日志确认前提；',
    '（b）直接把当前阻塞与已确认的事实汇报给我。',
    '不要重复提交已经失败过的命令，也不要靠微调参数再试一次。',
    '</stall-guard>'
  ].join('\n');
}

function installToolBreaker(ctx, cfg) {
  const b = cfg.toolBreaker;
  if (!b.enabled) return;
  const maxFailures = Math.max(1, Number(b.maxConsecutiveFailures) || 3);
  const armed = new Map();

  let seen = 0;
  ctx.on('tools/post-execute', async (exec, result, next) => {
    if (seen < 20) {
      seen += 1;
      log(`BREAKER seen#${seen} tool=${toolNameOf(exec)} failed=${failedOf(result)} agent=${exec?.agent === void 0 ? 'MISSING' : 'ok'} sid=${String(sessionIdOf(exec))}`);
    }
    let decision;
    try {
      decision = await next();
    } catch (error) {
      log(`breaker next failed: ${String(error?.message ?? error)}`);
      throw error;
    }
    try {
      const sessionId = breakerKeyOf(exec);
      if (sessionId === null) return decision;
      const toolName = toolNameOf(exec);
      const failed = failedOf(result);
      const entry = armed.get(sessionId);
      if (!failed) {
        if (entry !== void 0 && entry.tool === toolName) armed.delete(sessionId);
        return decision;
      }
      if (entry === void 0 || entry.tool !== toolName) {
        armed.set(sessionId, { tool: toolName, count: 1, fired: false });
        return decision;
      }
      entry.count += 1;
      if (entry.count >= maxFailures && !entry.fired) {
        entry.fired = true;
        log(`BREAKER armed sess=${breakerLabelOf(sessionId)} tool=${toolName} consecutiveFailures=${entry.count}`);
      }
      return decision;
    } catch (error) {
      log(`breaker accounting failed: ${String(error?.message ?? error)}`);
      return decision;
    }
  });

  ctx.on('agent/pre-step', async ({ agent } = {}, next) => {
    const decision = await next();
    try {
      // 与 post-execute 侧用同一个 key 推导（breakerKeyOf），否则退化路径下 armed 与 fired 的 Map key 不同，永远 fired 不了。
      const sessionId = breakerKeyOf({ agent });
      if (sessionId === null) return decision;
      const entry = armed.get(sessionId);
      if (entry === undefined || !entry.fired) return decision;
      if (!Array.isArray(decision?.messages)) return decision;
      const text = breakerText(entry.tool, entry.count);
      armed.delete(sessionId);
      log(`BREAKER fired sess=${breakerLabelOf(sessionId)} tool=${entry.tool} count=${entry.count}`);
      return {
        ...decision,
        messages: [
          ...decision.messages,
          {
            id: randomUUID(),
            role: 'user',
            content: [{ type: 'text', text }],
            source: { kind: name, form: 'snapshot', sections: [{ name, text }] }
          }
        ]
      };
    } catch (error) {
      log(`breaker inject failed: ${String(error?.message ?? error)}`);
      return decision;
    }
  });

  log(`toolBreaker armed maxConsecutiveFailures=${maxFailures}`);
}

/* ── entry ──────────────────────────────────────────────────────────────── */

export function apply(ctx, config) {
  try {
    const cfg = {
      ...DEFAULTS,
      ...(config ?? {}),
      stallGuard: { ...DEFAULTS.stallGuard, ...(config?.stallGuard ?? {}) },
      toolBreaker: { ...DEFAULTS.toolBreaker, ...(config?.toolBreaker ?? {}) }
    };
    logSink = makeLogSink(resolveLogPath(cfg));
    log(`installed pid=${process.pid} node=${process.version}`);
    installStallGuard(ctx, cfg);
    installToolBreaker(ctx, cfg);
  } catch (error) {
    try {
      console.error('[stall-guard] install failed', error);
    } catch {
      /* 连 console 都可能不可用 */
    }
  }
}

