---
id: mem-6c9fffab2c1fc783fe8c01689b565379
revision: 2
created_at: "2026-10-25T18:25:37.886Z"
updated_at: "2026-10-25T18:39:09.030Z"
name: dsh-pwsh-常驻化-p1
description: "pwsh 常驻化 P1 已上线验收：PID 相同、状态持久、FullLanguage；677→189ms（-72%，3.59×）；cold 路径有 468ms 是 seam 开销；pwsh 有状态而 bash 无状态"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## dsh 在 Windows 上启用 pwsh 常驻（方案 P1），2026-10-26 已上线并验收

### 结论：成功，收益 3.59×
`pwsh` 工具从「每次 cold-spawn」改为「每 agent 一个常驻 ConPTY shell」。
**实测（`~/.dsh/logs/tool-calls.jsonl` 的 `durMs`，整个 tool-call 往返）**：

| | n | median | min | p90 | max |
|---|---|---|---|---|---|
| cold（重启前） | 40 | **677 ms** | 480 | 4158 | 19928 |
| persistent（重启后） | 3 | 245（含 1134 预热） | 133 | — | 1134 |
| persistent 稳态 | 2 | **189 ms** | 133 | — | 245 |

⇒ **省 488 ms/次 = −72%，加速 3.59×**。首次调用 1134 ms（ConPTY 起 shell）只付一次。

**关键修正（比预期收益更大）**：`677 − 209`（纯 `pwsh -NoProfile` 启动）= **~468 ms 是 `dsh-tool-pwsh` 自身的 seam 开销** —— 它的描述是 "over the bash executor seam"，即套了一层 bash 再起 pwsh。常驻化把「启动 + seam」两层一起砍掉了。

### 验收证据（2026-10-26 02:37，同一 session 连续调用）
- `$PID` = **17824 / 17824**（相同）⇒ 真常驻，不是每次新进程
- 第 1 次设的 `$env:TESTVAR` 在第 2 次仍为 `kept-across-calls`；`Get-Location` 保留 ⇒ 状态跨调用持久
- 中文输出正常（`汉字 与 ★`）；`[Console]::OutputEncoding` = **utf-8**
- `$PSVersionTable.PSVersion` = **7.6.8**
- `$ExecutionContext.SessionState.LanguageMode` = **FullLanguage** ⇒ **README 警告的 ConstrainedLanguage 风险未发生**（当前 sandbox 不是 ACL read-only 模式）
- 无错误事件；`bash` 工具行为完全不变

### ⚠️ 新的语义不对称（最重要的一条使用约束）
`pwsh` 现在**有状态**，`bash` 仍**无状态**（每次冷启动新进程）。
- 在 pwsh 里 `cd` 之后，bash 不会跟着；
- 在 pwsh 里设的 `$env:` 会一直留着，可能累积污染；
- **`timeoutMs` 绝不调小** —— README 明说 `Reset, never repair`，工具级超时会**关掉 shell 并丢掉全部状态**（命令内部的 coreutils `timeout 30` 不受影响，那是子进程级）。

### 配置（已落地于 `profiles/desktop/cordis.patch.yml`）
根因：`persistent-shell` group 标了 `disabled: !!js process.platform === 'win32'` ⇒ Windows 上从没挂载过 PTY backend。

① `tool-pwsh`（`@deepseek-ai/dsh-tool-pwsh`）门控改为 `disabled: !!js process.platform === 'win32'`
   （两个包都注册工具名 `pwsh`，同 layer 重复注册会被 registry 拒）。
② `custom-bash` 之后新增 win32-exclusive group：
```yaml
- id: pty-win
  name: cordis:group
  group: true
  disabled: !!js process.platform !== 'win32'
  isolate:
    terminals: true
  config:
    - id: pty-win-backend
      name: '@deepseek-ai/dsh-terminal'
    - id: terminal-pwsh-win
      name: '@deepseek-ai/dsh-terminal-bash'
      config:
        shellDialect: pwsh
        shellPath: 'C:\Program Files\PowerShell\7\pwsh.exe'
        timeoutMs: 300000
    - id: persistent-pwsh-win
      name: '@deepseek-ai/dsh-tool-pwsh-persistent'
      config:
        timeoutMs: 300000
        maxOutputChars: 16000
```
备份：`profiles/desktop/cordis.patch.yml.bak-20261026-pre-pty-win`（77523 bytes，改前）。
`web` / `headless` **未改**，等 desktop 观察几天再同步。

### 依赖包（全都已装，v0.2.1-rc.2，在 `~/.dsh/profiles/node_modules/@deepseek-ai/`）
`dsh-terminal`（PTY seam）、`dsh-terminal-bash`（backend，`shellDialect: z.union(["bash","pwsh"]).default("bash")`，显式 `shellPath` 优先）、`dsh-tool-bash-persistent`、`dsh-tool-pwsh-persistent`。
README 原文：**「requires an owning Agent and a real terminal backend with a pwsh dialect — Windows ConPTY or a POSIX pwsh」**。

### 踩坑（会重犯，务必记住）
用 python heredoc 写 YAML / markdown 时：
- `'C:\\...\\PowerShell\\7\\pwsh.exe'` 里的 **`\7` 被解释成八进制转义 `\x07`（BEL）**
- `C:\Users\...` 里的 **`\U` 直接抛 `unicodeescape` 错误**（这个还好，会报错）
- `C:\mingw64\bin` 里的 **`\b` 被解释成 backspace `\x08`**
前两种会**静默**写入不可见控制字符，PyYAML 和 `cat` 都发现不了。
⇒ **Windows 路径一律用 raw 字符串**（`r"C:\..."` 或三引号 `r"""..."""`），写完必须扫 `ord(c) < 9 or 11 <= ord(c) <= 31`。
（这条坑已在 PLAN.md 里污染过 5 行、在 cordis.patch.yml 里污染过 shellPath，全部已修。）

### 观察期检查项
连续几天看 `logs/tool-calls.jsonl` 里 `pwsh` 的 `isError` 与 p90。marker 提取失败会降级到 silence 慢路径，表现为 durMs 突然跳到 1 s+。稳定后再同步 web / headless。

### 回滚
`cp profiles/desktop/cordis.patch.yml.bak-20261026-pre-pty-win profiles/desktop/cordis.patch.yml` + 重启 dsh。

数字背景与对照见 fact `spawn-vs-常驻-worker-实测`。
