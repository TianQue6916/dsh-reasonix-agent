---
id: "68496d1e-2cf3-4558-8ccf-10f1f2beac0a"
title: "dsh-plugin-local-search 第四源 goat 的成本证据与「默认关闭」决策（T13 回归断言、两层默认关闭原则、CRLF 编辑陷阱）"
description: "2026-10-01 把 goat（claude-sonnet-5-5 + Anthropic web_search_20250305）加入 web_search 聚合后又默认关闭的成本取证与实现交接：账本拟合单价、单次/最坏成本、代码默认值与 patch 双关的设计理由、T13 回归断言、selftest 13 组、CRLF 文件编辑陷阱，以及仍未修的 gateway 400 额度冷却问题指向。"
status: "active"
created_at: "2026-10-01T12:02:31.704Z"
updated_at: "2026-10-01T12:02:31.704Z"
content_hash: "679c20b205349f021b8ed78c2a6e44296d35db9f4b362c23121081bcee199f9c"
source_paths:
  - "profiles/web/node_modules/dsh-plugin-local-search/index.js"
  - "profiles/web/node_modules/dsh-plugin-local-search/cordis.patch.yml"
  - "profiles/web/node_modules/dsh-plugin-local-search/selftest.mjs"
  - "profiles/web/node_modules/dsh-plugin-local-search/README.md"
  - "profiles/web/cordis.patch.yml"
  - "profiles/headless/cordis.patch.yml"
session_ids:
  - "a388a8e8-e0b1-47ca-850a-e4055ffbd2df"
memory_body_ids:
  []
---

# dsh-plugin-local-search 第四源 goat 的成本与默认关闭决策

关联文档：
- `c6920883-b535-418c-afe8-68e83c7dfa0b` —— 三源（GitHub / DeepSeek 官方 / 本地 wiki）并发聚合 provider 的 rank 合并语义、凭证熔断、`deepseek-official` 正确 id。本文是其后的第四源增补与回退。
- `fb4a6e22-1db0-406a-bd62-9d693e968f7a` —— goat gateway「上游 400 不进 quota 冷却 + session 死粘」的故障调查与 A/B/C 修复选项（本文末尾的未修项就是它的方案 A）。
- `be295e6b-be04-4de4-9625-c6cd431e73dc` —— deepseek 源 `maxUses` 100→3 与三端 patch 位置、运行时核验方法。

## 结果（2026-10-01）

第四源 **goat** 已实现并自测通过，但**默认关闭** —— 代码默认值与 `cordis.patch.yml` 两处都写 `false`。

- rank 顺序变为 `github(0) > goat(1) > deepseek(2) > wiki(3)`，四路并发 + `Promise.allSettled`，单源失败只记日志并熔断。
- goat 走 `http://127.0.0.1:8788/v1`（本地 goat gateway / Anthropic Messages 路由）+ native `web_search_20250305` server tool，模型 `claude-sonnet-5-5`。
- 62 个 allowlist 模型里**只有 `claude-sonnet-5-5` 一个 Claude 模型**能用该 server tool；其余模型走 `/chat/completions`（openai-completions 路由）吃不到 server tool。判据来自 `DEFAULT_CONFIG` 注释与 `cordis.patch.yml` 同步注释。
- 质量结论：goat 命中「答案所在页」（官方文档 / 源码树 / issue / README）比率最高，且会诚实说「找不到」——这是质量上保留它的理由，但不足以为它付默认开启的代价。

## 成本证据（关闭的直接原因）

- 账本拟合单价：**$2.00/M input + $10.03/M output**（7 行 claude 调用零残差拟合）。
- 机制：Anthropic server tool 的搜索结果块会被**回灌进 context 并按 input token 计费**，所以费用不只是输出。
- 单次 goat 搜索 ≈ **12–21k input tokens ≈ $0.038**；`dsh-tool-web` 的 `searchMaxQueries` 默认 4 ⇒ 一次用户级搜索最坏 **≈ $0.15**。
- 现实约束：当时 `qq` 月剩余额度只有 0.5316，而当天四源实测 + 对照跑掉的 7 行 claude 调用合计 $0.2681（约一半被自己吃掉）。因此选的是「默认关」而非「调参保留」。
- 关闭后仍保留可用性：`enableGoat: false` 时 `provider.available()` 仍为 `true`，不会触发 `WEB_PROVIDER_CONFIGURED_UNAVAILABLE` 把整个 `web_search` 打挂。

