---
id: "725a1b1a-0814-420c-92db-1be81f77e3bb"
title: "dsh Windows pwsh 常驻化（P1）重启后验收：PID/状态持久确认、实测 3.59× 与 seam 开销 468 ms 的发现"
description: "2026-10-26 02:37 重启后实测验收：pwsh 工具改由 dsh-tool-pwsh-persistent + Windows ConPTY 提供后，$PID 17824 跨调用一致、$env 与 cwd 持久、中文 utf-8、FullLanguage 通过；收益 cold median 677 ms → 稳态 189 ms（−72%，3.59×，n=3 小样本），并定位到被砍掉的 ~468 ms 是 dsh-tool-pwsh 自身的 bash executor seam 而非 .NET 启动；记录由此产生的 pwsh 有状态 / bash 无状态不对称约束与 timeoutMs 绝不调小的理由。配置改动、根因与 BEL 踩坑见文档 e6971222。"
status: "active"
created_at: "2026-10-25T18:40:24.249Z"
updated_at: "2026-10-25T18:40:24.249Z"
content_hash: "c9bcfb02315d6161004482a1edd16162692cf0b6581348cef46bc58fb3f013af"
source_paths:
  - ".dsh/profiles/desktop/cordis.patch.yml"
  - ".dsh/profiles/desktop/cordis.patch.yml.bak-20261026-pre-pty-win"
  - ".dsh/PLAN.md"
  - "logs/tool-calls.jsonl"
session_ids:
  - "792d6369-df38-4707-a338-f5ccbc5eb0de"
memory_body_ids:
  []
---

# dsh Windows pwsh 常驻化（P1）重启后验收

**日期**：2026-10-26 02:37（同 session 实测） ｜ **机器**：Windows，用户目录 `C:\Users\27063`
**前序**：配置改动、根因定位、四条静态验证与 `\7`→BEL(0x07) 踩坑见文档 `e6971222-e273-4968-8258-74da4cc5c00a`（本文不重复）。

## 一、验收：5 项全过

重启 dsh 后（新增插件行 + node_modules bundle 不在 patch HMR 覆盖范围内，必须重启），连续两次调用 `pwsh` 工具：

| 检查 | 结果 | 含义 |
|---|---|---|
| `$PID` 跨调用 | **17824 / 17824** | 真常驻，同一个 shell 进程 |
| `$env:TESTVAR` 跨调用 | `kept-across-calls` 保留 | 环境变量持久 |
| `Get-Location` 跨调用 | 保留 | cwd 持久 |
| 中文输出 | `汉字 与 ★` 正常；`[Console]::OutputEncoding` = **utf-8** | README 担心的 marker-anchored 提取回显问题未出现 |
| `SessionState.LanguageMode` | **FullLanguage** | README 警告的 ConstrainedLanguage 风险未发生 |
| `bash` 工具 | 行为完全不变 | 无回归 |

其余：PSVersion 7.6.8，无错误事件。

## 二、实测收益：−72%，3.59×

数据源 `logs/tool-calls.jsonl` 的 `durMs` —— 这是**整个 tool-call 往返**，不只是进程启动。

| | n | median | min | p90 | max |
|---|---|---|---|---|---|
| `pwsh` cold（重启前） | 40 | **677 ms** | 480 | 4158 | 19928 |
| `pwsh` persistent（重启后全部） | 3 | 245（含一次 1134 预热） | 133 | — | 1134 |
| **persistent 稳态** | 2 | **189 ms** | 133 | — | 245 |

⇒ 稳态 **省 488 ms/次 = −72%**，加速 **3.59×**。首次 1134 ms 是 ConPTY 起 shell 的预热，只付一次。

**样本量警告**：重启后 n=3（稳态 n=2）只够确认「方向正确且量级对」，不足以定 p90/长尾。要看长尾必须靠观察期积累数据。

## 三、关键意外发现：被砍的 468 ms 不是 .NET 启动

```
677 ms（cold 实测往返） − 209 ms（纯 pwsh -NoProfile 启动） = ~468 ms
```

这 468 ms 与 `pwsh` 进程启动无关。`dsh-tool-pwsh` 的包描述写的是 "over the bash executor seam" —— 冷启动路径实际是**先起一层 bash，再由它拉起 pwsh**。所以 P1 砍掉的是「209 ms 启动 + 468 ms seam 开销」两层，真实收益是事前预估的 3 倍多。

**可复用的推论**：判断某个 tool 的调用耗时构成时，不能把 wrapper 的 seam 开销算在目标进程头上。`durMs`（工具级往返）与「子进程启动耗时」是两个数量级不同的量，差值里藏着 harness 层的包装成本。这条也印证了 PLAN 里"提效优先级 ③ 长驻 worker 复用进程"排在 native 重写之前。

## 四、副作用：新的语义不对称（比收益更容易咬人）

| 工具 | 状态 |
|---|---|
| `pwsh` | **有状态** —— cwd / `$env:` / 函数 / 后台 job 跨调用保留 |
| `bash` | **无状态** —— 每次冷启动新进程（`custom-bash` 未改） |

后果三条：

1. 在 pwsh 里 `cd` 之后 bash 不会跟着，反之亦然。
2. 在 pwsh 里设的 `$env:X` 会一直留着，可累积污染环境（验收时留下的 `TESTVAR` 即是）。
3. **`timeoutMs` 绝不调小**：README 明确 `Reset, never repair` —— 工具级超时会直接关掉 shell 并丢掉全部状态。命令内部的 `timeout 30`（coreutils）是子进程级，安全。

为应对 1、2，约定：在 pwsh 里做有状态操作后显式 `cd` 回 `C:\Users\27063`；需要干净环境时显式 `$env:X = $null`。

## 五、回滚

```bash
cp C:/Users/27063/.dsh/profiles/desktop/cordis.patch.yml.bak-20261026-pre-pty-win \
   C:/Users/27063/.dsh/profiles/desktop/cordis.patch.yml
```
再重启一次。失败模式是软的：PTY backend 起不来时 `pwsh` 工具激活但首次调用报错，dsh 进程不崩，`bash` 不受影响。

## 六、范围与后续

- 只动了 desktop profile（`profiles/desktop/cordis.patch.yml`）。**web / headless 一份未动** —— web 是跑在 3080 上的那个，影响面大，等 desktop 观察期稳了再同步。
- 观察期检查项：统计 `logs/tool-calls.jsonl` 里 `pwsh` 的 `isError` 与 p90。marker 提取失败会降级到 silence 慢路径，表现为 `durMs` 突然跳到 1 s+。
- P2（bash 也走 PTY）暂缓：官方说 persistent shell "cannot serve win32"，风险远高于 P1；且 bash 冷启动本身就是快的那一侧。

## 七、附带修复：反斜杠转义污染

写 YAML/PLAN 时反斜杠被解释成控制字符，三次咬人，**其中两次静默**：

| 写法 | 后果 |
|---|---|
| `\7` | → BEL(0x07)，静默，路径少一级目录（`PowerShell\7\pwsh.exe` 变 `PowerShell␇\pwsh.exe`） |
| `\b` | → backspace(0x08)，静默（`C:\mingw64\bin` 变 `C:\mingw64␈in`） |
| `\U` | 直接抛 `unicodeescape` 错误（这个反而是好的，立即失败） |

PyYAML 与 `cat` 都不报错。规则：**Windows 路径一律用 raw 字符串写，写完扫 `ord(c) < 9 or 11 <= ord(c) <= 31`**。PLAN.md 中 5 行历史遗留污染已全部清除。
