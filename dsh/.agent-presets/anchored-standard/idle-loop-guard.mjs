/*
 * idle-loop-guard.mjs —— 抓「跨 turn 的空转」：连续多个 step 只说不动手。
 *
 * ── 为什么 gateway 侧的 loop-guard 不够 ────────────────────────────────────
 * goat-gateway 的 loop-guard.mjs 看的是**单次 SSE 响应**内字符级 6-gram 的
 * novelty（唯一率）。它能抓「好。写。输出。好。写。输出。」这种已经塌缩的
 * 字面循环，但抓不到下面两类，因为它们跨了 turn 边界：
 *
 *   ① 每轮只吐几十字、字面各不相同、但内容都是「我打算怎么做」——单次响应
 *      的 novelty 是 0.9+，完全正常；问题在于**连续 N 轮都没产生 tool call**。
 *   ② 短输出（< 4096 字符）永远填不满 slowCapacity 窗口，fast 窗口的命中
 *      又因为阈值收紧而失效（2026-10-27 实测 minFast=0.1055 刚好落在
 *      阈值边缘）。
 *
 * 2026-10-26 现场：一个请求 reasoning 2639 字符、fast 0.1758、slow=null，
 * 4 次 fast 命中全在 shadow 里只记录不干预 —— 那正是「只想不做」的形态。
 *
 * ── 本模块判据（只看结构，不看语义）────────────────────────────────────────
 * 一个 step 记作 IDLE 当且仅当：**本 step 结束时尚无任何 tool call**。
 * 连续 idleStreak >= maxConsecutiveIdleSteps（默认 3）时，在下一个 step 注入
 * 一条可见提示，要求「要么立刻调用工具，要么停下来汇报」。
 *
 * 为什么用「无 tool call」而不是「novelty 低」：跨 turn 的文本相似度不可靠
 * （每轮换个说法就是新的 6-gram），但「该动手时没动手」是结构事实，判错不了。
 * 代价是它抓不到「一边空转一边真的在调工具」的错方向执行 —— 那类归
 * stall-guard 的工具失败熔断管。
 *
 * ── 与 dsh-thinking-guard 的区别（这是关键）────────────────────────────────
 * thinking-guard 熔断后**注入「继续」**→ 新 attempt → 又空转 → 又熔断，
 * 形成正反馈并让问题看起来更严重（见 cordis.patch.yml 里 stall-guard 的注释）。
 * 本模块注入的是**纠正指令**（要求行动或停止），且**只在连续命中时注入一次**，
 * 注入后把 streak 清零，不制造循环。
 *
 * 约束：只能 import node:*；任何异常都不得拖倒 boot（全文件 try/catch）。
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export const name = 'idle-loop-guard';
export const inject = [];

const DEFAULTS = {
  enabled: true,
  maxConsecutiveIdleSteps: 3,
  // 一个 step 的 text 总长低于这个值才算「没实质产出」。
  // 设成 0 表示不看长度，只看有没有 tool call。
  maxTextCharsPerStep: 2000,
  // 注入后多少 step 内不再重复注入（防止把 prompt 撑爆）。
  cooldownSteps: 6,
  // 同一 session 累计注入多少次之后升级为 agent.cancel()。0 = 永不升级。
  escalateAfter: 3,
  logPath: null
};

let logSink = null;

function log(line) {
  try {
    if (logSink !== null) logSink(line);
  } catch {
    /* 日志失败无副作用 */
  }
}

function makeLogSink(path) {
  try {
    const dir = dirname(path);
    mkdirSync(dir, { recursive: true });
    return (line) => {
      try {
        appendFileSync(path, `${new Date().toISOString()} ${line}\n`);
      } catch {
        /* 落盘失败不影响判定 */
      }
    };
  } catch {
    return () => {};
  }
}

function resolveLogPath(cfg) {
  if (typeof cfg.logPath === 'string' && cfg.logPath.length > 0) return cfg.logPath;
  const home = process.env.DSH_HOME || join(homedir(), '.dsh');
  return join(home, 'logs', 'idle-loop-guard.log');
}

