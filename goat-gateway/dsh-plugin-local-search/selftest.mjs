// selftest.mjs — 离线验证三源合并的 rank / 配额 / 去重 / 并发 / 回退。
// 不碰真实网络：GitHub 走实例 monkeypatch，deepseek 走假 provider 对象，wiki 走本机 http stub。
import http from 'node:http';
import assert from 'node:assert/strict';
import { LocalSearchProvider, mergeSources, DEFAULT_CONFIG } from './index.js';

let passed = 0;
const ok = (name) => { passed += 1; console.log(`  ✓ ${name}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const src = (n, host) => ({ url: `https://${host}.test/${n}`, title: `${host}-${n}` });
const labels = (list) => list.map((s) => s.source).join(',');

console.log('T1 mergeSources：rank 块顺序 + 配额');
{
  const groups = [
    { source: 'wiki', sources: [src(1, 'wiki'), src(2, 'wiki'), src(3, 'wiki'), src(4, 'wiki')] },
    { source: 'github', sources: [1, 2, 3, 4, 5].map((n) => src(n, 'gh')) },
    { source: 'deepseek', sources: [1, 2, 3].map((n) => src(n, 'ds')) },
  ];
  const { sources, dropped } = mergeSources(groups, 8);
  assert.equal(labels(sources), 'github,github,github,deepseek,deepseek,deepseek,wiki,wiki');
  assert.ok(dropped > 0, '超编应被记为 dropped');
  ok('输入的乱序 groups 也按 github > deepseek > wiki 输出，且三源都露面');
}

console.log('T2 mergeSources：跨源同 URL 去重，保留 rank 高的那份');
{
  const dup = { url: 'https://same.test/x', title: 'same' };
  const { sources } = mergeSources(
    [
      { source: 'wiki', sources: [dup, src(2, 'wiki')] },
      { source: 'github', sources: [dup, src(1, 'gh')] },
    ],
    8,
  );
  assert.equal(sources.length, 3);
  assert.equal(sources.filter((s) => s.url === dup.url).length, 1);
  assert.equal(sources.find((s) => s.url === dup.url).source, 'github');
  ok('同 URL 只出现一次，且归属 github');
}

console.log('T3 mergeSources：某源稀缺时剩余名额按 rank 回填');
{
  const groups = [
    { source: 'wiki', sources: [] },
    { source: 'github', sources: [1, 2, 3, 4, 5, 6, 7].map((n) => src(n, 'gh')) },
    { source: 'deepseek', sources: [src(1, 'ds')] },
  ];
  const { sources } = mergeSources(groups, 8);
  assert.equal(labels(sources), 'github,github,github,github,github,github,github,deepseek');
  ok('回填后仍是严格 rank 分块（github 7 条在前，deepseek 1 条在后）');
}

console.log('T4 mergeSources：interleaveSources = true 时按轮次交错');
{
  const groups = [
    { source: 'wiki', sources: [1, 2, 3].map((n) => src(n, 'wiki')) },
    { source: 'github', sources: [1, 2, 3].map((n) => src(n, 'gh')) },
    { source: 'deepseek', sources: [1, 2, 3].map((n) => src(n, 'ds')) },
  ];
  const { sources } = mergeSources(groups, 8, { interleave: true });
  assert.equal(labels(sources), 'github,deepseek,wiki,github,deepseek,wiki,github,deepseek');
  ok('round-robin 交错：每轮 github → deepseek → wiki');
}

// ── 端到端：真的跑 LocalSearchProvider.search()，三个来源全部替换成本地 stub ──────
const TOKEN = 'selftest-token';
process.env.LOCAL_SEARCH_TOKEN = TOKEN;

let wikiHits = 0;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/health') return void res.writeHead(200).end('ok');
  if (url.pathname !== '/search') return void res.writeHead(404).end('');
  if (req.headers['x-local-search-token'] !== TOKEN) return void res.writeHead(401).end('');
  wikiHits += 1;
  setTimeout(() => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, sources: [{ ...src(1, 'wiki'), provider: 'pocketwiki' }, { ...src(2, 'wiki'), provider: 'wikipedia' }] }));
  }, 120);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
