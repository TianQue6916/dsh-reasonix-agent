---
id: mem-2112417d8f0d63cec2c4c3f377e848b2
revision: 1
created_at: "2026-09-28T07:34:25.302Z"
updated_at: "2026-09-28T07:34:25.302Z"
name: windows-task-REDACTED
description: "两个验收陷阱：ScheduledTask 的 LastTaskResult 不是退出码；node 内置 zstd 静默截断多 frame 流"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 一、`LastTaskResult` 不是子进程退出码
Windows ScheduledTask 的 `LastTaskResult` 是**调度器自己的结果码**（0x0 = 调度成功），**不是被启动进程的退出码**。

**实证**：`MemoryToMnemon` 任务的 `LastTaskResult` 一直是 0，而它调用的 `memory-to-mnemon.py` 每天在第 119 行 `NameError` 崩溃、从未执行 `mnemon import`（2026-09-28 发现）。我此前把它当作"任务成功"的证据，导致缺口的验收漏了。

**正确验收方式**（择一，最好都做）：
1. 让脚本自己 append 日志（`memory-to-mnemon.py` → `~/.dsh/logs/memory-to-mnemon.log`；`thread-edges.mjs` → `~/.dsh/logs/thread-edges.log`）。
2. 检查**业务输出物**的新鲜度：`thread-edges.json` 的 `generatedAt`、`~/.mnemon` 的 oplog 等。
3. 手动 `Start-ScheduledTask` 一次再验证，而不是只看 `Get-ScheduledTaskInfo`。

## 二、node 内置 zstd 会静默截断多 frame 流
**不能用 `zlib.zstdDecompressSync` 替代 `zstd -dc`**。

dsh 的 session 文件（`session.v4.jsonl.zstd`）是**多 frame** zstd 流（边写边 flush）。`zlib.zstdDecompressSync` 只解**第一个 frame**，而且**不报错**。

实测对照（Node v24.15.0，8 个样本）：cli 解出 541 / 95386 / 295486 / 292531 / 700097 / 858787 / 1148973 / 1564118 字节，node 内置分别只给 **205 / 176 / 176 / 176 / 213 / 176 / 176 / 176** 字节 —— 0/8 正确，且全部静默。

→ 读 dsh session 必须走 `zstd -dc`（`thread-edges.mjs` 用 `ZSTD_BIN` 环境变量可覆盖路径）。本机系统 PATH 里已解析到 `D:\miniconda\Library\bin\zstd.exe`。
