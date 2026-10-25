---
id: "25bec28c-5934-41d8-b8f9-619d3f92824c"
title: "dsh-context 费用面板计价链路取证与修复方案（2026-10-02）"
description: "dsh-context 面板费用「仅含支持计价映射的模型」根因取证：host 只落 token 桶、金额由 client.js 用 models.dev 乘出；96% 未计价 token 全部来自 commandcode-goat|deepseek/deepseek-v4.1-flash 一组解析失败；含三关失败机制、反事实金额、注入式 patch 修法、跨机用量聚合数据源与未决口径。"
status: "active"
created_at: "2026-10-02T06:58:23.212Z"
updated_at: "2026-10-02T06:58:23.212Z"
content_hash: "1abf2a490dbd20c20f855588b04330163bf72f3ccd226f4637b5a35d6adba840"
source_paths:
  - "storages/session_projcache/sessions"
  - "storages/tools/patch-replay-pricing.mjs"
  - "tmp-probe/sim-price.py"
session_ids:
  - "d4fccdc6-c4ca-487b-8825-fc8e389bec61"
memory_body_ids:
  []
---

# dsh-context 费用面板计价链路取证与修复方案（2026-10-02）

## 现象

面板费用行小字写「费用（仅含支持计价映射的模型）」，旁边显示 **已计价 151/1468 个会话**、金额 **¥38.56**（累计消耗 ≈2.5B token）。用户诉求：「展示的根本不全」。

## 机制：面板的钱不是读出来的，是 client 端算出来的

- host 半 `dsh-context/lib/index.js` 只做 `ctx.sessionProjections.register(...)`，落盘 `~/.dsh/storages/session_projcache/sessions/*.json`（1596 个）。
- 这些 JSON 的 `rows.contextTimeline.val.cost` 只存 **token 桶**，形如
  `{"commandcode-goat": {"deepseek/deepseek-v4.1-flash": {"peak": {cacheRead, uncached, cacheWrite, output}}}}`。
- 金额由 client 半 `dsh-context/lib/client.js` 用 models.dev 价目本乘出；**乘不出来就 `return null`，cell 显示 `—`**。

### 复刻验证（对链路理解已证实）

把 `pricesBookOf` / `priceIndexOf` / `priceFaceOf` / `estimateSessionCost` 逐函数复刻成 Python（`~/.dsh/tmp-probe/sim-price.py`），喂真实 `models.dev/api.json`（5,293,409 B / 225 providers）+ 真实 1596 个 projcache：

| | session 数 | 已计价 | 金额 |
|---|---|---|---|
| 面板 | 1468 | **151** | **¥38.56** |
| 复刻 | 1596 | **153** | **¥38.84** |

差 2 个 session 是「全部 vs 近 30 天」的窗口差，命中即证明复刻等价。

## 根因：一根管子堵住了 96% 的钱

全机 18 组 `(provider, model)` 里只有 2 组解析失败：

```
1410 sess  commandcode-goat | deepseek/deepseek-v4.1-flash  → NULL ✗  2.4449B token
   1 sess  commandcode-goat | z-ai/glm-5.3-flash           → NULL ✗  0 token
其他 16 组 → 全部命中（deepseek / google / meta / anthropic / azure / moonshotai）
```

⇒ 失败组占全部未计价 token 的 **100%**、占全机 token 的 **96%**。

三关连续失败（`lib/client.js` 内）：

```js
const registryPid = modelsDevProviderOf(provider);   // "commandcode-goat" 原样透传（不在 rename 表里）
const direct = branchOf(book.prices, registryPid);   // → null
if (model.toLowerCase().startsWith("deepseek-")) {}  // 第二关：id 是 "deepseek/deepseek-v4.1-flash"
                                                     //   以 deepseek/ 开头而非 deepseek- ⇒ 跳过
const cand = resolveRate(book.index, model);         // 第三关：四层候选全空 → null
```

1. **provider 名透传**：`MODELS_DEV_PROVIDER_IDS` 只映射 `deepseek-official / deepseek-account / kimi-coding / minimax-cn / zai-coding-cn`，`commandcode-goat` 不在其中。
2. **`deepseek/` ≠ `deepseek-`**：一手 DeepSeek 价目分支被字符串前缀判定挡掉。
3. **`resolveCandidates` 四层全空**：org 层要求候选 `pid === "deepseek"`，而 models.dev 的 `deepseek` provider 只有 4 个 model（`deepseek-v4-flash-vision-exp`、`deepseek-flash`、`deepseek-v4-pro`、`deepseek-v4-flash`），**没有 `deepseek-v4.1-flash`**；primary 层 `@ai-sdk/<own id>` 对第三方 gateway 不成立；前缀层不成立；lone-carrier 层因整串键有 10 个 carrier、尾段键有 23 个 carrier 而不成立。

对照组：`deepseek/deepseek-v4-pro`（103 sess）能计价，因为 models.dev 恰好把该 id 挂在 `deepseek` 名下。**差别只在于 models.dev 有没有把那个 id 挂到第一方 provider。**

### 两个反直觉结论（避坑）

