---
id: "39cd6686-7e84-40a4-a971-cfd2995f8353"
title: "custom-bash 分级超时（TIMEOUT_RULES）：为什么「schema 有可选参数」治不了根 + heredoc 吞 \\b 的坑（2026-10-29）"
description: "承接 85db2c49 / c495f84f：在 custom-bash.mjs 里把超时从「模型可选传参」改为「按命令类型自动分级」，含完整 TIMEOUT_RULES 规则表、优先级（显式 > 规则 > 120s 默认）、17/17 单测与端到端取证，以及正则经 heredoc 写入被吞成退格符 \\x08 导致 17 条规则静默全失效的排查教训与验收方法。"
status: "active"
created_at: "2026-10-29T06:07:19.148Z"
updated_at: "2026-10-29T06:07:19.148Z"
content_hash: "368134f2214b82fea0a6ed05de6b66f5b211ed0ba98ede5a803a324d31eba161"
source_paths:
  - ".dsh/.agent-presets/anchored-standard/custom-bash.mjs"
  - ".dsh/.agent-presets/anchored-standard/concurrency-discipline.mjs"
session_ids:
  - "c1cffae8-b3db-4dc8-8160-61fff1837e63"
memory_body_ids:
  []
---

# custom-bash 分级超时：让工具自己决定，而不是求模型记得写

本机 Windows（`C:\Users\27063`，Git Bash），2026-10-29。前序取证见
`85db2c49-dd80-4157-8e6c-160df380273e`（`timeoutMs` 只定义未使用 → schema 加 `timeout` 参数 +
`AbortSignal.any` + `unref`）与 `c495f84f-f1d3-4172-b021-244be70b0002`（120s 硬默认的成因、
preset `.mjs` 改动对已存在会话不生效）。本文只记录**这两步之后仍然治不了根**的部分。

## 结论先行

> **schema 里有可选参数 ≠ 模型会用它。** 「可选参数」永远竞争不过模型「少写一点」的倾向，
> 尤其是当「要不要写」取决于一个主观判断（"这个命令会不会超过 60s"）时——模型对每条命令
> 都觉得「这个应该挺快」。

实测判据（解压新建会话 `session-eeb1749b` 的 session.v4.jsonl.zstd）：
bash schema 有 `timeout` = True、`concurrency-discipline` 为新版、该会话 bash 调用 0 次。
⇒ **注入链路 100% 通了，缺的是「必然被执行」的机制**。

修法：把超时决策从 instruction 层下移到**工具实现层**，`custom-bash.mjs` 内置按命令类型分级的
`TIMEOUT_RULES`，完全不依赖模型。

## 优先级（三档）

1. 模型显式传入的 `timeout`（秒）
2. `TIMEOUT_RULES` 命中
3. 默认 `120_000`（由原 300s 收紧）

## 规则表（落地版本，17/17 单测通过）

```js
const TIMEOUT_RULES = [
  // 可能永久挂住：等 stdin / 等网络 / 交互式
  { re: /\b(ssh|scp|sftp|rsync|telnet|ncat|nc|ping|tracert|traceroute)\b/,        ms: 30_000 },
  { re: /\b(curl|wget|Invoke-WebRequest|Invoke-RestMethod)\b/,                    ms: 60_000 },
  // 慢但该等的：装包 / 仓库 / 构建 / 全量测试
  { re: /\b(npm|pnpm|yarn|bun|pip|pip3|apt|apt-get|brew|cargo|gem|composer)\s+(install|add|update|upgrade|sync)\b/, ms: 300_000 },
  { re: /\b(git\s+(clone|fetch|pull)|docker|podman)\b/,                           ms: 300_000 },
  { re: /\b(vitest|jest|pytest|tsc|webpack|vite|esbuild|rollup|turbo|nx)\b/,       ms: 300_000 },
  // 会跑但一般几十秒内结束的
  { re: /\b(dsh\s+--|python3?\s+-c|node\s+-e)\b/,                                 ms: 60_000 },
]
```

要点：

- `npm run build` **不该**被 `install` 规则吃掉 → 规则用 `\s+(install|add|update|upgrade|sync)\b`
  而不是裸 `npm`；`git status` 同理，用 `git\s+(clone|fetch|pull)`。
- `vite` 等词同时出现在 `npm run` 里，因此 300s 规则必须排在 60s「会跑但短」规则之前，且
  默认值收紧到 120s 以免 `ls`/`echo` 也吃 300s。
- `dsh --` 与 `dsh <subcmd>` 只保留 `dsh\s+--`，避免把长远行命令一起吞掉。

## 端到端验证（不等真实时间，mock 子进程）

```
① 无 timeout（config=1000ms）: 1003ms  ->  bash timed out after 1000ms — aborted: sleep 999
   拿到 AbortSignal 类型: AbortSignal
② timeout=0.3s:                309ms  ->  bash timed out after 300ms — aborted
③ timeout=99s（被夹到 1s）:    1010ms  ->  bash timed out after 1000ms
④ schema.properties = ["command","workdir","timeout"]，additionalProperties = false
显式压过规则：ssh + timeout=0.4s → 403ms（消息里 limitMs=400）
```

## 踩坑：heredoc 把正则里的 `\b` 吞成退格符 `\x08`

第一版规则写入后**17 条全部失败**，所有命令都走默认 120s。实际落盘内容：

```js
{ re: /\b(ssh|scp|rsync|ping|...)\b/, ms: 30_000 }   // 期望
{ re: /(ssh|scp|rsync|ping|...)/,     ms: 30_000 }   // 实际（\b 变成 \x08，正则静默失效）
```

`sed` 打印时退格符是不可见控制字符，肉眼看不出差异；`node --check` 也仍然通过。

排查方法：数反斜杠。`grep` 回来看实际字节，或写入后断言文件里反斜杠个数。
最终改用 Python `chr(92)` 构造反斜杠重写规则表，一版通过（"含 17 个反斜杠，SYNTAX OK"）。

**通用教训**：正则 / 转义序列经过 shell heredoc、`sed`、多重引号写入时，必须以「读回字节」验证，
不能信「写入成功」的返回值或 `sed` 的打印结果。

## 生效边界与验收

- 当前已存在会话仍持旧 schema 与旧实现；**下次新开的会话自动获得分级超时**，用户与模型都无需额外动作。
- 验收方法：新会话里跑一条 `ssh`（应 30s 死）或 `curl`（应 60s 死），而不是 120s。
- 相关但未变的结论：没有 refresh 语义、`process.exit()` 与 undici 的 UV assertion 崩溃见
  `584495bb-785a-4ab3-9a15-50367bd1fe64`（`process.exitCode` 让事件循环自然排空）。
