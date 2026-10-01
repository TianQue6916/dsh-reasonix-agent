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
import https from 'node:https';
import os from 'node:os';
import tls from 'node:tls';
import { spawnSync } from 'node:child_process';

const IS_WIN = process.platform === 'win32';
const HOME = os.homedir();

/** 来源 rank：数字小的排前面（github > goat > deepseek > wiki）。 */
export const SOURCE_RANK = { github: 0, goat: 1, deepseek: 2, wiki: 3 };

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

  timeoutMs: 20000,
  maxResults: 8,

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
  }

  available() {
    const cfg = this.getConfig();
    if (cfg.enableWiki !== false && cfg.aggregatorUrl) return true;
    if (cfg.enableGithub !== false) return true;
    if (cfg.enableDeepseek !== false) return true;
    return cfg.enableGoat !== false && Boolean(cfg.goatBaseUrl);
  }

  async search(request, signal) {
    const cfg = this.getConfig();
    const query = String(request?.query || '');
    const maxResults = Math.max(
      1,
      Math.min(Number(request?.maxResults || cfg.maxResults || 8), Number(cfg.maxResults || 8)),
    );

    // 四路并发：先只组装 plan，再一把 allSettled —— 单源失败/超时不拖累另外几源
    const plan = [];
    if (cfg.enableWiki !== false && cfg.aggregatorUrl) {
      plan.push({ source: 'wiki', run: () => this.searchAggregator(query, maxResults, signal) });
    }
    if (cfg.enableGithub !== false) {
      plan.push({ source: 'github', run: () => this.searchGithub(query, maxResults, signal) });
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
      if (entry.source === 'deepseek' && /api key|credential|account/i.test(reason)) {
        const cooldown = Number(cfg.deepseekFailureCooldownMs ?? 600000);
        if (cooldown > 0) {
          this.deepseekDisabledUntil = Date.now() + cooldown;
          this.deepseekCooldownWarned = false;
          console.warn(`[local-search] deepseek source paused for ${Math.round(cooldown / 1000)}s: ${reason}`);
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
    const url = new URL('/search', cfg.aggregatorUrl);
    url.searchParams.set('q', query);
    url.searchParams.set('max', String(maxResults));
    const response = await fetch(url, {
      headers: { 'x-local-search-token': token },
      signal: timedSignal(signal, cfg.timeoutMs || 20000),
    });
    if (!response.ok) throw new Error(`local-search HTTP ${response.status}`);
    const data = await response.json();
    return Array.isArray(data.sources) ? data.sources : [];
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
