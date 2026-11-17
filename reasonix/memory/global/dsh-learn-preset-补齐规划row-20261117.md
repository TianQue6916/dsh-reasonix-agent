---
id: mem-da5c8357d0721b9996c7133f839ef698
revision: 2
created_at: "2026-11-16T17:00:48.888Z"
updated_at: "2026-11-16T17:04:25.891Z"
name: dsh-learn-preset-补齐规划row-20261117
description: "learn preset 缺 8 个 row（含 plan-anchor）已补齐；mnemon 运行时记忆上限 4096 与 Source 侧 8192 不一致已对齐"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 结论（2026-11-17 修完）

**learn preset 缺规划 row**：`preset-learn` 在 `~/.dsh/profiles/{web,desktop}/cordis.patch.yml` 里原来缺 8 行：`host-log-tee`、`concurrency-discipline`、`session-age-warn`、`plan-anchor`、`subagent-language`、`git-context`、`tool-goal`、`planning`。症状 = learn 会话完全没有任务规划（`~/.dsh/plans/<session-id>.md` 不建不注入）。

根因：11-16 的 `d535faf6` 按 `.agent-presets/learn/preset-declaration.yml` 逐字搬 plugins，而那份文件（0.1.7 起目录不扫描，从未被加载）本身只有 8 行。该文件已改名 `preset-declaration.yml.retired-20261117`。

现约定：`preset-learn` = `preset-anchored-standard` 只减 `tool-bootstrap` + `context-gate`（learn 故意首轮工具齐全）。web learn 31 行、desktop 30 行，顺序与 anchored 一致。改一边必须同步另一边 + 两份 patch 都改。

## 运行时记忆上限（同日已修）

报错 `dsh-mnemon: automatic Git backup failed ... 5747 bytes and exceeds its 4096 byte limit` 的根因：两处限额不一致。`mnemon-source-runtime` 配了 `userLimitBytes: 8192 / memoryLimitBytes: 16384`，但 `mnemon` 控制器侧没配 `runtimeMemory`，用上游默认 4096 / 10240（`dsh-mnemon-source-runtime/lib/contracts-*.js` 里 `DEFAULT_RUNTIME_USER_LIMIT_BYTES = 4096`、`DEFAULT_RUNTIME_MEMORY_LIMIT_BYTES = 10240`；校验点 `dsh-mnemon/lib/index.js:2274`）。

修法：在两份 patch 的 `- id: mnemon` config 里加

```yaml
runtimeMemory:
  userLimitBytes: 8192
  memoryLimitBytes: 16384
```

与 Source 侧对齐。上游明确支持（PR #102 落地、#514 进设置页，硬上限 1 MiB），不需要 patch 源码。USER.md 5747 B / MEMORY.md 10603 B 现在都在限内。

## 行尾陷阱

- `profiles/web/cordis.patch.yml` 纯 CRLF；`profiles/desktop/cordis.patch.yml` 混合（636 CRLF + 1764 LF）。别统一。
- `read().decode().split('\n')` 后原行带 `'\r'`，再给插入行补 `'\r'` ⇒ `\r\r\n`，git diff 会报全文件重写（实测 2291/2208 而非 83/0）。
- 判据：`git diff --ignore-cr-at-eol --numstat -- <file>` 应等于真实改动行数。

## 生效

改 patch 需重启 dsh 进程（不是开新会话）。入口 `~/.dsh/storages/tools/dsh-restart.bat`、`delayed-restart-dsh.ps1`。重启后自检：新会话出现 `# 任务规划 · <session-id>` 注入，`ls -t ~/.dsh/plans/ | head` 出现新文件；`logs/host-stdio.log` 不再刷 Git backup 失败。

## 遗留判断

USER.md 里「当前状态（2026-11-12 复核）」这类条目属于易变状态，放在 runtime（每轮注入）是错层 —— 按上游分层原则应进 MEMORY.md 或 Documents。目前没动，等他自己决定删改。
