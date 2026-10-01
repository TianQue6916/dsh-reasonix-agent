// loop-guard.mjs — degenerate repetition 检测（gateway 侧，shadow-first）
//
// 作用：在 SSE 转发链路上实时检测模型输出的「退化重复」——不是网络卡死，而是
//       模型在 reasoning / text 段原地打转（decision deadlock 或 token 级周期）。
//
// 为什么不用「周期检测」当主判据：周期检测只能抓住已经塌缩成精确重复的后半段
// （`（...）\n（...）`），而前半段（`好。` `写。` `输出。` `OK 写。` 语义打转但
// 字面各不相同）抓不住。等它塌缩时已经烧掉几千 token，止损窗口早过了。
//
// 主判据用 n-gram novelty：滑动窗口内「唯一 n-gram 数 / 窗口内 n-gram 总数」。
//   - 正常输出（哪怕 temperature=0）每个新 n-gram 都是新的 → novelty ≈ 1
//   - 语义打转：窗口内反复用同一批短语 → novelty 塌到 0.2~0.4
//   - token 周期 p：novelty ≈ p / capacity（p=5,cap=256 → 0.02）
// 这个量对「字面不重复但语义重复」同样敏感，而且是 O(1) 增量维护的精确统计，
// 不需要 EMA、不需要压缩、不需要 embedding。
//
// 注意：不要用 token 熵做判据。temperature 会在采样时把随机性加回来，一个在
// {好,写,输出} 之间随机挑的循环，token 级 empirical entropy 看起来完全正常。
// 观测量必须是「序列」的 novelty，不是「分布」的熵。
//
// shadow 模式：只记录 jsonl，从不干预转发。校准完阈值再把 mode 改成 'abort'。

import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_LOOP_GUARD = {
  enabled: false,               // 总开关；shadow 阶段手动开
  mode: 'shadow',               // 'shadow'（只记）| 'abort'（命中即断上游，由调用方执行）
  channels: ['reasoning', 'text'],  // tool 参数默认不检测：JSON 缩进/引号天然高重复

  n: 6,                         // 字符级 n-gram 长度
  fastCapacity: 256,            // 快窗口：256 字符，负责「早发现」（只抓 token 级塌缩）
  slowCapacity: 4096,           // 慢窗口：主判据。必须 >= 循环周期，否则 novelty 恒接近 1
  longCapacity: 16384,          // 长窗口：对长输出更敏感（周期越长的语义循环越依赖它）
  tailChars: 512,               // 保留的原始尾部字符，供周期确认使用
  warmupChars: 256,             // 至少观测这么多字符才允许触发

  // 触发规则（双路径，见 feed()）：
  //   slow 窗口是强证据，单独命中即可触发；
  //   fast 窗口是弱证据，只在 slow 未就绪（请求早期）时才独立成立。
  // 校准依据（2026-10-01 在 C:/tmp/fx/ 的真实数据集上实测，脚本 ev7.mjs / ev8.mjs）：
  //   数据集：degen.jsonl = 40 条真实退化 reasoning；normal.jsonl 中 len<80000 的 163 条正常 reasoning。
  //   末窗口 final novelty 分布 ——
  //     capacity= 4096: degen {min 0.0535, p25 0.0889, med 0.1199, p75 0.1689, max 0.2786}
  //                     ctrl  {min 0.0073, p05 0.6975, p25 0.7561, med 0.7952, p75 0.8369, max 0.9109}
  //     capacity=16384: degen {min 0.0206, med 0.0410, max 0.1149}
  //                     ctrl  {min 0.0018, p05 0.5593, med 0.6797, max 0.7976}
  //   => 4096 尺度上 degen.max(0.2786) 与 ctrl.p05(0.6975) 之间是一整条空白带，
  //      阈值 0.20 落在正中，两端各留 0.08 / 0.50 余量。
  //   流式结果：4096@0.20 检出 40/40、误报 1/163=0.6%、中位命中 6144 字符。
  //   对照 thinking-guard 的 sparse-repeat：40/40、误报 3.7%、中位命中 3072 字符。
  // ⚠ capacity<=1024 完全抓不住这类循环：degen 在 256 尺度上 med=0.8008、
  //   1024 尺度上 med=0.4092 —— 因为循环周期常比窗口还长，窗口里全是「新」内容。
  //   旧配置（slow=1024）在真实数据上只检出 4/40。窗口必须 >= 周期。
  // ⚠ capacity=16384 在 degen 上只检出 8/40，因为这些样本普遍 5k-20k 字符、填不满窗口
  //   因而永不 ready。它是长输出的补充尺度，不能替代 4096。
  thresholds: {
    reasoning: { fast: 0.20, slow: 0.20, long: 0.20 },
    text: { fast: 0.35, slow: 0.20, long: 0.20 },
  },

  period: { maxPeriod: 64, minRepeats: 4, minBlockNonSpace: 3 },

  sampleEveryChars: 64,         // 每 N 字符记一个 novelty 采样点
  maxRecordedSamples: 64,
  refireCooldownChars: 512,     // 同一 channel 触发后多久内不再重复报
  sinkFile: 'loop-guard.jsonl',
};

