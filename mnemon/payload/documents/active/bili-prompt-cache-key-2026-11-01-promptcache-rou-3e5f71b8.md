---
id: "3e5f71b8-8052-4f84-860b-2e8f0f99f5f6"
title: "bili prompt_cache_key 路由开关判定（2026-11-01）：promptCache.routing 机制、本机单号暂不启用、上游 miss 归因"
description: "billion-context #5079 提示「prompt_cache_key 自注入默认关闭」后的判定记录：key 是路由键而非缓存开关、auto/enabled 两档差异、本机配置无 promptCache 字段、goat-gateway 拓扑与源码无消费点、acp_cache 实测 88% 命中与 #114 单号 2 分钟全 miss 的异常候选、日后开 auto 的验证指标。结论：用户单号暂不启用。"
status: "active"
created_at: "2026-11-01T15:15:39.036Z"
updated_at: "2026-11-01T15:15:39.036Z"
content_hash: "77084d59b6ffa74b204ccf5ed2c04d1ced8e21384279c0b97da7e7b1e494c59a"
source_paths:
  - ".config/billion-context/billion-context.json"
session_ids:
  - "06428b03-203f-471a-af2a-73300449d733"
memory_body_ids:
  []
---

# bili prompt_cache_key 路由开关判定（2026-11-01）

**触发**：排查关机自启时 bili 弹 #5079 升级提示（`prompt_cache_key` 自注入默认关闭），用户问「该不该开」。结论：**单号暂时不开**（用户原话「暂时只有一个号,先这样吧」）。

## 机制（不是"开缓存"开关）

- `prompt_cache_key` 是**路由键**：provider 侧 KV 前缀 cache 存在具体后端实例上，同一前缀只有路由回同一台机器才命中；换节点/换账号则前缀相同但 cache 为空，全量重算。
- 官方 OpenAI 单账号：缓存本就粘，key 意义有限。
- 中转站 / 号池（多上游轮转）：**必须**靠它做一致性路由，否则落点随机。
- bili #5079 之后 `promptCache.routing` 默认 `disabled`（bili 不写自己的 key；客户端自带的 key 始终原样转发）。三档：
  - `disabled`（默认）：不写。
  - `auto`：chat wire（`/v1/chat/completions`）每个插件车道请求都盖章；Responses wire 仅当 host 恰为 `api.openai.com` 时注入。
  - `enabled`：两条 wire 任意 host 都盖章（多出来的能力只在 Responses wire）。

## 本机现状（2026-11-01）

- 配置文件 `C:\Users\27063\.config\billion-context\billion-context.json` **没有 `promptCache` 字段** ⇒ 走默认 `disabled`；`ACP_PROMPT_CACHE_ROUTING` env 未设置。
- 上游链路：`commandcode-goat` → `127.0.0.1:8788` 自建 goat-gateway（`D:/Toolbox/goat-gateway`，目录内有 `_patch-multiupstream.py`、`_patch-quota-priority.py`，形态上是多上游 + 配额优先级 = 号池）。
- 但在 gateway 源码内搜 `prompt_cache_key` **无命中**（只命中无关的 PDFMathTranslate venv 里 openai SDK 定义）⇒ gateway 本身不消费该字段，真正消费方是其**上游中转站**，无法从本机推断是否认这个 key。
- 用户当前**只有一个上游号** ⇒ 钉不钉一样，选择先不开。

## 实测证据（同会话 `acp_cache`，session-f6dab754，114 requests）

- GRAND LEDGER：input 17.59M / cached 15.48M / **hit 88.0%**；miss 2.11M = 新内容 422.4K + 压缩重付 40.0K + `upstream-ttl-or-client-rewrite (unattributed)` 1.65M。
- 异常样本：
  - `#106 18:50:25 input 344.5K cached 53.2K hit 15.5% idle 2.7h` —— TTL 过期，正常。
  - `#114 23:07:26 input 390.7K cached 7.5K hit 1.9% idle 2m` —— **单号 + 仅隔 2 分钟却掉 98% 缓存**，路由轮换解释不了。
- 剩余候选（未验证，留待复现时查）：① 上游自身多节点负载均衡；② 上游 cache TTL 极短（1–5 分钟）；③ gateway fallback 换了上游入口。
- 报告侧另有 4 samples / 250.7K tok 判为 `PROVIDER-SIDE MISS`（eviction / relay node rotation），以及 18 个 abort-correlated 样本（correlation 非 causation）。

## 若日后上多号

- 设 `"promptCache": { "routing": "auto" }`（chat wire 已足够；`enabled` 多出的仅 Responses wire 任意 host）。改法三选一：Web UI `http://127.0.0.1:18787/__bili/#/config` 快速配置开关 / 配置文件加字段 / `ACP_PROMPT_CACHE_ROUTING=auto`。
- 验证：开完跑 5–10 轮再调 `acp_cache`，看 ① `miss breakdown` 里 unattributed 量（当前 1.65M）是否下降；② `LINE ITEMS` 里 `hit% < 10%` 且 idle 只有几分钟的样本（如 #114）是否消失。两条都改善 ⇒ 上游认这个 key；无变化 ⇒ 可关回。

## 相关文档

- `784243df-dd9c-413a-b220-7a5c3a5bd207` —— bili 前缀缓存命中率归因（cache-report 取证、切模型与 compress 双元凶，2026-10-13），本文是其「路由键」角度的补充，不是重复。
- `15cf275f-838c-466f-899f-8004e4827df7` —— goat-gateway `/cache` 端点三层缓存改造（网关自身缓存，与上游前缀 cache 无关，勿混）。
