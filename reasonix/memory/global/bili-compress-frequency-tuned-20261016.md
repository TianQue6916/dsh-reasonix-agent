---
id: mem-ec43f2a05966d2166d461f6cf9a8f736
revision: 1
created_at: "2026-10-16T03:53:33.361Z"
updated_at: "2026-10-16T03:53:33.361Z"
name: bili-compress-frequency-tuned-20261016
description: "bili 压缩频率已调低（nudgeGrowthTokens 150000 + preserveRecent 加大）并重启生效；附带「改 config 必须 kill bili 让 dsh 自动拉起」的手法"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 已落地（2026-10-16 11:46 CST）
用户 m10896 逐字「压缩频率修改,只要完成我的需求就行」⇒ 直接改 bili 全局压缩参数：

`C:\Users\27063\.config\billion-context\billion-context.json`（备份 `billion-context.json.bak-20261016-114652`）
```json
{
  "providers": {},
  "compress": {
    "nudgeGrowthTokens": 150000,
    "preserveRecentTokens": 20000,
    "preserveRecentMessages": 10
  }
}
```
- `nudgeGrowthTokens` 默认 **50000 → 150000** ⇒ 软压缩 nudge 的增长步长放大 3 倍，**压缩触发频率降到 1/3**
- `preserveRecentTokens` 默认 ≈5000 → **20000** / `preserveRecentMessages` 默认 3 → **10** ⇒ 尾部保护加大，**防止再次出现 `degenerate-fold`（折叠覆盖 89–94%、anchor 只剩 1.5–2.3K tok 导致整个 prefix 重写）**

## ★ 关键机制：改 bili 配置必须重启 bili 才生效
- `/__bili/config` 端点**会立刻返回新值**（说明它读了新文件），但日志里的 `nudge idle: … interval=50000` **仍是旧值** ⇒ `nudgeGrowthTokens` 映射到内核字段 `nudge.growthFloor` / `nudge.growthCap`，**只在进程启动时固化**。
- **★ 干净的重启手法（已实测）**：`Stop-Process -Id <bili pid> -Force` —— **父进程 `DeepSeek Harness.exe` 会自动重新拉起 bili**（实测：kill 15368 后端口 18787 立刻有 listener，新 pid 5376、ppid 12768）。不需要手动启动。
- **重启后验证逐字**：`[v=0.1.197] nudge idle: usage=19% (165836/868928), growth=48947/67500 (ref=116889, interval=150000)` ⇒ `interval` **50000 → 150000**、增长分母 `22500 → 67500`，生效 ✓

## 顺带收益
bili 从 `0.1.196 (stale: true, diskVersion 0.1.197)` **升级到 `0.1.197 (stale: false)`** —— 因为 auto-update 只换磁盘包不重启进程，此前一直跑旧代码（我曾在日志里看到 `[update] running v0.1.196 but v0.1.197 is installed — restart bili to activate`）。**⇒ 以后看到 `stale: true` 就应该 kill 一次 bili。**

## 诊断端点（bili 自带，很有用）
- `GET http://127.0.0.1:18787/__bili/status` → `{version, diskVersion, stale, autoRestartOnUpdate, inFlight, conflicts:{sessions,events,kinds,latest:[{sessionId,kind,detail}],clients}}`
- `GET http://127.0.0.1:18787/__bili/config` → 当前生效的 config（含 `raw` 原文）
- `GET http://127.0.0.1:18787/__bili/cache-report` → GRAND LEDGER / FOLD ECONOMICS / LINE ITEMS 归因报告
- **`conflicts.kinds` 里的 `unannounced-rewrite`** 实测有 1 条：`{sessionId: "session-a0d5fbf8-...", detail: "9/20 incoming message(s) carry pre-turn refs of 8106 known"}` ⇒ **dsh 客户端侧的插件在重写历史前缀**（与 cache-seam 的发现一致）。

## 待办（未做）
T1 会话内永不切模型（已写进 `~/.dsh/PLAN.md` 铁律）、T3 `tool-result-pruner` `thresholdChars: 8192` → 32768 或删行、T4 关 `dsh-headroom`（需改 `~/.dsh/.agent-presets/anchored-standard/agent.cordis.yml` 或 profile）。

截至 2026-10-16。
