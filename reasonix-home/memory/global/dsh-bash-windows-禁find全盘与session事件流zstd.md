---
id: mem-3d68597405c16c0e3f729fce0e4ff031
revision: 1
created_at: "2026-10-01T06:14:19.208Z"
updated_at: "2026-10-01T06:14:19.208Z"
name: dsh-bash-windows-禁find全盘与session事件流zstd
description: "Windows/Git Bash 上 find / 会全盘扫导致卡死（含 -xdev 解法）；dsh session 事件流是 zstd 压缩，grep 前必须先解压"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 症状与根因（2026-09-30 实测，dsh 会话被一条命令卡死）

命令 `find / -maxdepth 6 -type d -name "dsh-web-search*" 2>/dev/null` 卡死。

- Git Bash 的 `/` **不是磁盘根，而是 `C:\Git`**（Git for Windows 安装目录）；`C:` 与 `D:` 分别挂在它内部的 `/c`、`/d` ⇒ `find /` 实际是 **C:\ 与 D:\ 全盘扫**。
- 量化：只算 `C:\Users\27063` 一个子树、depth ≤ 6 = **23563 个目录 / 9.7s**（其中 `sys 6.98s`，时间全在内核 stat）。NTFS junction / reparse point 还会造成无限 directory walk。
- `2>/dev/null` 会把权限错误全吞掉 ⇒ 外表是"没输出但一直在跑"，最容易误判成 hang。
- 对照：`find / -maxdepth 6 -xdev`（`-xdev` = 不跨 mount point）**2.4s / 3111 个目录**。
- harness 层：同一 block 里的多个 tool call 并发下发并一起等待 ⇒ 第一个卡住，第二个连 dispatch 都到不了（表现为 "aborted before dispatch"）。

## 执行规矩（此后一律遵守）

1. 每条 bash 命令套 `timeout N`（超时会给出 exit 124 这个可观测信号）。
2. 搜索 root 边界化：从 `~/.dsh`、`D:/Toolbox` 等已知目录起手，**永不 `find /`**；MSYS 里至少加 `-xdev`；Windows 侧用 `where` / `Get-ChildItem -Recurse -Depth N -Filter`。
3. 找包/文件位置用 `node -p "require.resolve('<pkg>')"`（在目标 cwd 跑），别全盘 find。
4. 不用 `2>/dev/null` 掩盖错误；长任务丢后台 job（job_list / job_output），不阻塞主链。

## dsh session 事件流是 zstd（grep 前必须解压）

- 真实事件流：`~/.dsh/sessions/<cwd-slug>/session-<id>/session.v4.jsonl.zstd` —— **zstd 压缩**，直接 `grep` 必然 0 命中（曾据此误判"事件不存在"）。
- 读法：`pip install zstandard`，然后 `zstandard.ZstdDecompressor().stream_reader(open(path,'rb')).read().decode('utf-8','replace')` 按行 JSON 解析。
- `~/.dsh/storages/session_projcache/**` 只是投影缓存，不含完整事件流；不要拿它当证据源。
- `~/.dsh/logs/dsh-web-3080.out.log` 未必是当前进程的 stdout（取决于启动方式）⇒ **不能**用它的 mtime/体积推断"有没有 warn"。
- 想确认某 provider 是否真被调用：DeepSeek 搜索 provider 每次搜索会往 session append 事件 `web/deepseek-search-llm-request`（解压后 grep 该字符串）。