/* ────────────────────────────────────────────────────────────────
 * 1. NoveltyWindow — 滑动窗口 n-gram 唯一率
 *
 * 实现：ring buffer 存最近 capacity 个 gram + 一个精确计数 Map。
 * 窗口滑动时淘汰被覆盖的那个 gram，O(1)。novelty = count.size / filled
 * 即「窗口内不同 gram 的种类数 / 窗口内 gram 总数」。
 * ──────────────────────────────────────────────────────────────── */
export class NoveltyWindow {
  constructor(n, capacity) {
    this.n = n;
    this.capacity = capacity;
    this.ring = new Array(capacity).fill(null);
    this.pos = 0;
    this.filled = 0;   // 已写入的 gram 数，上限 capacity
    this.total = 0;    // 生命周期内产出过的 gram 总数
    this.chars = [];   // 最近 n 个字符，用于拼新 gram
    this.count = new Map();
  }

  /** 窗口填满后 novelty 才有意义 */
  get ready() {
    return this.filled >= this.capacity;
  }

  get novelty() {
    return this.filled === 0 ? 1 : this.count.size / this.filled;
  }

  push(ch) {
    this.chars.push(ch);
    if (this.chars.length > this.n) this.chars.shift();
    if (this.chars.length < this.n) return;
    const g = this.chars.join('');   // 字符级，join('') 无歧义
    const evicted = this.ring[this.pos];
    if (evicted !== null) {
      const c = this.count.get(evicted);
      if (c !== undefined) {
        if (c <= 1) this.count.delete(evicted);
        else this.count.set(evicted, c - 1);
      }
    }
    this.ring[this.pos] = g;
    this.pos = (this.pos + 1) % this.capacity;
    if (this.filled < this.capacity) this.filled++;
    this.total++;
    this.count.set(g, (this.count.get(g) || 0) + 1);
  }
}

/* ────────────────────────────────────────────────────────────────
 * 2. 周期确认 — novelty 触发后跑一次，只为给出可读诊断
 *
 * 朴素扫描：找最小周期 p 使最后 p*minRepeats 个字符严格周期为 p。
 * 额外约束 minBlockNonSpace：重复块里必须有足够多的「内容字符」，
 * 否则 `。。。\n\n`、`----`、连续相同缩进这类合法重复会误报。
 * ──────────────────────────────────────────────────────────────── */
