---
id: "bf1e1849-d671-46dd-b9a4-ab9b17ab653c"
title: "billion-context 作为 bundle 时的 compaction gate 覆盖机制：宿主 auto:true 为何在运行态无效，以及 disabled:true 解法（2026-10-29）"
description: "2026-10-29 取证：billion-context@0.1.208 的 dsh-compaction-gate.js 通过 internal/config 全局 hook 把所有 preset 的 compaction-basic/command-compact row 改成 disabled:true（上游 #3354），导致只改 auto:true / thresholdRatio 在 dump-config 里可见但运行态无实例；patch 的 name mismatch 拒绝本地 shim 替换；最终用 disabled:true 关 gate entry。另记 authoredCompaction 需 session 持 active 折叠块否则 422。承接并反转 3912c06c 的 auto:false 修法。"
status: "active"
created_at: "2026-10-28T18:10:20.941Z"
updated_at: "2026-10-28T18:10:20.941Z"
content_hash: "c982bc05d42b68fe9e392cc2aa255131cf15633b10affa36501c90f0f83a52f9"
source_paths:
  - ".dsh/profiles/web/cordis.patch.yml"
  - ".dsh/profiles/node_modules/billion-context/dist/agent/dsh-compaction-gate.js"
  - ".dsh/profiles/node_modules/billion-context/dsh.bundle.patch.yml"
  - ".dsh/profiles/node_modules/billion-context/dist/agent/dsh-native.js"
  - ".dsh/plugins/bili-gate-passthrough.mjs"
session_ids:
  - "baae034f-a801-4dac-b4a0-8a1691304386"
memory_body_ids:
  []
---

# billion-context gate 覆盖机制与自动压缩的落地姿势

**日期**：2026-10-29
**承接**：`3912c06c-b67c-42a0-bf41-3b3ad3142d42`（2026-10-16 的结论是 `auto: false`）、`0bb2e36f-ef0d-4ea1-b110-bc7f0e68eed8`（60% 阈值 / cache 经济学）。
**本文反转 3912c06c 的修法结论**：一旦 `billion-context` 以 profile bundle 形式挂载，`auto: false` 不再是「选择」，而是被 gate 强制的唯一结果。

## 1. 目标

让 dsh 原生 `compaction-basic` 重新可用，并与 bili 的 `compress`（手动）并存：

- 手动：模型自己调 `compress`，把任意一段写成摘要（`billion-context` 装上即提供）。
- 自动：`compaction-basic` → `auto: true`、`thresholdRatio: 0.65`。

1M window 下触发点 `min(1e6 × 0.65, 1e6 − 131072 − 65536) = 650,000` token。

## 2. 核心坑：gate 在 `internal/config` 上全局覆盖

`billion-context/dist/agent/dsh-compaction-gate.js`（整文件仅约 2.6 KB，只做这一件事）：

```js
ctx.on("internal/config", (_raw, next) => {
  const resolved = next();
  if (!isDshCompactionActive()) return resolved;          // 恒为 true
  ...
  return { ...config, plugins: disableBasicCompaction(config.plugins) };
}, { global: true })
```

`disableBasicCompaction` 递归遍历**所有** preset 的 plugins 数组，凡 `name === '@deepseek-ai/dsh-compaction-basic'` 或 `'@deepseek-ai/dsh-command-compact'` 的 row 一律改成 `disabled: true`（上游 issue #3354）。它带 `{ global: true }`，**连自定义 preset（如 `anchored-standard`）也照样覆盖**。

后果：`--dump-config` 能看到 `auto: true / thresholdRatio: 0.65`（那是 patch 层合成后的静态结果），但运行态根本不存在实例。**只改 `auto` 永远无效，dump-config 不是运行态证据。**

`billion-context` 自己的 `dsh.bundle.patch.yml` 里也写着这条因果（#1772/#2474/#3354，#3662）：gate 必须放在独立的 always-on entry 里，不能塞进 `bili-native`，否则杀掉 bili-native 会让 preset 永远 pending、session 创建直接 brick。