- **往 rename 表里加 `commandcode-goat→deepseek` 会更糟**：`direct !== null` 时函数只做 `lookupFace`，失败即 `return null`，**不再下沉**到 model-side index。
- **放宽分辨率也救不了**：23 个 carrier 中 `alibaba-token-plan/deepseek-v4.1-flash` 的 cost 是 `{input:0, output:0, cache_read:0, cache_write:0}`（套餐价非单价），选中它会算出 **¥0** 而非「更多」。

## 这一对值多少钱（反事实估算）

token 桶：`peak.cacheRead 2,339,563,247` + `peak.uncached 62,342,226` + `peak.output 43,044,287` = **2,444,949,760**。

按 models.dev `deepseek/deepseek-v4-flash` 同族价（hit 0.003 / miss 0.15 / out 0.6）：

- ≈ **USD 42.1966 = ¥281.31**
- 若按 DeepSeek 峰时双倍：≈ **¥562.62**

⇒ 面板 ¥38.56 中这一对贡献 0；修好后总数约从 ¥38.56 跳到 **≈¥320**，这就是「展示不全」的实际尺度。

## 没有任何配置入口

`baseUrl` 只有 `options.baseUrl ?? "https://models.dev"`（`client.js:6347`，`base` 归一化在 :6348；`make()` 定义在 :6346，内部调用不传参）；`grep process.env` 在 `client.js` 与 `index.js` **零命中**；settings schema 只有 7 个 UI 偏好字段。

⇒ 只有两条路：**patch 本地 bundle**，或**改上游**。

## 修复方案

### 第一步 · 治「不全」（可立刻做，可回滚）

不动第三方包语义，在 `pricesBookOf` 返回前注入自建价目分支：

```js
book.prices["commandcode-goat"] = {"deepseek/deepseek-v4.1-flash": {hit, miss, write, out}}
```

命中 `direct` 后 `lookupFace` 精确命中共计价。配**幂等 patch 脚本**（参照既有 `~/.dsh/storages/tools/patch-replay-pricing.mjs` 的做法），插件升级后重跑即可；回滚 = 恢复 `.bak`。

### 第二步 · 治「不是总视图」

写 rollup：本机 `session_projcache` + reasonix `usage-catalog` → 一个小 JSON；Linux 侧跑同一脚本，经 Tailscale 拉回合并（Linux `~/.dsh` 已有 ssh 通路与 `sync_dsh.py`）。价目表用自建那一套，不再依赖 models.dev 猜，与第一步共用同一权威来源。

### 上游 issue

这是**通用缺陷**：任何走自建 gateway、model id 带 `org/` 前缀、且 models.dev 未把该 id 挂到第一方名下的用户，都会看到「96% 的钱是 `—`」。最小上游修法：settings 里加一张 `priceOverrides` 覆盖表。

## 跨机总视图：面板本身做不到，但数据已就绪

- dsh-context 天然只能看本机：host 半只调 `ctx.sessionProjections.register(...)`，数据源是宿主进程自己的 session store。
- `ds-harness-remote` v0.4.27 是「在另一台设备继续跑同一个 session」的 Remote Host/workspace 插件，**不是用量聚合**。

| 源 | 位置 | 规模 | 形态 |
|---|---|---|---|
| dsh 用量 | `~/.dsh/storages/session_projcache/sessions/*.json` | 1596 个小 JSON | 已 fold 好的 token 桶（provider/model/period/日），无需碰几十 GB session 日志 |
| reasonix 用量 | `%APPDATA%\reasonix\cache\usage-catalog\v1.sqlite` | `usage_records` 5406 / `usage_rollups` 32 | `day, source, provider, model_ref, prompt, completion, reasoning, cache_hit, cache_miss, total, requests, turns` |

reasonix 源库 `source` 只有 `desktop`(5402 行 / 882,874,288 tok) 与 `cli`(4 行 / 65,344 tok)，数据停在 **2026-09-21**（每天一份 `%APPDATA%\reasonix\stats\YYYY-MM-DD.jsonl`）。⇒ 每台机器各有一套 dsh 用量 + 一套 reasonix 用量，正好四格。

**未决口径（待用户拍板）**：「四个 agent」= 读法 A `{Windows, Linux} × {dsh, reasonix}`，还是读法 B `{Windows, Linux} × {dsh web, dsh desktop}`。数据实测支持 **A**；读法 B 在数据上**不可分**——web 与 desktop 共用同一个 `~/.dsh/sessions` store，profile 未写进 session header。另注：Linux 侧 reasonix 常驻服务已被 stop+disable，将来 Linux 那一格会自然归零。

## 相关

- 桌面端 `dsh-plugin-message-edit` 1.2.0 boot 崩溃的本地 PR #7 补丁、vendor tarball、`profiles/desktop/package.json` `file:` 声明与重启边界，已由文档 `b028b5a5-54fd-4679-aeca-79e8b6d7958a` 覆盖，本取证不重复。
- 同期未决：desktop 冷启动验证 message-edit 补丁；thinking-guard 需一次 web 进程重启才生效。