// T5–T9 聚焦三源语义：显式关掉 goat 源，避免它们去真打 8788
const config = { ...DEFAULT_CONFIG, aggregatorUrl: `http://127.0.0.1:${server.address().port}`, tokenFile: '', enableGoat: false };

const calls = { github: 0, deepseek: 0, fallback: 0 };
const fakeDeepseek = {
  id: 'deepseek-official',
  available: () => true,
  search: async () => { calls.deepseek += 1; await sleep(120); return { sources: [src(1, 'ds'), src(2, 'ds')], truncated: false }; },
};
const fakeMulti = {
  id: 'multi-search',
  available: () => true,
  search: async () => { calls.fallback += 1; return { sources: [src(1, 'multi')], truncated: false }; },
};
const web = { searchProviders: new Map([['deepseek-official', fakeDeepseek], ['multi-search', fakeMulti]]) };
const makeProvider = () => {
  const p = new LocalSearchProvider(() => config, web);
  p.searchGithub = async () => { calls.github += 1; await sleep(120); return [src(1, 'gh'), src(2, 'gh')]; };
  return p;
};

console.log('T5 search()：三路并发、统一合并、都返回');
{
  wikiHits = 0; calls.github = 0; calls.deepseek = 0; calls.fallback = 0;
  const provider = makeProvider();
  assert.equal(provider.available(), true);
  const t0 = Date.now();
  const res = await provider.search({ query: 'concurrent probe', maxResults: 8 });
  const elapsed = Date.now() - t0;
  assert.equal(labels(res.sources.map((s) => ({ ...s, source: s.source }))), 'github,github,deepseek,deepseek,wiki,wiki'); // goat 已关
  assert.deepEqual([calls.github, calls.deepseek, wikiHits], [1, 1, 1], '三源各被调用一次');
  assert.ok(elapsed < 260, `三路应并行（实测 ${elapsed}ms，串行会是 360ms）`);
  assert.equal(res.truncated, false);
  ok(`github → deepseek → wiki 顺序统一返回，耗时 ${elapsed}ms（并行）；wiki 结果带 pocketwiki/wikipedia 标记`);
}

console.log('T6 search()：单源抛错不拖累另外两源');
{
  calls.github = 0; calls.deepseek = 0;
  const provider = makeProvider();
  provider.searchGithub = async () => { throw new Error('github boom'); };
  const res = await provider.search({ query: 'partial failure probe', maxResults: 8 });
  assert.equal(labels(res.sources), 'deepseek,deepseek,wiki,wiki');
  ok('github 挂掉后仍返回 deepseek + wiki（allSettled 生效）');
}

console.log('T7 search()：三源全空才回退，且不会把 deepseek 当回退打第二次');
{
  const provider = makeProvider();
  provider.searchGithub = async () => [];
  const emptyDeepseek = { ...fakeDeepseek, search: async () => ({ sources: [], truncated: false }) };
  web.searchProviders.set('deepseek-official', emptyDeepseek);
  config.aggregatorUrl = `http://127.0.0.1:${server.address().port}`;
  provider.searchAggregator = async () => [];
  calls.fallback = 0;
  const res1 = await provider.search({ query: 'empty probe', maxResults: 4 });
  assert.deepEqual(res1.sources.map((s) => s.url), [src(1, 'multi').url]);
  assert.equal(calls.fallback, 1, '全空时回退一次');

  const guarded = { ...config, fallbackProviderId: 'deepseek-official' };
  const p2 = new LocalSearchProvider(() => guarded, web);
  p2.searchGithub = async () => [];
  p2.searchAggregator = async () => [];
  let deepseekSkipHits = 0;
  web.searchProviders.set('deepseek-official', { id: 'deepseek-official', available: () => true, search: async () => { deepseekSkipHits += 1; return { sources: [], truncated: false }; } });
  const res2 = await p2.search({ query: 'guarded probe', maxResults: 4 });
  assert.equal(res2.sources.length, 0);
  assert.equal(deepseekSkipHits, 1, '只作为并发来源被调用一次，不再当回退用');
  ok('空结果回退到 multi-search；fallback 指向 deepseek 时被显式拦住（不白跑 model turn）');
}

