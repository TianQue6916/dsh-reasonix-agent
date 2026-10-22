---
id: mem-519c8b8c905c49fb8a6fe9bc538ced64
revision: 1
created_at: "2026-10-04T07:48:39.204Z"
updated_at: "2026-10-04T07:48:39.204Z"
name: billion-context-community-solution-and-dsh-preset-blindspot-20261004
description: "billion-context 的社区解法 = 关掉原生 auto-compaction；但它自己承认 dsh 有盲区（#1772 preset 内实例 patch 命不中）；实测复现 + 我们机器上双重压缩的实证"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 用户诉求（m06852 逐字）
「又变成这样,上下文消失,先把熔断关闭,借鉴社区经验」⇒ 三条：①关熔断 ②**借鉴社区经验** ③查「上下文消失」真因。

## ★ 社区经验（billion-context，用户已装的社区 context 压缩插件）
`~/.dsh/profiles/desktop/node_modules/billion-context`（v0.1.178，2.4 MB dist）。
**它的立场：关掉宿主原生 auto-compaction，改用它自己的模型驱动压缩。**
- `dsh.bundle.patch.yml` 逐字：
  ```yaml
  - insert:
      - id: bili-native
        name: billion-context
  - id: compaction-basic
    config:
      auto: false
  ```
- README.zh-CN.md `:158` 逐字「`bili plugin install opencode    # 在 opencode 真实配置里注册插件 + 关闭原生自动压缩」
- README.zh-CN.md `:169` 逐字「…在同一份配置里设 `"compaction": { "auto": false }`（否则 OpenCode 的原生自动压缩会双重压缩）」
- README.zh-CN.md `:259` 压缩时机：「由模型驱动：注入的上下文工具由模型在上下文增长时自行调用，温和的增长 nudge（按设计固定约 50K token 步长）…仅输入就超窗时预检作为硬兜底触发（#470）」
- 它注入的四个工具：`compress` / `decompress` / `search_context` / `acp_status`。

## ★★ 但它自己承认在 dsh 上有盲区（README.zh-CN.md:196 逐字）
> `bili dsh  # deepseek-harness:经 --patch 注入完整原生插件(#941) —— 真实 dsh 工具、会话绑定 /acp(plugin 模式);非回环上游走代理 env,回环保留 overlay DSH_HOME 改写(#535);`**`dsh 自动压缩关(web profile 除外——preset 内实例无法经 patch 触及,#1772)`**

⇒ 社区已记录 issue **#1772**：**dsh 的 preset group 内嵌的 `compaction-basic` 实例无法被 `- id: compaction-basic` patch 触及**。

## ★★ 实测复现（2026-10-04）
`profiles/web/cordis.patch.yml:553-570` 把 compaction 三件套包进 `cordis:group`（`isolate: {compaction: true, toolResultPruner: true}`）；**dump 里 `- id: compaction-basic` 共 5 处**：
- 顶层 `:727`（`name: '@deepseek-ai/dsh-compaction-basic'` + `disabled: true`，来源注释 `# == @deepseek-ai/dsh-base, patched by @deepseek-ai/dsh-web-app`）⇒ **dsh-web-app 禁掉了顶层那份**
- **group 内 4 份**（`:1197` / `:1379` / `:1643` / `:2145`，各在 `- id: compaction / name: cordis:group` 下）⇒ **无 config、无 disabled ⇒ 用默认 `auto: true` ⇒ 活着的自动压缩在这些实例上**

**实验（决定性）**：overlay `- id: compaction-basic / config: {auto: false}` + `--profile web --patch <overlay> --dump-config`
⇒ 只有顶层 `:727-731` 变成 `disabled: true` + `config: auto: false`；**group 内 4 份完全没有变化** ✓ 与 #1772 一致。

**`dsh-compaction-basic` 的 `auto` 字段**（`lib/index.js`）：`:62 if (config.auto !== void 0 && typeof config.auto !== "boolean") throw new Error("BasicCompactionConfig: auto must be a boolean");`；`:85 auto: config.auto ?? true`；`:817 auto: z.boolean()`；`:827 if (this.config.auto) this._registerAutomaticCompaction();` ⇒ **`auto: false` 是合法字段，默认 true**。

## ★★ 结论：用户机器上正在**双重压缩**
本 session（desktop App，pid 2792，跑在 `app.asar`）的 session 流统计（27310 events）：
- 原生：`compaction/summary` **14**、`compaction/prune` 39、`compaction/start|end` 各 14
- billion-context：`compress` 工具调用 **104 次**、`search_context` 2 次（这些就是 ACP 工具）
⇒ **两套压缩同时在跑** ⇒ 「上下文消失」是叠加结果：
  ① 原生 auto-compaction 因**虚高账本**在真实占用 10–16% 就触发（已定位、已修，见 `tm-usage-first-plugin-desktop-token-meter-fix-20261004`）
  ② billion-context 的模型驱动压缩也在折叠区间
- 佐证进程：`host-stdio.log` 有 `[err] bili: attaching to running proxy at http://127.0.0.1:18787 (pid 18396)` ⇒ **billion-context 的代理在 18787 且已 attach** ⇒ 它在真实代理 desktop 流量。

## 修法评估（未执行，交用户决定）
- **社区原味做法**：彻底关掉原生 auto-compaction。但 `- id:` patch 命不中 group 内实例 ⇒ 需**直接改 `profiles/{web,desktop}/cordis.patch.yml` 里 group 内那 4 处**（各加 `config: {auto: false}`），或用 agent-preset hook 拦。
- **风险**：关掉后若 billion-context 代理失效（它自己说「早期」、`.bili` 需独立进程）就**没有兜底压缩**，会话会撑爆 context window。
- **当前采取的折中**：先让 usage-first 修复生效（原生只在真满 ~80% 才触发）⇒ 原生与 billion-context 共存的冲突大幅降低，不急于关原生。
