// dsh-plugin-local-search — dsh web_search 的三源并发聚合 provider。
//
// 一次 web_search 调用**同时**发起三路（不是 fallback 链），结果合并成一份列表统一返回：
//   rank 0  GitHub 全站（repos + code + issues；priorityOwner 的仓库在这个来源内部提前）
//   rank 1  DeepSeek 官方搜索（provider id: deepseek-official；Anthropic 兼容 Messages 的
//           native web_search server tool，每搜一次花掉一次 model turn）
//   rank 2  Linux 侧 local-search 聚合器（PocketWiki + 离线 Wikipedia ZIM）
//
// 合并规则见 mergeSources：
//   * 每个来源先吃自己的配额 ceil(maxResults / 来源数)，保证三源都露面；
//   * 剩下的名额按 rank 顺序回填（先 github，再 deepseek，再 wiki）；
//   * 同一 URL 只留 rank 最高的那一份（顺手消掉跨源重复）；
//   * dsh 的 web seam 还会按 request.maxResults 再裁一刀，本 provider 只负责顺序与去重。
//   * interleaveSources: true 改成 round-robin 交错（github1, deepseek1, wiki1, github2, …）。
//
// 三源全空才回退到已注册的 fallbackProviderId（默认 multi-search）。deepseek 已经是并发
// 来源之一，所以 fallback 不能再指向它，否则空结果时会白跑一次 model turn。
//
// 设计参考社区做法：不改 dsh 核心，只通过 ctx.web.registerSearchProvider 替换 provider；
// token 走本地文件，不写进插件配置；GitHub token 优先环境变量，其次 git credential fill。

import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import tls from 'node:tls';
import { spawnSync } from 'node:child_process';

const IS_WIN = process.platform === 'win32';
const HOME = os.homedir();

/** 来源 rank：数字小的排前面（github > goat > deepseek > wiki）。 */
// rank：github > deepseekSearch > goat > deepseek > wiki
// deepseekSearch 直连 JSON API（¥5/1000 次，2026-11-01 前免费），不吃 token，
// 且返回 rerank_score / authority 可做阈值过滤；goat / deepseek 是「一次 model turn 换结果」，贵一个量级。
export const SOURCE_RANK = { github: 0, deepseekSearch: 1, bing: 2, goat: 3, deepseek: 4, wiki: 5 };

const DEFAULT_CONFIG = {
  aggregatorUrl: process.env.LOCAL_SEARCH_AGGREGATOR_URL || 'http://100.79.96.82:8810',
  tokenFile: IS_WIN
    ? `${HOME}/.dsh/local-search-token`
    : `${HOME}/.config/local-search/token`,
  githubTokenFile: IS_WIN ? '' : `${HOME}/.config/local-search/github-token`,

  // 四路来源开关。
  // goat 默认关闭（2026-10-01 决定）：它按 claude-sonnet-5-5 单价计费
  // （账本拟合 $2.00/M input + $10.03/M output，7 行零残差），而 Anthropic
  // server tool 的搜索结果块会被回灌进 context 并按 input token 计费
  // ⇒ 单次 goat 搜索 ~12-21k input tokens ≈ $0.038；dsh-tool-web 的
  // searchMaxQueries 默认 4 ⇒ 最坏 ~$0.15/次用户级搜索。质量更好但不该默认开。
  // 要开启：在 cordis.patch.yml 里显式写 enableGoat: true。
  enableWiki: true,
  enableGithub: true,
  enableDeepseek: true,
  enableGoat: false,
  // DeepSeek Search API（2026-10 上线，自研搜索引擎）——直连 JSON，不经过模型。
  // 文档 https://api-docs.deepseek.com/zh-cn/guides/search
  // 计费：¥5 / 1000 次成功请求（仅 HTTP 200 且 results 非空才计费），count 不影响单价。
  // 2026-11-01 00:00 前免费。QPS 100（账号级）。
  enableDeepseekSearch: true,
  // Bing HTML 搜索：免 key、国内直连（cn.bing.com 可达），用来补足条数。
  // 实测单次给 10 条（RSS 只给 1 条，first=11/21 拿回同样结果 ⇒ 无 cookie 不分页）。
  enableBing: true,

  // ── goat：本地 goat gateway 的 Anthropic server-side web_search ──────────────
  // gateway.mjs 自己只透传，但上游（api.commandcode.ai/provider/v1）在 Anthropic
  // Messages 路由上提供原生 web_search_20250305 server tool。2026-10-01 实测：
  // 只有 claude-sonnet-5-5 可用；其余模型走 /chat/completions，不认 anthropic server tool。
  goatBaseUrl: process.env.GOAT_SEARCH_BASE_URL || 'http://127.0.0.1:8788/v1',
  goatModel: process.env.GOAT_SEARCH_MODEL || 'claude-sonnet-5-5',
  goatApiKeyEnv: 'COMMANDCODE_API_KEY',
  // dsh 的 launch env 不一定继承到插件进程 ⇒ 支持从 .env 文件补读
  goatEnvFile: `${HOME}/.dsh/.env`,
  // 实测一次 6–10s（上游真去搜），给足预算但必须 < dsh-tool-web 的 searchTimeoutMs(60000)
  goatTimeoutMs: 50000,
  // 单次请求内 server tool 最多搜几次
  goatMaxUses: 3,
  goatCacheTtlMs: 120000,
  // 凭证/配置类失败（不会自愈）的熔断时长
  goatFailureCooldownMs: 300000,

  // deepseek 官方 provider 在 dsh 里注册的 id 是 deepseek-official，不是插件的 row id
  deepseekProviderId: 'deepseek-official',
  // 一次 deepseek 搜索 = 一次 Messages model turn，单独给超时预算；
  // 必须小于 dsh-tool-web 的 searchTimeoutMs（web profile 里配的是 60000）。
  // 2026-10-01 实测 40s 会对中文 query 偶发超时 ⇒ 提到 50s
  deepseekTimeoutMs: 50000,
  // 同一 query 的结果短期复用：dsh-tool-web 的 searchMaxQueries 默认 4，4 路并发子查询
  // 若撞上同一 query 就不重复打 model turn。0 = 关闭缓存
  deepseekCacheTtlMs: 120000,
  // 凭证缺失/账号错误这类不会自愈的失败，熔断这么久不再发起（0 = 不熔断）
  deepseekFailureCooldownMs: 600000,

  // ── DeepSeek Search API（POST /v1/tools/search）────────────────────
  deepseekSearchBaseUrl: process.env.DEEPSEEK_SEARCH_BASE_URL || 'https://api.deepseek.com',
  deepseekSearchApiKeyEnv: 'DEEPSEEK_API_KEY',
  // key 只写在 .env 里，dsh 的 launch env 不一定继承到插件进程
  deepseekSearchEnvFile: `${HOME}/.dsh/.env`,
  // count 只影响返回条数（1~50），不影响计费
  deepseekSearchCount: 10,
  // 是否让 API 回传网页正文（Markdown）；false 时 content 恒为空
  deepseekSearchNeedContent: false,
  // rerank_score 阈值：官方口径 >=1.5 为优质；0 = 不过滤
  deepseekSearchMinRerankScore: 0,
  deepseekSearchTimeoutMs: 30000,
  deepseekSearchCacheTtlMs: 120000,
  deepseekSearchFailureCooldownMs: 600000,

  // ── Bing HTML（免 key 兜底源）────────────────────────────────────
  bingBaseUrl: process.env.BING_SEARCH_BASE_URL || 'https://cn.bing.com',
  bingUserAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  bingTimeoutMs: 25000,
  bingCacheTtlMs: 120000,
  bingFailureCooldownMs: 300000,

  timeoutMs: 20000,
  maxResults: 30,

  enableFallback: true,
  fallbackProviderId: 'multi-search',
  interleaveSources: false,
  tagTitles: false,
  priorityOwner: 'TianQue6916',
  githubCaFile: IS_WIN
    ? 'C:/Users/27063/.dev-sidecar/dev-sidecar.ca.crt'
    : `${HOME}/.dev-sidecar/dev-sidecar.ca.crt`,
  insecureTls: true,
};

function readTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return '';
  }
}

function timedSignal(parent, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`timeout after ${timeoutMs}ms`));
  }, timeoutMs);
  timer.unref?.();
  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  if (parent) {
    if (parent.aborted) {
      controller.abort(parent.reason);
    } else {
      const onAbort = () => controller.abort(parent.reason);
      parent.addEventListener('abort', onAbort, { once: true });
      controller.signal.addEventListener('abort', () => parent.removeEventListener('abort', onAbort), { once: true });
    }
  }
  return controller.signal;
}


/**
 * 纯 node:http 的 GET-JSON 助手。
 *
 * 为什么不用 fetch：dsh 跑在 Electron 里，全局 fetch 可能是 Chromium 的 net.fetch，
 * 走的是浏览器网络栈（含系统代理 / PAC）。内网地址 100.79.96.82:8810 经代理必挂，
 * 实机表现就是 `[local-search] wiki source failed: fetch failed`。
 * node:http 是 Node 原生栈，绕开代理，和命令行 curl 的行为一致。
 */
function httpGetJson(urlObj, headers, timeoutMs, parentSignal) {
  // 顺序很重要：先声明全部状态 + 先绑 error handler，再处理 abort / timeout。
  // 否则 AbortSignal 已经 aborted 时，destroy() 会在 error handler 绑定之前发出 'error'，
  // 变成未捕获的 'error' event，直接把进程打挂（实测过）。
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    let req = null;
    let onAbort = null;

    const finish = (fn, val) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (parentSignal && onAbort) parentSignal.removeEventListener?.('abort', onAbort);
      fn(val);
    };
    finish.resolve = (v) => finish(resolve, v);
    finish.reject = (e) => finish(reject, e);

    req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || 80,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
          if (body.length > 8_000_000) {
            if (req) req.destroy();
            finish.reject(new Error('response too large'));
          }
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              finish.resolve(JSON.parse(body));
            } catch (error) {
              finish.reject(new Error(`invalid JSON: ${error.message}`));
            }
            return;
          }
          finish.reject(new Error(`local-search HTTP ${res.statusCode}: ${body.slice(0, 160)}`));
        });
      },
    );

    // 必须在任何 destroy() 之前绑定，否则 'error' 无人接管
    req.on('error', (error) => {
      const cause = error?.cause?.code || error?.code || '';
      finish.reject(new Error(cause ? `${error.message} (${cause})` : error.message));
    });

    onAbort = () => {
      if (req) req.destroy();
      finish.reject(new Error('aborted'));
    };
    if (parentSignal) {
      if (parentSignal.aborted) {
        onAbort();
        return;
      }
      parentSignal.addEventListener('abort', onAbort, { once: true });
    }

    timer = setTimeout(() => {
      if (req) req.destroy();
      finish.reject(new Error(`timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    timer.unref?.();

    req.end();
  });
}



/** 纯 node:https 的 GET-文本助手（给 Bing HTML 用；不走 Chromium 代理栈）。 */
function httpGetText(urlObj, headers, timeoutMs, parentSignal) {
  const lib = urlObj.protocol === 'http:' ? http : https;
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    let req = null;
    let onAbort = null;
    const finish = (fn, val) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (parentSignal && onAbort) parentSignal.removeEventListener?.('abort', onAbort);
      fn(val);
    };
    req = lib.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'http:' ? 80 : 443),
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          try {
            finish(resolve, httpGetText(new URL(res.headers.location, urlObj), headers, timeoutMs, parentSignal));
          } catch (error) {
            finish(reject, error);
          }
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
          if (body.length > 6_000_000) {
            if (req) req.destroy();
            finish(reject, new Error('response too large'));
          }
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            finish(resolve, body);
            return;
          }
          finish(reject, new Error(`HTTP ${res.statusCode}: ${body.slice(0, 160)}`));
        });
      },
    );
    req.on('error', (error) => {
      const cause = error?.cause?.code || error?.code || '';
      finish(reject, new Error(cause ? `${error.message} (${cause})` : error.message));
    });
    onAbort = () => {
      if (req) req.destroy();
      finish(reject, new Error('aborted'));
    };
    if (parentSignal) {
      if (parentSignal.aborted) {
        onAbort();
        return;
      }
      parentSignal.addEventListener('abort', onAbort, { once: true });
    }
    timer = setTimeout(() => {
      if (req) req.destroy();
      finish(reject, new Error(`timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    timer.unref?.();
    req.end();
  });
}

/**
 * 给 wiki 源构造查询变体。
 *
 * 实测（2026-10-25）Linux 侧聚合器用的是英文版 Wikipedia ZIM
 * （wikipedia_en_all_nopic_2026-06.zim）：
 *   query = "DeepSeek V4 模型 参数"      -> 0 条
 *   query = "DeepSeek V4 model parameters" -> 6 条
 *   query = "DeepSeek"                    -> 20 条
 * 中文 query 对英文词条几乎是零命中，所以对含 ASCII 词的混合 query 补一个纯英文变体。
 */
function buildWikiQueryVariants(query) {
  const q = String(query || '').trim();
  if (!q) return [];
  const variants = [q];
  // 去掉非 ASCII 后仍然有 ≥2 个字符的英文片段，才值得单独查一次
  const ascii = q.replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
  if (ascii && ascii !== q && ascii.replace(/[^A-Za-z0-9]/g, '').length >= 2) {
    variants.push(ascii);
  }
  return variants;
}

/**
 * 纯函数：把各来源的结果按 rank 合并成一份列表。
 * groups: [{ source: 'github' | 'deepseek' | 'wiki', sources: [...] }]
 * 返回 { sources, dropped }；dropped > 0 表示有份额被 maxResults 挤掉。
 */
export function mergeSources(groups, maxResults, { interleave = false } = {}) {
  const ordered = [...groups]
    .filter((g) => g && Array.isArray(g.sources))
    .sort((a, b) => (SOURCE_RANK[a.source] ?? 99) - (SOURCE_RANK[b.source] ?? 99));

  const seen = new Set();
  const out = [];
  let dropped = 0;

  const take = (group, source) => {
    if (!source || typeof source.url !== 'string' || !source.url.trim()) return;
    const url = source.url.trim();
    if (seen.has(url)) return;
    if (out.length >= maxResults) {
      dropped += 1;
      return;
    }
    seen.add(url);
    out.push({ ...source, url, source: group.source });
  };

  if (interleave) {
    // round-robin：每轮每个来源各取 1 条，rank 只决定同一轮内的先后
    for (let rank = 0; rank < maxResults; rank += 1) {
      for (const group of ordered) take(group, group.sources[rank]);
    }
  } else {
    // pass 0：每个来源先吃自己的配额，保证三源都露面
    const quota = Math.max(1, Math.ceil(maxResults / Math.max(1, ordered.length)));
    for (const group of ordered) {
      for (let i = 0; i < quota; i += 1) take(group, group.sources[i]);
    }
    // pass 1：剩余名额按 rank 顺序回填
    for (const group of ordered) {
      for (let i = quota; i < group.sources.length; i += 1) take(group, group.sources[i]);
    }
  }

  // pass 1 回填进来的条目可能落在别的来源后面 → 最后按 rank 稳定排序，
  // 输出永远是「github 块 → deepseek 块 → wiki 块」（块内保持各来源自身顺序）。
  // interleave 模式本身就是按轮次交错，不能再按 rank 排。
  if (!interleave) out.sort((a, b) => (SOURCE_RANK[a.source] ?? 99) - (SOURCE_RANK[b.source] ?? 99));

  return { sources: out.slice(0, maxResults), dropped };
}

class LocalSearchProvider {
  constructor(getConfig, web) {
    this.id = 'local-wiki-github';
    this.getConfig = getConfig;
    this.web = web;
    this.githubTokenCache = undefined;
    this.deepseekCache = new Map();
    this.goatCache = new Map();
    // 凭证缺失时的熔断（这类错误不会自愈，不能每搜一次 warn 一次）
    this.deepseekDisabledUntil = 0;
    this.deepseekCooldownWarned = false;
    this.goatDisabledUntil = 0;
    this.goatCooldownWarned = false;
    this.goatKeyCache = undefined;
    this.deepseekSearchCache = new Map();
    this.deepseekSearchDisabledUntil = 0;
    this.deepseekSearchCooldownWarned = false;
    this.deepseekSearchKeyCache = undefined;
    this.bingCache = new Map();
    this.bingDisabledUntil = 0;
    this.bingCooldownWarned = false;
  }

  available() {
    const cfg = this.getConfig();
    if (cfg.enableWiki !== false && cfg.aggregatorUrl) return true;
    if (cfg.enableGithub !== false) return true;
    if (cfg.enableDeepseek !== false) return true;
    if (cfg.enableDeepseekSearch !== false) return true;
    if (cfg.enableBing !== false) return true;
    return cfg.enableGoat !== false && Boolean(cfg.goatBaseUrl);
  }

  async search(request, signal) {
    const cfg = this.getConfig();
    const query = String(request?.query || '');
    // 以配置的 maxResults 为准：dsh-tool-web 传给 provider 的 request.maxResults
    // 是给模型看的建议值（实测恒为 8），若照它 min() 会被压回 8 条，配置调到 30 也没用。
    const configuredMax = Math.max(1, Number(cfg.maxResults || 30));
    const requestedMax = Number(request?.maxResults);
    const maxResults = Number.isFinite(requestedMax) && requestedMax > configuredMax
      ? Math.floor(requestedMax)
      : configuredMax;

    // 四路并发：先只组装 plan，再一把 allSettled —— 单源失败/超时不拖累另外几源
    const plan = [];
    if (cfg.enableWiki !== false && cfg.aggregatorUrl) {
      plan.push({ source: 'wiki', run: () => this.searchAggregator(query, maxResults, signal) });
    }
    if (cfg.enableGithub !== false) {
      plan.push({ source: 'github', run: () => this.searchGithub(query, maxResults, signal) });
    }
    if (cfg.enableDeepseekSearch !== false) {
      if (Date.now() >= (this.deepseekSearchDisabledUntil || 0)) {
        plan.push({ source: 'deepseekSearch', run: () => this.searchDeepseekSearchCached(query, maxResults, signal) });
      } else if (!this.deepseekSearchCooldownWarned) {
        this.deepseekSearchCooldownWarned = true;
        const left = Math.round(((this.deepseekSearchDisabledUntil || 0) - Date.now()) / 1000);
        console.warn(`[local-search] deepseekSearch source skipped for another ${left}s (cooldown after credential failure)`);
      }
    }
    if (cfg.enableBing !== false) {
      if (Date.now() >= (this.bingDisabledUntil || 0)) {
        plan.push({ source: 'bing', run: () => this.searchBingCached(query, maxResults, signal) });
      } else if (!this.bingCooldownWarned) {
        this.bingCooldownWarned = true;
        const left = Math.round(((this.bingDisabledUntil || 0) - Date.now()) / 1000);
        console.warn(`[local-search] bing source skipped for another ${left}s (cooldown)`);
      }
    }
    if (cfg.enableGoat !== false && cfg.goatBaseUrl) {
      if (Date.now() >= (this.goatDisabledUntil || 0)) {
        plan.push({ source: 'goat', run: () => this.searchGoatCached(query, maxResults, signal) });
      } else if (!this.goatCooldownWarned) {
        this.goatCooldownWarned = true;
        const left = Math.round(((this.goatDisabledUntil || 0) - Date.now()) / 1000);
        console.warn(`[local-search] goat source skipped for another ${left}s (cooldown after credential failure)`);
      }
    }
    if (cfg.enableDeepseek !== false) {
      // 熔断期内直接不发起：凭证缺失不是瞬时故障，重试只会白刷日志
      if (Date.now() >= (this.deepseekDisabledUntil || 0)) {
        plan.push({ source: 'deepseek', run: () => this.searchDeepseekCached(query, maxResults, signal) });
      } else if (!this.deepseekCooldownWarned) {
        this.deepseekCooldownWarned = true;
        const left = Math.round(((this.deepseekDisabledUntil || 0) - Date.now()) / 1000);
        console.warn(`[local-search] deepseek source skipped for another ${left}s (cooldown after credential failure)`);
      }
    }

    const settled = await Promise.allSettled(plan.map((entry) => entry.run()));
    try { console.warn("[local-search] probe " + plan.map((e,i) => e.source + "=" + (settled[i].status === "fulfilled" ? (Array.isArray(settled[i].value) ? settled[i].value.length : "nonarray") : "ERR:" + String(settled[i].reason && settled[i].reason.message || settled[i].reason).slice(0,90))).join(" ") + " max=" + maxResults + " req=" + String(request && request.maxResults)); } catch (e) {}
    const groups = [];
    plan.forEach((entry, index) => {
      const outcome = settled[index];
      if (outcome.status === 'fulfilled') {
        const sources = Array.isArray(outcome.value) ? outcome.value : [];
        groups.push({ source: entry.source, sources: sources.map((s) => ({ ...s, source: entry.source })) });
        // 一旦成功就解除熔断
        if (entry.source === 'goat') {
          this.goatDisabledUntil = 0;
          this.goatCooldownWarned = false;
        }
        if (entry.source === 'deepseek') {
          this.deepseekDisabledUntil = 0;
          this.deepseekCooldownWarned = false;
        }
        if (entry.source === 'deepseekSearch') {
          this.deepseekSearchDisabledUntil = 0;
          this.deepseekSearchCooldownWarned = false;
        }
        if (entry.source === 'bing') {
          this.bingDisabledUntil = 0;
          this.bingCooldownWarned = false;
        }
        return;
      }
      const reason = String(outcome.reason?.message || outcome.reason);
      console.warn(`[local-search] ${entry.source} source failed: ${reason}`);
      if (entry.source === 'goat' && /api key|credential|401|403|account|not registered|credit|quota|balance|insufficient/i.test(reason)) {
        const cooldown = Number(cfg.goatFailureCooldownMs ?? 300000);
        if (cooldown > 0) {
          this.goatDisabledUntil = Date.now() + cooldown;
          this.goatCooldownWarned = false;
          console.warn(`[local-search] goat source paused for ${Math.round(cooldown / 1000)}s: ${reason}`);
        }
      }
      if (entry.source === 'deepseek' && /api key|credential|401|403|account|not registered|credit|quota|balance|insufficient/i.test(reason)) {
        const cooldown = Number(cfg.deepseekFailureCooldownMs ?? 600000);
        if (cooldown > 0) {
          this.deepseekDisabledUntil = Date.now() + cooldown;
          this.deepseekCooldownWarned = false;
          console.warn(`[local-search] deepseek source paused for ${Math.round(cooldown / 1000)}s: ${reason}`);
        }
      }
      if (entry.source === 'bing' && /HTTP 4\d\d|ECONN|ETIMEDOUT|ENOTFOUND/i.test(reason)) {
        const cooldown = Number(cfg.bingFailureCooldownMs ?? 300000);
        if (cooldown > 0) {
          this.bingDisabledUntil = Date.now() + cooldown;
          this.bingCooldownWarned = false;
          console.warn(`[local-search] bing source paused for ${Math.round(cooldown / 1000)}s: ${reason}`);
        }
      }
      if (entry.source === 'deepseekSearch' && /api key|credential|401|402|403|balance|insufficient/i.test(reason)) {
        const cooldown = Number(cfg.deepseekSearchFailureCooldownMs ?? 600000);
        if (cooldown > 0) {
          this.deepseekSearchDisabledUntil = Date.now() + cooldown;
          this.deepseekSearchCooldownWarned = false;
          console.warn(`[local-search] deepseekSearch source paused for ${Math.round(cooldown / 1000)}s: ${reason}`);
        }
      }
    });

    const merged = mergeSources(groups, maxResults, { interleave: cfg.interleaveSources === true });
    if (merged.sources.length > 0) {
      if (cfg.tagTitles === true) {
        for (const source of merged.sources) {
          if (source.title) source.title = `[${source.source}] ${source.title}`;
        }
      }
      return { sources: merged.sources, truncated: merged.dropped > 0 };
    }

    // 全部来源都空 → 才回退到别的已注册 provider
    const fallbackId = String(cfg.fallbackProviderId || '');
    const deepseekQueried = plan.some((entry) => entry.source === 'deepseek');
    const fallbackAllowed =
      cfg.enableFallback !== false &&
      fallbackId.length > 0 &&
      fallbackId !== this.id &&
      !(deepseekQueried && fallbackId === (cfg.deepseekProviderId || 'deepseek-official'));
    if (fallbackAllowed) {
      const fallback = this.web?.searchProviders?.get(fallbackId);
      if (
        fallback &&
        typeof fallback.search === 'function' &&
        (typeof fallback.available !== 'function' || fallback.available())
      ) {
        return await fallback.search({ ...request, maxResults }, signal);
      }
      console.warn(`[local-search] fallback provider "${fallbackId}" is not registered or unusable; returning empty`);
    }

    return { sources: [], truncated: false };
  }

  localSearchToken() {
    const cfg = this.getConfig();
    return process.env.LOCAL_SEARCH_TOKEN || readTextFile(cfg.tokenFile);
  }

  async searchAggregator(query, maxResults, signal) {
    const cfg = this.getConfig();
    const token = this.localSearchToken();
    if (!token) throw new Error(`missing local-search token (${cfg.tokenFile})`);

    const variants = buildWikiQueryVariants(query);
    if (variants.length === 0) return [];

    // 每个变体各查一次（内网免费，成本只在延迟），按 URL 去重后合并
    const settle = await Promise.allSettled(
      variants.map((variantQuery) => {
        const url = new URL('/search', cfg.aggregatorUrl);
        url.searchParams.set('q', variantQuery);
        url.searchParams.set('max', String(maxResults));
        // 用 node:http 而不是 fetch —— 见 httpGetJson 注释（Electron 的 fetch 走代理，内网必挂）
        return httpGetJson(
          url,
          { 'x-local-search-token': token },
          Number(cfg.timeoutMs || 20000),
          signal,
        );
      }),
    );

    const seen = new Set();
    const merged = [];
    let firstError = null;
    for (const outcome of settle) {
      if (outcome.status !== 'fulfilled') {
        if (!firstError) firstError = outcome.reason;
        continue;
      }
      const list = Array.isArray(outcome.value?.sources) ? outcome.value.sources : [];
      for (const item of list) {
        const key = String(item?.url || '').trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
      }
    }
    // 全部变体都失败才抛错；只要有一个成功就返回已拿到的
    if (merged.length === 0 && firstError) throw firstError;
    return merged;
  }

  // ── goat：本地 gateway 的 Anthropic server-side web_search ──────────────────
  // 与 deepseek 那一路同机制（Messages + web_search_20250305），只是 baseURL/model/key 不同。
  goatApiKey() {
    if (this.goatKeyCache !== undefined) return this.goatKeyCache;
    const cfg = this.getConfig();
    const envName = String(cfg.goatApiKeyEnv || 'COMMANDCODE_API_KEY');
    const fromEnv = process.env[envName];
    if (fromEnv) return (this.goatKeyCache = fromEnv.trim());
    // dsh 的 launch env 未必继承到插件进程 ⇒ 退回 .env 文件
    const envFile = cfg.goatEnvFile;
    if (envFile) {
      const raw = readTextFile(envFile);
      for (const line of raw.split(/\r?\n/)) {
        const i = line.indexOf('=');
        if (i <= 0) continue;
        if (line.slice(0, i).trim() === envName) {
          const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
          if (value) return (this.goatKeyCache = value);
        }
      }
    }
    return (this.goatKeyCache = '');
  }

  async searchGoat(query, maxResults, signal) {
    const cfg = this.getConfig();
    const key = this.goatApiKey();
    if (!key) throw new Error(`missing goat API key (env ${cfg.goatApiKeyEnv} / file ${cfg.goatEnvFile})`);
    const maxUses = Math.max(1, Number(cfg.goatMaxUses ?? 3));
    const body = {
      model: cfg.goatModel || 'claude-sonnet-5-5',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `${query}\n\nAnswer concisely using the web search results, and cite the sources.`,
        },
      ],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxUses }],
    };
    const endpoint = new URL('messages', String(cfg.goatBaseUrl).replace(/\/?$/, '/'));
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': key,
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: timedSignal(signal, cfg.goatTimeoutMs || 50000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const error = new Error(`goat search HTTP ${response.status}: ${detail.slice(0, 200)}`);
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    const blocks = Array.isArray(payload?.content) ? payload.content : [];
    const sources = [];
    const seen = new Set();
    // snippet 来源：text 块里的 citations[]，按 url 索引（与 deepseek provider 同一手法）
    const snippets = new Map();
    for (const block of blocks) {
      if (block?.type !== 'text') continue;
      for (const cite of block.citations ?? []) {
        if (cite?.url && cite?.cited_text && !snippets.has(cite.url)) snippets.set(cite.url, cite.cited_text);
      }
    }
    for (const block of blocks) {
      if (block?.type !== 'web_search_tool_result') continue;
      for (const item of block.content ?? []) {
        if (item?.type !== 'web_search_result' || !item.url || seen.has(item.url)) continue;
        seen.add(item.url);
        const source = { url: item.url, provider: 'goat' };
        if (item.title) source.title = item.title;
        const snippet = snippets.get(item.url);
        if (snippet) source.snippet = String(snippet).replace(/\s+/g, ' ').trim().slice(0, 300);
        if (item.page_age) source.publishedAt = item.page_age;
        sources.push(source);
      }
    }
    return sources.slice(0, Math.max(maxResults, 4));
  }

  async searchGoatCached(query, maxResults, signal) {
    const cfg = this.getConfig();
    const ttl = Number(cfg.goatCacheTtlMs ?? 120000);
    if (!(ttl > 0)) return await this.searchGoat(query, maxResults, signal);
    const key = `goat\u0000${maxResults}\u0000${query}`;
    const now = Date.now();
    const hit = this.goatCache.get(key);
    if (hit && now - hit.at < ttl) return await hit.promise;
    const promise = this.searchGoat(query, maxResults, signal).catch((error) => {
      this.goatCache.delete(key);
      throw error;
    });
    this.goatCache.set(key, { at: now, promise });
    if (this.goatCache.size > 32) {
      for (const [k, v] of this.goatCache) if (now - v.at >= ttl) this.goatCache.delete(k);
    }
    return await promise;
  }

  // ── DeepSeek 官方搜索：直接调 provider 对象，不走 ctx.web.search（否则 seam 会再选一次）──
  resolveDeepseekProvider(cfg) {
    const registry = this.web?.searchProviders;
    if (!registry || typeof registry.get !== 'function') return undefined;
    const candidates = [cfg.deepseekProviderId, 'deepseek-official', 'web-search-deepseek'].filter(Boolean);
    for (const id of candidates) {
      const provider = registry.get(id);
      if (provider && typeof provider.search === 'function') return provider;
    }
    return undefined;
  }

  async searchDeepseek(query, maxResults, signal) {
    const cfg = this.getConfig();
    const provider = this.resolveDeepseekProvider(cfg);
    if (!provider) {
      throw new Error(
        `deepseek provider not registered (tried "${cfg.deepseekProviderId}", "deepseek-official", "web-search-deepseek")`,
      );
    }
    if (typeof provider.available === 'function' && !provider.available()) {
      throw new Error('deepseek provider is registered but unavailable (missing API key / credential)');
    }
    const result = await provider.search(
      { query, maxResults },
      timedSignal(signal, cfg.deepseekTimeoutMs || 40000),
    );
    const sources = Array.isArray(result?.sources) ? result.sources : [];
    return sources.map((source) => ({ provider: 'deepseek-official', ...source }));
  }

  async searchDeepseekCached(query, maxResults, signal) {
    const cfg = this.getConfig();
    const ttl = Number(cfg.deepseekCacheTtlMs ?? 120000);
    if (!(ttl > 0)) return await this.searchDeepseek(query, maxResults, signal);

    const key = `${maxResults}\u0000${query}`;
    const now = Date.now();
    const hit = this.deepseekCache.get(key);
    if (hit && now - hit.at < ttl) return await hit.promise;

    const promise = this.searchDeepseek(query, maxResults, signal).catch((error) => {
      this.deepseekCache.delete(key);
      throw error;
    });
    this.deepseekCache.set(key, { at: now, promise });
    if (this.deepseekCache.size > 32) {
      for (const [k, v] of this.deepseekCache) if (now - v.at >= ttl) this.deepseekCache.delete(k);
    }
    return await promise;
  }

  // ── DeepSeek Search API：POST /v1/tools/search ──────────────────────────
  // 官方文档 https://api-docs.deepseek.com/zh-cn/guides/search
  // 与 searchDeepseek 的根本区别：那条路让模型跑一轮搜索（吃 input token），
  // 这条是纯 JSON 检索（按成功请求计费 ¥5/1000 次，2026-11-01 00:00 前免费）。
  // 响应字段：rerank_score(0~3，>=1.5 优质) / title / url / snippet / summary(600~800字)
  //           / content(need_content=true 时) / site_name / site_icon / date / authority(0~4)
  // 计费口径：只有 HTTP 200 且 results 非空才计费，count 不影响单价；QPS 100（账号级）
  deepseekSearchApiKey() {
    if (this.deepseekSearchKeyCache !== undefined) return this.deepseekSearchKeyCache;
    const cfg = this.getConfig();
    const envName = String(cfg.deepseekSearchApiKeyEnv || 'DEEPSEEK_API_KEY');
    const fromEnv = process.env[envName];
    if (fromEnv) return (this.deepseekSearchKeyCache = fromEnv.trim());
    const envFile = cfg.deepseekSearchEnvFile || cfg.goatEnvFile;
    if (envFile) {
      const raw = readTextFile(envFile);
      for (const line of raw.split(/\r?\n/)) {
        const i = line.indexOf('=');
        if (i <= 0) continue;
        if (line.slice(0, i).trim() === envName) {
          const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
          if (value) return (this.deepseekSearchKeyCache = value);
        }
      }
    }
    return (this.deepseekSearchKeyCache = '');
  }

  async searchDeepseekSearch(query, maxResults, signal) {
    const cfg = this.getConfig();
    const key = this.deepseekSearchApiKey();
    if (!key) {
      throw new Error(
        `missing DeepSeek API key (env ${cfg.deepseekSearchApiKeyEnv || 'DEEPSEEK_API_KEY'} / file ${cfg.deepseekSearchEnvFile || cfg.goatEnvFile})`,
      );
    }
    const count = Math.max(1, Math.min(Number(cfg.deepseekSearchCount ?? 10), 50));
    const body = {
      query: String(query).slice(0, 128),
      count,
      need_content: cfg.deepseekSearchNeedContent === true,
    };
    const base = String(cfg.deepseekSearchBaseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
    const response = await fetch(`${base}/v1/tools/search`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: timedSignal(signal, cfg.deepseekSearchTimeoutMs || 30000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const error = new Error(`DeepSeek search HTTP ${response.status}: ${detail.slice(0, 200)}`);
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    const results = Array.isArray(payload?.results) ? payload.results : [];
    const minScore = Number(cfg.deepseekSearchMinRerankScore ?? 0);
    const sources = [];
    for (const item of results) {
      if (!item || typeof item.url !== 'string' || !item.url) continue;
      const score = Number(item.rerank_score);
      // 设了阈值就必须「有分数且达标」；无分数视为不合格，否则阈值形同虚设
      if (minScore > 0 && !(Number.isFinite(score) && score >= minScore)) continue;
      const source = {
        url: item.url,
        provider: 'deepseek-search',
        title: String(item.title || item.url),
        snippet: String(item.summary || item.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 400),
      };
      if (item.date) source.publishedAt = String(item.date);
      if (item.site_name) source.siteName = String(item.site_name);
      if (Number.isFinite(score)) source.rerankScore = score;
      const authority = Number(item.authority);
      if (Number.isFinite(authority) && authority >= 0) source.authority = authority;
      if (item.content) source.content = String(item.content);
      sources.push(source);
    }
    // 稳定降序：rerank_score 高的在前；无分数的排最后并保持原顺序
    sources.sort((a, b) => {
      const av = a.rerankScore === undefined ? -1 : a.rerankScore;
      const bv = b.rerankScore === undefined ? -1 : b.rerankScore;
      return bv - av;
    });
    return sources;
  }

  async searchDeepseekSearchCached(query, maxResults, signal) {
    const cfg = this.getConfig();
    const ttl = Number(cfg.deepseekSearchCacheTtlMs ?? 120000);
    if (!(ttl > 0)) return await this.searchDeepseekSearch(query, maxResults, signal);
    const key = `dss\u0000${maxResults}\u0000${query}`;
    const now = Date.now();
    const hit = this.deepseekSearchCache.get(key);
    if (hit && now - hit.at < ttl) return await hit.promise;
    const promise = this.searchDeepseekSearch(query, maxResults, signal).catch((error) => {
      this.deepseekSearchCache.delete(key);
      throw error;
    });
    this.deepseekSearchCache.set(key, { at: now, promise });
    if (this.deepseekSearchCache.size > 32) {
      for (const [k, v] of this.deepseekSearchCache) if (now - v.at >= ttl) this.deepseekSearchCache.delete(k);
    }
    return await promise;
  }


  // ── Bing HTML（免 key 兜底源）──────────────────────────────────────────
  // cn.bing.com 国内可直连（不走代理），HTML 里 <li class="b_algo"> 是结果块。
  // 单次 10 条；RSS 只给 1 条，first=11/21 拿回同样结果（无 cookie 时分页失效）。
  async searchBing(query, maxResults, signal) {
    const cfg = this.getConfig();
    const base = String(cfg.bingBaseUrl || 'https://cn.bing.com').replace(/\/+$/, '');
    const url = new URL('/search', base);
    url.searchParams.set('q', String(query).slice(0, 200));
    url.searchParams.set('count', String(Math.max(10, Math.min(Number(maxResults) || 10, 50))));
    const html = await httpGetText(
      url,
      {
        'user-agent': cfg.bingUserAgent || 'Mozilla/5.0',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      Number(cfg.bingTimeoutMs || 25000),
      signal,
    );

    const decode = (s) =>
      String(s)
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const out = [];
    const seen = new Set();
    for (const block of html.split('<li class="b_algo"').slice(1)) {
      const m = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block);
      if (!m) continue;
      const url = m[1];
      if (!/^https?:/i.test(url) || seen.has(url)) continue;
      seen.add(url);
      const source = { url, provider: 'bing', title: decode(m[2]) || url };
      const sn = /<p[^>]*>([\s\S]*?)<\/p>/.exec(block);
      if (sn) {
        const snippet = decode(sn[1]);
        if (snippet) source.snippet = snippet.slice(0, 400);
      }
      out.push(source);
    }
    return out;
  }

  async searchBingCached(query, maxResults, signal) {
    const cfg = this.getConfig();
    const ttl = Number(cfg.bingCacheTtlMs ?? 120000);
    if (!(ttl > 0)) return await this.searchBing(query, maxResults, signal);
    const key = `bing\u0000${maxResults}\u0000${query}`;
    const now = Date.now();
    const hit = this.bingCache.get(key);
    if (hit && now - hit.at < ttl) return await hit.promise;
    const promise = this.searchBing(query, maxResults, signal).catch((error) => {
      this.bingCache.delete(key);
      throw error;
    });
    this.bingCache.set(key, { at: now, promise });
    if (this.bingCache.size > 32) {
      for (const [k, v] of this.bingCache) if (now - v.at >= ttl) this.bingCache.delete(k);
    }
    return await promise;
  }

  githubToken() {
    if (this.githubTokenCache !== undefined) return this.githubTokenCache;
    const cfg = this.getConfig();
    const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PAT;
    if (envToken) return (this.githubTokenCache = envToken);
    if (cfg.githubTokenFile) {
      const fileToken = readTextFile(cfg.githubTokenFile);
      if (fileToken) return (this.githubTokenCache = fileToken);
    }
    try {
      const result = spawnSync('git', ['credential', 'fill'], {
        input: 'protocol=https\nhost=github.com\n\n',
        encoding: 'utf8',
        timeout: 5000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });
      if (result.status === 0) {
        const match = /(?:^|\n)password=(.+)/.exec(result.stdout || '');
        if (match && match[1].trim()) return (this.githubTokenCache = match[1].trim());
      }
    } catch {
      // ignore
    }
    return (this.githubTokenCache = '');
  }

  githubJson(path, signal, accept = 'application/vnd.github+json') {
    const cfg = this.getConfig();
    const token = this.githubToken();
    let ca;
    try {
      if (cfg.githubCaFile) ca = [...tls.rootCertificates, fs.readFileSync(cfg.githubCaFile, 'utf8')];
    } catch {
      ca = undefined;
    }
    return new Promise((resolve, reject) => {
      const headers = {
        'User-Agent': 'dsh-plugin-local-search/0.2',
        Accept: accept,
        'X-GitHub-Api-Version': '2022-11-28',
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      const req = https.request(
        {
          hostname: 'api.github.com',
          path,
          method: 'GET',
          headers,
          ca,
          rejectUnauthorized: ca !== undefined ? true : cfg.insecureTls === false,
        },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(body));
              } catch (error) {
                reject(error);
              }
              return;
            }
            const error = new Error(`GitHub HTTP ${res.statusCode}: ${body.slice(0, 180)}`);
            error.status = res.statusCode;
            reject(error);
          });
        },
      );
      req.on('error', reject);
      if (signal) {
        if (signal.aborted) {
          req.destroy(new Error('aborted'));
          return;
        }
        const onAbort = () => req.destroy(new Error('aborted'));
        signal.addEventListener('abort', onAbort, { once: true });
        req.on('close', () => signal.removeEventListener('abort', onAbort));
      }
      req.end();
    });
  }

  async searchGithub(query, maxResults, signal) {
    const cfg = this.getConfig();
    const token = this.githubToken();
    const timeoutSignal = timedSignal(signal, cfg.timeoutMs || 20000);
    const sources = [];

    // 1) 仓库：全 GitHub
    try {
      const data = await this.githubJson(
        `/search/repositories?q=${encodeURIComponent(query)}&per_page=${Math.min(5, maxResults)}`,
        timeoutSignal,
      );
      for (const item of data.items || []) {
        sources.push({
          url: item.html_url,
          title: `${item.full_name}${item.language ? ` · ${item.language}` : ''}`,
          snippet: `${item.description || ''}${item.stargazers_count != null ? ` ★${item.stargazers_count}` : ''}`.trim(),
          provider: 'github',
        });
      }
    } catch (error) {
      console.warn(`[local-search] github repo search failed: ${error?.message || error}`);
    }

    // 2) 代码：有 token 才走 code search（GitHub 要求认证，且限流更紧）
    if (token) {
      try {
        const data = await this.githubJson(
          `/search/code?q=${encodeURIComponent(query)}&per_page=${Math.min(5, maxResults)}`,
          timeoutSignal,
          'application/vnd.github.text-match+json',
        );
        for (const item of data.items || []) {
          const repo = item.repository?.full_name || '';
          const fragment = (item.text_matches || [])
            .map((m) => String(m.fragment || '').replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .join(' … ');
          sources.push({
            url: item.html_url,
            title: `${repo} / ${item.path || ''}`,
            snippet: fragment.slice(0, 300),
            provider: 'github',
          });
        }
      } catch (error) {
        console.warn(`[local-search] github code search failed: ${error?.message || error}`);
      }
    }

    // 3) Issues / Discussions：补充问答类结果
    try {
      const data = await this.githubJson(
        `/search/issues?q=${encodeURIComponent(query)}&per_page=${Math.min(4, maxResults)}`,
        timeoutSignal,
      );
      for (const item of data.items || []) {
        if (!item.html_url) continue;
        sources.push({
          url: item.html_url,
          title: `[GitHub] ${item.title || ''}`,
          snippet: String(item.body || '').replace(/\s+/g, ' ').trim().slice(0, 220),
          provider: 'github',
        });
      }
    } catch (error) {
      console.warn(`[local-search] github issue search failed: ${error?.message || error}`);
    }

    // 自己的仓库优先，其余保持 GitHub 返回顺序
    const owner = String(cfg.priorityOwner || '').toLowerCase();
    if (owner) {
      sources.sort((a, b) => {
        const aOwn = a.url.toLowerCase().includes(`github.com/${owner}/`) ? 0 : 1;
        const bOwn = b.url.toLowerCase().includes(`github.com/${owner}/`) ? 0 : 1;
        return aOwn - bOwn;
      });
    }
    return sources;
  }
}

export const name = 'local-search';
export const inject = ['web'];
export { LocalSearchProvider, DEFAULT_CONFIG };

export function apply(ctx, initialConfig = {}) {
  const config = { ...DEFAULT_CONFIG, ...(initialConfig || {}) };
  ctx.inject(['web'], (wctx) => {
    const provider = new LocalSearchProvider(() => config, wctx.web);
    wctx.web.registerSearchProvider(provider);
  });
}