function sessionIdOf(agent) {
  try {
    const id = agent?.session?.id ?? agent?.sessionId ?? agent?.id;
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

function labelOf(sessionId) {
  if (typeof sessionId !== 'string') return '?';
  return sessionId.length <= 8 ? sessionId : `${sessionId.slice(0, 6)}…${sessionId.slice(-2)}`;
}

export function apply(ctx, config) {
  try {
    const cfg = { ...DEFAULTS, ...(config ?? {}) };
    // 2026-10-28 修：以前从不读 enabled，导致 profile 里写 enabled:false 完全无效
    // （实测配置改了、重启了、仍然在 FIRE）。stall-guard 的每个子系统都有 if (!x.enabled) return，这里漏了。
    if (cfg.enabled === false) {
      logSink = makeLogSink(resolveLogPath(cfg));
      log(`disabled by config (enabled=false) — not installing`);
      return;
    }
    logSink = makeLogSink(resolveLogPath(cfg));
    log(`installed pid=${process.pid} node=${process.version}`);

    const maxIdle = Math.max(1, Number(cfg.maxConsecutiveIdleSteps) || 3);
    const maxText = Math.max(0, Number(cfg.maxTextCharsPerStep) || 0);
    const cooldown = Math.max(0, Number(cfg.cooldownSteps) || 6);
    const escalateAfter = Math.max(0, Number(cfg.escalateAfter) || 0);

    // sessionId -> { streak, stepTextChars, stepToolCalls, cooldownLeft, steps }
    const states = new Map();

    function st(sessionId) {
      let s = states.get(sessionId);
      if (s === undefined) {
        s = { streak: 0, stepTextChars: 0, stepToolCalls: 0, cooldownLeft: 0, steps: 0, fires: 0 };
        states.set(sessionId, s);
      }
      return s;
    }

    ctx.on(
      'agent/assistant-stream',
      (payload) => {
        try {
          const agent = payload?.agent;
          const frame = payload?.frame;
          const sessionId = sessionIdOf(agent);
          if (sessionId === null || frame === undefined) return;
          const s = st(sessionId);
          // 只统计文本增量；tool-call 增量单独记，并立刻把本 step 标记成「动手了」。
          if (frame?.type === 'text-delta') {
            const t = frame?.text ?? frame?.delta?.text ?? frame?.delta ?? '';
            if (typeof t === 'string') s.stepTextChars += t.length;
          } else if (frame?.type === 'tool-call-delta' || frame?.type === 'tool-call-start') {
            s.stepToolCalls += 1;
          } else if (frame?.type === 'end') {
            // step 结束：结算
            s.steps += 1;
            const idle = s.stepToolCalls === 0 && (maxText === 0 || s.stepTextChars <= maxText);
            s.streak = idle ? s.streak + 1 : 0;
            if (s.cooldownLeft > 0) s.cooldownLeft -= 1;
            s.stepTextChars = 0;
            s.stepToolCalls = 0;
          }
        } catch (error) {
          log(`stream accounting failed: ${String(error?.message ?? error)}`);
        }
      },
      { global: true }
    );

    // { prepend: true }：与 thinking-anchor.mjs 同理 —— unshift 到 listener 数组头部，
    // 抢最外层，让注入的消息落在**最贴近采样点**的位置。2026-10-27 实测：不加这行时
    // 注入 9 次、steps 从 3 涨到 21，模型全程照旧空转；thinking-anchor 的头注释明确写了
    // 「位置比措辞重要 —— 紧贴生成点才是这个 harness 能拿到的最强位置」。
    ctx.on('agent/pre-step', async ({ agent } = {}, next) => {
      const decision = await next();
      try {
        const sessionId = sessionIdOf(agent);
        if (sessionId === null) return decision;
        const s = st(sessionId);
        if (s.streak < maxIdle) return decision;
        if (s.cooldownLeft > 0) return decision;
        if (!Array.isArray(decision?.messages)) return decision;

        const text =
          `[idle-loop-guard] 连续 ${s.streak} 个 step 都没有产生任何 tool call，` +
          `合计 ${s.steps} 个 step。你正在重复「描述打算」而不是实际执行。\n\n` +
          `立刻二选一，不要继续描述计划：\n` +
          `（a）马上调用一个具体工具去推进任务；\n` +
          `（b）如果你认为任务已经完成或无法推进，直接给出结论并停止。\n\n` +
          `这条提示由本地插件注入，不是用户发的。`;

        s.fires += 1;
        s.streak = 0;
        s.cooldownLeft = cooldown;
        log(`FIRE sess=${labelOf(sessionId)} steps=${s.steps} textChars=${s.stepTextChars} fire#${s.fires} cooldown=${cooldown}`);

        // 升级：同一 session 反复空转时，光注入无效。实测 2026-10-27 注入 9 次、
        // steps 从 3 涨到 21，模型全程照旧 —— 一条 user message 不足以让它转向。
        // 到 escalateAfter 次就 agent.cancel()，让 turn 干净收尾、控制权交还用户。
        if (escalateAfter > 0 && s.fires >= escalateAfter) {
          log(`ESCALATE sess=${labelOf(sessionId)} fires=${s.fires} steps=${s.steps} — cancelling turn`);
          s.fires = 0;
          try {
            agent.cancel({
              kind: name,
              reason: 'consecutive-idle-steps',
              detail: { steps: s.steps, fires: escalateAfter },
              sessionId
            });
          } catch (error) {
            log(`cancel failed: ${String(error?.message ?? error)}`);
          }
          return decision;
        }


        // 先剪掉本插件此前注入的那些（transcript 只增不改，不剪会累加成噪声，
        // 这也是 thinking-anchor.mjs 的关键做法）。
        const kept = decision.messages.filter((m) => m?.source?.kind !== name);

        return {
          ...decision,
          messages: [
            ...kept,
            {
              id: randomUUID(),
              role: 'user',
              content: [{ type: 'text', text }],
              source: { kind: name, form: 'snapshot', sections: [{ name, text }] }
            }
          ]
        };
      } catch (error) {
        log(`pre-step inject failed: ${String(error?.message ?? error)}`);
        return decision;
      }
    }, { prepend: true });

    ctx.on(
      'agent/disposed',
      ({ agent } = {}) => {
        try {
          const sessionId = sessionIdOf(agent);
          if (sessionId !== null) states.delete(sessionId);
        } catch {
          /* 清理失败无副作用 */
        }
      },
      { global: true }
    );
  } catch (error) {
    try {
      console.error('[idle-loop-guard] install failed', error);
    } catch {
      /* 连 console 都可能不可用 */
    }
  }
}
