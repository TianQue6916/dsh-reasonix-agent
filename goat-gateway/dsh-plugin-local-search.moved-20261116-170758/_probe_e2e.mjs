import { LocalSearchProvider, DEFAULT_CONFIG } from './index.js';

// 模拟生产 profile patch 的开关（bundle 里 enableDeepseek/enableGoat 默认 false，patch 再确认）
const cfg = { ...DEFAULT_CONFIG, enableDeepseek: false, enableGoat: false, interleaveSources: true, maxResults: 74 };
const web = { searchProviders: new Map() };
const p = new LocalSearchProvider(() => cfg, web);

const query = process.argv[2] || '拉格朗日乘子的几何意义';
const t0 = Date.now();
const res = await p.search({ query, maxResults: 74 });
const ms = Date.now() - t0;

const by = {};
for (const s of res.sources) by[s.source] = (by[s.source] || 0) + 1;
console.log(`query=${JSON.stringify(query)}  ${ms}ms  total=${res.sources.length}  truncated=${res.truncated}`);
console.log('by source:', JSON.stringify(by));
console.log('顺序前 12:', res.sources.slice(0, 12).map((s) => s.source).join(' → '));
for (const it of res.sources.slice(0, 8)) console.log(`  [${it.source}] ${String(it.title).slice(0, 60)}`);