export function detectPeriod(text, opts = {}) {
  const {
    maxPeriod = 64,
    minRepeats = 4,
    minBlockNonSpace = 3,
  } = opts;
  const L = text.length;
  for (let p = 1; p <= maxPeriod; p++) {
    const need = p * minRepeats;
    if (L < need) break;
    const s = L - need;
    let ok = true;
    for (let i = p; i < need; i++) {
      if (text[s + i] !== text[s + (i % p)]) { ok = false; break; }
    }
    if (!ok) continue;
    const block = text.slice(s, s + p);
    const nonSpace = block.replace(/[\s\p{P}\p{S}]/gu, '').length;
    if (nonSpace < minBlockNonSpace) continue;
    return { period: p, repeats: minRepeats, block: block.slice(0, 60) };
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────
 * 3. SseDeltaParser — 增量 SSE 解析
 *
 * ⚠ 这是接入 gateway 时最容易炸的地方：绝不能在 SSE 帧中间断流。
 *   必须先攒到完整的 \n\n 边界，再从 data: 行取 JSON。
 *   半个 JSON 会让下游 parser 直接抛错，dsh 会当成网络错误走
 *   agent/request-error → retryPolicy 重跑，反而更费额度。
 * ──────────────────────────────────────────────────────────────── */
export class SseDeltaParser {
  constructor() {
    this.buf = '';
  }

  /** 喂入任意切分的文本，返回本次完整收到的 SSE event（raw 文本，可能为空数组） */
  feed(str) {
    // 先规范化 CRLF：\r\n\r\n 里不含 \n\n，不规范化会永远配不上边界。
    // \r\n 跨 chunk 边界也安全：buf 没被消费的部分会保留到下次一起规范化。
    this.buf = (this.buf + str).replace(/\r\n/g, '\n');
    const out = [];
    let idx;
    while ((idx = this.buf.indexOf('\n\n')) !== -1) {
      out.push(this.buf.slice(0, idx));
      this.buf = this.buf.slice(idx + 2);
    }
    return out;
  }

  /** 从一条 SSE event 抽出增量文本。返回 null 表示这条 event 没有可用的 delta。 */
  static extract(raw) {
    const datas = [];
    for (const line of raw.split('\n')) {
      if (line.startsWith('data:')) datas.push(line.slice(5).replace(/^ /, ''));
    }
    if (datas.length === 0) return null;
    const payload = datas.join('\n');
    if (payload === '[DONE]') return { done: true };
    let json;
    try {
      json = JSON.parse(payload);
    } catch {
      return { malformed: true };
    }
    const choice = Array.isArray(json.choices) ? json.choices[0] : null;
    // 没有 choices 的 chunk 可能是纯 usage 尾巴；两者都没用就返回 null，
    // 调用方据此跳过，不必自己判 undefined。
    if (!choice) return json.usage ? { usage: json.usage } : null;
    const d = choice.delta || {};
    return {
      content: typeof d.content === 'string' ? d.content : '',
      // provider 字段名不统一：deepseek 系用 reasoning_content，其他系用 reasoning
      reasoning:
        typeof d.reasoning_content === 'string' ? d.reasoning_content
          : typeof d.reasoning === 'string' ? d.reasoning
            : '',
      toolArgs: Array.isArray(d.tool_calls)
        ? d.tool_calls.map((t) => (t && t.function && t.function.arguments) || '').join('')
        : '',
      finish: choice.finish_reason || null,
      usage: json.usage || null,
    };
  }
}

/* ────────────────────────────────────────────────────────────────
 * 4. LoopGuard — per-request 状态机
 * ──────────────────────────────────────────────────────────────── */
function newChannelState(cfg) {
  return {
    fast: new NoveltyWindow(cfg.n, cfg.fastCapacity),
    slow: new NoveltyWindow(cfg.n, cfg.slowCapacity),
    long: new NoveltyWindow(cfg.n, cfg.longCapacity),
    chars: 0,
    tail: '',
    minFast: 1,
    minFastAtChars: 0,
    samples: [],
    lastFireAtChars: -1 << 30,
  };
}

export class LoopGuard {
  /**
   * @param {object} cfg       LOOP_GUARD 配置（通常来自 gateway config.json 的 loopGuard 段）
   * @param {(line:string)=>void} log gateway 的日志函数
   * @param {object} sink      GuardSink 实例（可为 null = 不落盘）
   */
  constructor(cfg, log, sink) {
    this.cfg = { ...DEFAULT_LOOP_GUARD, ...(cfg || {}) };
    this.thresholds = { ...DEFAULT_LOOP_GUARD.thresholds, ...(this.cfg.thresholds || {}) };
    this.period = { ...DEFAULT_LOOP_GUARD.period, ...(this.cfg.period || {}) };
    this.log = log || (() => {});
    this.sink = sink || null;
    this.attempts = new Map();   // reqId -> state
  }

  get enabled() {
    return !!this.cfg.enabled;
  }

  /** 一次上游请求开始时调用 */
  begin(meta) {
    if (!this.enabled) return;
    const chans = {};
    for (const name of this.cfg.channels) chans[name] = newChannelState(this.cfg);
    this.attempts.set(meta.reqId, {
      meta,
      startTs: Date.now(),
      chans,
      hits: [],
    });
  }

  /** 喂入一段 delta 文本。返回命中的 hit 对象（shadow 模式下调用方应忽略返回值）。 */
  feed(reqId, text, channel) {
    if (!this.enabled || !text) return null;
    const st = this.attempts.get(reqId);
    if (!st) return null;
    const c = st.chans[channel];
    if (!c) return null;

    for (const ch of text) {
      c.fast.push(ch);
      c.slow.push(ch);
      c.long.push(ch);
    }
    c.chars += text.length;
    c.tail = (c.tail + text).slice(-this.cfg.tailChars);

    if (c.fast.novelty < c.minFast) {
      c.minFast = c.fast.novelty;
      c.minFastAtChars = c.chars;
    }

    if (c.chars % this.cfg.sampleEveryChars < text.length) {
      if (c.samples.length < this.cfg.maxRecordedSamples) {
        c.samples.push({
          at: c.chars,
          fast: round4(c.fast.novelty),
          slow: round4(c.slow.novelty),
          long: c.long.ready ? round4(c.long.novelty) : null,
        });
      }
    }

    if (c.chars < this.cfg.warmupChars) return null;
    if (!c.fast.ready) return null;
    if (c.chars - c.lastFireAtChars < this.cfg.refireCooldownChars) return null;

    const th = this.thresholds[channel] || this.thresholds.text;
    const fast = c.fast.novelty;
    const slow = c.slow.ready ? c.slow.novelty : null;
    const lng = c.long.ready ? c.long.novelty : null;

    // 三路径触发：
    //   slow / long 是强证据 —— 窗口 >= 典型循环周期，单独命中即可成立。
    //   fast 是弱证据 —— 只在两个大窗口都还没就绪时（请求早期）才能独立成立；
    //     它们一旦就绪且不认同，说明只是局部合法重复（表格 / 缩进 / 分隔线），放过。
    const slowHit = slow !== null && slow < th.slow;
    const longHit = lng !== null && lng < th.long;
    const fastHit = fast < th.fast;
    if (!slowHit && !longHit && !fastHit) return null;
    if (fastHit && !slowHit && !longHit && (slow !== null || lng !== null)) return null;

    const hit = {
      channel,
      atChars: c.chars,
      reason: slowHit ? 'slow' : longHit ? 'long' : 'fast',
      fast: round4(fast),
      slow: slow === null ? null : round4(slow),
      long: lng === null ? null : round4(lng),
      threshold: th,
      minFastAtChars: c.minFastAtChars,
      period: detectPeriod(c.tail, this.period),
      mode: this.cfg.mode,
    };
    c.lastFireAtChars = c.chars;
    st.hits.push(hit);
    this.log(
      `LOOP-GUARD HIT id=${st.meta.reqId} mode=${this.cfg.mode} ch=${channel} via=${hit.reason}` +
        ` at=${c.chars}ch fast=${hit.fast} slow=${hit.slow} long=${hit.long}` +
        (hit.period ? ` period=${hit.period.period} repeats=${hit.period.repeats}` : ' period=none'),
    );
    return hit;
  }

  /** 一次上游请求结束（正常 / 断流 / 错误）时调用，落盘诊断记录 */
  end(reqId, outcome) {
    if (!this.enabled) return;
    const st = this.attempts.get(reqId);
    if (!st) return;
    this.attempts.delete(reqId);

    const chans = {};
    for (const [name, c] of Object.entries(st.chans)) {
      if (c.chars === 0) continue;
      chans[name] = {
        chars: c.chars,
        fast: c.fast.ready ? round4(c.fast.novelty) : null,
        slow: c.slow.ready ? round4(c.slow.novelty) : null,
        long: c.long.ready ? round4(c.long.novelty) : null,
        minFast: round4(c.minFast),
        minFastAtChars: c.minFastAtChars,
        samples: c.samples,
      };
    }

    // 全程没有任何 channel 产出 → 不落盘，避免 jsonl 被空请求灌满
    if (Object.keys(chans).length === 0 && st.hits.length === 0) return;

    if (this.sink) {
      this.sink.write({
        ts: new Date().toISOString(),
        reqId: st.meta.reqId,
        model: st.meta.model || null,
        sess: st.meta.sess || null,
        key: st.meta.key || null,
        stream: st.meta.stream !== false,
        durMs: Date.now() - st.startTs,
        outcome: outcome || null,
        chans,
        hits: st.hits,
      });
    }
  }

  /** 请求异常退出时的兜底清理，防止 Map 泄漏 */
  drop(reqId) {
    this.attempts.delete(reqId);
  }
}

/* ────────────────────────────────────────────────────────────────
 * 5. GuardSink — 异步 jsonl 落盘（绝不能用 appendFileSync 阻塞 SSE 转发）
 * ──────────────────────────────────────────────────────────────── */
export class GuardSink {
  constructor(file) {
    this.path = file;
    this.stream = fs.createWriteStream(file, { flags: 'a' });
    this.stream.on('error', () => {});   // 落盘失败不能影响转发
  }

  write(obj) {
    try {
      this.stream.write(JSON.stringify(obj) + '\n');
    } catch {}
  }

  close() {
    try {
      this.stream.end();
    } catch {}
  }
}

/* ────────────────────────────────────────────────────────────────
 * 6. 工厂 — gateway 侧只调这一个
 * ──────────────────────────────────────────────────────────────── */
export function createLoopGuard(cfg, log, logDir) {
  const merged = { ...DEFAULT_LOOP_GUARD, ...(cfg || {}) };
  if (!merged.enabled) {
    return { enabled: false, begin() {}, feed() { return null; }, end() {}, drop() {} };
  }
  const sink = logDir ? new GuardSink(path.join(logDir, merged.sinkFile)) : null;
  const guard = new LoopGuard(merged, log, sink);
  guard.log(
    `LOOP-GUARD enabled mode=${guard.cfg.mode} channels=${guard.cfg.channels.join('+')}` +
      ` n=${guard.cfg.n} fast=${guard.cfg.fastCapacity} slow=${guard.cfg.slowCapacity} long=${guard.cfg.longCapacity}` +
      ` sink=${sink ? sink.path : 'none'}`,
  );
  return guard;
}

function round4(x) {
  return Math.round(x * 10000) / 10000;
}
