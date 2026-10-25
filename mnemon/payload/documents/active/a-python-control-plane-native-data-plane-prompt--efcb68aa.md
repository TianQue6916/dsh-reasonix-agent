---
id: "efcb68aa-835e-4e42-8de2-26b6c2e154b3"
title: "实现语言分层契约（方案 A）：Python control plane + native data plane 的选型论证与三端 prompt 落地（2026-10-26）"
description: "2026-10-26 用户提问「能否让 agent 写的东西绝大多数用 C 而不是 Python」后的选型调查与落地：为何不能全 C、N*≈6×10^5 交叉点推导、失败模式反向论证、提效优先级四步、用户拍板方案 A 后写入三端 persona prefix 第 7 条的具体位置与字段名、PyYAML 与 --dump-config 验证证据、回滚备份路径，以及未完成欠账（micro-benchmark 未跑、WDAC 状态待复核）。"
status: "active"
created_at: "2026-10-25T17:53:27.894Z"
updated_at: "2026-10-25T17:53:27.894Z"
content_hash: "04d898fc47b3ca4ab1f417c75270fb5d8430729dc9ca35169e89acf23ca7e6da"
source_paths:
  - ".dsh/profiles/desktop/cordis.patch.yml"
  - ".dsh/profiles/web/cordis.patch.yml"
  - ".dsh/profiles/headless/cordis.patch.yml"
  - ".dsh/PLAN.md"
  - ".dsh/.agent-presets/anchored-standard"
session_ids:
  - "79d1b550-736d-4f96-8c1d-91974e4c706d"
memory_body_ids:
  []
---

# 实现语言分层契约（方案 A）——选型论证 + 三端 prompt 落地

**日期**：2026-10-26
**用户原始诉求**：「能否要求 agent 写的绝大多数处理的东西由 C 写而不是 Python？想要稳定和效率，注意社区经验，看看大家都是怎么做的。」
**用户决策**：在三选项里拍板 **A = 分层混合**。未选 B（全 PyO3 核心库）、未选 C（全 C + 独立 exe）。
**用户追加指令**：「计入记忆和每次的注入提示词 prompt」——即同时要求落地到持久记忆与 system prompt。

---

## 1. 结论

不能「绝大多数 C」，要**分层**：

- **control plane = Python**：编排 / 胶水 / 短命工具 / 会被 agent 反复改的代码。
- **data plane = C / Rust**：只在过门槛时进入。
- **稳定靠进程边界**，不靠换语言：独立 exe + stdin/stdout JSON 契约，崩溃 = 子进程非零 exit，主控可重试 / 降级。

## 2. 两条第一性原理

### 2.1 效率：交叉点 N* ≈ 6×10^5

`T(N) = T_startup + c·N`

`N* = (T_startup_py − T_startup_c) / (c_py − c_c) ≈ 37 ms / 60 ns ≈ 6×10^5`

- 内层循环 < 10^6、或整个脚本只跑一次 ⇒ 用 C 重写**永远亏**（省几十 ms，付 3–10 倍开发 + 调试成本）。
- 参照系：一次 tool round-trip 是 5–20 s，Python 启动 40 ms 只占 0.2%–0.8%。⇒ 用户实际感受到的「命令太慢」是**调用次数 / 冷启动 powershell.exe**，不是字节码速度。
- 上 native 门槛：**N > 10^7 且被高频调用**，或需要 **< 10 ms 的确定性延迟**。

### 2.2 稳定性：方向是反的

- C 的失败模式是 UB → 越界 / use-after-free / 未初始化 → **静默内存破坏**、几小时后崩在别处、无 traceback。
- Python 的失败模式是 traceback + 行号。
- ⇒ **agent 高速生成的 C 比 agent 生成的 Python 危险一个量级**：可诊断性 = agent 迭代的收敛速度。
- 现实中 C「稳」是因为人写 + review + ASan + 长测试，不是语言本身带来的。

## 3. 提效优先级（固定次序）

1. 合并 / 减少工具调用 —— 成本≈0，收益最大。
2. 消灭 O(N) 的解释器循环（NumPy / Polars / 系统工具 vectorize）—— 成本≈0。
3. 长驻 worker 复用进程（消灭 T_startup）。
4. 才考虑 native。

另：已有 C 实现的**系统工具优先**（robocopy /MT、findstr、wevtutil、rg），别自己写 C。

## 4. 本机约束（实测，2026-10-26）

- `gcc` = MinGW-W64 x86_64-ucrt-posix-seh，built by Brecht Sanders r7，**15.2.0**（`C:\mingw64\bin\gcc.exe`；另有一份 `D:\Octave-11.3.0\mingw64\bin\gcc.exe`）。
- **无 rustc、无 MSVC** ⇒ 要 native 就选 Rust+PyO3（abi3 / maturin，需先装工具链）或 **C + 独立 exe**；**不手写 CPython C API**（缺 MSVC / setuptools 链路）。
- **WDAC / CodeIntegrity 状态待复核**：MEMORY 记着 2026-10-23 是 Enforced；本次 `reg query` 与 `Get-CimInstance Win32_DeviceGuard` 两种方式都**没有输出**（不是「未启用」，是查不出来——可能权限或路径问题）。若确为 Enforced，B/C 方案在本机可能根本走不通，这是选型的前置事实。

