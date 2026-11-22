---
id: mem-2b0e5592968a09669912af9f0e8fec09
revision: 1
created_at: "2026-11-21T20:23:16.051Z"
updated_at: "2026-11-21T20:23:16.051Z"
name: dsh-会话停止渲染-开流竞态
description: "DSH 0.2.1-rc.2 切换会话后视图冻结的根因（开流被 outgoing retirement abort，无重试）与规避手段"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 现象
在 dsh web GUI 里，切走再切回一个**正在 streaming** 的会话，该会话视图冻结；host 继续产出。切会话/重启后才补出积压内容。

## 根因（对齐上游 Discussion #7101，2026-09-18 开帖）
`replaceMain`（packages/client/ui-workspace navigation.ts:303-333）先 retain 新目标（:309）再 release 旧引用（:330）；旧 scope 的 retirement 是**异步**的，几十 ms 后才把 abort 送到 wire。而切回时会话已经发出新的 `session/follow` open 帧，Host 正常回 snapshot —— 但两者赛跑，incoming generation 在 snapshot 到达前被 abort（实测 open 后 8ms 被 cancel）。

关键放大点：`RemoteJournalStream.open()` catch 里 `await this.stream.dispose(); throw error;` —— **不重试**；`Session.doOpen` catch 里 `if (!isRemoteFailure(error)) throw error;` —— 普通 Error 被 rethrow，`openState` 停在 'loading'，UI 无限空白且无错误。此后该 session 在没有 follow 流（实测 42s 无任何 session/follow）。

## 0.2.1-rc.2 实测仍在
- `app.asar/dsh/node_modules/@deepseek-ai/dsh-api-gateway/lib/types/client/journal-stream.js:70-73`
- `app.asar/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/client/sessions/session.js:550-558`（:553-554 即那句 throw）

## 规避（不改代码）
1. 卡住后**新开标签页**直接进该会话 URL（全新 Client，无旧 scope）—— 比刷新可靠。
2. 切走 → 停 1-2 秒 → 再切回，让上一次 retire 落地。
3. 不在「正在 streaming 的会话」之间来回切；等这轮跑完再切。
4. 压并发：maxActiveSubagents=32 时事件洪峰把竞态窗口从几十 ms 拉到秒级。
5. 别在 RDP 里跑重前端（RDP 下 Chromium 常落软件光栅）；用 `launch-web-tailnet.ps1` 那套 `--host 192.168.0.100 --port 3080`，让 Linux 浏览器直接连。

## 相关上游
- #7101 开流竞态（根因）
- #1316 mux 事件流无订阅过滤、无背压（344 帧/s 淹没主线程）
- zhu1090093659/dsh-web 缺陷文档：三处 host 侧 downlink 队列无界（ControlQueue.buffer / SessionControlController.follow 的 buffered / RemoteEventQueue.frames）
- dsh-optimizer 插件：单会话 13.3 万事件中 13.2 万是 assistant/chunk，切换时 history 分页全量重算

截至日期：2026-11-22
