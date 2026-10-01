#!/usr/bin/env node
// bench-llm.mjs — 给「同一个网关 + 同一个 key 池」的公平基准：首字延迟 / 解码速率 / 端到端
//
// 为什么需要它：reasonix 状态栏的 TPS 是「回合吞吐」（分母含首字延迟、思考、重试、工具往返），
// dsh 那边看到的往往是「解码速率」。两个数不是一回事，直接比会得出「同一个 key 差 3 倍」的错觉。
//
// 用法：
//   node bench-llm.mjs                                    # 默认 3 次
//   node bench-llm.mjs --runs 5 --max-tokens 600
//   node bench-llm.mjs --prompt "请从 1 数到 400，每行一个数字"
//   node bench-llm.mjs --url http://127.0.0.1:8788/v1/chat/completions --model deepseek/deepseek-v4.1-flash
//
// 输出：
//   ttfb   = 请求发出 → 收到第一个 SSE 事件
//   ttft   = 请求发出 → 第一个 content 增量（真正开始出字）
//   decode = 第一个 content 增量 → 最后一个 content 增量
//   dec_tps= usage.completion_tokens / decode（真·解码速率，对标 200+/600+）
//   e2e_tps= usage.completion_tokens / 总耗时（对标 reasonix 状态栏里的小数字）

import process from 'node:process';

const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : def;
}

const URL_ = arg('url', 'http://127.0.0.1:8788/v1/chat/completions');
const MODEL = arg('model', 'deepseek/deepseek-v4.1-flash');
const RUNS = Math.max(1, Number(arg('runs', 3)) || 3);
const MAXTOK = Number(arg('max-tokens', 800)) || 800;
const PROMPT = arg('prompt', '请从 1 输出到 300，每行一个数字，不要输出任何其它内容。');
const KEY = arg('key', 'bench-client'); // 网关会换成池子里的真 key

async function once(n) {
  const body = JSON.stringify({
    model: MODEL,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: MAXTOK,
    messages: [{ role: 'user', content: PROMPT }],
  });
  const t0 = Date.now();
  let ttfb = 0, ttft = 0, last = 0, chars = 0, rchars = 0, usage = null;
  const res = await fetch(URL_, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${KEY}`,
      'x-reasonix-session-id': `bench-${n}`, // 故意用 header 指纹，顺带回归这个代码路径
    },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!ttfb) ttfb = Date.now() - t0;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      let obj;
      try { obj = JSON.parse(payload); } catch { continue; }
      if (obj.usage) usage = obj.usage;
      for (const ch of obj.choices || []) {
        const d = ch.delta || {};
        // 思考(推理)增量也算在「解码窗口」里：它同样是模型吐出来的 token，
        // 只是不计入 visible 字数。否则只出思考的请求会得到 0 秒窗口。
        // 这个上游把思考放在 delta.reasoning（OpenAI 风格是 reasoning_content，
        // 有的实现还会给 reasoning_details[].text）——三种都认，取其一避免重复计数。
        let rc = '';
        if (typeof d.reasoning_content === 'string') rc = d.reasoning_content;
        else if (typeof d.reasoning === 'string') rc = d.reasoning;
        else if (Array.isArray(d.reasoning_details)) {
          rc = d.reasoning_details.map((x) => (x && x.text) || '').join('');
        }
        const c = d.content;
        if (rc || c) {
          if (!ttft) ttft = Date.now() - t0;
          last = Date.now() - t0;
          if (rc) rchars += rc.length;
          if (c) chars += c.length;
        }
      }
    }
  }
  const total = Date.now() - t0;
  const ct = usage ? usage.completion_tokens : 0;
  const decodeS = Math.max(1, last - ttft) / 1000;
  return {
    n,
    ttfb: ttfb / 1000,
    ttft: ttft / 1000,
    decode: decodeS,
    total: total / 1000,
    ct,
    chars,
    rchars,
    dec_tps: ct ? ct / decodeS : 0,
    e2e_tps: ct ? ct / (total / 1000) : 0,
  };
}

const rows = [];
for (let i = 1; i <= RUNS; i++) {
  try {
    const r = await once(i);
    rows.push(r);
    console.log(
      `#${r.n}  ttfb ${r.ttfb.toFixed(2)}s  ttft ${r.ttft.toFixed(2)}s  decode ${r.decode.toFixed(2)}s  ` +
        `total ${r.total.toFixed(2)}s  ct ${r.ct}  chars ${r.chars}  think ${r.rchars}  ` +
        `dec_tps ${r.dec_tps.toFixed(0)}  e2e_tps ${r.e2e_tps.toFixed(0)}`,
    );
  } catch (e) {
    console.log(`#${i}  FAILED: ${e.message}`);
  }
}
if (!rows.length) process.exit(1);
// 解码窗口过短（<0.2s）的样本对速率不可信，中位数里剔除
const good = rows.filter((r) => r.decode >= 0.2);
const med = (f) => {
  const a = (good.length ? good : rows).map(f).sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
};
console.log(
  `\n中位数：ttft ${med((r) => r.ttft).toFixed(2)}s  decode ${med((r) => r.decode).toFixed(2)}s  ` +
    `dec_tps ${med((r) => r.dec_tps).toFixed(0)}  e2e_tps ${med((r) => r.e2e_tps).toFixed(0)}`,
);
