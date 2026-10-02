---
id: mem-c6af36af5b9e3de99823e5201d047b7a
revision: 1
created_at: "2026-10-02T07:26:43.021Z"
updated_at: "2026-10-02T07:26:43.021Z"
name: dsh-context-pricing-overlay-patch-20261002
description: "dsh-context 面板 96% 花费显示不出来的根因与本地价目覆盖补丁（含三处插入点、幂等/回滚验证、¥38.84→¥321.08）"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 症状
dsh-context（上下文洞察 / Context Dashboard）显示「费用 ¥38.56，已计价 **151/1468** 个会话」，绝大多数 card 是 `费用 —`。图例自带免责：「费用（仅含支持计价映射的模型）」。

## 根因（逐函数复刻 `profiles/desktop/node_modules/dsh-context/lib/client.js` + 真实数据验证）
host 半只落 **token 桶**（`~/.dsh/storages/session_projcache/sessions/*.json` 的 `rows.contextTimeline.val.cost = {provider:{model:{peak|off:{cacheRead,uncached,cacheWrite,output}}}}`），钱由 client 半用 models.dev 价目本乘出。`priceFaceOf` 三关全败：
1. `modelsDevProviderOf("commandcode-goat")` 原样透传（`MODELS_DEV_PROVIDER_IDS = {"deepseek-official":"deepseek","deepseek-account":"deepseek","kimi-coding":"moonshotai","minimax-cn":"minimax","zai-coding-cn":"zhipuai"}` 里没有它）⇒ `branchOf(book.prices, ...)` = null。
2. `if (model.toLowerCase().startsWith("deepseek-"))` —— model id 是 `deepseek/deepseek-v4.1-flash`，以 `deepseek/` 开头而**不是** `deepseek-` ⇒ 一手价目本分支被跳过。
3. `resolveRate(book.index, model)`：org 段 `deepseek`，整串键 10 个 carrier（nano-gpt / llmgateway-providers / kilo / openrouter / zenmux / vercel / ofox / merge-gateway / tensorx / crossmodel）、尾段键 `deepseek-v4.1-flash` 23 个 carrier，`resolveCandidates` 四层（org 命名 → `@ai-sdk/<own id>` primary → id 前缀 → lone carrier）全空 —— **models.dev 的 `deepseek` provider 只有 4 个 model**（`deepseek-v4-flash-vision-exp`/`deepseek-flash`/`deepseek-v4-pro`/`deepseek-v4-flash`），根本没有 `deepseek-v4.1-flash` ⇒ null ⇒ 显示 `—`。

实测影响（本机 1599 个 projcache）：这一对 = **1413 session / 2.4502B token = 全机 token 的 96%**，对总额贡献 0。对照组 `deepseek/deepseek-v4-pro`（103 session）**能**计价（models.dev 有它）——差别只在 models.dev 有没有把该 id 挂在 DeepSeek 名下。
插件**无配置入口**：`make(options={})` 里 `baseUrl = options.baseUrl ?? "https://models.dev"` 可注入但没有调用方传参，`grep process.env` 在 client.js/index.js 均 0 命中。

## 修法（三处纯插入，不做任何替换）
| 位置 | 内容 |
|---|---|
| `priceFaceOf` 定义之前 | `LOCAL_PRICES` / `LOCAL_PEAK_PROVIDERS` + `localFaceOf()` / `localPeakProvider()` |
| `priceFaceOf` 空书守卫之后 | `const localFace = localFaceOf(provider, model); if (localFace !== null) return localFace;` |
| `isDeepSeekProvider` 开括号之后 | `if (localPeakProvider(dshProviderId)) return true;` |

**关键反直觉结论：不能把 `commandcode-goat` 加进 `MODELS_DEV_PROVIDER_IDS` 映射成 `deepseek`** —— 那会先命中 `direct !== null` 分支，而该分支 `lookupFace` 失败即 `return null`、**不再下沉**到 model-side index，于是现在能正确计价的 `deepseek/deepseek-v4-pro`/`-v4-flash` 一起变 null。

## 产物
- `~/.dsh/storages/dsh-context-price-overlay.json`（2769 B；3 条 / 2 provider；`peakProviders` 默认空 —— 全机 token 桶 100% 落在 peak，打开即总额翻倍）
- `~/.dsh/storages/tools/patch-dsh-context-pricing.mjs`（`--check/--apply/--verify/--restore`，锚点 count!==1 即拒绝写入，写盘后回读比对，语法用 `--experimental-vm-modules` 的 `vm.SourceTextModule`）
- `~/.dsh/storages/tools/test-dsh-context-pricing.mjs`（**28 passed / 0 failed**；从磁盘真实产物切出 cost.ts 段 `lib/client.js` 行 **6008..6298**（291 行/12277 B）+ `asRecord`@1230 / `numOf`@1238 重组成 ESM 再 import，含回归护栏）
- `~/.dsh/patches/README-dsh-context-pricing.md`（6937 B）
- 备份 `client.js.bak-20261002-pre-local-prices`（618351 B, md5 `d8ac91e7ea6b6829a05f8cf5e67882e3`）

## 实测数字（`~/.dsh/tmp-probe/sim-price.py`，`OVL=0/1` 两跑）
| | 已计价 | 未计价 | 总额 |
|---|---|---|---|
| BEFORE | 153/1599 | 1446（2.4502B token） | USD 5.8260 = **¥38.84** |
| AFTER | **1558/1599** | 41（**0 token**） | USD 48.1622 = **¥321.08** |

补丁后 md5 `6a3e92887c788334950d1c5dfc607ab5`（620408 B，+2057）；连跑两次 `--apply` md5 相同（幂等）；`--restore` 后 618351 B / 标记 0 / md5 与备份逐字节相等。
**生效条件：必须重启 DeepSeek Harness App**（node_modules 里的 client bundle 不参与 `patchReload: live`）。改价目只动 overlay JSON 再 `--apply`。

## 上游修法建议
通用缺陷（任何走自建 gateway + `org/` 前缀 model id + models.dev 未挂第一方名的用户都会 96% 无价）。最小零破坏上游修法：settings 加 `priceOverrides: {<dsh provider>: {<dsh model>: {hit,miss,write,out}}}`，在 `priceFaceOf` 顶部精确命中即返回。次选把第 2 关的 `startsWith("deepseek-")` 放宽到同时接受 `deepseek/`（只解决 DeepSeek 一家）。

## 踩坑
**C/JS 块注释里绝不能出现 glob 星号紧贴斜杠**：注释里写 `~/.dsh/profiles/*/node_modules/dsh-context/lib/client.js` 的 `*/` 提前闭合块注释 ⇒ `SyntaxError: Invalid or unexpected token`，报错定位在**下一行末尾**，极具误导性。改写成 `<profile>` 即可。
