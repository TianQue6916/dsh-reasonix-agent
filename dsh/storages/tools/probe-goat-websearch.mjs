// probe-goat-websearch.mjs —— 单独测 goat gateway 的 Anthropic server-side web_search 质量。
// 用法: node probe-goat-websearch.mjs [model] [query...]
//   node probe-goat-websearch.mjs claude-sonnet-5-5 "Rust 1.85 release date"
// key 从 ~/.dsh/.env 的 COMMANDCODE_API_KEY 读（不落盘、不打印）。
import fs from 'node:fs';

const argv = process.argv.slice(2);
const model = argv[0] || 'claude-sonnet-5-5';
const query = argv.slice(1).join(' ') || 'Rust 1.85 release date';
const maxUses = Number(process.env.PROBE_MAX_USES || 1);

const env = Object.fromEntries(
  fs.readFileSync(process.env.USERPROFILE + '/.dsh/.env', 'utf8')
    .split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const key = env.COMMANDCODE_API_KEY;

const body = {
  model,
  max_tokens: Number(process.env.PROBE_MAX_TOKENS || 1024),
  messages: [{ role: 'user', content: `${query}\n\nAnswer concisely using web search results, and cite the URLs.` }],
  tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxUses }],
};

const t0 = Date.now();
let status = 0, txt = '';
try {
  const r = await fetch('http://127.0.0.1:8788/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': key, authorization: 'Bearer ' + key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  status = r.status;
  txt = await r.text();
} catch (e) {
  console.log(JSON.stringify({ model, query, status: 'FETCH_FAIL', error: String(e.message || e) }, null, 1));
  process.exit(1);
}
const elapsedMs = Date.now() - t0;

let out = { model, query, status, elapsedMs };
try {
  const j = JSON.parse(txt);
  const blocks = j.content ?? [];
  out.blockTypes = blocks.map((b) => b.type);
  out.searches = blocks.filter((b) => b.type === 'server_tool_use').length;
  out.results = blocks
    .filter((b) => b.type === 'web_search_tool_result')
    .flatMap((b) => b.content ?? [])
    .filter((x) => x.type === 'web_search_result')
    .map((x) => ({ title: x.title, url: x.url, page_age: x.page_age ?? null }));
  out.answer = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n').slice(0, 1200);
  out.usage = j.usage ? { input: j.usage.input_tokens, output: j.usage.output_tokens } : null;
  if (j.error) out.error = j.error;
} catch {
  out.raw = txt.slice(0, 400);
}
console.log(JSON.stringify(out, null, 1));
