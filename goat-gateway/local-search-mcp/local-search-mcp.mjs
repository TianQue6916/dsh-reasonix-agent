#!/usr/bin/env node
// local-search-mcp — reasonix 用的本地搜索 MCP server（stdio，newline-delimited JSON-RPC）。
//
// 工具：
//   web_search(query, max_results) -> 本地 wiki 优先 + 全 GitHub，返回 Markdown 来源列表
//
// 本地 wiki 来自 Linux local-search 聚合器（PocketWiki + 离线 Wikipedia ZIM）；
// GitHub 走 GitHub Search API（repositories + code + issues）。

import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import tls from 'node:tls';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline';

const IS_WIN = process.platform === 'win32';
const HOME = os.homedir();

const CONFIG = {
  aggregatorUrl: process.env.LOCAL_SEARCH_AGGREGATOR_URL || 'http://100.79.96.82:8810',
  tokenFile: process.env.LOCAL_SEARCH_TOKEN_FILE || (IS_WIN ? `${HOME}/.dsh/local-search-token` : `${HOME}/.config/local-search/token`),
  githubTokenFile: process.env.GITHUB_TOKEN_FILE || (IS_WIN ? '' : `${HOME}/.config/local-search/github-token`),
  githubCaFile: process.env.GITHUB_CA_FILE || (IS_WIN ? 'C:/Users/27063/.dev-sidecar/dev-sidecar.ca.crt' : `${HOME}/.dev-sidecar/dev-sidecar.ca.crt`),
  insecureTls: process.env.GITHUB_INSECURE_TLS !== '0',
  timeoutMs: Number(process.env.LOCAL_SEARCH_TIMEOUT_MS || 20000),
  maxResults: Number(process.env.LOCAL_SEARCH_MAX_RESULTS || 8),
  priorityOwner: process.env.GITHUB_PRIORITY_OWNER || 'TianQue6916',
};

function readTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return '';
  }
}

function log(...args) {
  process.stderr.write(`[local-search-mcp] ${args.join(' ')}\n`);
}

function timedSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  timer.unref?.();
  return controller.signal;
}

async function searchAggregator(query, maxResults) {
  const token = readTextFile(CONFIG.tokenFile);
  if (!token) throw new Error(`missing local-search token: ${CONFIG.tokenFile}`);
  const url = new URL('/search', CONFIG.aggregatorUrl);
  url.searchParams.set('q', query);
  url.searchParams.set('max', String(maxResults));
  const response = await fetch(url, {
    headers: { 'x-local-search-token': token },
    signal: timedSignal(CONFIG.timeoutMs),
  });
  if (!response.ok) throw new Error(`local-search HTTP ${response.status}`);
  const data = await response.json();
  return Array.isArray(data.sources) ? data.sources : [];
}

let githubTokenCache;
function githubToken() {
  if (githubTokenCache !== undefined) return githubTokenCache;
  const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PAT;
  if (envToken) return (githubTokenCache = envToken);
  if (CONFIG.githubTokenFile) {
    const token = readTextFile(CONFIG.githubTokenFile);
    if (token) return (githubTokenCache = token);
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
      if (match && match[1].trim()) return (githubTokenCache = match[1].trim());
    }
  } catch {
    // ignore
  }
  return (githubTokenCache = '');
}

function githubJson(path, accept = 'application/vnd.github+json') {
  const token = githubToken();
  let ca;
  try {
    if (CONFIG.githubCaFile) ca = [...tls.rootCertificates, fs.readFileSync(CONFIG.githubCaFile, 'utf8')];
  } catch {
    ca = undefined;
  }
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'local-search-mcp/0.1',
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
        rejectUnauthorized: ca !== undefined ? true : CONFIG.insecureTls !== true,
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
          const error = new Error(`GitHub HTTP ${res.statusCode}: ${body.slice(0, 200)}`);
          error.status = res.statusCode;
          reject(error);
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(CONFIG.timeoutMs, () => req.destroy(new Error('GitHub request timeout')));
    req.end();
  });
}

