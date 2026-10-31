---
id: mem-4a3e0c0ae458698b9047bf1ff88f97b2
revision: 1
created_at: "2026-10-26T16:14:49.672Z"
updated_at: "2026-10-26T16:14:49.672Z"
name: goat-gateway-loop-guard-abort-mode
description: "goat-gateway loop-guard：n-gram novelty 判据、阈值依据、abort 动作、提权改配置的三个坑、已知盲区"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 位置与状态
`D:\80-系统\Toolbox\goat-gateway\loop-guard.mjs`（424 行，2026-10-01 写）+ `config.json` 的 `loopGuard` 块。
**2026-10-27 00:12 从 shadow 切到 abort，已生效**（gateway 日志确认 `LOOP-GUARD enabled mode=abort`）。

## 判据（比逐字周期更强）
字符级 **6-gram 滑动窗口 novelty**（唯一 gram 数 / 窗口内 gram 总数），三尺度：
- `fastCapacity=256`（早发现，只抓 token 级塌缩）
- `slowCapacity=4096`（主判据）
- `longCapacity=16384`（长输出补充）

**为什么不用周期检测**：周期只抓得住已塌缩的精确重复（`（...）\n（...）`），前半段「好。写。输出。」语义打转但字面各异，抓不住；等塌缩时已烧掉几千 token。

**为什么不用 token 熵**：temperature 会把随机性加回来，在 {好,写,输出} 里随机挑的循环，token 级 empirical entropy 看起来完全正常。观测量必须是**序列**的 novelty，不是**分布**的熵。

## 阈值（2026-10-27 按线上分布重定）
```json
"thresholds": {
  "reasoning": { "fast": 0.11, "slow": 0.20, "long": 0.20 },
  "text":      { "fast": 0.15, "slow": 0.20, "long": 0.20 }
}
```
依据：8359 请求里 405 次 fast 命中的分布双峰 —— `[0,0.02)` 187 次（几乎逐字复制）+ `[0.15,0.20)` 136 次（擦边、误报未知）。取 0.11 覆盖「好。写。输出。」那类短空转（2026-10-26 实测 `minFast=0.1055`）且排除 136 次擦边。slow/long 的 0.20 来自离线校准（degen 40 条 max=0.2786 vs ctrl p05=0.6975，检出 40/40、误报 1/163=0.6%）。

## abort 动作（gateway.mjs ~1236 行）
```js
if (guard.cfg.mode !== 'abort') return;
try { upRes.destroy(); } catch {}          // 断上游 = 真正止损、停止计费
clientRes.write('data: [DONE]\n\n');        // 必须给合法 SSE 收尾
finishStream({ ok: true, streamError: 'loop-guard abort' });
```
**注释里那条很重要**：直接 destroy 客户端连接会让 dsh 当网络错误走 retryPolicy 重跑，反而更费额度 —— 必须让客户端正常读到 `[DONE]`。

## 改配置的两条硬事实
1. **`D:\80-系统` 是 High IL，普通进程写不进**（python/pwsh/touch 全 PermissionError）。改 config 只能提权。
2. **`Start-Process cmd.exe -ArgumentList '/c','x.bat' -Verb RunAs` 必须【异步】（不加 `-Wait`）** 才弹得出 UAC；加 `-Wait` 会静默失败。schtasks 和 `cmd //c` 在这台机器上都失败（`/Create` 被 MSYS 吃成 `reat(e)`）。
3. **`Copy-Item` 保留源文件 mtime** ⇒ gateway 的 mtime watch 检测不到变化，必须手动 `curl http://127.0.0.1:8788/_gateway/reload`。`reloadRuntimeConfig()` 会重建 `LOOP_GUARD`（`gateway.mjs:213`）。

## 已知盲区（2026-10-27 实测）
- **只输出 reasoning、content 为空的请求**：`chans` 里只有 `reasoning`。短英文词重复（`line line line`）在 6-gram 尺度上 novelty 仍有 0.9+，**抓不住** —— 6-gram 对 < 6 字符的周期不敏感。中文短句（「好。写。输出。」8 字符）能抓（实测 minFast 0.1055）。
- **跨 turn 空转抓不到**：「连续 N 条 assistant 消息都是纯文本、无 tool call、novelty 低」这个模式 gateway 看不到，必须放在 dsh 侧做。

## 回滚
`cp config.json.bak-20261027-0012{10,20}-pre-loopguard-abort config.json` + `curl .../_gateway/reload`；或把 `mode` 改回 `'shadow'`。