console.log('T8 searchDeepseekCached：同一 query 的并发调用只打一次 model turn');
{
  web.searchProviders.set('deepseek-official', fakeDeepseek);
  calls.deepseek = 0;
  const provider = makeProvider();
  provider.searchGithub = async () => [];
  provider.searchAggregator = async () => [];
  const [a, b] = await Promise.all([
    provider.search({ query: 'cache probe', maxResults: 4 }),
    provider.search({ query: 'cache probe', maxResults: 4 }),
  ]);
  assert.equal(calls.deepseek, 1, `重复并发 query 应命中缓存（实际 ${calls.deepseek} 次）`);
  assert.equal(a.sources.length, b.sources.length);
  ok('缓存把重复的 deepseek 调用压成 1 次（省一次 model turn 的钱和延迟）');
}


console.log('T9 search()：deepseek 凭证缺失 → 熔断，不再每搜一次都白发起');
{
  const failing = {
    id: 'deepseek-official',
    available: () => true,
    search: async () => {
      calls.deepseek += 1;
      throw new Error('DeepSeek search has no API key for "DEEPSEEK_API_KEY"; store it through the credentials service (WEB_PROVIDER_CREDENTIAL_MISSING)');
    },
  };
  web.searchProviders.set('deepseek-official', failing);
  calls.deepseek = 0;
  const cfg2 = { ...config, deepseekFailureCooldownMs: 60000 };
  const p3 = new LocalSearchProvider(() => cfg2, web);
  p3.searchGithub = async () => [src(1, 'gh')];
  const r1 = await p3.search({ query: 'cred probe 1', maxResults: 4 });
  const r2 = await p3.search({ query: 'cred probe 2', maxResults: 4 });
  assert.equal(calls.deepseek, 1, `熔断后不应再发起（实际 ${calls.deepseek} 次）`);
  assert.equal(labels(r1.sources), 'github,wiki,wiki');
  assert.equal(labels(r2.sources), 'github,wiki,wiki');
  ok('首次凭证失败 → 熔断 60s；后续搜索不再发起 deepseek，github/wiki 照常返回');
}

