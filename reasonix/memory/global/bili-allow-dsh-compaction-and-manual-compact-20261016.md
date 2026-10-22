---
id: mem-ccdadef859f3a4e2c7180254b71a307e
revision: 1
created_at: "2026-10-16T08:50:08.861Z"
updated_at: "2026-10-16T08:50:08.861Z"
name: bili-allow-dsh-compaction-and-manual-compact-20261016
description: "bili 开 allowDshCompaction 恢复 /compact 手动压缩；二层开关（auto:false + allowDshCompaction:true）的区别；kill bili 不会自动拉起已成定论"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 落地的配置（2026-10-16 16:5x）
`C:\Users\27063\.config\billion-context\billion-context.json` 现在是：
```json
{
  "providers": {},
  "compress": {
    "nudgeGrowthTokens": 150000,
    "preserveRecentTokens": 20000,
    "preserveRecentMessages": 10,
    "injectNudge": false,
    "maxContextLimit": "60%"
  },
  "dsh": { "allowDshCompaction": true }
}
```
备份：`billion-context.json.bak-20261016-...-pre-allow-dsh-compaction`。

**生效验证**：`curl -s http://127.0.0.1:18787/__bili/config` → `"allowDshCompaction": {"enabled": true, "source": "file"}`（改前是 `{"enabled": false, "source": null}`）。

## 为什么必须开这个（用户硬需求：手动压缩）
用户依赖 `/compact`（手动）。但 bili 默认 `dsh.allowDshCompaction = false` ⇒ **bili 在 wire 层否决 dsh 的 native compaction 调用**，bili.log 逐字：
```
[passthrough] dsh native compaction call identified on the unattributed passthrough lane (#1117/#2709)
  — REFUSED, not forwarded: bili owns compression on this lane; a landed dsh checkpoint would durably
  shadow the raw history (#1729, cf. #1772/#1206).
```
⇒ dsh 收不到摘要 ⇒ 界面报 **`Compaction could not produce a useful summary. The attempt is recorded in the session log.`**

**关键区分（我曾搞混，务必记住）**：
- **`compaction-basic` 的 `auto: false`**（preset 层，已改三处）只关**自动触发**；**管不到 `/compact` 手动命令**。
- **`/compact` 走的是同一条 compaction pipeline**，因此仍会被 bili 拦 ⇒ 必须开 `dsh.allowDshCompaction: true` 才真正可用。
- 二者是**两层开关，缺一不可**：`auto:false` 防自动破 cache，`allowDshCompaction:true` 让手动能用。

**与 bili 压缩共存的安全性**：因为 `injectNudge: false` 已关掉 bili 的自动折叠，所以实际只有两条路 —— bili 在 60% 窗口时压一次、dsh 只在用户点 `/compact` 时压，**不会同时跑**。

## ★★ 运维教训（第二次验证，已成定论）：kill bili 后**不会**自动拉起
- 2026-10-16 第一次 kill（pid 15368）⇒ dsh 自动拉起（新 pid 5376）。
- 之后两次 kill（pid 5376、16788）⇒ **都没有自动拉起**，必须手动：
```powershell
Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' `
  -ArgumentList @('C:\Users\27063\.dsh\profiles\desktop\node_modules\billion-context\dist\index.js','start','--host','127.0.0.1','--port','18787') `
  -WindowStyle Hidden -WorkingDirectory 'C:\Users\27063\.dsh\profiles\desktop\node_modules\billion-context'
```
**⇒ 把「kill 后手动拉起 + `curl /__bili/status` 确认」当成固定步骤**，否则 dsh 与上游之间断流。

## 相关（同批已完成）
- `tool-result-pruner` 的 `thresholdChars` 8192 → **32768**（三处：`profiles/{desktop,web}/cordis.patch.yml:567` + `.agent-presets/.../agent.cordis.yml:383`），两个 profile 的 dump 均确认生效。
- `plan-anchor.mjs` v2（`:181` 起）：上一处「删历史中间的旧消息 + 尾部追新」会让**每步**击穿一次 prefix cache；改为「确认历史里有逐字节相同副本则跳过，一条都不动」，fail-open 回原行为。**待重启 dsh 进程生效**。
- **`.agent-presets/**` 下的 mjs 不参与 HMR，必须重启 dsh 进程才加载**；profile patch 的 yml 走 `patchReload: live`，改完开新 session 即生效。

截至 2026-10-16。