## 设计决策：两层都关

只在 `cordis.patch.yml` 里关不够 —— 代码默认值若仍是 `true`，将来换机器或重装 bundle 就会静默按 Claude 单价烧钱。**默认值代表「安全姿势」，部署偏好才写进 patch**；要开就显式在 patch 里写 `enableGoat: true`。同款成本注释同时写在 `index.js:40-49`（代码默认值附近）与 `cordis.patch.yml:17`，避免后来者只看到其中一处。

## 改动落点

| 文件 | 改动 |
|---|---|
| `D:/Toolbox/goat-gateway/dsh-plugin-local-search/index.js:40-49` | `enableGoat: false`（代码默认也关）+ 成本机制注释 |
| 同目录 `cordis.patch.yml:17` | `enableGoat: false` + `$2.00/M in`、`$10.03/M out`、最坏 `~$0.15/次` 注释 |
| 同目录 `selftest.mjs` | 新增 **T13 成本安全默认**：断言 `DEFAULT_CONFIG.enableGoat === false`，且 goat 关闭时 `provider.available()` 仍为 `true` |
| 同目录 `README.md` | 新增「为什么 goat 默认关闭」小节；rank 表标注「默认关闭」；组数 12 → 13 |

自测结果：`node selftest.mjs` → **13 组全部通过**（T1 rank/配额 → T13 成本默认；T5–T12 用 `enableGoat: false` 的 config 避免真打 8788，T10/T11/T12 显式开回 goat 做解析、四源 rank、凭证熔断验证）。

## 生效边界与验证

- 插件是 bundle（`node_modules` symlink，`link:D:/Toolbox/goat-gateway/dsh-plugin-local-search`）⇒ **不吃 HMR，必须重启 dsh 进程**；只能改配置不想重启时，在 `~/.dsh/profiles/<p>/cordis.patch.yml` 加一条**完整同名 row**（row 是 replace 语义，`name` 和全部字段都要带；走 `patchReload: live`）。
- 零副作用校验：`dsh --profile <p> --dump-config`。三端（web / headless / desktop）均确认 `searchProvider: local-wiki-github` + `enableGoat: false`（web `:825/:1741`、headless `:911/:997`）。
- 备份命名：`*.bak-20261001-2005-pre-disable-goat`、`selftest.mjs.bak-...-pre-T13`、`README.md.bak-...-pre-goat-default-off`。

## 编辑陷阱（可复用教训）

这几个文件是 **CRLF**：`index.js` 653 个 `\r\n` / 0 bare LF、`cordis.patch.yml` 55、`selftest.mjs` 293、`README.md` 93（关闭 goat 后分别变为 659 / 60 / 293 / 113）。用 `\n` 拼接字符串做 python 替换会**全部 assert 失败**（`AssertionError: ('index.js', '// 四路来源开关（默认全开、并发）', 0)`），必须按行处理、保留行尾。改完要复核 `CRLF n / bare LF 0` 而非只看内容 grep。

## 仍未完成（交接）

1. **重启才生效**：需重启 dsh 进程（`launch-dsh.ps1 -Mode Serve` 并用 pid/启动时间核对）goat 关闭才真正落到 bundle 运行时状态。
2. **gateway 认不出「额度耗尽」**：上游返 HTTP 400 `insufficient credits`，而 `gateway.mjs:831` 的 `retryableStatus` 不含 400、`:343` 的 quota 冷却只认 402 ⇒ 不冷却、不换 key；`selectKey` 只在 `isCooling` 时才改绑会话，导致 1717 个会话中 914 个（`qq` key）持续钉在耗尽的那个 key 上，看不见 `163` 还剩的 11.95 额度。修法 A（约十几行）：在 body 里匹配 `/insufficient credits|quota exceeded|out of credits/i` 归入现有 `quota` 冷却（600000ms），400 的透传语义不变。详见 `fb4a6e22-1db0-406a-bd62-9d693e968f7a`。**用户当时未答复是否动手。**
