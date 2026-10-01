---
id: mem-26123472706a36b85a52e50959db7aef
revision: 1
created_at: "2026-09-28T07:20:39.604Z"
updated_at: "2026-09-28T07:20:39.604Z"
name: dsh-mnemon-realtime-sync
description: "修复 memory→mnemon 同步的三处 bug，并新增 memory_remember 实时同步通路（含开关与回滚）"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 为什么需要
markdown 语料（`~/.reasonix/memory/<scope>/*.md`）是 canonical —— 跨 harness（reasonix ⇄ dsh）与跨机同步都靠它；mnemon 是 **dsh 这一侧**的检索/注入层。两者之间原本只有每天 12:20 的 `MemoryToMnemon` 计划任务这一条桥 → 新写的 fact 最长 24h 不出现在 `mnemon recall/search` 里。2026-09-28 用 `blockedAfterConsecutiveRounds` 当探针实测 `mnemon search hits=0` 确证。

## 已落地（2026-09-28）
1. **`memory-to-mnemon.py` 修 frontmatter 缩进解析 bug**：`g()` 原用 `^key:` 锚定行首，但 `metadata:` 下的键是缩进的（`  fact_type: reference`）→ `type`/`fact_type`/`scope` 全部读不到 → 每条 insight 的 category 都塌成 `fact`（`mnemon status` 实证 212/212），`fact_type` 分层 importance 规则也全部失效。改用 `^[ \t]*key:` 后 category 分布变成 `{context: 66, preference: 16, fact: 136}`。
2. **`fact_type` 优先，且拒绝 `type: user` 作为画像标记**：`metadata.type` 在本语料里是默认填充值（142/177 个文件都是 `user`），若拿它当画像信号，几乎所有 fact 都会跳到 importance 4（= mnemon gc 的 immune 区）直接废掉 importance decay。fallback 只在 `type ∈ {feedback, project, reference}` 时采用。
3. **修一处致命 NameError**：`print(f"  max content ... max tag {max(blen(t) for t in ins for t in x['tags'])}")` 里 `x` 未定义，而且它执行在 `mnemon import` **之前** → 脚本每天只落盘 draft、从不 import。已改为 `for x in ins for t in x['tags']`。
4. **新增 `--only <name>`**：只同步一个 fact，走独立临时 draft（`%TEMP%/mnemon-draft-<name>-<ms>.json`），避免与每日全量任务互相覆盖。
5. **新增 append 日志 `~/.dsh/logs/memory-to-mnemon.log`**：因为实测 **ScheduledTask 的 `LastTaskResult` 在脚本崩溃时仍报 0**，它不能作为成功的证据。
6. **`memory.mjs` 加 `syncToMnemon()`**：`memory_remember` 写完后 fire-and-forget `spawn(python, [memory-to-mnemon.py, '--only', name, '--src', dir])`，detached + `stdio:'ignore'` + `unref`，失败不影响写入。两个 scope 都支持（`dir` 就是该 scope 的语料目录）。

## 开关与回滚
- `DSH_MNEMON_SYNC=0` 关闭实时同步；`DSH_PYTHON` 覆盖解释器（默认 `python`，本机 = Python313）。
- 备份：`memory.mjs.bak-20260928-1520-pre-mnemon-realtime`、`memory-to-mnemon.py.bak-20260928-1515-pre-realtime-sync`。
- **`memory.mjs` 的改动需要重启 dsh 才加载**（preset .mjs 不参与 patchReload: live 的 HMR，HMR 只 watch profile patch 文件本身）。

## 验证证据
mock ctx + 假 mnemon（`MNEMON_BIN` 指向记录参数的 .cmd）+ 隔离语料目录：`memory_remember` → spawn → 脚本 → 假 mnemon 收到 `import "<draft>"`，global 与 project 两个 scope 各一条，rc=0。真实 mnemon 侧用 `--only dsh-goal-stop-mechanism` 跑通，`mnemon search "blockedAfterConsecutiveRounds"` 命中。

## 已知限制
- **已入库的 212 条 insight 不会因修复而更新分类/importance** —— `mnemon import` 走内容 dedup，旧 insight 被 skip。只有新增/内容变更的 fact 按新规则入库。
- 全量重建需 `--no-diff` 重灌（会丢 dedup 保护），未做。
- `MNEMON_BIN` 传正斜杠路径曾让 cmd.exe 报 not recognized，已在脚本里对 `os.name == 'nt'` 归一化 `/` → `\`。
