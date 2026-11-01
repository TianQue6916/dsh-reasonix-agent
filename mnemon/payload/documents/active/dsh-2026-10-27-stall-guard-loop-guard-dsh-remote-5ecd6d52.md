---
id: "5ecd6d52-60e5-4e5b-8671-04a5b2e1911e"
title: "dsh「频繁中断 + 会话渲染空白」归因与处置（2026-10-27）：stall-guard/loop-guard 排除、dsh-remote credential_refresh 失败、29 MB 会话体量上限"
description: "2026-10-27 dsh 桌面会话频繁中断且主视图渲染不出内容的取证：逐个排除 stall-guard(18 次全在 10-07)、gateway loop-guard abort(0 次)、工具失败(0/2520)；定位 dsh-remote credential_refresh INVALID_MESSAGE 34 次并从 web profile 移除；确定 9529 行/29 MB 会话是渲染上限，且 idle-loop-guard 的 enabled:false 只对新会话生效。含各处日志路径、判读命令思路、未验证项。"
status: "active"
created_at: "2026-10-27T15:17:57.311Z"
updated_at: "2026-10-27T15:17:57.311Z"
content_hash: "fa3c61fbce54d113ce2f17621dd05d0dda779014ed1c8ee96164fbcbb1305d70"
source_paths:
  - ".dsh/logs/stall-guard.log"
  - ".dsh/logs/idle-loop-guard.log"
  - ".dsh/logs/tool-calls.jsonl"
  - ".dsh/logs/host-stdio.log"
  - ".dsh/profiles/web/package.json"
  - ".dsh/profiles/desktop/cordis.patch.yml"
  - ".dsh/PLAN.md"
session_ids:
  - "124ab7f1-0827-49e3-a76d-813e14abbe34"
memory_body_ids:
  []
---

# dsh 频繁中断 + 渲染空白：归因与处置（2026-10-27）

关联：[[c88550a9-d4d6-4dc1-b9e3-48f007b19709]] 输出退化三层防线（loop-guard / idle-loop-guard / stall-guard 的阈值与判据设计）。
本文只记录**中断与渲染**这条线的取证结论，不重复阈值校准内容。

## 一、症状

- 会话turn 中途被切断（无 turn/end），用户侧表现为「又断了」，重启 dsh 后主视图仍空白，只剩轨迹（原始事件流）可看。
- 同一时间段 `idle-loop-guard` 仍在弹提示（连续 6 step 无 tool call），说明注入仍在发生。

## 二、逐个排除（证据在 checkpoint 内已取得，不需重跑）

| 嫌疑 | 判读方式 | 结论 |
|---|---|---|
| `stall-guard` cancel | `~/.dsh/logs/stall-guard.log` 里 `STALL-CANCEL` 共 **18** 次 | 全部集中在 **2026-10-07 凌晨 03:45–06:37**（当天 8 次，`phase` 为 `pre-step` / `stream-start`，`idleMs≈240s` 撞 240000 上限）。今天 0 次 ⇒ **排除** |
| gateway `loop-guard` abort | 搜 `"streamError": "loop-guard abort"` | **0 次**（`mode=abort` 开了一天没开火，`fast 0.11` / `slow 0.20` 够严）⇒ 排除 |
| 工具调用失败 | `~/.dsh/logs/tool-calls.jsonl` | 2520 条，失败 0 条 ⇒ 排除 |
| `dsh-remote` 控制连接 | `~/.dsh/logs/host-stdio.log` | `server control connection failed {"code":"INVALID_MESSAGE","retryable":false,"phase":"credential_refresh"}` **34 次** ⇒ **真嫌疑，已处置** |
| `idle-loop-guard` 注入 | 会话 jsonl 里 `source.kind` 分布 | 注入条数 **0**（`enabled:false` 生效后已 prune 掉），日志里命中的 105 处只是 reasoning 提到该词 ⇒ 不是它 |

其余长期噪声（与中断无关，但会淹没日志）：`Cursor ACP CURSOR_BINARY_UNAVAILABLE`、`Codex App Server CODEX_BINARY_UNAVAILABLE`、`Antigravity spawn ...agy ENOENT`、`local-search GitHub HTTP 503 / aborted`。

## 三、处置

1. **从 web profile 移除远程插件**：编辑 `~/.dsh/profiles/web/package.json` 的 `dependencies`，删掉 `ds-harness-remote`（依赖 9 → 8），先备份 `package.json.bak-*-pre-drop-remote`。
   - `desktop` profile 保留（`ds-harness-remote ^0.5.17`），二进制的缺失只影响它的远端域。
   - 判据：`credential_refresh` 阶段 `retryable:false` ⇒ 每轮必败重试，属于确定性故障，不是网络抖动。
   - 注意 `dsh profiles remote` 并不存在该 profile（误敲会报 `profile "remote" does not exist`），凭证目录是 `~/.dsh/remote/servers`。
2. **`idle-loop-guard` 三 profile 均 `enabled: false`**（desktop / web / headless），已用 `dump-config` 确认合成结果为 `enabled: false`。
   - **关键约束**：`cordis.patch.yml` 的 HMR 是 patchReload，**只对重启后新建的会话生效**；已打开的会话继续用加载时那份配置。因此「改了却还弹提示」不等于改失败。

## 四、渲染空白的真正原因：会话体量

同一个会话 `~/.dsh/sessions/--C-Users-27063--/session-7da4ba19-.../session.v4.jsonl.zstd`：

- 解压后 **29,286,837 字节 / 9,529 行**；对照一个正常会话 389 行。
- 事件计数：`user/message 3405`、`step/start 1078`、`step/end 1077`、`tool/call 1057`、`tool/result 1056`、`turn/start 96`、`turn/end 95`。
- 三对计数**各差 1** ⇒ 最后一个 turn 没有收尾；前端在等一个不会到来的 `turn/end`，于是对话框空白，而轨迹视图不需要完成态所以还能显示。

结论：这不是插件 bug，是**会话数据本身太重**。处置优先级：开新会话（PLAN.md / memory / `kb/` 都已落盘，切会话不丢上下文）> `/compact` > 直接手改 session 补 `turn/end`（风险最高，不建议先做）。

## 五、仍未验证

- 重启 + 新会话后是否还断（若仍断，只剩「会话体量」一个变量，可直接用体量解释而不再查插件）。
- `wake-guard.log` 里 `ACTION last109 (Reboot)` + `OK: last transition was Reboot` 是否出现（连环关机修复的验证项，属于另一条线）。
- `dsh-mnemon` 的 `idle review failed: memory subagent stopped with aborted`（出现 2 次）是否与主 session 的 turn 生命周期耦合——未取证，`idleReviewMs` 当前为 300000（配置注释记录了 30 s → 300 s 的调整与碎片化理由）。