## 5. 落地：三端 persona prefix 第 7 条

在原有 6 条语言契约之后追加第 7 条「语言分层契约」，写入位置：

| profile | 文件 | 插入位置 | 字段 |
|---|---|---|---|
| desktop | `.dsh/profiles/desktop/cordis.patch.yml` | 第 307 行后 +6 行（indent=19） | `persona.prefix` |
| web | `.dsh/profiles/web/cordis.patch.yml` | 第 287 行后 +6 行（indent=19） | `persona.prefix` |
| headless | `.dsh/profiles/headless/cordis.patch.yml` | 第 33 行后 +6 行（indent=9） | `system-prompt.personaPrefix` |

踩坑提醒：`@deepseek-ai/dsh-system-prompt` 的 schema 是 `z.object({ includeHarnessIdentity, includeRuntimeContext, personaPrefix, personaSuffix, toolOrder })`，**非 strict，未知 key 被 Zod 静默丢弃**。以前用 `persona:` 作为 key 是彻头彻尾的 no-op；headless 侧正确字段名是 `personaPrefix`（dsh 0.1.5 起从 `text` 改名为 `prefix`，且 `prefix` 为必填）。

第 7 条正文要点（已实际写入）：默认 Python 写编排 / 胶水 / 短命工具；不要为「稳定」或「效率」把常规脚本改写成 C；`T(N)` 判据与 N*≈6×10^5；提效四步优先级；稳定靠进程边界（独立 exe + stdin/stdout JSON 契约）；native 只选 Rust+PyO3（abi3 / maturin）或 C+独立 exe，不手写 CPython C API（本机只有 MinGW gcc 15.2.0，无 rustc / MSVC）；已有 C 实现的系统工具优先；上 native 门槛 N > 10^7 且高频调用，或需 < 10 ms 确定性延迟；会被 agent 反复改的代码一律 Python。

## 6. 验证证据（不是「改完了」，是「验过了」）

- PyYAML 三份均可 parse（自定义 `!` / `js` multi-constructor 绕过 dsh 的 tag）；解析出的 prefix 尾部内容正确、续行 2 空格缩进与原条目一致；长度 **1690 / 1690 / 1659 chars，23 / 23 / 22 行**。
- `dsh --profile web --dump-config` **exit 0**，第 2128 行起 6 行全在；`dsh --profile headless --dump-config` exit 0，同样命中。这是 dsh 自己合成的最终配置，不是读源文件推断。
- **desktop 无法用 CLI dump 验**（MEMORY 记录：被 Electron 守卫拒绝）；其 patch 与 web 同构 + PyYAML 已过。
- 生效方式：profile patch 参与 `patchReload: live`（HMR 只 watch profile patch 本身）⇒ **开新会话即生效，不用重启 dsh**。已存在 session 的 system prompt 在创建时固定，仍是旧 prompt。

## 7. 回滚

三份同目录备份：`cordis.patch.yml.bak-20261026-pre-lang-contract`（desktop 76402 B / headless 23118 B / web 76472 B，2026-10-26 01:50 生成）。`cp` 回去 + 开新会话即可。

## 8. 欠账（明确未完成，不要当成已完成）

1. **micro-benchmark 没跑**。`N* ≈ 6×10^5` 仍是教科书常数（37 ms 启动 / 60 ns 每单位运算为通用估计）。要变成「本机常数」需实测三组：`T_startup`、`c` 值曲线（N 从 10^4 扫到 10^8）、**WDAC 复核**（gcc 编 hello.exe 能否执行）。
2. **WDAC 状态待复核**（同 §4）。已在持久 fact 中标为待复核，没有断言。

## 9. 记忆分工原则（本次确立）

- **system prompt 管「每次都要执行的规则」**；**memory / document 管「要细节时能查到为什么」**。
- 因此本契约只进 persona prefix（每次注入），**没有**同时写 runtime hot memory（USER.md / MEMORY.md，4096 B 预算很紧）——同一份内容不占两次预算。
- 详细论证另存于 reasonix 持久 fact `实现语言分层契约-方案A`（`C:\Users\27063\.reasonix\memory\global\实现语言分层契约-方案A.md`）+ 本 Document。

## 相关文件

- `.dsh/PLAN.md`（「进行中」段同主题条目，含更细推导与踩坑记录；anchor 已刷新 1404 → 1416 行）
- `.dsh/.agent-presets/anchored-standard/`（persona / 语言契约相关的 preset 侧实现）
