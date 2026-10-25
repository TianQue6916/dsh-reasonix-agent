---
id: mem-541186a153480afa9d1ba3c0d0b8e567
revision: 1
created_at: "2026-10-25T18:08:31.828Z"
updated_at: "2026-10-25T18:08:31.828Z"
name: spawn-vs-常驻-worker-实测
description: "实测冷启动 vs 常驻 worker：pwsh 100 次 spawn=21.7s，合并成一条省 96.4×，换语言只省 26ms；Windows 侧 persistent-shell 被 disabled（bash tool 也是 cold-spawn 24.8ms）"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 冷启动 vs 常驻 worker：本机实测（2026-10-26，Windows 天阙九泉机）

测试脚本 `C:\Users\27063\.dsh\scratch\lang-bench-20261026\b_worker.py`（可复跑）。N = 100 个「请求」，每个的计算量是 `len(string)`（O(1)，可忽略）⇒ **测到的全部是进程/会话开销**，协议本身成本在噪声内。三个语言各一套 C 源（`argc.c` cold 用、`payload.c` stdin 常驻用，`gcc -O2 -static`）。

### 主表

| 方案 | 总 ms（100 请求） | 每请求 ms | 相对 pwsh cold |
|---|---|---|---|
| **pwsh cold-spawn ×100**（`pwsh -NoProfile -NonInteractive -Command`） | **21672.6** | **216.73** | 1.0× |
| pwsh 合并成 **1 条** `-Command`（`a;b;c` 串联） | **224.9** | 2.25 | **96.4×** |
| pwsh 常驻 worker（stdin 逐行协议） | **230.7** | 2.31 | 93.9× |
| py cold-spawn ×100（`python -c`） | 2397.4 | 23.97 | 9.0× |
| py 常驻 worker（stdin 逐行协议） | **33.9** | **0.34** | **639×** |
| C cold-spawn ×100（`argc.exe <arg>`） | 697.9 | 6.98 | 31.1× |
| **C 常驻 worker**（stdin 逐行协议） | **7.5** | **0.08** | **2878×** |

### 三条结论

1. **pwsh 100 次 cold-spawn = 21.7 秒。** 这是用户日常抱怨「命令太慢」的主项。
2. **合并成一条 `-Command` 就赚 96.4×，零架构改动**（`a; b; c` 串起来即可）。常驻 worker 只比它快 5.8 ms（协议开销），**所以优先选更简单的「合并」**，不必上常驻。
3. **归一化对比**：消灭 cold-spawn 省 **21.4 s**；而在已常驻的前提下把 Python 换成 C 只省 **26 ms**（33.9 vs 7.5）。⇒ **换语言的收益比「消灭 spawn」低约 820 倍**。这是「方案 A 分层混合」的闭环证据。

### 追加基线（同一批测量，median of 15）

| 命令 | median | min |
|---|---|---|
| `bash -c exit`（Git Bash 带 profile/rc） | **24.77 ms** | 23.96 |
| `bash --noprofile --norc -c exit` | 24.76 ms | 23.21 |
| `sh -c exit` | 23.93 ms | 22.72 |
| `python -c pass` | 22.11 ms | 21.56 |
| `pwsh -NoProfile -NonInteractive -Command exit` | **209.01 ms** | 201.86 |

⇒ **Git Bash 的 fork/exec ≈ 24.8 ms，profile/rc 加载成本 ≈ 0**（`--noprofile --norc` 完全无差）。pwsh 的 209 ms 里 ~185 ms 是 .NET runtime + 程序集加载，无法优化，只能减少调用次数。

### 架构发现（可操作，重要）

`C:\Users\27063\.dsh\profiles\desktop\cordis.patch.yml:383`：
```yaml
- id: persistent-shell
  name: cordis:group
  group: true
  disabled: !!js process.platform === 'win32'   # ← Windows 上关掉了
```
注释原文：`persistent shell cannot serve win32. The custom-bash row below registers the same bash tool name there instead (platform-exclusive).`

**实测确认**：同一 session 连续两次 `echo $$` 得到 **461 → 528（不同 PID）** ⇒ **Windows 侧的 bash tool 是 cold-spawn，不是常驻**。而 Linux（天阙）侧是 PTY 常驻。

⇒ **实操规则**：
- **本 harness 里优先用 `bash` tool，不要默认用 `pwsh` tool**（24.8 ms vs 209 ms，差 8.4 倍）。
- 必须用 PowerShell 语义（.NET 对象、cmdlet、`Get-CimInstance` 等）时才调 pwsh，且**一次调用里用 `;` 串完所有相关命令**，绝不「一条命令一次调用」地刷。
- 一次排查若需 12 次 pwsh 调用：cold = 2.6 s，合并 = 0.23 s，差 2.4 s ≈ 一次 tool round-trip（5–20 s）的 12%–48%。

### 与主 fact 的关系
判据、社区锚点、本机工具链、落地位置见 fact `实现语言分层契约-方案A`。本条只存「启动/spawn 开销」这组数字和 harness 架构事实。