console.log('T10 searchGoat()：解析 Anthropic Messages 的 web_search_tool_result + citations');
{
  // 本机 stub 一个 /v1/messages，返回真实上游那种块结构
  const goatServer = http.createServer((req, res) => {
    if (!req.url.startsWith('/v1/messages')) return void res.writeHead(404).end('');
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const parsed = JSON.parse(body);
      captured.request = parsed;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        content: [
          { type: 'server_tool_use', name: 'web_search', input: { query: 'x' } },
          {
            type: 'web_search_tool_result',
            content: [
              { type: 'web_search_result', title: 'Rust Release Announcements', url: 'https://blog.rust-lang.org/releases/', page_age: '578 days ago' },
              { type: 'web_search_result', title: 'releases.rs 1.85.0', url: 'https://releases.rs/docs/1.85.0/' },
            ],
          },
          { type: 'text', text: 'Rust 1.85.0 was released on 2025-02-20.', citations: [{ url: 'https://blog.rust-lang.org/releases/', cited_text: 'Rust 1.85.0   which also stabilized the 2024 edition   was released on February 20, 2025' }] },
        ],
      }));
    });
  });
  const captured = {};
  await new Promise((r) => goatServer.listen(0, '127.0.0.1', r));
  const goatCfg = {
    ...DEFAULT_CONFIG,
    goatBaseUrl: `http://127.0.0.1:${goatServer.address().port}/v1`,
    goatEnvFile: '',
    goatApiKeyEnv: 'SELFTEST_GOAT_KEY',
    goatTimeoutMs: 5000,
  };
  process.env.SELFTEST_GOAT_KEY = 'stub-key';
  let gotKey = null;
  const p = new LocalSearchProvider(() => goatCfg, web);
  // 拦截 fetch 以捕获 header（同时验证 key 注入）
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    gotKey = opts?.headers?.['x-api-key'] ?? null;
    return await realFetch(url, opts);
  };
  const sources = await p.searchGoat('Rust 1.85 release date', 8);
  globalThis.fetch = realFetch;

  assert.equal(gotKey, 'stub-key', 'x-api-key 应带上 goat key');
  assert.equal(captured.request.model, goatCfg.goatModel);
  assert.equal(captured.request.tools[0].type, 'web_search_20250305', '必须声明 anthropic server tool');
  assert.ok(captured.request.tools[0].max_uses >= 1);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].url, 'https://blog.rust-lang.org/releases/');
  assert.equal(sources[0].provider, 'goat');
  assert.equal(sources[0].publishedAt, '578 days ago');
  assert.ok(/2024 edition/.test(sources[0].snippet), `citation snippet 应被折叠进 snippet，实际=${sources[0].snippet}`);
  ok('请求带 web_search_20250305 + max_uses；结果从 web_search_tool_result 取，snippet 来自 citations[]');
  goatServer.close();
}

console.log('T11 search()：四路并发，rank = github > goat > deepseek > wiki');
{
  // 注意：config 在 T5 处已把 enableGoat 设为 false，这里必须显式开回来
  const goatCfg2 = { ...config, enableGoat: true, goatBaseUrl: 'http://127.0.0.1:1/v1', goatEnvFile: '' };
  const p4 = new LocalSearchProvider(() => goatCfg2, web);
  p4.searchGithub = async () => [src(1, 'gh'), src(2, 'gh')];
  p4.searchGoat = async () => [src(1, 'goat'), src(2, 'goat')];
  p4.searchDeepseek = async () => [src(1, 'ds')];
  p4.searchAggregator = async () => [src(1, 'wiki')];
  const res = await p4.search({ query: 'rank probe', maxResults: 8 });
  // 4 源、maxResults=8 ⇒ 配额 ceil(8/4)=2。stub 各给 2/2/1/1 条 ⇒ pass0 取 2+2+1+1=6，
  // pass1 无富余可补（goat 恰 2 条已取完、deepseek/wiki 各只有 1 条）⇒ 总量 6。
  // 关键断言是「四源都露面 + 严格 rank 分块」，条数随 stub 而定。
  assert.equal(labels(res.sources), 'github,github,goat,goat,deepseek,wiki',
    `实际=${labels(res.sources)}`);
  ok('四源同时返回，块顺序 github → goat → deepseek → wiki（rank 严格，四源都露面）');
}

