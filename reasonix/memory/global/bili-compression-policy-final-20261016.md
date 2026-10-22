---
id: mem-f996ad7f3f53d845239bf487f38ccabb
revision: 1
created_at: "2026-10-16T04:57:16.866Z"
updated_at: "2026-10-16T04:57:16.866Z"
name: bili-compression-policy-final-20261016
description: "bili 压缩策略最终定案（injectNudge=false + maxContextLimit 60%）+ 50 倍价差的经济学依据 + kill 后需手动重启的教训"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 最终配置（2026-10-16 13:0x，已生效并验证）
`C:\Users\27063\.config\billion-context\billion-context.json`：
```json
{
  "providers": {},
  "compress": {
    "nudgeGrowthTokens": 150000,
    "preserveRecentTokens": 20000,
    "preserveRecentMessages": 10,
    "injectNudge": false,
    "maxContextLimit": "60%"
  }
}
```
备份链：`billion-context.json.bak-20261016-114652`（原始 25 B）→ `…-pre-nudge-off`（本次）。

生效验证：`curl -s http://127.0.0.1:18787/__bili/config` 返回上述 `compress` 块；`/__bili/status` → `version 0.1.197 · stale False`。

## ★ 为什么是 60% 而不是 30%（价格模型，用户拍板依据）
用户面板的 `models.dev` 刊登价（`commandcode-goat · deepseek/deepseek-v4.1-flash`）：
- **缓存输入 ¥0.02 / M**
- **未缓存输入 ¥1.01 / M**
⇒ **差 50 倍**（gateway 的 `LOCAL_PRICES` 同比例：`hit: 0.0030285` vs `miss: 0.151425`）。

**算例**（上下文 300k，压掉 200k）：不压 = 300k × ¥0.02/M = ¥0.006；压了 ⇒ 省下 200k 缓存读（¥0.004），但 cache 被打断 ⇒ 剩余 100k + 新增全按未缓存算 ⇒ 100k × ¥1.01/M ≈ **¥0.101**。**压一次多花约 ¥0.1，是「不压」的 16 倍。**

**⇒ 推论：压缩的经济价值只在「不压就要超窗」时成立；其余时候是纯亏损。** 所以 `maxContextLimit` 应该**尽量晚**（bili 官方默认就是 `"75%"`），**30% 是反社区的、会让问题更严重**。

bili 自己的 `FOLD ECONOMICS` 也印证：每次 fold 有 `n*`（回本所需轮数），实测 `n*=140.94`（NOT PAID BACK）、`146.13`、**`1062.75`** ⇒ 多数 fold 在含「破 cache 的 50 倍价差」后并不划算 —— bili 只把「省下多少 token」算进收益，没把这条算进成本。

## `injectNudge: false` 的作用（治元凶）
关掉增量折叠 ⇒ 消灭 `degenerate-fold`（13 天 8 次，`covers 94% of the live context … anchor≈2295 tok — the whole prefix rewrites`）与「fold 后那一轮 hit 96%→44%」的断崖。**`maxContextLimit` 是独立机制，保留 ⇒ 到 60% 窗口自动压一次，用户不需要手动压**（用户明确说「自己手动压缩太麻烦」）。

## ★★ 重要运维教训：kill bili 不保证 dsh 自动拉起
- 2026-10-16 第一次 kill（pid 15368）→ **dsh 立刻自动拉起**（新 pid 5376，ppid 12768 = `DeepSeek Harness.exe`）。
- 同日下午再 kill（pid 5376）→ **没有自动拉起**（`NOT running`），**必须手动启动**：
```powershell
Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' `
  -ArgumentList @('C:\Users\27063\.dsh\profiles\desktop\node_modules\billion-context\dist\index.js','start','--host','127.0.0.1','--port','18787') `
  -WindowStyle Hidden -WorkingDirectory 'C:\Users\27063\.dsh\profiles\desktop\node_modules\billion-context'
```
**⇒ 改完 bili config 重启后，务必用 `curl http://127.0.0.1:18787/__bili/status` 确认活着**（bili 是 dsh 与上游之间的 proxy，不活着则所有模型调用断流）。

## bili 的 HTTP 诊断端点（自测用）
- `GET /__bili/status` → `{version, diskVersion, stale, autoRestartOnUpdate, inFlight, conflicts:{kinds, latest, clients}}`
- `GET /__bili/config` → 当前生效 config（含 `raw` 原文）
- `GET /__bili/cache-report` → GRAND LEDGER / FOLD ECONOMICS / LINE ITEMS
- `POST /__bili/reload` → **404（不存在）**，只能靠重启进程

## 相关事实（同批）
- 用户明确否决过「删 `compaction-basic`」的方案（会丢 `/compact` 手动命令）⇒ 改用 `compaction-basic` 的 `auto: false`（`config.auto ?? true`，源码 `dsh-compaction-basic/lib/index.js:85` / `:827`），三处已改：`profiles/{desktop,web}/cordis.patch.yml:558-561` + `.agent-presets/anchored-standard/agent.cordis.yml:374-377`。
- `dsh-context`(2170★) 与 `billion-context`(1412★) 是**架构性冲突**：前者读 dsh 的 session/projcache（显示「压缩前」），后者在 wire 层改请求体（实际「压缩后」）。面板 `压缩 0 / 剪枝 0` 就是这个原因 —— **不是 bug**。

截至 2026-10-16。