async function searchGithub(query, maxResults) {
  const token = githubToken();
  const sources = [];
  try {
    const data = await githubJson(`/search/repositories?q=${encodeURIComponent(query)}&per_page=${Math.min(5, maxResults)}`);
    for (const item of data.items || []) {
      sources.push({
        url: item.html_url,
        title: `${item.full_name}${item.language ? ` · ${item.language}` : ''}`,
        snippet: `${item.description || ''}${item.stargazers_count != null ? ` ★${item.stargazers_count}` : ''}`.trim(),
        provider: 'github',
      });
    }
  } catch (error) {
    log(`github repo search failed: ${error.message}`);
  }
  if (token) {
    try {
      const data = await githubJson(
        `/search/code?q=${encodeURIComponent(query)}&per_page=${Math.min(5, maxResults)}`,
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
      log(`github code search failed: ${error.message}`);
    }
  }
  try {
    const data = await githubJson(`/search/issues?q=${encodeURIComponent(query)}&per_page=${Math.min(4, maxResults)}`);
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
    log(`github issue search failed: ${error.message}`);
  }
  const owner = String(CONFIG.priorityOwner || '').toLowerCase();
  if (owner) {
    sources.sort((a, b) => {
      const aOwn = a.url.toLowerCase().includes(`github.com/${owner}/`) ? 0 : 1;
      const bOwn = b.url.toLowerCase().includes(`github.com/${owner}/`) ? 0 : 1;
      return aOwn - bOwn;
    });
  }
  return sources;
}

function dedupe(sources, maxResults) {
  const seen = new Set();
  const out = [];
  for (const source of sources) {
    if (!source || !source.url || seen.has(source.url)) continue;
    seen.add(source.url);
    out.push(source);
    if (out.length >= maxResults) break;
  }
  return out;
}

async function webSearch(query, maxResults = CONFIG.maxResults) {
  const max = Math.max(1, Math.min(Number(maxResults) || CONFIG.maxResults, 20));
  let sources = [];
  try {
    sources.push(...(await searchAggregator(query, Math.max(1, Math.ceil(max / 2)))));
  } catch (error) {
    log(`aggregator failed: ${error.message}`);
  }
  if (sources.length < max) {
    try {
      sources.push(...(await searchGithub(query, max)));
    } catch (error) {
      log(`github failed: ${error.message}`);
    }
  }
  sources = dedupe(sources, max);
  if (!sources.length) return '本地离线维基 / PocketWiki 与 GitHub 全站都没有找到结果。';
  const lines = sources.map((s, index) => {
    const tag = s.provider === 'wikipedia' ? '离线维基' : s.provider === 'pocketwiki' ? 'PocketWiki' : 'GitHub';
    return `${index + 1}. [${tag}] [${s.title || s.url}](${s.url})\n   ${s.snippet || ''}`;
  });
  return `本地 wiki 优先 / 全 GitHub 搜索：${query}\n\n${lines.join('\n')}\n`;
}

const TOOLS = [
  {
    name: 'web_search',
    description:
      '本地优先搜索：先查 Linux 上的离线 Wikipedia / PocketWiki，再查 GitHub 全站（repositories/code/issues）。' +
      '涉及百科、课程笔记、代码、开源项目时优先使用本工具；只有这里没有结果时才用 exa / parallel / nothumansearch。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        max_results: { type: 'integer', description: '返回结果数，默认 8，最大 20' },
      },
      required: ['query'],
    },
  },
];

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', async (line) => {
  const text = line.trim();
  if (!text) return;
  let request;
  try {
    request = JSON.parse(text);
  } catch (error) {
    log(`invalid JSON: ${error.message}`);
    return;
  }
  const { id, method, params } = request;
  try {
    if (method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: params?.protocolVersion || '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'local-search', version: '0.1.0' },
        },
      });
      return;
    }
    if (method === 'notifications/initialized' || method === 'initialized') return;
    if (method === 'ping') {
      send({ jsonrpc: '2.0', id, result: {} });
      return;
    }
    if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      return;
    }
    if (method === 'resources/list') {
      send({ jsonrpc: '2.0', id, result: { resources: [] } });
      return;
    }
    if (method === 'resources/templates/list') {
      send({ jsonrpc: '2.0', id, result: { resourceTemplates: [] } });
      return;
    }
    if (method === 'prompts/list') {
      send({ jsonrpc: '2.0', id, result: { prompts: [] } });
      return;
    }
    if (method === 'tools/call') {
      const name = params?.name;
      const args = params?.arguments || {};
      if (name !== 'web_search') {
        send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: `unknown tool: ${name}` }] } });
        return;
      }
      const text = await webSearch(String(args.query || ''), args.max_results);
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } });
      return;
    }
    if (id !== undefined) {
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
    }
  } catch (error) {
    log(`handler error: ${error.stack || error.message}`);
    if (id !== undefined) {
      send({ jsonrpc: '2.0', id, error: { code: -32603, message: String(error.message || error) } });
    }
  }
});