## 3. 失败的解法：本地 shim 顶掉 entry name

尝试在 `.dsh/profiles/web/cordis.patch.yml` 里把 entry 指向本地文件：

```yaml
- id: bili-compaction-gate
  name: ../../plugins/bili-gate-passthrough.mjs
```

patch 引擎直接拒绝（stderr）：

```
patch: name mismatch for "bili-compaction-gate"
  (expected "billion-context/dsh-compaction-gate", got "../../plugins/bili-gate-passthrough.mjs"), skipping
```

**结论：patch 层只能改同一 entry 的 config / disabled，不能换 name。** 想替换 bundle 提供的实现，只能改 bundle 本身的产物，或走「关掉该 entry」这条路。

## 4. 生效解法

```yaml
- id: bili-compaction-gate
  name: billion-context/dsh-compaction-gate
  disabled: true
```

`--dump-config` 确认 `disabled: true` 已合成、stderr 干净。代价：bili 的 `authoredCompaction` 也随之失去「拦截 dsh 原生压缩」的保护，需要 bili 侧能本地应答（见下）。

## 5. 因果依赖：authored compaction 不是无条件的

`billion-context/dist/agent/dsh-native.js` 的判据：

```js
const authored = dshAuthoredCompactionEnabled() && session.state.blocks.some(b => b.active)
  ? buildDshCompactionForgeBody(...) : null;
if (authored !== null) { /* ANSWERED LOCALLY */ return; }
// 否则 422 REFUSED
```

**该 session 必须已持有至少一个 active 折叠块**，bili 才会本地应答 dsh 的 summarize 调用。所以「手动 + 自动并存」的真实时间线是：

```
0 ─────── 50% ─────── 65% ──────────────────── 100%
   模型主动 compress        自动压缩（bili 本地应答）
   → 产生 active 块         → 在此之前仍是 422 + warn
```

在首次 `compress` 成功之前，65% 那次自动压缩会被拒，每次 pre-step 一条 `step compaction failed: 422 ...; continuing the turn`。不致命，但日志会脏。

bili 的 `nudgeMaxContextLimitPct` 默认 0.70 > 0.65，所以自动压缩会先于 nudge 撞上「无 active 块」的 422。把 nudge 降到 ~0.50 可让模型先手动压一次——但该配置在 `~/.local/state/billion-context`，**desktop 与 web 共用**，会连带提前 desktop 的 nudge。

## 6. 验证步骤（尚未执行：需重启 dsh web）

bundle 变更只在加载期生效，`patchReload: live` 覆盖不了 gate 的 `internal/config` hook，**必须重启** `C:\Users\27063\.dsh\_restart-web.cmd`。重启后：

1. 新 session 的 `request/header` 工具列表应出现 `compress`。
2. 跑到 65% 后 `logs/` 出现 dsh 侧 `compaction (step pressure): shadowed ... ~N tokens` + bili 侧 `ANSWERED LOCALLY`。
3. 若只见 `422 refused`，说明还没手动 compress 过。

回滚：`cp ~/.dsh/profiles/web/cordis.patch.yml.bak-*-pre-auto-compaction65 ~/.dsh/profiles/web/cordis.patch.yml`（连 bili 的 gate 一起恢复）。

## 7. 操作要点速查

- `dsh plugin --profile web add billion-context` 会把包名写进 profile `package.json` 的 `dsh.profile.bundles`，加载期自动应用其 `dsh.bundle.patch.yml`。
- patch 对 `config` 是**整体替换**，不是深合并。
- 判断某个 entry 是否真的跑起来：看运行态（工具列表 / log），不要只看 `--dump-config`。
- `billion-context` 的 entry 若被禁用，要确保它不承载其他 preset 依赖的 service（#3662 的教训）。
