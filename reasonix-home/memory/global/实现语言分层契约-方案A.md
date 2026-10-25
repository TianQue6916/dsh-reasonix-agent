---
id: mem-896a4179bfaf880c019c105a68999143
revision: 2
created_at: "2026-10-25T17:51:28.399Z"
updated_at: "2026-10-25T18:02:13.686Z"
name: 实现语言分层契约-方案A
description: "用户拍板「方案 A：分层混合」+ 本机 benchmark 实测（N*≈8e5、pwsh 200ms、bytes.count 12ms vs 手写 C 53ms、WDAC 不拦未签名 exe）"
metadata:
  type: user
  fact_type: feedback
  scope: global
---

## 用户拍板的实现语言策略（2026-10-26，方案 A：分层混合）+ 本机 benchmark 实测

**原始诉求**：「能否要求 agent 写的绝大多数处理的东西由 C 写而不是 Python？想要稳定和效率，注意社区经验，看看大家都是怎么做的。」
**结论**：不能「绝大多数用 C」，要**分层**——Python 是 control plane（编排 / 胶水 / 短命工具），C/Rust 只在过门槛时进 data plane。用户已选 A，不入 B（全 PyO3 核心库）/ C（全 C + 独立 exe）。

### 本机 benchmark（2026-10-26 01:53–02:00 实跑，可复现）
产物目录：`C:\Users\27063\.dsh\scratch\lang-bench-20261026\`
（`hello.c` / `sumloop.c` / `countneedle.c` + `bin/*.exe`（`gcc -O2 -static`）+ `b_startup.py` / `b_core1.py` / `b_core2.py` / `b_core3.py` + `data/log100.txt` 102 MB）

**A. 启动开销**（各 warm×3，测 21 次取 median）：

| target | median | min | p90 |
|---|---|---|---|
| `python -c pass` | **21.40 ms** | 20.36 | 25.53 |
| `python -c "import json,re,pathlib"` | **38.67 ms** | 32.68 | 41.13 |
| `hello.exe`（gcc -O2 -static） | **7.79 ms** | 6.51 | 8.44 |
| `cmd /c exit` | 15.60 ms | 14.73 | 17.60 |
| **`pwsh -NoProfile -Command exit`** | **200.76 ms** | 185.65 | 207.13 |

⇒ **pwsh 启动 = Python 的 9.4×、gcc exe 的 26×**。用户反复批评的「你这命令太慢」成本基本全在这里。**优化工具调用次数的收益 > 优化任何语言选择**。

**B. 内层循环成本 `c`**（`s = Σi`, i<N）：

| N | py for 总 | py ns/iter | C 总（含 5.92 ms 启动） | numpy 总 | py/C |
|---|---|---|---|---|---|
| 10^4 | 0.17 ms | 17.1 | 5.96 ms | 0.003 ms | **0.0（py 快 35×）** |
| 10^5 | 1.83 | 18.3 | 5.48 | 0.021 | 0.3 |
| 10^6 | 19.73 | 19.7 | 7.64 | 0.211 | 2.6 |
| 10^7 | 198.44 | 19.8 | 8.89 | 4.857 | 22.3 |

- **`c_py = 19.8 ns/iter`** —— CPython 3.13.9 的 PEP 659 specializing adaptive interpreter，比教科书常说的 60 ns **快 3 倍**。做估算时别再套 60 ns。
- **`N* = (21.40 − 5.92) ms / (19.8 − 0.3) ns ≈ 8×10^5`**（事前估计 6×10^5，同量级 ✓）。
- `c_numpy = 0.21–0.49 ns`。**N=10^7 时 NumPy 4.86 ms < 自己写 C 再 spawn 8.89 ms** ⇒ 消灭解释器循环比换语言更有效。

**C. 102 MB 日志数 `ERROR`**（每行 71 B / 1.4 M 行 / 14000 命中）：

| 实现 | ms | MB/s | 备注 |
|---|---|---|---|
| `findstr /M`（只判断存在） | **9.1** | 11220 | 扫描最快，**但不给计数** |
| `python data.count(b"ERROR")` 预读内存 | **12.07** | 8458 | C 内核 two-way，拿计数最优 |
| `python f.read()`（纯 I/O） | 35.42 | 2883 | **I/O 硬底，换语言无用** |
| `C countneedle.exe`（memchr）端到端 | 53.08 | 1924 | 启动 5.9 + fread 35 吃掉收益 |
| `python mmap + count` 端到端 | 67.05 | 1523 | |
| `findstr /C`（输出 14000 行） | 135.2 | 755 | 格式化/输出主导 |
| `python for line in f` 逐行 | 324.5 | 315 | 1.4 M 次解释器迭代 |
| **`pwsh Select-String`** | **2754** | **37** | **最慢，大文件禁用** |

三条硬结论：
1. **手写 C（53 ms）比 Python `bytes.count`（12 ms）慢 4.4×** —— 因为付了进程启动 + fread 拷贝，而 `bytes.count` 内核本身就是 C。**文本处理场景「自己写 C」净收益为负。**
2. 同一任务 324 ms ↔ 12 ms **不是语言差别，是写法差别**（逐行 for vs `bytes.count`）。
3. **反例**：`Select-String` 仅 37 MB/s，比 `bytes.count` 慢 **228 倍**。「用系统工具天然更快」的直觉是错的；`findstr /M` 才是真快的那个（但它不给计数）。`rg`（ripgrep）本机**不存在**（`where rg` 空）。

**D. 踩坑**：Git Bash 里 `cmd //c 'findstr /C:"[ERROR]" ...'` 因引号/方括号转义返回 `exit=1`（**假阴性**）；改 `subprocess.run(["findstr", ...])` 列表式调用才拿到正确 14000。⇒ Windows 上测外部命令不要经过 bash 转义层。

### WDAC 复核定论（2026-10-26，推翻「native 不可行」的担忧）
- `CodeIntegrityPolicyEnforcementStatus = 2`（Enforced）+ `VirtualizationBasedSecurityStatus = 2`（VBS 运行中）属实，但那是 **HVCI 内核态代码完整性**（驱动签名强制）。
- 用户态由 **Smart App Control** 管，而 `VerifiedAndReputablePolicyState = 0`（SAC 关闭），`SkuPolicyRequired = 0`、`EmodePolicyRequired = 0`。
- **实测**：gcc 编出的未签名 `hello.exe` / `sumloop.exe` / `countneedle.exe` 全部正常执行（exit=0，结果正确）；CodeIntegrity 日志无 3077（拦截）事件，最近的 3033/3089 都是 lsass 的驱动签名事件。
- ⇒ **用户态 native 路线在技术上完全可行**，WDAC 不是障碍。
- 顺带纠正：之前 MEMORY 里把「5.1 跑 .ps1 报 not digitally signed」归因于 WDAC **很可能是错的**。实测执行策略：5.1 = CurrentUser `RemoteSigned` / LocalMachine `Unrestricted`；pwsh7 = LocalMachine `RemoteSigned`。真正的机制是 **MOTW（Zone.Identifier）+ RemoteSigned**，`Unblock-File` 即可解。（此归因仍属推断，未用 `Get-Item -Stream Zone.Identifier` 直接验证。）

### 提效优先级（固定次序，前两步成本≈0）
① 合并 / 减少工具调用（别反复 cold-spawn pwsh，200 ms/次）→ ② 消灭 O(N) 解释器循环（NumPy / `bytes.count` / 向量化）→ ③ 长驻 worker 复用进程（消灭 `T_startup`）→ ④ 才考虑 native。
**稳定靠进程边界**（独立 exe + stdin/stdout JSON 契约，崩溃＝子进程非零 exit，主控可重试/降级），不靠换语言。

### 两条第一性原理
1. **效率**：`T(N) = T_startup + c·N`，实测 `N* ≈ 8×10^5`。N < 10^6 或只跑一次 ⇒ C 永远亏（省几十 ms，付 3–10 倍开发+调试）。
2. **稳定性方向是反的**：C 的失败模式是 UB → 越界 / use-after-free / 未初始化 → **静默损坏、几小时后崩在别处、无 traceback**；Python 是 traceback + 行号。⇒ **agent 高速生成的 C 比 agent 生成的 Python 危险一个量级**（可诊断性 = agent 迭代收敛速度）。

### 社区锚点
- CPython 官方自承手工 `Py_INCREF/DECREF` 是扩展崩溃首要来源，推 pybind11 / nanobind / Cython 而非裸 C API。
- 2015 年后新做的 Python native 层全是 Rust：polars、pydantic-core、ruff、uv、tokenizers、orjson、Arrow 全系（NumPy 的 C/Fortran 是 1990s 遗产）。Rust 胜在生命周期编译期检查 + `catch_unwind` 转异常 + `abi3`/maturin 出 wheel 免重编。
- 工业界迁移方向是 **C → Rust/Go**（ripgrep / fd / zoxide / delta），与「为了稳上 C」正相反。

### 本机工具链现状（2026-10-26 实测）
- 唯一编译器 **MinGW-W64 UCRT 15.2.0**（winlibs r7, Brecht Sanders），`C:\mingw64\bin\gcc.exe`；另有 `D:\Octave-11.3.0\mingw64\bin\gcc.exe`（PATH 会打架）。
- **无 rustc / cargo / cl / clang / zig / MSVC**（vswhere 无输出）⇒ 方案 B 是真工程立项（rustup + VS Build Tools，几 GB）。
- Python 3.13.9（`C:\Users\27063\AppData\Local\Programs\Python\Python313\python.exe`）；numpy 2.3.5；**polars 未装**；**rg 未装**。
- MinGW 产物依赖 `libgcc_s_seh-1.dll` / `libwinpthread-1.dll` ⇒ 分发用 `-static`。

### 落地位置（已写入）
三端 persona prefix 都有**第 7 条「语言分层契约」**（2026-10-26 两版：初版用估计值，第二版换成下面的实测数字）：
- `C:\Users\27063\.dsh\profiles\desktop\cordis.patch.yml` → `persona.prefix`
- `C:\Users\27063\.dsh\profiles\web\cordis.patch.yml` → `persona.prefix`
- `C:\Users\27063\.dsh\profiles\headless\cordis.patch.yml` → `system-prompt.personaPrefix`
备份：`cordis.patch.yml.bak-20261026-pre-lang-contract`（改前）、`.bak-20261026-pre-bench-calib`（换实测数字前）。
验证：PyYAML（自定义 `!`/`js` multi-constructor）三份 parse OK（prefix 1762 / 1762 / 1731 chars）；`dsh --profile web --dump-config` 与 `--profile headless --dump-config` 均 **exit 0**，合成配置里含新数字（`pwsh -NoProfile 200.8 ms` / `Select-String 2754 ms`）。
生效：profile patch 参与 `patchReload: live` ⇒ **开新会话即生效，不必重启 dsh**。

### 剩余欠账
1. 没测「常驻 worker vs 每次 cold-spawn」的差距（按上表 5.9–200 ms/次；一天调 100 次 pwsh ≈ 20 s/天）。
2. 没测 `robocopy /MT` 的并行度曲线（PLAN 里 6.9 GB / 410 s 那次是反面素材）。
3. `.ps1` 的 MOTW 归因是推断，未直接验证 Zone.Identifier。