console.log('T12 search()：goat 凭证缺失 → 熔断，其余三源照常');
{
  const goatCfg3 = { ...config, enableGoat: true, goatEnvFile: '/nonexistent/.env', goatApiKeyEnv: 'SELFTEST_MISSING_KEY', goatFailureCooldownMs: 60000, goatBaseUrl: 'http://127.0.0.1:1/v1' };
  delete process.env.SELFTEST_MISSING_KEY;
  let goatCalls = 0;
  const p5 = new LocalSearchProvider(() => goatCfg3, web);
  p5.searchGithub = async () => [src(1, 'gh')];
  p5.searchDeepseek = async () => [src(1, 'ds')];
  p5.searchAggregator = async () => [src(1, 'wiki')];
  const origGoat = p5.searchGoat.bind(p5);
  p5.searchGoat = async (...a) => { goatCalls += 1; return await origGoat(...a); };
  const r1 = await p5.search({ query: 'goat cred probe 1', maxResults: 6 });
  const r2 = await p5.search({ query: 'goat cred probe 2', maxResults: 6 });
  assert.equal(goatCalls, 1, `熔断后不应再发起 goat（实际 ${goatCalls} 次）`);
  // stub 各给 1 条：github(1) + deepseek(1) + wiki(1) = 3
  assert.equal(labels(r1.sources), 'github,deepseek,wiki');
  assert.equal(labels(r2.sources), 'github,deepseek,wiki');
  ok('首失败 → 熔断 60s；后续不再发起 goat，github/deepseek/wiki 照常返回');
}

console.log('T13 默认配置：goat 关闭（成本安全），且不因此让 provider 变 unavailable');
{
  // goat 按 claude-sonnet-5-5 单价计费（实测单次 ~$0.038，最坏 ~$0.15/次用户级搜索），
  // 所以默认必须关闭：装了插件不该静默产生费用。这条断言是防回归用的。
  assert.equal(DEFAULT_CONFIG.enableGoat, false, 'DEFAULT_CONFIG.enableGoat 必须默认 false（成本安全）');
  // 且 goat 关闭不能让 provider 变成 unavailable —— web seam 的 resolveProvider
  // 见 available() === false 会抛 WEB_PROVIDER_CONFIGURED_UNAVAILABLE，
  // 那样整个 web_search 会全挂（其余三个源明明还活着）。
  const p6 = new LocalSearchProvider(() => ({ ...DEFAULT_CONFIG }), web);
  assert.equal(p6.available(), true, 'goat 关闭时 provider 仍必须 available（github/deepseek/wiki 还在）');
  ok('enableGoat 默认 false；goat 关闭不影响 provider 的 available()');
}

console.log('T14 search()：deepseek 报 402 Insufficient Balance → 熔断（余额类错误必须并入凭证类）');
{
  // 回归断言。2026-10-02 之前 deepseek 的熔断正则只有 /api key|credential|account/i，
  // 而官方余额耗尽返回的是 402 "Insufficient Balance" —— 不匹配 ⇒ 不熔断 ⇒ 每搜一次都白打一轮
  // （民警：goat 那侧的正则从一开始就含 balance|insufficient|credit|quota，二者不一致）。
  const balanceWeb = {
    searchProviders: new Map([['deepseek-official', {
      id: 'deepseek-official',
      available: () => true,
      search: async () => { calls.deepseek += 1; throw new Error('402 Insufficient Balance'); },
    }]]),
  };
  const cfg = { ...DEFAULT_CONFIG, aggregatorUrl: `http://127.0.0.1:${server.address().port}`, tokenFile: '', enableGoat: false, deepseekFailureCooldownMs: 600000 };
  const provider = new LocalSearchProvider(() => cfg, balanceWeb);
  provider.searchGithub = async () => [src(1, 'gh')];
  provider.searchAggregator = async () => [src(1, 'wiki')];   // 照 T12 的写法：stub 成 1 条，避开 mock server 本身的 2 条
  calls.deepseek = 0;
  const r1 = await provider.search({ query: 'balance probe one', maxResults: 8 });
  assert.equal(calls.deepseek, 1, '第一次搜索应向 deepseek 发起一次');
  assert.equal(labels(r1.sources), 'github,wiki', 'deepseek 失败但 github/wiki 照常返回');
  await provider.search({ query: 'balance probe two', maxResults: 8 });
  assert.equal(calls.deepseek, 1, '熔断后第二次搜索不应再打 deepseek');
  ok('402 Insufficient Balance → 熔断 600s，不再每搜一次白打官方');
}
server.close();
console.log(`\nselftest: ${passed} 组全部通过`);
