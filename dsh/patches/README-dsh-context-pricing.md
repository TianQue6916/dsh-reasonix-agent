# dsh-context 计价不全：本地价目覆盖补丁（2026-10-02）

## 症状

上下文洞察面板（Context Dashboard）显示：活跃会话 1468、累计消耗 2.5B、**费用 ¥38.56，已计价 151/1468 个会话**。
图例自己写着「费用（仅含支持计价映射的模型）」；绝大多数 session card 的 `费用` 一栏是 `—`。

## 根因（代码级，已逐函数复刻 + 真实数据验证）

`dsh-context` 的 host 半只落 **token 桶**，钱是 client 半用 models.dev 价目本乘出来的：

```
~/.dsh/storages/session_projcache/sessions/*.json
  rows.contextTimeline.val.cost = {provider: {model: {peak|off: {cacheRead, uncached, cacheWrite, output}}}}
```

`profiles/desktop/node_modules/dsh-context/lib/client.js` 的 `priceFaceOf(book, provider, model)` 对主力流量三关全败：

1. `modelsDevProviderOf("commandcode-goat")` 原样透传（`MODELS_DEV_PROVIDER_IDS` 里没有它）
   ⇒ `branchOf(book.prices, "commandcode-goat")` = null。
2. 下一道 `if (model.toLowerCase().startsWith("deepseek-"))` —— model id 是
   **`deepseek/deepseek-v4.1-flash`**，以 `deepseek/` 开头而**不是** `deepseek-` ⇒ DeepSeek 一手价目本这支被跳过。
3. 落到 `resolveRate(book.index, model)`：org 段 = `deepseek`，先试整串键（10 个 carrier：nano-gpt /
   llmgateway-providers / kilo / openrouter / zenmux / vercel / ofox / merge-gateway / tensorx / crossmodel），
   再试尾段键 `deepseek-v4.1-flash`（23 个 carrier）。`resolveCandidates` 四层（org 命名 → `@ai-sdk/<own id>` primary
   → id 前缀 → lone carrier）全空：**models.dev 的 `deepseek` provider 只有 4 个 model**
   （`deepseek-v4-flash-vision-exp` / `deepseek-flash` / `deepseek-v4-pro` / `deepseek-v4-flash`），
   **根本没有 `deepseek-v4.1-flash`**；其余都是第三方 gateway，primary 不成立；carrier 数 10 与 23 都不是 lone
   ⇒ 返回 null。

实测影响（本机 1599 个 projection cache）：这一对 = **1413 个 session / 2.4502B token，占未计价 token 的 100%、
占全部 token 的 96%**，对 ¥38.56 贡献 **0**。对照组：`deepseek/deepseek-v4-pro`（103 session）**能**计价 ——
差别只在于 models.dev 有没有把那个 id 挂在 DeepSeek 名下。

顺带确认 `make(options = {})` 里 `const baseUrl = options.baseUrl ?? "https://models.dev"` 虽是可注入的，
但**没有任何调用方传 options，`grep process.env` 在 client.js / index.js 均 0 命中** ⇒ 插件没有配置入口，
只能 patch 或改上游。

## 修法：本地价目覆盖表（三处纯插入，不做任何替换）

| 位置 | 插入内容 |
| --- | --- |
| `priceFaceOf` 定义之前 | `LOCAL_PRICES` / `LOCAL_PEAK_PROVIDERS` + `localFaceOf()` / `localPeakProvider()` |
| `priceFaceOf` 的空书守卫之后 | `const localFace = localFaceOf(provider, model); if (localFace !== null) return localFace;` |
| `isDeepSeekProvider` 的函数开括号之后 | `if (localPeakProvider(dshProviderId)) return true;` |

**为什么不去改 `MODELS_DEV_PROVIDER_IDS` 把 `commandcode-goat` 映射成 `deepseek`**（这是本补丁第一个反直觉结论）：
那条路会先命中 `direct !== null` 分支，而该分支一旦 `lookupFace` 失败就 `return null`、**不再下沉**到
model-side index —— 于是现在能正确计价的 `deepseek/deepseek-v4-pro` / `-v4-flash` 会一起变 null。

三处都是**纯插入**（不改动任何既有语句），标记为 `/* dsh-context-local-prices:* */`，
strip 后逐字节还原 ⇒ 幂等、可反复 apply。

## 产物

- `~/.dsh/storages/dsh-context-price-overlay.json` —— 价目表（键 = harness 上报的 provider / model 原样字符串）
- `~/.dsh/storages/tools/patch-dsh-context-pricing.mjs` —— `--check` / `--apply` / `--verify` / `--restore`
- `~/.dsh/storages/tools/test-dsh-context-pricing.mjs` —— 行为级验证（28 断言）
- 备份 `client.js.bak-20261002-pre-local-prices`（618351 B，md5 `d8ac91e7ea6b6829a05f8cf5e67882e3`）

## 实测数字

| | 已计价 session | 未计价 | 总额 |
| --- | --- | --- | --- |
| 打补丁前 | 153 / 1599 | 1446（2.4502B token） | USD 5.8260 = **¥38.84** |
| 打补丁后 | **1558 / 1599** | 41（**0 token**） | USD 48.1622 = **¥321.08** |

面板自己报的是 `151 / 1468 · ¥38.56`（与我的复刻同比例，population 口径略有差异）。
**剩下 41 个未计价 session 的 token 量是 0**，即**全部 token 体积都已计价**。

## 验证链

1. 幂等：连跑两次 `--apply`，md5 均为 `6a3e92887c788334950d1c5dfc607ab5`，第二次报「先剥掉旧注入：2057 bytes / +0」。
2. 回滚：`--restore` → 618351 B、标记数 0、md5 = `d8ac91e7ea6b6829a05f8cf5e67882e3` = 备份 md5（逐字节相等）。
3. 语法：`node --experimental-vm-modules` 里 `new vm.SourceTextModule(src)` → ok。
4. 行为：`test-dsh-context-pricing.mjs` 28 passed / 0 failed —— 从**磁盘上那个真实产物**切出 cost.ts 段
   （`lib/client.js` 行 6008..6298）重组成 ESM 再 import，测的是真代码；含回归护栏
   （没被覆盖的 `deepseek/deepseek-v4-pro` 仍走 org 段解析出 `pid==='deepseek'`、`miss===0.435`）。
5. 全机复算：`~/.dsh/tmp-probe/sim-price.py`，`OVL=0/1` 两跑对照。

## 用法 / 回滚

```sh
node ~/.dsh/storages/tools/patch-dsh-context-pricing.mjs --check     # 只报告
node ~/.dsh/storages/tools/patch-dsh-context-pricing.mjs --apply     # 写盘 + 验证
node ~/.dsh/storages/tools/patch-dsh-context-pricing.mjs --restore   # 回滚
node ~/.dsh/storages/tools/test-dsh-context-pricing.mjs              # 行为级测试
```

改完**必须重启 DeepSeek Harness App**（node_modules 里的 client bundle 不参与 `patchReload: live`）。

改价目表只动 `dsh-context-price-overlay.json`，再跑一次 `--apply` 即可。
`peakProviders` 默认为空：全机 token 桶 100% 落在 `peak`，加进去会让总额翻倍，
只有在确认 goat 套餐按 DeepSeek 官方峰时价计费时才打开。

## 上游修法建议（值得提 issue/PR）

这是**通用缺陷**：任何走自建 gateway、model id 带 `org/` 前缀、且 models.dev 未把该 id 挂在第一方名下的用户，
都会遇到「96% 的钱显示不出来」。最小、零破坏的上游修法是给 settings 加一个
`priceOverrides: { <dsh provider>: { <dsh model>: {hit, miss, write, out} } }`，
在 `priceFaceOf` 顶部精确命中即返回 —— 与本补丁同形。次选是放宽第 2 关：
把 `startsWith("deepseek-")` 改成同时接受 `deepseek/`，但那只解决 DeepSeek 一家。

## 踩坑留档

**C/JS 块注释里绝不能出现 glob 星号紧贴斜杠。** 头注释里写了 `~/.dsh/profiles/*/node_modules/dsh-context/lib/client.js`，
其中的 `*/` 提前闭合了块注释 ⇒ `SyntaxError: Invalid or unexpected token`，且报错定位在**下一行末尾**，极具误导性。
