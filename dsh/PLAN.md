# PLAN

> 每步由 `.agent-presets/anchored-standard/plan-anchor.mjs` 取 head 重注入。
> 改完这个文件**不需要重启** —— 它是每 step 现读的。
> 需要细节时直接 read 本文件，不要凭注入的截断段猜测后面的内容。

## ⚠️ 铁律（2026-10-06 用户明确要求，最高优先级）

**每条 shell 命令都必须设时限，超时就自己停。** 原话：「以后每次都给命令设下时限,超过就自己ting」。

- 所有命令前置 `timeout <秒>`：默认 **30–60s**，重活最多 **120s**
- **禁止**无上限的长任务：大文件 robocopy、全盘扫描、大目录递归、无界轮询
- 长任务必须拆片 / 后台化 / 先估算规模再决定
- 触发事件：robocopy 搬 6.9 GB 桌面跑了 **410 秒**不返回，用户两次批评「你又卡死了」

---

## 当前目标

把 dsh 打磨成能长期跑的主力 harness：目标每步可见 + 思考链中文 + 工具/技能集干净可审计。

## 进行中

### ★ 已落地：实现语言策略定论 = 方案 A 分层混合（2026-10-26）
      **用户诉求**：「能否要求 agent 写的绝大多数处理的东西由 C 写而不是 Python？想要稳定和效率，注意社区经验，看看大家都是怎么做的。」
      **结论**：不能「绝大多数 C」，要**分层** —— Python = control plane（编排 / 胶水 / 短命工具），C/Rust 只在过门槛时进 data plane。用户在三选项里拍板 **A**（不选 B = 全 PyO3 核心库，不选 C = 全 C + 独立 exe）。
      **两条第一性原理**：
        1. **效率**：`T(N) = T_startup + c·N`，`N* = (T_startup_py − T_startup_c)/(c_py − c_c)`。**本机实测 `N* ≈ 8×10^5`**（启动差 15.5 ms ÷ (19.8 − 0.3) ns/iter），与事前估计的 6×10^5 同量级 ⇒ 内层循环 < 10^6 或只跑一次时用 C 重写永远亏。参照系：一次 tool round-trip 是 5–20 s；**pwsh -NoProfile 启动 200.8 ms = python 21.4 ms 的 9.4 倍 = gcc exe 7.8 ms 的 26 倍** ⇒ 用户抱怨的「命令太慢」是**调用次数 / cold-spawn pwsh**，不是字节码。
        2. **稳定性方向是反的**：C 的失败模式是 UB → 越界 / use-after-free / 未初始化 → 静默损坏、几小时后崩在别处、无 traceback；Python 是 traceback + 行号 ⇒ **agent 高速生成的 C 比 agent 生成的 Python 危险一个量级**（可诊断性 = agent 迭代的收敛速度）。C 稳是因为人写 + review + ASan + 长测试，不是语言本身。
      **提效优先级（固定次序，前两步成本≈0）**：① 合并 / 减少工具调用 → ② 消灭 O(N) 解释器循环（NumPy / Polars / 系统工具 vectorize）→ ③ 长驻 worker 复用进程（消灭 T_startup）→ ④ 才考虑 native。**稳定靠进程边界**（独立 exe + stdin/stdout JSON 契约，崩溃 = 子进程非零 exit，主控可重试/降级），不靠换语言。
      **社区锚点（用户明确要求「看大家怎么做的」）**：CPython 官方文档自承手工 `Py_INCREF/DECREF` 是扩展崩溃首要来源、推 pybind11 / nanobind / Cython 而非裸 C API；2015 年后新做的 Python native 层全是 Rust（polars / pydantic-core / ruff / uv / tokenizers / orjson；NumPy 的 C/Fortran 是 1990s 遗产），Rust 胜在生命周期编译期检查 + `catch_unwind` 转异常 + `abi3`/maturin 出 wheel 免重编；工业界迁移方向是 **C → Rust/Go**（ripgrep / fd / zoxide / delta），与「为了稳上 C」正相反；**最强一条：别自己写 C，调用已经用 C 写好的系统工具**（robocopy /MT、findstr、wevtutil、reg、fsutil、rg）。
      **本机硬约束（2026-10-26 实测）**：唯一编译器是 **MinGW-W64 UCRT 15.2.0**（`C:\mingw64\bin\gcc.exe`，另有 `D:\Octave-11.3.0\mingw64\bin\gcc.exe` 一份，PATH 顺序会打架）；**无 rustc / cargo / cl / clang / zig / MSVC**（vswhere 无输出）⇒ 方案 B/C 都是真工程立项（要装 rustup + VS Build Tools，几 GB），不是「让 agent 随手写」；MinGW 产物依赖 `libgcc_s_seh-1.dll` / `libwinpthread-1.dll`，需 `-static`；**WDAC 已复核（2026-10-26）**：`CodeIntegrityPolicyEnforcementStatus=2`（Enforced）与 VBS=2 属实，但那是 **HVCI 内核态 CI**（驱动签名强制）；用户态由 Smart App Control 管而 `VerifiedAndReputablePolicyState=0`（SAC 关闭）⇒ **未签名 exe 正常执行**（实测 gcc 编的 hello.exe/sumloop.exe/countneedle.exe 全部 exit=0、结果正确）、CodeIntegrity 日志无 3077（拦截）事件。⇒ **native 路线在技术上可行**，不是最大不确定性。另：`.ps1` 被拒签的真因是 **MOTW（Zone.Identifier）+ RemoteSigned**（5.1 CurrentUser=RemoteSigned / LocalMachine=Unrestricted；pwsh7 LocalMachine=RemoteSigned），不是 WDAC —— 解 MOTW 即可（`Unblock-File`）。。
      **本机 benchmark 实测（2026-10-26 01:53–02:00，脚本与产物在 `.dsh/scratch/lang-bench-20261026/`，全部可复跑）**：
        - **启动开销（中位数，各 warm×3 后测 21 次）**：`python -c pass` **21.40 ms**；`python -c "import json,re,pathlib"` **38.67 ms**；`hello.exe`（gcc -O2 -static）**7.79 ms**；`cmd /c exit` 15.60 ms；**`pwsh -NoProfile` 200.76 ms**。
          ⇒ pwsh 启动是 Python 的 **9.4×**、C 的 **26×**。他反复说的「命令太慢」，成本基本都在这里，不在语言。
        - **内层循环成本 `c`（s = Σi）**：`c_py = 19.8 ns/iter`（**CPython 3.13.9 的 PEP 659 specializing interpreter，比教科书常说的 60 ns 快 3 倍**）；`c_numpy = 0.21–0.49 ns`；`c_C` 被进程启动淹没（N=10^7 时 C 端到端 8.89 ms，其中 5.92 ms 是启动）。
          ⇒ 交叉点 `N* = 15.5 ms / 19.5 ns ≈ 8×10^5`。N=10^6 时 Python 19.73 ms vs C 7.64 ms（2.6×）；N=10^7 时 198 ms vs 8.89 ms（22×）。
          **关键**：N=10^4 时 Python 0.17 ms vs C 5.96 ms —— **Python 快 35 倍**（C 全在付启动）。这就是「小任务用 C 永远亏」的硬数字。
          **另一个关键**：N=10^7 时 **NumPy 4.86 ms < 自己写 C 再 spawn 8.89 ms** —— 消灭解释器循环比换语言更有效。
        - **102 MB 日志数 `ERROR`（每行 71 B / 1.4 M 行 / 14000 次命中）**：
          | 实现 | ms | MB/s | 备注 |
          |---|---|---|---|
          | `findstr /M`（只判断存在） | **9.1** | 11220 | 扫描最快，但**不给计数** |
          | `python data.count(b"ERROR")`（预读内存） | **12.07** | 8458 | C 内核 two-way，拿计数最快的可行方案 |
          | `python f.read()`（纯 I/O） | 35.42 | 2883 | **I/O 硬底，任何语言都逃不掉** |
          | `C countneedle.exe`（memchr）端到端 | 53.08 | 1924 | 启动 5.9 + fread 35 吃掉了扫描收益 |
          | `python mmap + count` 端到端 | 67.05 | 1523 | |
          | `findstr /C`（输出 14000 行） | 135.2 | 755 | 格式化/输出主导 |
          | `python for line in f` 逐行 | 324.5 | 315 | 1.4 M 次解释器迭代 |
          | **`pwsh Select-String`** | **2754** | **37** | **最慢，大文件禁用** |
          ⇒ **手写 C（53 ms）比 Python `bytes.count`（12 ms）慢 4.4 倍**：因为你付了进程启动 + fread 拷贝，而 Python 的 count 内核本身就是 C。**「自己写 C」在做文本处理时净收益为负。**
          ⇒ 同一任务里 324 ms ↔ 12 ms 的差别**不是语言，是写法**（逐行 for vs `bytes.count`）—— 这正是「提效优先级②」的实测证据。
          ⇒ 反例：`Select-String` 只有 37 MB/s，比 `bytes.count` 慢 **228 倍**。**PowerShell cmdlet 不是「快」的代名词**，这条推翻了「用系统工具天然更快」的直觉（`findstr /M` 才是真快的那一个，但它不给计数）。
        - **冷启动 vs 常驻（2026-10-26 追加实测，N=100 个 O(1) 请求，测的全是进程/会话开销）**：
          | 方案 | 总 ms | 每请求 ms | 相对 pwsh cold |
          |---|---|---|---|
          | pwsh cold-spawn ×100 | **21672.6** | **216.73** | 1.0× |
          | pwsh 合并成 1 条 `-Command` | **224.9** | 2.25 | **96.4×** |
          | pwsh 常驻 worker（stdin 协议） | **230.7** | 2.31 | 93.9× |
          | py cold-spawn ×100 (`python -c`) | 2397.4 | 23.97 | 9.0× |
          | py 常驻 worker（stdin 协议） | **33.9** | **0.34** | **639×** |
          | C cold-spawn ×100 (`argc.exe`) | 697.9 | 6.98 | 31.1× |
          | C 常驻 worker（stdin 协议） | **7.5** | **0.08** | **2878×** |
          ⇒ **pwsh 100 次 cold-spawn = 21.7 秒**，这就是他每天在付的钱。**合并成一条 `-Command` 就省 96.4×，零架构改动**（`a; b; c` 串起来即可）；常驻只再多 5.8 ms（协议开销），所以**优先选更简单的「合并」**。
          ⇒ **归一化**：消灭 cold-spawn 省 **21.4 s**；在常驻模式下把 Python 换成 C 只省 **26 ms**（33.9 vs 7.5）。**换语言的收益比「消灭 spawn」低约 820 倍。** 这是方案 A 的闭环证据。
        - **追加基线（同一批测量，median 15 次）**：`bash -c exit` **24.77 ms** / `bash --noprofile --norc -c exit` 24.76 ms / `sh -c exit` 23.93 ms / `python -c pass` 22.11 ms / `pwsh -NoProfile -NonInteractive` **209.01 ms**。
        - **架构发现（重要，可操作）**：`profiles/desktop/cordis.patch.yml:383` 的 `persistent-shell` 组是 `disabled: !!js process.platform === 'win32'` ⇒ **Windows 上从来没有真正常驻的 bash**，每次 `bash` tool 调用都是 cold-spawn、付 ~24.8 ms；而 Linux 侧是 PTY 常驻。
          实测证据：连续两次 `echo $$` 得到 **461 → 528（不同 PID）** ⇒ 确认非持久。Windows 侧 `bash` tool 由本地的 `custom-bash.mjs` 注册（platform-exclusive 替代行）。
          ⇒ **实操结论：本 harness 里优先用 `bash` tool 而不是 `pwsh` tool**（24.8 ms vs 209 ms，差 8.4 倍）；只有在必须用 PowerShell 语义（.NET 对象、cmdlet）时才调 pwsh，且一次调用里串完所有相关命令。
        - **踩坑记录**：Git Bash 里 `cmd //c 'findstr /C:"[ERROR]" ...'` 会因引号/方括号转义返回 `exit=1`（假阴性）；改用 `subprocess.run(["findstr", ...])` 列表式调用才拿到正确结果（14000）。⇒ 在 Windows 上测外部命令别经过 bash 转义层。
      **已落地（harness 层，方案 P1：pwsh 常驻化，2026-10-26）**：
        - **根因**：`profiles/desktop/cordis.patch.yml` 的 `persistent-shell` group 是 `disabled: !!js process.platform === 'win32'` ⇒ **Windows 上从没挂载过任何 PTY backend**。所以 `bash` 走 `custom-bash.mjs`（普通 `bash -c`，**24.8 ms/次**，无 sandbox）、`pwsh` 走 `dsh-tool-pwsh`（cold spawn，**209 ms/次**）。
        - **关键事实**：需要的包**全都已经装了**（`dsh-terminal` / `dsh-terminal-bash` / `dsh-tool-bash-persistent` / `dsh-tool-pwsh-persistent`，均 v0.2.1-rc.2）。`dsh-tool-pwsh-persistent` 的 README 明确支持 **「Windows ConPTY or a POSIX pwsh」**；`dsh-terminal-bash` 的 schema 是 `shellDialect: z.union(["bash","pwsh"]).default("bash")` 且**显式 shellPath 优先于 dialect 默认值**（源码 `config.shellPath !== void 0 && length > 0 ? config.shellPath : ...`）。
        - **改动（只改 desktop；web/headless 待 P1 稳定后同步）**：
          ① `tool-pwsh` 的门控从「非 win32 启用」改为 `disabled: !!js process.platform === 'win32'`。**必须**：两个包都注册工具名 `pwsh`，同一 layer 重复注册会被 tools registry 拒绝（同 352-357 行对 bash 的警告）。
          ② 在 `custom-bash` 之后新增 win32-exclusive group：
             `pty-win`（`group: true` / `disabled: !!js process.platform !== 'win32'` / `isolate.terminals: true`）→
             `pty-win-backend`(@deepseek-ai/dsh-terminal) → `terminal-pwsh-win`(@deepseek-ai/dsh-terminal-bash，`shellDialect: pwsh`、`shellPath: C:\Program Files\PowerShell\7\pwsh.exe`、`timeoutMs: 300000`) → `persistent-pwsh-win`(@deepseek-ai/dsh-tool-pwsh-persistent，`timeoutMs: 300000`、`maxOutputChars: 16000`)。
        - **验证**：PyYAML parse OK；**门控对称性求值**确认 win32 上 `tool-pwsh` = DISABLED、`pty-win` = ENABLED；`persistent-bash` 仍被父 group 关掉 ⇒ 不与 `custom-bash` 争 `bash` 名；**无重复注册**；全文件无控制字符。
        - **踩坑（重要，会重犯）**：用 python heredoc 写 YAML 时，`'C:\...\PowerShell\7\pwsh.exe'` 里的 `\7` 被 python 解释成**八进制转义 BEL(0x07)** —— 路径少了一级目录、混入不可见控制字符、PyYAML 与肉眼都看不出来。**Windows 路径一律用 raw 字符串写**，写完扫描 `ord(c)<9 or 11<=ord(c)<=31`。
        - **✅ 重启后验收通过（2026-10-26 02:37，同一 session 实测）**：① 连续两次 `$PID` = **17824 / 17824**（相同）⇒ 真常驻；② 第一次调用设的 `$env:TESTVAR` 在第二次调用仍为 `kept-across-calls`，`Get-Location` 也保留 ⇒ 状态跨调用持久；③ 中文输出正常（`汉字 与 ★`）、`[Console]::OutputEncoding` = **utf-8**、PSVersion = **7.6.8**；④ `SessionState.LanguageMode` = **FullLanguage**（**README 警告的 ConstrainedLanguage 风险未发生**）；⑤ 无错误事件，`bash` 工具行为不变。
        - **实测收益（`logs/tool-calls.jsonl` 的 `durMs`，这是整个 tool-call 往返，不只是进程启动）**：`pwsh` cold（重启前 **n=40**）**median 677 ms**（min 480 / p90 4158 / max 19928）→ persistent（重启后 n=3：**1134 预热 / 245 / 133**）**稳态 median 189 ms** ⇒ **省 488 ms/次 = −72%，加速 3.59×**。预热 1134 ms（ConPTY 起 shell）只付一次。
          **关键修正**：`677 − 209`（纯 `pwsh -NoProfile` 启动）= **~468 ms 是 `dsh-tool-pwsh` 自身的 seam/harness 开销**（它的描述是 "over the bash executor seam"，很可能套了一层 bash 再起 pwsh）。所以真实收益比预估的「209 → 0」更大 —— 常驻化把启动和 seam 两层一起砍掉了。
          参照：`bash`（`custom-bash`）重启后 n=4 median 330 ms，但样本全是 `echo`/`ls` 短命令，与重启前 n=1051 的 median 711 ms（含大量重命令）**不可直接比较**。
        - **⚠️ 新的语义不对称（必须记住）**：`pwsh` 现在**有状态**（cwd / `$env:` / 函数 / 后台 job 跨调用保留），`bash` 仍**无状态**（每次冷启动新进程）。后果：① 在 pwsh 里 `cd` 之后 bash 不会跟着；② 在 pwsh 里设的 `$env:` 会一直留着，可能累积污染。
          约束：① 在 pwsh 里做有状态操作后显式 `cd` 回 `C:\Users\27063`；② **`timeoutMs` 绝不调小** —— README 明说 `Reset, never repair`，工具级超时会直接关 shell 并丢掉全部状态（命令内部的 coreutils `timeout` 不受影响）。
        - **观察期**：连续几天看 `pwsh` 的 `isError` 与 p90；marker 提取失败会降级到 silence 慢路径，表现为 durMs 突然跳到 1 s+。稳定后再同步 web / headless。
        - **回滚**：`cp profiles/desktop/cordis.patch.yml.bak-20261026-pre-pty-win profiles/desktop/cordis.patch.yml` + 再重启。
        - **预期收益**：pwsh **209 ms → ~2 ms**（按一天 200 次调用 ≈ 省 42 s/天）。`bash` 的 24.8 ms 本轮不动（README 说 persistent shell "cannot serve win32"，需要另立 P2 试验）。
      **已落地**：三端 persona prefix 加**第 7 条「语言分层契约」** —— `profiles/desktop/cordis.patch.yml:307` 后 / `web:287` 后 / `headless:33` 后（`persona.prefix` ×2 + `system-prompt.personaPrefix` ×1），备份 `cordis.patch.yml.bak-20261026-pre-lang-contract`；PyYAML（自定义 `!`/`js` multi-constructor）三份均 parse OK，prefix 长度 1690 / 1690 / 1659 chars，续行缩进与原条目一致。详细论证存 fact `实现语言分层契约-方案A`（global）。patch 参与 `patchReload: live` ⇒ **开新会话即生效，不必重启 dsh**。
      **欠账（剩余）**：① 没测「常驻 worker vs 每次 cold-spawn」的差距（按上面的数应在 5.9–200 ms/次量级，若某个流程一天调 100 次 pwsh 就是 20 s/天，值得实测）；② 没测 `robocopy /MT` 的并行度曲线（PLAN 里那次 6.9 GB / 410 s 的事件就是反面素材）；③ `rg`（ripgrep）本机**不存在**（`where rg` 空）⇒ 若要长期的日志检索工具，需先装；④ PowerShell 5.1 报 `.ps1` 未签名的 MOTW 归因是推断（`RemoteSigned` + 文件带 Zone.Identifier 可解释），**未用 `Get-Item -Stream Zone.Identifier` 直接验证**。

### ★ 定论 + 已落地：关机后 13~21 秒自己冷启动 = BIOS AC 假边沿（2026-10-25）
      **现象**：用户报告「晚上关机，电脑自己启动了，好几次」。60 天日志扫出 **26 次**「正常关机（109 Shutdown Off + 6006）→ 13~33 秒后冷启动」，BootType 全 `0x0`（完整 POST，非 S4/S0ix 恢复）；08-28 / 09-11 / 09-25 各出现「关机→自启→再关→再自启」连发 3 次；概率约 26/74 ≈ 35%；延迟中位数 17 秒。
      **根因判定**：BIOS 的 `Power On after AC Loss`（用户主动开启，用于「智能插座断电→通电」远程开机）+ **EC 在 S5 下对 `AC_PRESENT` 的一次假判定**。`AC_PRESENT` 是带阈值 + 去抖窗口的比较器输出，不是导线通断 ⇒ 物理上「一直插着电」与逻辑上「EC 认为 AC 掉过再回来」可同时为真；关机后负载骤降 → 适配器电压漂移 → 假边沿 → 策略执行 Power On。**13~21 秒 = 适配器空载稳定 + 去抖窗口的时间尺度**，不是「等唤醒源」。
      **已排除（附证据）**：① OS 定时唤醒：`WakeToRun` 任务空、`powercfg /waketimers` 空；② 快速启动/混合关机：`HiberbootEnabled=0`、`powercfg /a` 明示「快速启动：当前系统策略禁用」；③ 从睡眠恢复：60 天 BootType `0x0`×68 / `0x1`×0，**hiberfil.sys 12.69 GB 存在但一次 S4 都没用过**；④ AC 掉电恢复（电池不在）：`BatteryStatus=2`、电池 100% OK 在位；⑤ RTC 定时：第二次关机后不再触发、延迟非整点；⑥ **WoL**：官方文档确认主板无此功能（Realtek 驱动里 `S5WakeOnLan=开启` 只是 NDIS 高级属性 UI，不代表固件实现），`WakeUpType=6` 疑为 BIOS 静态 DMI 值、未证实动态；⑦ **miIO 插座断电**：插座与电脑不在同一局域网（电脑走手机 USB 共享 192.168.0.100/.102 + 有线 ICS 192.168.243.1），UDP 54321 跨不了网段；且小米插座功率自动化最短间隔 1 分钟 ≫ 21 秒窗口。
      **不可解的硬冲突**：`Power On` 的判据就是「AC 出现 0→1 边沿」，而「远程开机（APP 断电→通电）」与「关机后假边沿」是同一信号，信号层不可区分 ⇒ 无法靠单个 BIOS 选项两全；`Last State` 不能用（远程开机时机器本就在 S5，`Last State` 会保持关机）。
      **已落地（方案 B，OS 侧自愈）**：
        - 脚本 `C:\Users\27063\.dsh\storages\tools\wake-guard.ps1` —— 开机读最近一条 `Kernel-Power 109`，若「本次 boot 时间 − 109 时间」< 60 秒则判假自启并 `shutdown /s /t 0 /f`；含日志、事件日志就绪重试（≤120s）、循环保护（1 小时内最多处理 3 次，防无限开关机）、`-DryRun` / `-GraceSeconds` / `-ThresholdSeconds` 参数。
        - 计划任务 `WakeGuard`：`AtStartup` + **Delay=PT20S** + `SYSTEM` / `Highest`，`ExecutionTimeLimit=5min`，`StartWhenAvailable`。
        - **验证已过**：① 干跑正常分支 `gap=38601s ≥ 60s → OK: normal boot`；② 干跑 phantom 分支（放大阈值）`DRYRUN: would shut down now`；③ 任务 XML `state=Ready delay=PT20S user=SYSTEM`；④ **手动触发 LastResult=0，SYSTEM 上下文真实跑通并写入 `dryrun=False` 日志**（证明 SYSTEM 能读 System 日志、能写 `C:\Users\27063\.dsh\logs`）。
        - **踩坑**：PowerShell 字符串转义是 `` ` `` 不是 `\` —— `"... -File \"{0}\""` 里的 `\"` 被解析成「字面反斜杠 + 字符串结束」，`{0}` 变裸代码块导致整个脚本 parse 失败、一行不执行（靠 `[Parser]::ParseFile` 才查出）。改用 `[char]34` 拼接双引号。另：`New-ScheduledTaskTrigger -AtStartup` 设 `$trigger.Delay` 会丢，**必须在 `New-ScheduledTask` 之后设 `$task.Triggers[0].Delay`**。
        - 安装脚本 `wake-guard-setup.ps1`（同目录），日志 `C:\Users\27063\.dsh\logs\{wake-guard.log, wake-guard-setup.log}`。
        - **回滚**：`schtasks /delete /tn WakeGuard /f`
      **待验**：下次真实关机若触发假自启，日志应出现 `PHANTOM: shutting down now`，且 `off->boot`（109→27 间隔 ≤120s）不再产生「关机后又开机」的净结果。
      **独立问题（勿混入）**：`10-18 12:36` 与 `10-23 09:51` 各有一次 `Kernel-Power 41`，BugcheckCode `0xEF`(CRITICAL_PROCESS_DIED) / `0x154`(UNEXPECTED_STORE_EXCEPTION)，`PowerButtonTimestamp=0`（非长按）；`0x154` 与存储栈相关，值得单独查。

### ★ 终端环境定论：5.1 全盘失效 → 交互式 shell 迁到 pwsh 7（2026-10-24）
      **症状**：在 `Windows PowerShell`（5.1.26100.9711）里任何 `.ps1` 都报 `is not digitally signed` —— profile 加载失败 + `dsh` 命中 `npm\dsh.ps1` 也失败。
      **判定**：不是 ExecutionPolicy 设置问题。实测 `Get-ExecutionPolicy -List` = CurrentUser RemoteSigned / LocalMachine Unrestricted / 无 GPO，手写 `.ps1` 无 `Zone.Identifier`，但显式 `-ExecutionPolicy RemoteSigned` 与 `AllSigned` 均被拒，只有 `Bypass` 通过。⇒ 5.1 的 `SystemPolicy.GetLockdownPolicy()` 被机器级 WDAC script enforcement（`CiPolicies\Active` 下 8 个 `.cip`，`CodeIntegrityPolicyEnforcementStatus=2`）判成 Enforce，覆盖了 RemoteSigned 的「本地文件免签」豁免；`LanguageMode` 仍为 FullLanguage（强制签名 ≠ ConstrainedLanguage）。**pwsh 7.6.8 跑同一文件正常**。
      **已落地**：① 5.1 profile 迁到 `C:\Users\27063\Documents\PowerShell\Microsoft.PowerShell_profile.ps1`（原目录不存在），`ghm` 改为 `& pwsh -NoProfile`；已验语法 OK、ghurl/ghdl/ghdlx/ghm/ghmirror_base 五个函数加载成功，`ghmirror.ps1` 在 7 下语法 OK。② `pwsh` 已在 PATH（`C:\Program Files\PowerShell\7`），Win+R 输 `pwsh` 直开 7。③ WT `defaultProfile` = `{574e775e-…}` = PowerShell 7（本来就是）。
      **Win+R -> powershell 已生效（2026-10-24 23:2x 复核）**：`HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\powershell.exe` (default) = `C:\Program Files\PowerShell\7\pwsh.exe`、`Path` = `C:\Program Files\PowerShell\7`。该值与我给用户的那份 UAC 提权脚本写的内容完全一致 ⇒ 只能是那两次 `Start-Process -Verb RunAs` 之一被确认执行（我的 tool 进程对 HKCU 是 WinError 5 只读，排除自写；HKLM 仍是 5.1 未动）。用户主观「没运行过脚本」= 他没在终端里手打，但确认过 UAC 框。
      **生效边界（实测）**：① `ShellExecute` 路径（Win+R / 开始菜单 / 资源管理器）→ 查 App Paths，HKCU 优先于 HKLM ⇒ 得到 7.6.8。② `PATH` 路径（cmd.exe 或任意 PowerShell 内部输入 `powershell`，以及 `Start-Process powershell`）→ `where powershell` 仍为 `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`（5.1，`FileVersion 10.0.26100.8972`）⇒ 仍 5.1。要覆盖 ② 只能改系统 PATH，代价大于收益，不做。
      **回滚一行**：`reg delete "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\powershell.exe" /f`
      **兜底**：在 5.1 里跑 dsh 用 `dsh.cmd`（npm 的 cmd shim，不经 `.ps1`），已验证 `dsh.cmd --version` = `0.2.1-rc.2`。

### ★ compress 工具的正确用法（2026-10-23，踩坑记录）
      **它是 tool，不是斜杠命令。** `/compress` 不存在；dsh 的斜杠命令叫 **`/compact`**（包 `@deepseek-ai/dsh-command-compact`，`USAGE = "Usage: /compact (no arguments)"`），且要求 agent 处于 idle，否则回 `busy`。
      **正确的调用形态**（空调用必然失败，报 `kind=missing-content`）：
      ```js
      compress({ content: [
        { startId: "m00364", endId: "m00950", summary: "…", topic: "可选短标题" }
      ]})
      ```
      **三条硬约束**：① **一次给完** —— 多个 range 全塞进同一个 call 的 `content` 数组，不能分多次调用；② **summary 自己写**，模型不代劳，写不好就是真丢信息（要包含路径、判据、原话、时间锚点）；③ startId/endId 用回放里的 ref id（形如 `m00175`），不要带 XML 包装。
      **实测收益**：m00364–m00950 回收 280K tokens，m00361–m00363 + m00951–m01741 回收 325K，合计约 605K，三个 block 落地后返回 `No compressible ranges remain`。


### ★ 已完成：dsh 0.2.1-rc.2 全量适配（2026-10-23 11:58，**桌面端没走官方安装器**）
      **结果**：桌面端 Electron **44.0.0 → 44.7.0**、内置 dsh **0.2.0-rc.2 → 0.2.1-rc.2**；CLI 也已 0.2.1-rc.2；插件 12 个全升。
      **官方 NSIS 安装器在这台机器上永远 rc=2**（穷举：`/S` 0.6s、`/S --updated` 0.7s、`/S /NCRC` 3.7s、`/S /D=临时目录` 51s 产出 0 文件、应用全 taskkill 后仍 rc=2、UI「安装并重启」卡十几分钟）。签名 Valid、无 Zone.Identifier ⇒ 排除参数/占用/签名。**别再调参数了。**
      **实际走的路**：安装器内嵌 app-64.7z（7z 签名在 exe 偏移 **863248**）→ 切出来 `py7zr` 解开（8708 条目 = 7811 文件 / 1094 MB）→ 关应用 → **两个 rename**（安装目录→`.old-20261023`，解压目录→安装目录）→ 原路径启动。**路径一字未动 ⇒ 桌面/任务栏 pinned 全保留。**
      **必须整目录换**：Electron 44.0.0→44.7.0，`DeepSeek Harness.exe` 244,481,512→246,343,144，`app.asar` 121,348,951→182,794,869；只换 asar 会崩。
      **回归全绿**：asar 内版本串 `0.2.1-rc.2`；bili `/__bili/sessions` 四个会话 `contextWindow` 全 **868928**；`dsh-headroom-ccr.json` 1.73 MB 继续长；wechat daemon port 10425 OK；`host-stdio.log`/`stall-guard.log` **零 skip**（`profiles/desktop/compatibility.json` 预置的 0.2.1-rc.2 豁免生效）；旧版完整留在 `%LOCALAPPDATA%\Programs\DeepSeek Harness.old-20261023`（1.06 GB）可回滚。
      **本机 shell 三个坑（实测）**：① python `subprocess` 调 `schtasks` 一律 "cannot find the path specified"（即使 cwd/完整路径都对），改用 **bash 里 `cmd //c "C:\Windows\System32\schtasks.exe ..."`**；② python `Popen(['powershell','-File',...], DETACHED_PROCESS)` 起的脚本**一行不执行、零输出**，别用 powershell 做后台脚本；③ **`schtasks + .bat` 是唯一可靠的脱离应用执行方式**，bat 里延时用 `ping -n N 127.0.0.1 >nul`（任务调度器无终端，`timeout /t` 会报错）。
      **遗留**：① `dsh-tmp\app-64.7z` 0.29 GB、`dsh-tmp\app-new` 已移走、旧安装目录 1.06 GB —— 观察几天后清；② **`/compact` 仍报 "Compaction could not produce a useful summary"**（与窗口 150000 那件事无关，待查）；③ 新版自带 `experimental-session-search` / `experimental-cot-translation-bundle` / `dsh-tool-schedule` 等 10 个新能力未评估。


### ★ 已完成：备份链路三项加固 A/B/C（2026-10-22 22:50~23:05，用户拍板「开始吧」）
      **P0-A 噪音 commit 治理**：依据「近 300 条 auto commit 里的出现频次」实测（`storages/dsh-headroom-ccr.json` **156 次**、`wechat-bridge/daemon.pid` 41、`daemon-port.json` 39、`storages/thread-edges.*` 35、`storages/git-anchors.json` 34、`storages/workspace.json` 28 —— 对照真正手写的 `PLAN.md` 才 43）⇒ `.gitignore` 追加 7 条运行期状态 + `git rm --cached`；备份脚本 `dsh` target 的 `XF` 同步加这 7 个名字（备份 `backup-to-github.ps1.bak-20261022-pre-runtime-xf`；改后 CRLF 245 / BOM 保留 / `parse errors: 0`）。遗留：`storages/mnemon-sync-state.json` 变动不频繁，暂留跟踪。
      **P0-B 幽灵文件清理**：repo 跟踪 3143 个文件里 **83 个源端已不存在**（`robocopy /E` 只增不删的后果）：旧技能全套（`skills/bilingual-ocw-translator/**` 23 个 + `skills.junctions-legacy-20261001/bilingual-ocw-translator/**` 18 个 + `bilingual-translator`/`ocw-lecture-translator` 各 1）、`storages/tools/` 一次性实验脚本 29 个、`scratch/` 8 个、`profiles/desktop/_bak-pre-fullport-20260930-*` 4 个、`settings.yaml` 1 个；再加 7 个运行期状态 ⇒ **`git rm` 90 个**（含工作树，防止下次 `git add -A` 复活）。跟踪 3143 → 3053。
      **P0-C 定时任务覆盖率**：`\ReasonixGitHubBackup` 加 **BootTrigger(+10 min)**、`StartWhenAvailable`、放开电池限制、`ExecutionTimeLimit` 72H → **PT30M**；`\DshConfigAutocommit` 放开 `DisallowStartIfOnBatteries` / `StopIfGoingOnBatteries`。**Action 一字未动** —— 评估后放弃「换成 run-hidden.vbs」：收益小（现状已有 `-WindowStyle Hidden`），风险是重演 09-27 的 `Arguments` 被覆盖。改法 = `Export-ScheduledTask` 存 XML → 改 Settings 对象 → `Register-ScheduledTask -InputObject -Force` → 前后逐字段 diff 写日志。回滚点 `~/.dsh/backups/tasks/{ReasonixGitHubBackup,DshConfigAutocommit}.pre-20261022.xml`（1546 B / 1374 B）。
      **验收**：备份任务 `df12d89 backup: 2026-10-22 23:00`（127 files，脱敏扫 2789 改 23，双重校验通过）→ 本地 `rev-parse` == `ls-remote` == `df12d89e4729adbfa265406acb444b565f7c9ecc`，`origin/master..master`=0，工作树 0 脏，跟踪 3070；`dsh/storages/dsh-headroom-ccr.json`、`dsh/wechat-bridge/daemon.pid`、`dsh/skills/bilingual-ocw-translator/SKILL.md` 三个抽样点全部 `gone`。任务现场：GitHub 备份 `triggers=2 / startWhenAvailable=True / noStartOnBatt=False / limit=PT30M`，autocommit `noStartOnBatt=False / stopOnBatt=False`。
      **新教训 4（重大，与本机磁盘拓扑相关）**：`C:\Users\27063\Desktop` 是 **junction → `D:\Desktop`**（且 `Desktop\工具箱` 带 `ReadOnly`、Target 显示 `C:\Desktop\工具箱`）。所以备份 repo 的真实 gitdir = `D:\Desktop\工具箱\reasonix-ops\repo\.git`。**实测分歧**：`git -C 'C:\...\Desktop\工具箱\...\repo' rm` → `fatal: Unable to create '.git/index.lock': Permission denied`（连续 4 次 chunk 全挂）；同一条命令换成 `git -C 'D:\Desktop\工具箱\...\repo'` → rc=0 正常。同期 **python 的 `open(...,'wb')` / `os.remove` 在该目录报 PermissionError 13 / WinError 5**，而 MSYS 的 `rm`/`touch`/`sed -i` 与 `git.exe` 全部正常。⇒ 对备份 repo 的写操作：**走 D 真实路径 + bash/git，禁用 python 文件 API、禁用 C 盘 junction 路径**。这与 MEMORY 里「dsh 工具在 D 盘写入被拒（2026-10-07）」是同一现象的两个面。
      **新教训 5**：计划任务改动用「XML 备份 → 改 `$t.Settings.*` → `Register-ScheduledTask -InputObject -Force` → 前后快照 diff」，**从不碰 `Actions`**；UAC 提权用 `Start-Process -Verb RunAs -PassThru -ErrorAction Stop`，并把异常打出来（前两次调用没有任何回显，加上 `try/catch` + `-PassThru` 才看到 `started pid=7084` 并成功）。
### ★ 已完成：GitHub 备份线静默断链 20 天 — 根因 / 修复 / 看门狗（2026-10-22 22:30~22:40）
      **两件事必须分开判**：① 本地 autocommit（任务 `\DshConfigAutocommit`，每 20 分钟）**全程健康** —— Last Result 0，实测 22:29 手动 `/Run` 得 `b8a794a`（48 files）、22:30:01 自动再跑得 `e345f7d`；`~/.dsh` 532 commits 里 529 条 `auto:` 格式；**该 repo 无 remote、脚本明令永不 push**，与 GitHub 无关。② 每日 GitHub 备份（任务 `\ReasonixGitHubBackup`，23:30）**死了 20 天**。
      **断链证据**：repo `Desktop\工具箱\reasonix-ops\repo` 的 HEAD 停在 `aaee3bf backup: 2026-10-02 23:31`；`%APPDATA%\reasonix\github-backup.log` mtime = Oct 2 23:31（最后一行「已推送到 GitHub === 完成 ===」）；任务 Last Run 2026/10/20 23:30、**Last Result -196608 (0xFFFD0000)**。
      **根因**：`C:\Users\27063\Desktop\reasonix-ops` junction **不存在（MISSING）** —— 09-27 修好的那条被删了。任务 `Task To Run` = `powershell -File "C:\Users\27063\Desktop\reasonix-ops\backup-to-github.ps1"` ⇒ 进程根本没进入脚本 ⇒ **脚本第一行 `Log '=== backup-to-github 开始 ==='` 都没执行** ⇒ 日志一行没有 ⇒ 静默。对照：`C:\Users\27063\reasonix-ops` 是**真实目录**（Get-Item Target 空、Attributes 无 ReparsePoint），所以用它的 `DshConfigAutocommit` 毫发无伤 —— 这就是一条活一条死的机制解释。
      **修复 A（用户拍板）**：`New-Item -ItemType Junction -Path Desktop\reasonix-ops -Target Desktop\工具箱\reasonix-ops`，**任务定义一字未改**（避开 09-27 记的 `Set-ScheduledTask` 把 Arguments 整体覆盖的坑）。验证 `attrs=Directory, ReparsePoint` + `backup-to-github.ps1` 可达。
      **第二道坎（安全机制正常工作）**：第一次重跑 `exit 3` —— `!! 字节级全扫发现 5 个文件含密钥（白名单外类型）→ 中止，不推送`，命中 `goat-gateway/.tmpdiag/*.html`（10-03 抓的 Claude Code 文档页）。判定 **假阳性**：`sk-REDACTED` 这类 HTML class 名匹配了 `sk-[A-Za-z0-9_-]{16,}`；且 `git log --all --diff-filter=A -- 'goat-gateway/.tmpdiag/*'` 为空 ⇒ 这 5 个文件**从未 commit**，没进过 public 远端。处置：脚本 goat-gateway 的 `XD` 加 `'.tmpdiag'`（备份 `backup-to-github.ps1.bak-20261022-pre-tmpdiag-exclude`）+ `git rm -r --cached goat-gateway/.tmpdiag` + 删 repo 内工作树副本。
      **结果（三重验收）**：`696143b backup: 2026-10-22 22:37`，将提交 356 个文件，脱敏扫描 2860 改 23，字节级全扫 + 兜底校验均通过；本地 `rev-parse HEAD` == `ls-remote origin refs/heads/master` == `696143b3faef82e2fad6d26ed7a974deeb8a278b`，`origin/master..master` = 0，工作树 0 脏。
      **加固 C（用户拍板）**：新建 `C:\Users\27063\reasonix-ops\backup-watchdog.ps1`（**真实目录，不经 junction**，与故障点解耦）+ 任务 `\ReasonixBackupWatchdog`（每日 23:45 + 开机后 5 分钟，`wscript.exe run-hidden.vbs` 隐藏窗口，StartWhenAvailable，电池不限，MultipleInstances=IgnoreNew，时限 10 分钟）。三条判据：`CALL-PATH-MISSING`（任务实际调用的路径不可达）/ `STALE-HEAD`（repo HEAD > 30h）/ `UNPUSHED`（master 领先 origin）。输出 `%APPDATA%\reasonix\backup-watchdog.log`（每次 OK 或 ALERT）+ `backup-alert.json`（仅 ALERT 时写、OK 时自删）。**三分支实测**：默认 → `OK  head-fresh  callpath=ok` exit 0；`-MaxAgeHours 0` → `ALERT  STALE-HEAD: 0.0h old (696143b ...)` + json 生成；经计划任务 `/Run` → OK 且 json 被删除。注册需管理员（`Register-ScheduledTask` Access denied）⇒ `Start-Process -Verb RunAs`，注册日志 `~/.dsh/logs/backup-watchdog-register.log`。
      **新教训（三条，都可复现）**：
      1. Git Bash 里给 `git -C` 传 `/c/Users/...` 中文路径时**不要**加 `MSYS_NO_PATHCONV=1` —— 加了 git 报 `fatal: cannot change to '/c/...': No such file or directory`，不加则成功（同一路径同一 shell，实测两次）。`MSYS_NO_PATHCONV` 只该用于 `schtasks` 这类 Windows 原生程序收 `/参数` 的场合。
      2. 在 `Desktop\工具箱\reasonix-ops` 里用 **python 覆写已存在的 `.ps1` → PermissionError 13**；同类新建（`.txt`、`cp` 出的 `.bak`）与 `sed -i` 均成功 ⇒ 改这类脚本走 `sed -i`。注意 `sed -i` 会把 CRLF 全部转成 LF（实测 243→0），必须 `sed -i 's/\r*$/\r/'` 复原，再用 `[Parser]::ParseFile` 验 `parse errors: 0` 才敢跑。
      3. **静默失败的真正盲点不是「脚本挂了」，而是「产物不新鲜却没人量」** —— 脚本一挂，日志就完全不写，任何「读自己日志」的自检会一起沉默。看门狗必须判**外部产物**（repo HEAD 的 commit 时间 / ahead 数 / 调用路径可达性），且自身放在不与故障共享单点的路径上。
      **遗留（待用户拍板，未动）**：`TianQue6916/reasonix.git` 仍是 **public**（09-27 记的隐患 1 至今未处理）；本轮 356 个文件已推到 public 远端，内容为 `~/.dsh`（profile patch / PLAN / storages）+ goat-gateway + 各 editor 配置，脚本已强制脱敏，但脱敏≠隔离。
### ★ 已完成：B 会话（a0d5fbf8）502 死锁根因与修复（2026-10-22 22:55）
      **症状**：会话每条消息都 502 `preflight_compress_failed`；`/compact` 报 `Compaction could not produce a useful summary`；导出 zip 里 35355 行 JSONL **零损坏**（会话本体没坏，坏的是这条 lane 的压缩判定）。
      **根因链（源码 + 运行态互证）**：
      1. bili 的 json 里 `compress.modelContextLimit` 被设成 **150000**（后来改 200000）——它是**预检压缩的硬墙**，不是截断上限；一旦压低，`context >= 硬墙` 就每轮触发 preflight fold。
      2. bili 的 `compress` 段是**启动时快照**（改文件不热生效，必须重启 bili）⇒ 实测生效窗口 = `200000 × (1 − 25% output headroom)` = **150000**，与 `/__bili/sessions` 里 10-22 全部 session 的 `contextWindow: 150000` 完全吻合；10-16/10-17 的 session 是 `967232`（1M − 32768）/ `868928`（1M − 131072），即 native 一直是 registry 的 1M。
      3. 旧会话上下文 ~271k > 150k ⇒ 每轮都试 fold；fold 的 raw 折叠与 tier-distillation 都拿不到 summary（`0 summary call(s)` / `distillation summary was unavailable`）⇒ `futile round` ⇒ fail fast 且**不可 retry** ⇒ 死锁：压缩本身要发一次带全历史的 summary 请求，而这次请求又被同一堵墙拦下。
      4. `/compact` 的 `could not produce a useful summary` 是 dsh 侧 `ManualCompactionError("summary")` 兜底文案；更早的 compaction/end 实体错误是 422 `dsh_compaction_refused`（bili 默认拒 dsh 原生压缩，需 `dsh.allowDshCompaction: true`，10-16 已开）与 400 `invalid_request_error`——同一条链的下游症状。
      **修复**：`~\.config\billion-context\billion-context.json` 删除 `compress.modelContextLimit`（备份 `.bak-20261023-pre-drop-ctxlimit`），让 native 回落 registry/plugin 头的 1M；`taskkill` 旧 bili（pid 26068），dsh supervisor **自动拉起**新进程（pid 7216）。
      **验证**：重启后 `/__bili/sessions` 所有活跃 session `contextWindow: 150000 → 868928`；本会话 122k/868k = 14%；`conflicts` 清零。
      **教训**：① `modelContextLimit` 只会「制造」硬墙，**永远不要低于真实窗口**，更别把它当省钱旋钮——墙一触发而 summary 后端不可用，整条会话不可救；② bili 的 `compress` 不热生效，改完必须 `taskkill` 让 supervisor 重拉；③ 判断 bili 实际窗口别猜，直接看 `/__bili/sessions` 的 `contextWindow` 字段。

### ★ 已完成：技能 `learn-translate` v4.3（原 bilingual-ocw-translator）（2026-10-22）
      **动机**：目标不再只是翻译，而是「大一统理论与第一性原理」的具体实现；压缩即智能；每学一处要查资料 + 想清「现实世界什么功能由它实现」+ 大量拓展进阶；社区经验十分重要。用户拍板改名 `learn-translate`。
      **落法**：形态 A 翻译（原 8 步流水线逐字不动）/ B 学习（5 步：定锚→取料→四问→验证→落盘）；四问锚点 = 本质 / 公式 / **现实承重（`X 承重于 <系统> 的 <功能>` + 消失测试 + `[未定位]` 纪律）** / 拓展四层（L1 上游·L2 平行·L3 实现 `文件:行`·L4 arXiv，P1-P4）；资料分级 A>B>C；核心契约 15 条、铁律 30 条（新增学习类 27-30）、references 18 个（+`learning-engine.md`、+`sources.md`），原 16 refs 与 26 铁律零删除。
      **v4.1 顺手修的旧病**：① 铁律 21「Reasonix 不派子代理」→「宿主内建子代理一律不用，全转主力机」（去 Reasonix 时代化）；② `§A2` 输出表只有小电脑 Linux 路径，补主力机五类落盘位置；③ 锚点卡原本无路径 → `C:/Users/27063/Desktop/课程文件/锚点卡/<课程>/`（Desktop 实测无 `课程笔记`）；④ 新增「与相邻技能边界」表（course-summarizer / learning-method / tool-offline-wiki / thinking-modes）；⑤ description 压 468→342 字符。
      **v4.2（补学习科学证据分级）**：用户追问「社区学习经验是否融入」→ 自查只融了**检索手法**，没融**学习法本身的证据强弱**。新增 `references/learning-science.md`（57 行，技能第 19 个 ref）：[MA]/[RCT]/[EXP]/[CS]/[OBS]/**[D 社区口传]** 六级；九条学习法逐条判级——自测 [MA]（Rowland 2014 带反馈 g≈0.73 vs 0.39）、间隔 [MA]（Cepeda 2006，254 项研究，D+1/3/7/21 只是启发式）、**费曼技巧 [D] 无一手来源**、**learning styles [MA] 无证据→禁用句式**、艾宾浩斯 [CS] 但 n=1 + 无意义音节、Anki SM-2 是 [D] 工程调度工具。连带改 `learning-engine.md` 间隔段（必须给反馈）、铁律 29（学习法主张同样分级）、核心契约 14。三端 sha 一致（SKILL `e93bc46187`）。
      **v4.2.2（人-AI 讨论协议）**：用户定调「核心就是我的脑袋和 AI，难问题都会和你讨论」⇒ AI = **外部裁判 + 第二推导引擎**，缺的是裁判不是产出。写进 `learning-engine.md` 末节：入口三样（你的版本 / 卡在哪 / 试过什么）、**角色四档（默认「审稿人」只挑错不给答案；不指定会滑向「同伴」）**、产物三样（+「如果我要推翻它，从哪里下手」）、防 sycophancy（标 A/B/C/`[判断]`、定期自我推翻、可独立复核）、跨模型对撞 `dsh-remote -m deepseek-v4.1-flash -e max`（分歧点信息量 > 共识点）、AI 短板三条、**禁忌「先问机制再定位缺口」**（禁推 Anki 抽卡 / 日程重排）。落 3 条记忆：`人-AI讨论协议-审稿人角色与防sycophancy`（global feedback）、`用户学习模式-检索重建型与伴随式复习`（global user，含禁止清单）、`learn-translate-版本索引与三端状态`（project reference）。三端 sha 一致（SKILL `3f1bda3971`）。
      **v4.3（讲解用图标准）**：用户要求「帮助理解的图像也有很高要求，参照社区经验」。原来 `image-pipeline.md` 只管图的搬运/生成，没有一条管**图的质量**。新增 `references/figures.md`（73 行）+ **铁律 31** + 契约 16：五条硬标准全带可判定判据（coherence 删除测试 / signaling **遮标题测试** / contiguity 禁「编号+远处对照表」/ 一图一主张 / caption 必须是**可被反驳的主张句**）；数学图专规（截断轴必标 break、多子图共享 min/max、离散量不画光滑曲线、误差与样本数必须画、对数轴、**黑白打印可读**、色盲调色板给具体色值 Okabe-Ito / Paul Tol / CUDO）；**源码必须入库**（禁止只交裸 PNG）。证据：多媒体原则 [MA]（Noetel et al.）、coherence [EXP]（Mayer 2001 三实验，无关材料**降低**理解）、seductive details [EXP] 效应小；社区出处 learning-wiki 四 claims + CUD skill + Tufte 失败模式清单。references 19→20，三端 sha 一致（SKILL `379dd4a64b`）。
      **三端实测**：dsh 读 `~/.dsh/skills` → junction `C:/Users/27063/ai-skills`；`.reasonix/skills/learn-translate` 与 ai-skills 那份 **inode 相同**（同一份）⇒ 真副本 2 个（ai-skills + `AppData/Roaming`）；sha256 三处一致；`skill_search` 当场命中**无需重启**。备份 `SKILL.md.bak-20261022-pre-v40-ark`。
      **教训**：单次 shell heredoc 写 >8 KB 中文会截断（v4.0 主文档断在第 148 行半句）——长文件分段写（每段 ≤3 KB）+ `wc -l`/`tail`/grep 锚点验证；含反斜杠路径的 python 三引号必须 `r"""..."""`。


### ★ 已完成：goat-gateway 禁用 dead key `deepseek-official`（2026-10-16 11:37）
      **症状**：界面反复显示「本轮运行失败 / 当前请求的额度已用尽」，但主力 key `qq` 额度充足（10-07 数据：5h 0.53/14、周 9.30/35、月剩 60.70）。
      **因果链（两次复现，10-07 与 10-16 同型）**：`qq` 被上游打挂（CF `Error 1102` / `ECONNRESET` / `ENOTFOUND api.commandcode.ai`）→ gateway failover 到 `priority:0` 的 `deepseek-official` → 该号余额 **-0.22（欠费）** → 上游回 **402 `Insufficient Balance`** → `gateway.mjs:495/:504` 判 `quota` + 600s 冷却、**并把 402 body 原样透传** → dsh `dsh-llm/lib/types/error.js` 归一化成 `QUOTA` → `failureMessage()` 渲染成「额度已用尽」。**⇒ 报错误导。**
      **修法**：`keys.json` 里 `deepseek-official` 的 `enabled: true` → `false`（UAC 提权，`_elev-disable-official.ps1`，日志 `~/.dsh/logs/elev-disable-official.log` 逐字 `RESULT: ok=True`），再 `curl -X POST http://127.0.0.1:8788/_gateway/reload` → 返回 keys 里 `deepseek-official enabled=false`，gateway log `03:39:22.315Z RELOAD …`。
      **回滚**：改回 `true` + reload；备份 `keys.json.bak-20261016-113751`（D 盘同目录）与 `C:\Users\27063\.dsh\storages\goat-gateway-keys.json.bak-20261016-113543`（C 盘，1265 B = 原全文）。
      **★ D 盘写入边界（重要，别再踩）**：非提权下 `[IO.File]::Open('keys.json','Open','ReadWrite','None')` **能过**、`WriteAllText('__wtest.tmp')` **能过**，但 python `io.open(p,'w')` 与 `shutil.copy2` 新建 `.bak` **一律 `PermissionError: [Errno 13]`** ⇒ **create-new 语义被拦，改 gateway 配置一律走 UAC**。提权脚本必须把日志写 C 盘（`~/.dsh/logs/`）。
      **替换算术（历史事故教训）**：`'"enabled": true'` = **15** 字符、`'"enabled": false'` = **16** ⇒ **delta=+1 是正确预期**；10-07 写坏 keys.json 是 PowerShell 硬编码 `Substring($j + 16)` 多吃一个字符切掉逗号。

### ★ cache hit 退化归因已定（2026-10-16，用户 m10599/m10659）
      **结论：不是「插件在不断压缩」。** 权威工具 = bili 自带 `GET http://127.0.0.1:18787/__bili/cache-report`（`README.zh-CN.md:267`）。
      - session-d60ed9f2（109 req）：hit 82.0%，miss 拆解 `new content 440.5K (41%)` + **`compress re-pay 51.3K (4.8%)`** + `upstream-ttl unattributed 576.2K (54%)`，identity check residual 0
      - session-a0d5fbf8（1823 req）：`restart/refork 537.1K (15)` + `model switch 37.3K (8)` + **88% unattributed provider-side**
      - bili `nudge idle: usage=5% (46008/868928)` ≪ `emergencyThresholdPercent 95%` ⇒ 紧急截断从未触发；`dsh-headroom` CCR 13 天只有 `entries: 12`
      **两条有逐字证据的可修元凶**：① **会话内切模型**（cache-report MODEL SWITCHES：`#100 20:44:13 → deepseek-v4-flash · hit 37.6%` / `#104 切回 · 96.7%` / `#117 · 30.2%` / `#131 · 96.0%`；且切模型会开新 session 代次、refs 重置）② **fold 后断崖**（`13:33:00.094Z tool compress executed` → `13:33:50.796Z [acp-usage] input=137768 cached=61056 (44%) fold=new`，相邻轮 95–97%）。
      **★ 更深一层 `degenerate-fold`（13 天 8 次：10-06×3 / 10-07×1 / 10-10×1 / 10-11×1 / 10-13×2）**，bili 自己的 warn 逐字：`covers 94% of the live context (~85703/91490 tok) leaving 1 active block(s), anchor≈2295 tok — the whole prefix rewrites and the prefix cache restarts from scratch on the next request`（另两条 anchor≈1654 / 1576 tok）⇒ **一次 fold 覆盖 89–94% 上下文、anchor 只剩 1.5–2.3K tok ⇒ 整个 prefix 重写**。旁证 `[cache-seam] suspected mid-history prefix break: hit 8.1% (input=50427, unexplained=46331 tok, no fold/switch/restart attribution); first divergence at byte 14011, message[?] of 118→38`（**118 条消息被砍到 38 条**）。
      **bili 配置全默认**：`C:/Users/27063/.config/billion-context/billion-context.json` 只有 25 B（`{"providers":{}}`）；关键默认 `dsh.allowDshCompaction=false`（拦住 dsh 原生 compaction）、`compress.reasoning {drop:true, threshold:2048}`、`compress.nudgeGrowthTokens≈50K`、`stableSystemAnchor=false`（且**仅纯代理模式生效；dsh plugin 模式自管上下文、永不被锚定**）。
      **待落地**：T1 会话内永不切模型 / T2 降低 ACP compress 频率（避免 degenerate fold）/ T3 `tool-result-pruner` 8192→32768 或删行 / T4 关 `dsh-headroom` / T5 查 restart/refork（**已有答案 = degenerate-fold**）。用户 m10788「持续推进」已授权 T1+T2+T5。
      **附带发现**：bili auto-update 换磁盘包但不重启进程 ⇒ bili.log 反复 `[update] running v0.1.196 but v0.1.197 is installed — restart bili to activate`；**升级后必须重启 bili 才生效**。
### ★ 已修（待 App 重启落地）：desktop renderer 崩溃 / 「对话」白屏 = core client bundle 实际从 app.asar 加载
      **结论纠正（2026-10-07 19:4x，实测推翻本文件下方 12:4x 那条）**：desktop App 的 renderer 读的是 **asar 内**那份 core client bundle，不是 node_modules 那份。
      **活体证据**：token 从 `~/.dsh/logs/host-stdio.log` 取 —— `awk '/\[tee\] installed/{n=NR}{a[NR]=$0}END{for(i=n;i<=NR;i++)print a[i]}' … | grep -a -o -E 'token=[A-Za-z0-9_-]{16,}' | tail -1`（**别用 `sort -u`，字典序拿不到最新**）→ `curl -c jar -b jar "http://127.0.0.1:19387/?token=$TOK"` 得 303 + cookie → 首页里 `<script src="plugins/??@deepseek-ai/dsh-client-ui-chat/client.js&amp;rev=572d90f59a46">` → `curl --path-as-is --globoff -b jar ".../plugins/??@deepseek-ai/dsh-client-ui-chat/client.js&rev=572d90f59a46"` → **200 / 565106 B / raw=7 guarded=1 == asar 版（565053 B）**；磁盘版是 565462 B / raw=0 guarded=8。**⇒ 12:42 打在 node_modules 上的 13 处 guard 对 App 完全无效。**
      **报错归属**：`dsh-app://app/assets/index-5SrrfWpU.js:56` 只是 `console.error` 的位置前缀、不是抛错点（该文件 `source.kind`=0）；真正抛错在插件聚合 bundle `rev=faa4ff6401c0:23887`。
      **修法**：`~/.dsh/storages/tools/asar-core-guard.mjs`（`--check` / `--build <out> [<src>]` / `--install`）原地重建 asar —— 4 个 entry 的新内容 append 到 data 区末尾、只改各自 `offset`/`size`（offset 相对 data 区 ⇒ 其余 12963 个节点不受影响）。
      **产物**：`C:\Users\27063\.dsh-lab\tmp\app.patched.asar`，121348951 → **123195923 B**；新节点 `dsh-client-ui-chat`(117956887,565060) / `-ui-conversation`(118521947,716014) / `-api-session-controller`(119237961,144382) / `-ui-trajectory`(119382343,421512)，末位正好贴满 dataLen=119803855。
      **验证（全绿）**：① header JSON 递归 diff = **8 条**（4 entry × size/offset），`non size/offset diffs: 0`、类型保真；② 4 个新节点 offset 无缝衔接；③ 抽样 7 个未改 entry（`package.json` / `lib/main.js` / `dsh/package.json` / `dsh-client-modules/lib/index.js` / `index-5SrrfWpU.js` …）sha256 与原件一致；④ **用 Electron 44 自己的 loader 实测可读**（`ELECTRON_RUN_AS_NODE=1 "<install>\DeepSeek Harness.exe" probe.cjs` → 4 个 bundle 全 `OK raw=0 guarded=8/2/2/2`）。
      **落地**：`~/.dsh/storages/tools/install-asar-guard.ps1`（param 化，`-SkipWait -NoRelaunch` 可干跑）—— 等 App 退出 → `rename app.asar → app.asar.bak-<stamp>` → copy → sha256 + `asar-core-guard --check` 探针（必须 `ok=true`）→ 用 Start Menu 快捷方式重开 App（**必须带 `--no-sandbox`**）→ 任一步失败则回滚并用原 asar 照样拉起 App。**干跑已全绿**（`~/.dsh-lab/tmp/asar-install-dryrun.log`：sha `5FEFE1D2…45AD` 双向匹配、`RESULT: ok=True`）；正式 watcher 已 detached 启动，**用户关掉 App 即自动完成**。
      **回滚**：`Stop-Process -Name 'DeepSeek Harness' -Force` 后 `Move-Item -Force "…\resources\app.asar.bak-<stamp>" "…\resources\app.asar"`。
      **仍未找到治本源头**：`source: null` 出在运行时投影（inbox projection / optimistic pending submission）—— 4 个 crash 相关 session 的磁盘事件流里 `source=null` 全为 0 ⇒ guard 只是 containment。
      **第三方侧复核（本轮）**：`dsh-context/lib/client.js` 那 1 处已自带 `source !== null` 判断（**安全，不需 patch**）；`ds-harness-remote/dist/{index,session-format-compat}.js`、`dsh-mnemon/lib/index.js`、`dsh-plugin-message-edit/lib/index.js`、`dsh-better-sidebar/lib/client*.js` 的裸读**全在 host 侧**（不进 renderer bundle），且 `session-format-compat.js:normalizeMessage` 开头即 `if (!isRecord(value) || !isRecord(value.source)) return value;` ⇒ 排除为白屏源头。


### ★ 根因已定 + 已修（待重启生效）：会话页「对话」tab 白屏（2026-10-07 12:4x）
      **症状**：desktop App 里会话内容区全黑；tabs（对话/轨迹/版本/上下文/Replay）仍在；多个会话都复现。
      **根因（唯一，已实测）**：`dsh-client-ui-chat/lib/client.js:5187` 的 `ChatView` 在 render 期 useMemo 里无条件读 `message.source.kind`（无判空）⇒ 收到一条 `source: null` 的 inbox 消息就抛 `TypeError: Cannot read properties of null (reading 'kind')` ⇒ `dsh-client-ui-renderer` 的 `SlotErrorBoundary` 隔离该 entry、渲染空 `<div data-slot-error="conversation.view">` ⇒ 用户看到全黑。
      **crash log 逐字**（`%APPDATA%/@deepseek-ai/dsh-desktop/logs/crash-2026-10-06T16-14-06-734Z-renderer.log`，25.6 KB，3x each）：`slot entry crashed in 'conversation.view': TypeError: Cannot read properties of null (reading 'kind')` + `[session-controller] event feed subscriber failed: TypeError: ... (reading 'kind')`。
      **修复（containment，13 处）**：`~/.dsh/storages/tools/patch-dsh-null-source-guard.mjs`（`--check` / `--apply` / `--verify` / `--restore`，幂等）把 4 个 bundle 里 13 处 `source.kind` → `source?.kind`：`dsh-client-ui-chat` 8、`dsh-client-ui-conversation` 2、`dsh-api-session-controller` 2、`dsh-client-ui-trajectory` 2（含脚本外的 `:5222`）。`node --check` 全绿、`--verify` 全 PASS、备份 `lib/client.js.bak-20261007-pre-null-source-guard`。
      **生效路径已证**：renderer 的 bundle URL（crash log 里）明确列了这 4 个包，且都经 `~/.dsh/profiles/node_modules/@deepseek-ai/*/lib/client.js` → symlink → `%APPDATA%/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/` 加载 ⇒ **插件不打包进 app.asar，改 node_modules + 重启 App 即生效**（bundle `rev=` hash 会变）。asar 内也有一份同名文件（`/dsh/node_modules/...`，565053 B）但那是内嵌 runtime，不是 renderer 加载的那份。
      **未找到治本源头**：扫了 4 个 crash 相关 session 的持久化事件流（4853 + 3142 + 31830 + 823 events）—— `data.source = null` 与 `inserted[*].source` 缺失/为 null **全部为 0** ⇒ `source: null` 出在**运行时投影**（inbox projection / optimistic pending submission），不在磁盘上。

### ★ 根因已定 + 已修：dsh 工具在 D 盘写入被拒（2026-10-07 00:4x）
      **症状**：dsh 的 bash / node / spill 在 `D:\Temp`、`D:\`、`C:\Windows\Temp`、`C:\Users\Public` 全部 `EPERM` / `Permission denied`；web 侧日志里的 `spill-local ... mkdtemp 'D:\Temp\dsh-spill-XXXXXX'` 是同一个根因。
      **根因（三层，全部实测）**：
      1. dsh 的 Windows sandbox = `@deepseek-ai/dsh-sandbox-windows-acl`。其 `lib/types-Cl_DXjhk.js` 用 `createRestrictedToken(currentToken, 13, ...)`（13 = `DISABLE_MAX_PRIVILEGE|LUA_TOKEN|WRITE_RESTRICTED`）+ `SetTokenInformation(token, 25 /*TokenIntegrityLevel*/, S-1-16-4096)` 把工具树降为 **Low integrity level**；`buildLowLabelAcl()` / `AddMandatoryAce` 给 workspace 打 **Low mandatory label**。
      2. Windows 的 **no-write-up** 规则：Low 主体不能写 label 更高的对象，而**无 label 的对象按 Medium 算** ⇒ 写 `D:\*`、`C:\Windows\Temp`、`C:\Users\Public` 一律被拒。
      3. 提权（High）对**同一客体** 7/7 写成功 ⇒ 一次性排除 DACL / 卷只读 / 火绒（火绒 `hips.db` 的 `HipsUser_60`、`HipsUserAuto_60` 都是 0 行，`HrLogV3_60` 159 条无一与 D 盘写入相关）。
      **决定性判据**：同一条低 integrity shell，对**已带 Low label** 的 `D:\Temp\dsh-label-probe` **写成功**；对同分区、无 label、且已 `Everyone:(OI)(CI)(F)` 的 `D:\Temp\dsh-everyone-probe` **写失败** ⇒ 变量只有一个：mandatory label。
      **修复**：`~/.dsh/storages/tools/fix-d-temp-integrity.ps1`（自 UAC 提权，跑 `icacls "D:\Temp" /setintegritylevel "(OI)(CI)Low" /T`）⇒ `D:\Temp` 现有 `Mandatory Label\Low Mandatory Level:(OI)(CI)(NW)`，`Successfully processed 613 files; Failed processing 0 files`。修后低 shell 的 `touch` / `mkdir` / `node writeFileSync` 写 `D:\Temp` 全部 OK。
      **回滚**：提权跑 `fix-d-temp-integrity.ps1 -Rollback`（= `/setintegritylevel "(OI)(CI)Medium" /T`）。日志 `~/.dsh/logs/fix-d-temp-integrity.log`；PLAN 备份 `PLAN.md.bak-20261007-pred-rootcause`。
      **未覆盖（符合机制，不是 bug）**：`D:\` 根、`D:\Toolbox`、`C:\Windows\Temp`、`C:\Users\Public` 仍未加 label ⇒ 仍拒写。是否扩面需用户点头 —— 给目录加 Low label 等于允许**任何** Low 进程写它，是安全面降级。

- [x] **★ 开机命令行窗口根因定位 + 禁用（2026-10-06 23:1x）—— 元凶 = Task Scheduler 任务 `\dsh-web-3080`**
      **症状**：每次登入约 20 s 后弹命令行窗口，三行输出（`启动 ollama serve (port 11434)` / `启动 dsh web  port=3080  workspace=C:\Users\27063  mode=Serve` / `已在 3080 运行。`）逐字对应 `~/.dsh/launch-dsh.ps1` 内的 Write-Host。
      **定位手法（关键）**：本机 `schtasks.exe`（含从 `C:\Windows\System32` 直调、加 `MSYS_NO_PATHCONV=1`）与 `Get-ScheduledTask` 在**非提权下一律失败**（`ERROR: The system cannot find the path specified.` / `HRESULT 0x80070003`）；
      但 `C:\Windows\System32\Tasks\` 目录 **`ls` 报 Permission denied，按文件名 `cat` 却能读** ⇒ 直接读 UTF-16 的 `C:\Windows\System32\Tasks\dsh-web-3080` 拿到全定义。
      **根因**：`<LogonTrigger><Enabled>true</Enabled><UserId>27063</UserId><Delay>PT20S</Delay></LogonTrigger>` + `<Exec>` 跑 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\27063\.dsh\launch-dsh.ps1" -Mode Serve`；Principal `InteractiveToken` / `LeastPrivilege`。
      **修复**：`~/.dsh/storages/tools/disable-dsh-web-autostart.ps1`（只 disable 不 delete）经 `Start-Process -Verb RunAs -Wait` 提权执行 ⇒ `before: state=Ready` → `after: state=Disabled`；非提权复核 XML 可见 `<Enabled>false</Enabled>` 且 LogonTrigger 内 `<Enabled>` 已消失。
      **回滚**：提权跑 `Enable-ScheduledTask -TaskName 'dsh-web-3080'`。日志 `~/.dsh/logs/disable-dsh-web-autostart.log`。
      **副产物**：给 `launch-dsh.ps1` 装了 caller-trace 探针（从 `$PID` 上溯 8 层父链 + 列两个 Startup 目录 → `~/.dsh/logs/launch-dsh-caller.log`），5633 → 7396 B，备份 `launch-dsh.ps1.bak-20261006-pre-callertrace`。
      **已核干净**：`Win32_StartupCommand` 8 条无 dsh；HKCU/HKLM Run、RunOnce、Startup 文件夹、`StartupApproved` 均无 dsh；TaskScheduler / PowerShell Operational 日志零命中。
      **注意**：桌面版**不依赖** 3080，但 desktop 与 web 共用 `DSH_HOME=~/.dsh` 与同一份 session 文件、无跨进程锁 ⇒ 两边同开一个 workspace 会互相踩。当前 3080 实例（PID 27072，21:52 起）仍在跑，未动。

- [x] **★ mnemon 语义检索开启（2026-10-06 23:1x，用户 m08258 指令「以后开 mnemon 语义检索」「ollama 闲置干啥,给记忆插件用起来吧」）**
      `~/.dsh/profiles/desktop/cordis.patch.yml:1326-1329` 与 `~/.dsh/profiles/web/cordis.patch.yml:1365-1368`：`embedding.enabled: false` → **`true`**（endpoint `http://localhost:11434` / model `nomic-embed-text`；不以 /v1 结尾 ⇒ 走 Ollama 协议）。
      **确切语义**（来自 `dsh-mnemon/lib/client.js` 的 i18n `config.embeddingManagedHint`）：开启后由 **DSH Host 为每次 mnemon CLI 调用注入** endpoint/model，覆盖 Mnemon 子进程环境。
      **验证**：`dsh --profile web --dump-config` → 行 1969-1971 `enabled: true`；`dump-desktop-config.ps1` → 行 1948-1950 `enabled: true`；`mnemon embed --status` → coverage 100% / embedded 383 of 384 / `embedding_available: true`；`POST http://127.0.0.1:11434/api/embed` → http 200 / 2.84 s / 9577 B / 768 维。
      **备份**：两处 `cordis.patch.yml.bak-20261006-pre-embedding-on`。
      **已知限制（别高估）**：mnemon 的 automatic intent 只认有限问句线索词，中文**陈述式**短语落 `GENERAL`、语义路径基本不参与排序 ⇒ **查询要用问句形式**。
      **ollama 事实**：便携版 `C:\Users\27063\.local\ollama\ollama.exe` v0.34.4；开机由 Startup 文件夹的 `ollama-serve.vbs` 静默拉起（`sh.Run ..., 0, False`，不弹窗）；`/api/tags` 仅 `nomic-embed-text:latest`（137M / F16 / 768 维 / ctx 2048）。

- [x] **★「图标白纸」根因定位 + 修复完成（2026-10-06 15:5x）—— 任务栏/开始菜单/桌面 270/280 恢复彩色**
      **判据**：白纸 = `SHGetFileInfoW` 的 `iIcon=0` + 渲染非灰种类≈48（空白文档图标）；正常 = `iIcon≥50` + 非灰≥300。
      **根因（行为层）**：**`C:\Users\27063\` 树内的文件，shell 拿不到图标**。决定因素是**文件自身路径**，
      与 target / 内容 / 大小 / 新旧 / 杀软全部无关。铁证：逐字节相同的 lnk 放 `D:\` 彩、放 Desktop 白；
      lnk 在 D 盘而 target 在 `AppData\Local\Programs\` 仍**彩**；显式 `IconLocation` 指向树内则白、
      改成 `,0`（退回 target 解析）即彩；**junction 路径也彩**（shell 会把 junction 解析到真实目标）。
      **修复**：① `Desktop` → `D:\Desktop` + junction 反指 ② `%APPDATA%\...\Quick Launch` → `D:\ExplorerData\Quick Launch` + junction
      ③ `%APPDATA%\Microsoft\Windows\Start Menu` → `D:\ExplorerData\Start Menu` + junction ④ 10 个 `IconLocation` 指向树内的 lnk 改 `,0`
      （每个留 `.bak-iconloc`）。核验：任务栏 10/10、开始菜单 87/89、桌面树 173/181 全彩。
      **待办：必须重启一次**（explorer 被火绒 `proc_prot_v6` 挡着杀不掉）。
      **回滚**：`D:\Desktop\工具箱\会话断点\fix-2026-10-04\before-desktop-move\`（含 .reg + README）；
      报告见同目录 `图标白纸-修复报告-2026-10-06.md`。
      **已否证**：系统更新 / 病毒 / **DACL**（⚠️ 此前"否证 ACL"只排除了 DACL；真凶在 SACL 的 mandatory label，见下条）/
      文件属性 / ProfileImagePath / KnownFolder / User Shell Folders /
      iconcache+thumbcache / CLSID 遮蔽 / overlay / BagMRU / DPI / **火绒**（关文件监控+加信任区后结果不变）。
      ⚠️ **副作用提醒**：桌面/开始菜单/Quick Launch 的**实体已在 D 盘**，备份工具默认跳过 reparse point，
      备份 `C:\Users\27063` 会漏掉这三处 ⇒ 需把 `D:\Desktop`、`D:\ExplorerData` 显式加入备份。

- [x] **★★ 根因升级到机制层（2026-10-06 16:xx）：元凶是 `Mandatory Label\Low Mandatory Level`（Low IL）——
      既不是 DACL，也不是"路径"本身**
      **决定性实验（同目录 / 同内容 / 同 DACL / 全新文件名）**：
      `t5c.lnk` 设 `setintegritylevel Medium` → `idx=50 nongray=511` **彩**；
      `t5d.lnk` 设 `Low` → `idx=0 nongray=48` **白**。**唯一变量 = mandatory label，可逆可控。**
      **端到端根治验证（已成功）**：`icacls C:\Users\27063\acltest /setintegritylevel "(OI)(CI)Medium" /T /C`
      （10 files，**无需 admin**）之后，**同一路径同一文件** `t0.lnk` 由 `idx=0/48`（白）→ `idx=50/511`（彩）。
      **否证 DACL**：给 Low IL 文件加 `Everyone` / `INTERACTIVE` / `ALL APPLICATION PACKAGES` 全部无效。
      **否证 target 的 IL**：lnk 在 `D:\`、target 指向 C 树内 Low IL 文件 → 仍 `idx=50`（能取到图标）
      ⇒ 触发点在「读 lnk 自身 / 读显式 `IconLocation` 指向的文件」，而非解析 target。
      **候选机制（行为已铁证；机制为高置信假说）**：Low IL 是 Windows 的"不受信任内容"标记（与 IE Protected Mode
      的临时文件同类）。shell 的图标提取对位于 Low IL 位置的文件**跳过内容解析**，直接退化返回空白文档图标 `iIcon=0`。
      注意 DACL 明明允许读（`天阙九泉\27063:(F)`）⇒ **不是权限拒绝**。
      **profile ACL 现状（被整体重写过）**：`C:\Users\27063` 无任何 `(I)` 继承标记 +
      `Everyone:(CI)(DENY)(DC)` + 未知 SID `S-1-4-1049387402-452331294:(OI)(CI)(W,D,DC)` +
      `Mandatory Label\Low Mandatory Level:(OI)(CI)(NW)`；`(OI)(CI)` 继承到每个子对象，连 `NTUSER.DAT` 都是 Low IL。
      另有 `S-1-15-3-65536-…` 形式的自定义 capability SID（`C:\Users` 与 profile 上各一条）。
      **对照（全部无 mandatory label）**：`C:\Users\Public` / `C:\ProgramData` / `C:\Windows\Temp` /
      `D:\` / `D:\Desktop` / `D:\ExplorerData` / `C:\Users\admin|dev|runner|Default`。
      **⇒ 另一个账户不会白纸**（问题只在本账户 profile 被打标）。`dsh_test_temp` / `WsiAccount` 当前账户读不到，未验。
      **来源未确证**：火绒（配置/二进制/日志 grep 无命中）已排除；
      `aTrust`（深信服；`C:\Program Files\Sangfor`、`aTrustService` 存在但当前 Stopped、
      `C:\ProgramData\Sangfor\EAIO3_LOG`、`C:\Users\27063\sangfor\aTrust`）属高嫌疑但**无直接证据，不下结论**。
      **根治选项（均未执行，待用户决定）**：
      ① 只改 profile 根 IL（不 `/T`）→ 只管未来新建文件，风险最低、可回滚；
      ② 按顶层子目录**分批** `icacls /T` 恢复 Medium（长任务，必须拆片 + 每批限时）；
      ③ 维持现状（junction 已让 270/280 彩），接受"以后在 C 树内新建的 lnk 仍会白"。
      ⚠️ 若该 Low IL 是学校/单位合规软件所设，擅自改动可能被周期性重置，甚至触发合规告警 —— 先问清来源再动。
      **实验产物**：`C:\Users\27063\acltest\`（t0/t2/t3/t4/t5/t5b/t5c/t5d，可随时删）、
      `D:\lowtest_hi\`、`D:\lowtest_low\`、`C:\Users\Public\dsh-icontest\probe2.ps1`。


- [x] **★ 任务栏图标「点了没反应」根因定位 + 修复（2026-10-06 13:40）**
      **根因（两条叠加）**：
      ① **任务栏 pin 的快捷方式参数为空**：
      `%APPDATA%\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\DeepSeek Harness.lnk`
      的 `Arguments = []`（2026-10-04 我只修了开始菜单那一个）⇒ 点它 = 无参数启动。
      ② **无参数启动 = sandbox 初始化即崩**：`& 'DeepSeek Harness.exe'` ⇒ 立即退出，
      `ExitCode = -2147483645 (0x80000003 STATUS_BREAKPOINT)`、`proc count = 0`。
      **崩溃点在最底层 sandbox 初始化（C++），早于 `lib/main.js` @281631 的
      `claimDesktopSingleInstance()`** ⇒ `requestSingleInstanceLock()` 根本到不了
      ⇒ **即使已有实例在跑，`second-instance` 也不会触发** ⇒ 两条路都表现为「完全没反应」。
      已排除（都查过、都干净）：IFEO(HKLM/HKCU) / Per-app Exploit Protection /
      AppCompatFlags Layers(HKCU/HKLM) / 三处 .lnk 与 exe、asar 的 Zone.Identifier。
      **修复**：三处快捷方式全部补 `--no-sandbox`（任务栏 pin / 桌面 `工具箱\` / 开始菜单），
      每处留 `.bak-nosandbox`；随后 `Stop-Process -Name explorer -Force` 刷新 pinned 缓存（Windows 自动拉起 shell）。
      **验收（两条路径都实测）**：
      · 无实例时：`Start-Process exe --no-sandbox` ⇒ `proc count = 6`；
      · 有实例时：再次启动 ⇒ **不新增进程、已有窗口被激活**
        （`hwnd=789418 / title=[持续推进，你最了解你自己 — DeepSeek Harness]`）。
      **固化**：`~/.dsh/storages/tools/fix-desktop-shortcuts-nosandbox.ps1`（幂等、自动备份、自带 launch check）
      —— **app 更新/重装或重新 pin 之后必须重跑**（NSIS 会重建快捷方式、参数丢失 ⇒ 症状回归）。
      **两个易误判点（勿重蹈）**：
      · `Start-Process <.lnk>` 会弹「打开文件 - 安全警告」——那是 Attachment Manager 对**非 explorer 发起**的
        .lnk 启动的确认，**不是**本故障的一部分（三处 .lnk 的 ADS 都只有 `:$DATA`，无 MOTW）。
      · 主窗口需约 **35 s** 才出现，20 s 时查 `MainWindowTitle` 是空的，别急着判「没起来」。
      **安全代价（需知情）**：`--no-sandbox` 关掉 Chromium 的 OS 级 renderer 隔离。
      本地自用工具可接受，但不要在长期打开不可信网页的场景下这么跑。
- [x] **★ 桌面版「更新 + 迁移」完成（2026-10-05 00:50）—— app 本体无新版，实际更新在 plugin 层**
      **① app 本体：无可更新版本（判据）**：asar 内 `@deepseek-ai/dsh-desktop` 与内嵌 `dsh` runtime 均
      **0.2.0-rc.2**，exe FileVersion 同；feed 只有 nightly 一个 channel（`latest.yml`/`beta.yml`/
      `canary.yml`/`alpha.yml` 全 404 且返回官网 HTML），`curl https://download.deepseek.com/dsh-desk/feeds/win-x64/nightly.yml`
      ⇒ **version: 0.2.0-rc.2**；updater cache 的 `installer.exe` sha512 `raIlxMQd9ESXgktmViW7QwVLcjBR5JIsrNOu+SpelY8kskdSr2H51/f+ey1EqFI/eIIrKQCuRANMeb5SptRZcg==`
      **与 feed 逐字节一致**、`Last-Modified: 29 Sep 2026 10:36:09 GMT` ⇒ 本机装的就是这个 build。**故未跑 installer。**
      **② `app.asar` 定性 = 官方原版**：与 `storages/tools/_asar-work.asar` 逐 entry 比对
      ⇒ `12967 = 12967`、only-PROD 0 / only-WORK 0、**differing 1** =
      `dsh/node_modules/@deepseek-ai/dsh-token-meter/lib/index.js`（双方 size 均 31507、integrity 不同）
      ⇒ PROD 是官方态、WORK 是我演练用的加 patch 副本。asar 的 Oct-3 13:47 mtime **不是内容变更**。
      另：`~/.dsh/profiles/node_modules/@deepseek-ai/{dsh,dsh-client-modules,dsh-client-ui-chat,dsh-token-meter}`
      全是 **symlink → `%APPDATA%/npm/node_modules/@deepseek-ai/dsh/...`** ⇒ **desktop 与 CLI 共用同一份核心 runtime**，
      CLI 侧 patch 天然对 desktop 生效；asar 内嵌 `dsh/` 只是种子。
      **③ 真正更新的是 desktop plugin（3 个）**：`dsh-context` 0.62.2→**0.63.0**、`dshmarket` 1.66.7→**1.66.8**、
      `billion-context` 0.1.178→**0.1.184**；其余已最新（`dsh-deja` 0.21.3 / `dsh-better-sidebar` 0.24.1 /
      `dsh-quick-toc` 0.8.2 / `dsh-plugin-message-edit` 1.2.0 / `@lanbaolu/dsh-wechat-bridge` 0.9.1 /
      `@mingozhou/dsh-replay` 0.4.1 / `ds-harness-remote` 0.4.27）；`dsh-headroom` 是 git 依赖未动。
      命令：`cd ~/.dsh/profiles/desktop && pnpm add dsh-context@0.63.0 dshmarket@1.66.8 billion-context@0.1.184`
      ⇒ `Packages: +3 -38 … Done in 15.7s`；pnpm 自动往 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude`
      补了 `billion-context@0.1.184` + `dsh-context@0.63.0`。兼容性前置：0.63.0 的 peerDependencies **与 0.62.2 逐字相同**。
      **④ 迁移（重打 patch）=「注意迁移」核心**：先备份
      `~/.dsh/storages/backups/dsh-context-client.js.PATCHED-0.62.2.bak-20261005-0035`（620423 B）；
      0.63.0 的 `client.js` **三个锚点各命中 1**（priceFaceOf 定义行 / 空书守卫 / isDeepSeekProvider 开括号）
      ⇒ `node ~/.dsh/storages/tools/patch-dsh-context-pricing.mjs --apply` **PASS**（620423 → **626531 B**，
      `✓ face hook ✓ 内嵌价目表与 overlay 一致（3 条 / 2 provider）✓ 语法 SourceTextModule ok`）。
      **⑤ 其它 file patch 存活（逐个 diff-lines）**：`@mingozhou/dsh-replay/lib/client.js` pricing 18 / thinking 27、
      `viewer.js` pricing 2 / thinking 10、`dsh-headroom/lib/compress.js` 2 —— mtime 仍 Sep-30 18:47 / Oct-4 11:48
      ⇒ **未被本次安装覆盖**。
      **⑥ 验收**：`dump-desktop-config.ps1` ⇒ **exit=0 / stderr 0 B / 86821 B**，与更新前基线 `diff` **零行**、
      `- id:` 仍 **201**；重启 App ⇒ **hwnd=2557518 / title=[…— DeepSeek Harness]**（窗口约需 35 s 才出现，
      20 s 查询会看到空标题）。
      **⑦ 顺带定案 objective ② 的 desktop 侧**：包内 `dsh-thinking-guard/cordis.patch.yml` 写 `enabled: true`，
      但合成配置（注释头 `# == @ethanwong-hk/dsh-thinking-guard, patched by …/desktop-probe/cordis.patch.yml`）
      最终为 **`enabled: false`** ⇒ profile row 覆盖 bundle patch，与 web 一致。
      **⑧ 环境事实（后续必用）**：**DevSidecar 当前未运行**（31180/31181 → 000），而 `~/.npmrc` 仍写死
      `proxy=…:31180 / https-proxy=…:31181` ⇒ 一切走 npm 协议的工具都 ECONNREFUSED；绕法：临时
      `grep -vE '^(proxy|https-proxy)=' .npmrc`（脚本内用 trap 还原）后 pnpm 直连 `registry.npmmirror.com`（直连 **200**）。
      `curl` 对 registry 另需 `--ssl-no-revoke`（否则 `CRYPT_E_REVOCATION_OFFLINE 0x80092013`）。
      **⑨ 回滚材料**：安装目录全量备份 `D:/_backup-dsh-desktop-pre-reinstall-20261005`
      （1145 dir / 9772 file / **1014.95 MB**）；版本快照
      `~/.dsh/storages/snapshots/desktop-node-modules-versions.json`（**278 包**）；
      `profiles/desktop/package.json` + `pnpm-lock.yaml` 的 `.bak-20261005-0040-pre-plugin-update`。
- [x] **★ objective ⑧ 完成（2026-10-04 23:0x；先前的「半完成」已解除）：死 model + reasoningEfforts 两侧都收掉**
      **① 死 model（复核 PASS）**：`python ~/.dsh/storages/tools/desktop-model-audit.py`
      ⇒ `web 61 / desktop 61 / not-in-allowlist 0 / duplicates 0 / 两侧集合相等`（与 web 完全一致）。
      **② reasoningEfforts（本轮真正收掉）**：原先 61 个共有 model 里 **47 个两侧不同**（只 14 个相同）。
      **根因：web 的档位建立在有缺陷的 probe 上** —— `probe-all-models.py` 只看
      `choices[0].message.reasoning_content`，而 `gpt-6-luna` / `gpt-5.6-*` / `google/gemini-*` /
      `xiaomi/mimo-*` / `deepseek/deepseek-v4-pro` 等**改用 `reasoning_details` 报思考** ⇒ 被系统性误判成
      「无 reasoning」⇒ **web 大面积错标 `false`**。两侧都不对，**实测是唯一依据**。
      **做法**：跑 `probe-reasoning-all.py`（两种字段都认；每 model 1 次请求；62 个约 3 分钟；
      结果落 `~/.dsh/tmp-probe/efforts-probe-20261004.json`），再用新工具
      `~/.dsh/storages/tools/sync-efforts-from-probe.py --probe <json> --apply` 重建**两侧**。
      **验收（全部可复现）**：
      `dsh --profile web --dump-config` ⇒ **exit=0 / stderr 0 B / rows=198**；
      `dump-desktop-config.ps1` ⇒ **exit=0 / stderr 0 B / 86821 B**；
      `efforts-diff.py` ⇒ **identical 58 / DIFFERENT 3**（从 47 降下来）；
      `desktop-model-audit.py` ⇒ **PASS**；
      **主力 `deepseek/deepseek-v4.1-flash` 从 4 档补到 6 档**（两侧合成配置均已确认）。
      **剩余 3 个差异是设计使然**：`meta/muse-spark-1.2` / `poolside/laguna-s-2.1-free` / `tencent/hy4-preview`
      在 probe 里返回 **503 `other`**（上游限速）⇒ 归入「未知」而**保持原样不猜**。
      **⚠️ 本轮我把两侧 patch 改坏两次，都靠备份回滚**（症状一律是 `dump-config` exit=1 / rows=0）：
      **坑一**：找 `        models:` 时命中了 **`commandcode-goat-anthropic` 的那个**（只有 6 行）而非
      `commandcode-goat` 的 61 个 —— 文件里有**两个同缩进的 `models:`**，必须先锚 6 空格的 provider key。
      **坑二**：block 结束边界若用「下一个 0 缩进的 `- id: `」会**多吞 421 行**
      （`- id: permission` 在 1128 行，而正确边界 `      commandcode-goat:` 在 707 行）；
      正确写法 = 「第一个非空且缩进 < 10 空格的行」。
      **坑三（判据）**：**不能用 pyyaml 当 gate** —— patch 合法使用 `!!js` 标签，stock loader 报
      `could not determine a constructor for the tag 'tag:yaml.org,2002:js'`，**那是误报**；
      唯一权威判据是 **`dsh --profile web --dump-config` 的 exit code**。
      **坑四**：某 block 若原本**没有 `reasoningEfforts` 行**，往 block 末尾 append 会破坏缩进
      （有的 block 以更深缩进的 `input:` 子项结尾）⇒ 必须**只做原地替换**，`(absent)` 一律跳过。
      四条已写进 memory `dsh-profile-models-block-parsing-traps-and-probe-choice-20261004`。
      **生效条件**：web 侧是 profile patch ⇒ live reload，**开新会话即生效**；
      desktop 侧需**重启 App**（当前实例是 22:33 启动的，需再重启一次才见新档位）。

- [x] **★ objective ⑧ 复核（2026-10-04 23:2x，亲手复现）：死 model 清理 PASS；`reasoningEfforts` 是刻意未动**
      工具：`python ~/.dsh/storages/tools/desktop-model-audit.py`
      输出（可复现）：`allowlist: 62 allowed ids`；
      **`web models=61 not-in-allowlist=0 duplicates=0`**、**`desktop models=61 not-in-allowlist=0 duplicates=0`**；
      `web-only: (none)`、`desktop-only: (none)` ⇒ **VERDICT: PASS — desktop 集合 == web 集合且两者都没有死 id**。
      ⇒ 先前 11:05 的清理结论**成立**（改前 desktop 82 个、其中 21 个不在 `D:/Toolbox/goat-gateway/model-allowlist.json`；
      删 21 + 补 `stealth/pixel-canary` + 移走 `claude-sonnet-5-5` ⇒ 61 个）。
      **但 objective ⑧ 只算「半完成」**：`reasoningEfforts` **刻意没动**，理由在 PLAN.md 旧条目里已写明且成立——
      两侧 60 个共有 model 的 `reasoningEfforts` 文本 **0 个相同**（web 走 `rewrite-model-list.py` 的实测 verdict，
      desktop 更像手工旧版），而「`zai-org/GLM-5.3` / `MiniMaxAI/MiniMax-M3` 实测 5 档都能出 thinking」与 web 标 `false` 矛盾
      ⇒ **哪侧正确未定论**，改了会改 UI 行为且无法自证 ⇒ 保守不动是对的。
      要真正收掉这半边，需要一次「逐 model 跑 5 档 reasoningEfforts 看有没有 thinking」的实测矩阵。

- [x] **★ objective ⑤ 复核（2026-10-04 23:2x）：Windows 侧亲手跑通**
      工具：`python ~/.dsh/storages/tools/usage-overview.py`（顺手修掉了 `utcfromtimestamp` 的 DeprecationWarning）
      输出（可复现）：`machine: 天阙九泉 / dsh home: C:/Users/27063/.dsh`；
      `dsh: 1666 session json, 0 unreadable`；`reasonix: %APPDATA%/reasonix/stats (25 files, 6119 lines, 824 lines without CNY cost)`。
      主力 `commandcode-goat / deepseek/deepseek-v4.1-flash` = **1,479 sessions / cacheRead 2,568,429,854 /
      uncached 94,936,379 / output 48,122,169 / ¥342.0122 / source=priced**；
      同一次运行的 dsh 侧 **TOTAL = 2,794,827,263 tokens / ¥373.0784**（**数字每跑一次都会涨**，因为新 session 在持续写入 —— 所以引用时要带「某次读数」的口径，不要当常量）。
      **reasonix 侧（同一份报告的后半段，同一个 agent 视图的另一半）**：
      `reasonix  (cost as reported by reasonix, CNY)` —— **TOTAL = 1,121,009,149 cacheRead / 135,977,072 uncached /
      7,977,713 output / ¥195.9563 / total tokens = 1,264,963,934**。
      报告末尾有 **`MACHINE SUMMARY  天阙九泉`** 段，把 `dsh` 与 `reasonix` 两行并列 ⇒ **Windows 侧 2/4 个 agent 已在同一视图**。
      （上一轮我只 `head -40` 看漏了 reasonix 那半张表，本轮取全量输出才发现 —— 记录一下这个坑。）
      **交叉验证**：`source=priced` 说明 objective ⑥ 的 overlay 价目**真的在参与计费**
      （若 overlay 未生效，这一行会显示 `NOPRICE` 且金额为 0，正如其余 20 余个未列价的 model）。
      **仍未并进视图的**：Linux 侧的两个 agent（dsh / reasonix）⇒ 同 objective ④ 的可达性约束。

- [ ] **★ objective ④ Linux gateway 补齐 reasoning-filter / finish-log —— 阻塞：`tianque` offline（已把执行路径备足）**
      **阻塞判据（可复现）**：`tailscale status` ⇒
      `100.79.96.82 tianque TianQue6916@ linux active; relay "nue"; offline, last seen 1d ago, tx 12168 rx 0`；
      `ssh -o BatchMode=yes -o ConnectTimeout=5 tianque` ⇒ `connect to host 100.79.96.82 port 22: Connection timed out`。
      **可达性结论（两条路都不通，但原因要分开说）**：
      ① 网络路：`tailscale status` 里 `tianque` 是 `offline, last seen 1d ago`，`ssh -o ConnectTimeout=5` 超时；
      ② 本地文件系统路：`Get-Partition` 显示**本机只有 `Disk 0` 一块盘，5 个分区全为 Windows 类型**
         （System / Reserved / C / D / Recovery，没有任何 Linux 分区），且 **WSL 未安装**（`wsl -l -v` 提示要先装）。
      ⇒ **Linux 环境既不可达、也不在本机可读的文件系统上** ⇒ Windows 会话内完不成。
      **注意（勿过度推断）**：两个 tailscale 节点同属一个账号 `TianQue6916@` **不等于**就是同一台机器
      （同一账号可有多台设备），本轮先前那句「同一台机双系统」是**证据不足的推断，已撤回**。
      **这是环境约束，不是配置错误 ⇒ 不要反复重试 ssh / tailscale。**
      **已做足的准备（切到 Linux 后一条命令即可）**：
      ① `patch-gateway-reasoning-filter.py` **新增 `--helper-anchor` / `--call-anchor`**（本轮改动 8 处、
         `py_compile OK`、**默认值不变 ⇒ Windows 行为逐字不变**，回归 `--check` 仍全绿且新增打印锚点原文）。
         原因：Linux 版 gateway.mjs 是另一个 **1642 行 build、没有 bodylog 补丁** ⇒
         默认 call 锚点 `'  // bodylog-end'` 在那边 **count=0** ⇒ 原脚本会直接 `SystemExit`（锚点不唯一/缺失）。
      ② 新增 `~/.dsh/storages/tools/linux-gateway-patch.sh`（`bash -n` 通过，并已在 **Windows 文件上 dry-run 全流程**）：
         先量锚点 → 缺 call 锚点时**打印 `parsed` 候选行** → 跑两个 `--check` → `--apply` 后 `node --check`
         → 提示 `systemctl --user restart goat-gateway`。
      ③ **Windows 侧四个补丁全部在位（对照基线）**：`reasoning-filter`×4 / `filterReasoning`×2 / `finish=`×1 /
         `HB elu`×1 / `BODYLOG`×1；`--check` 报「已打补丁=True、helper/call 锚点各 1、`node --check` OK、
         `logs/.reasoning-filter.json` 存在（启用）」。
      **切系统后的执行步骤**：
      `bash ~/.dsh/storages/tools/linux-gateway-patch.sh`（只诊断）→
      若 call 锚点缺失，按提示 `--apply --call-anchor '<候选行>'` → `systemctl --user restart goat-gateway`
      → `curl -sS localhost:8788/health`。

- [ ] **★ objective ⑤ 双机四 agent 用量总视图 —— Windows 侧已完成，Linux 侧同 ④ 阻塞**
      Windows 侧：`usage-overview.py`（PLAN.md 记于 2026-10-04 11:15）。
      数据源（口径 A = {Windows, Linux} × {dsh, reasonix}）：
      dsh = `storages/session_projcache/sessions/*.json` 的 `rows.tokenUsage.val.totals`
      （**无 cost 字段** ⇒ 价按 objective ⑥ 的 `dsh-context-price-overlay.json` 算）；
      reasonix = `%APPDATA%/reasonix/stats/*.jsonl`（**每行自带 CNY，直接用**）。
      阻塞：Linux 侧两个 agent 的数据要并进同一视图 ⇒ 需 Linux 可达（同上，物理不可达）。

- [x] **★ objective ① 思考链恒中文（含工具调用场景）（2026-10-04 23:0x 定论：PASS，实证）**
      工具：`python ~/.dsh/storages/tools/reasoning-language-audit.py 2026-10-04T18:36 6`
      （把 `assistant/message` 的 `reasoning` block 抽出来，分「该步调过工具/没调过工具」两个 bucket 统计
      CJK 字符占「CJK + 拉丁字母」的比例）
      结果（cutoff = 18:36）：
      `session-a0d5fbf8` 工具步 34.6% (n=30518) / 非工具步 32.6% (n=1926)；
      `session-5cc47bcb` 41.8% / 46.3%；`session-33713e9e` 37.3% / 52.2%；`session-81076132` 38.7% / 42.9%。
      **关键：两个 bucket 差异 < 6 个百分点 ⇒ 工具调用场景没有系统性退化**（这正是当初的抱怨点）。
      **实证复核**（抽样精读，工具：`python ~/.dsh/storages/tools/reasoning-sample.py`）——
      全是中文散文，例如：
      「用户遇到大问题：打开文件 - 安全警告 对话框，无法验证发布者。这是 SmartScreen/安全警告，针对 `display-guard.cmd`…」
      「关键新数据：- 当前写入速率：~250-850 KB/s（很低，0.85 MB/s 峰值），说明现在并不在疯狂写盘。」
      ⇒ **中文主导 + 技术术语按语言契约保留英文原词**（SmartScreen / display-guard.cmd / KB/s 等）。
      **CJK 占比 33–52% 不是缺陷**：技术思考必然夹大量英文标识符/术语，用「CJK 占比 >70%」当阈值选错了指标。
      正确判据 = ①两个 bucket 无系统性差异 ②句子结构是中文。

- [x] **★ objective ③ 真实 finish=length 证据链（2026-10-04 23:0x 定论：完成且已验收）**
      **证据链（比旧记录更完整）**：gateway 全量日志里 `finish=length` 共 **14 条**，
      其中 **10 条是 dsh 真流量**（`clientUa="deepseek-harness/0.2.0-rc.2"`）、4 条是 curl 探针
      （`clientUa="curl/8.21.0"`）—— 旧记录写的「只有 4 条」**低估了，实际真流量 10 条**。
      **共同特征**：`completion_tokens == reasoning_tokens`
      （真流量全部 `64 == 64`；`text_tokens: 0` ⇒ **只有 reasoning，没有可见正文**）。
      **根因（PLAN.md 内已记）**：`session-title-llm`（`@deepseek-ai/dsh-session-title-first-prompt-llm`）
      上游 `maxOutputTokens` 定为 **64**，而 title 请求**继承主 session 的 route**
      （实测 875/888 条是 `commandcode-goat / deepseek/deepseek-v4.1-flash`，thinking 默认开启）
      ⇒ reasoning 吃光 64 预算 ⇒ 上游回 `finish_reason="length"` ⇒ 标题拿不到文本 + UI 弹「已达到输出 token 上限」。
      **修复**：`maxOutputTokens: 64 -> 512`（web 与 desktop 两侧 patch 均已 512：
      `profiles/web/cordis.patch.yml:1295`、`profiles/desktop/cordis.patch.yml:1303`）。
      **验收（决定性）**：修复 commit = **`60357ea auto: 2026-10-04 11:20`**；
      真流量最后一条 finish=length = **`2026-10-04T10:00:08Z`** ⇒
      **修复后 11.5 小时（11:20 → 22:5x）零复发**（唯一 12:13 之后的是我自己的 curl 探针）。
      复现：`grep -h "finish=length" /d/Toolbox/goat-gateway/logs/*.log | grep deepseek-harness`

- [x] **★ objective ② thinking-guard 两侧真正生效 + 可验证痕迹（2026-10-04 22:5x 定论：完成）**
      **判据坑（重点）**：不能用「session JSON 里含 `thinking-guard` 字符串」——那会命中**会话自己在讨论它的文本**。
      本次实测：suspect 命中 712 条，逐条看 `source.plugin` 全是 `None`，内容是**我自己的 bash 输出 / reasoning**
      （19:20:53 tool/result、19:21:05 assistant/message、22:40:45 assistant/message …）⇒ **纯自我指涉**。
      正确判据 = `data.source.plugin === 'thinking-guard'` 这个**结构化字段**。
      工具：`python ~/.dsh/storages/tools/guard-trace-audit.py 2026-10-04T18:36`
      结果（cutoff = 18:36 重启时刻）：8 个 session 逐个统计，
      **`guard-inj` 全 0**（无一条 guard 注入的 `user/message`）；
      `guard-err` 仅 session-a0d5fbf8 有 9 条，**逐条查证全为 `source.plugin=None` 的自我指涉文本**
      （`python ~/.dsh/storages/tools/guard-err-detail.py`）。
      **web 侧痕迹**：`~/.dsh/logs/host-stdio.log` 第 8576 行（本次 18:36:58 启动标记）之后
      `thinking-guard` 字样 **0 条**。
      **desktop 侧痕迹**：`dump-desktop-config.ps1` **exit=0 / stderr 0 B / 201 rows**，
      合成配置 `- id: thinking-guard` 明确为 **`enabled: false`**（该脚本是 desktop 唯一可用的合成配置查看方式，
      CLI `--dump-config` 被 Electron 守卫拒绝）；且同一配置里 `tm-usage-first` 也在位（row 2278）。

- [x] **★ objective ⑥ overlay 价目精确值 + dsh-context 面板生效（2026-10-04 22:5x 定论：完成）**
      **价目侧（先前已完成，本轮复核）**：`node ~/.dsh/storages/tools/patch-dsh-context-pricing.mjs --check`
      ⇒ `bytes = 620423  已打补丁 = true`，三个锚点各 1 处命中
      （`priceFaceOf` 定义行 / `priceFaceOf` 空书守卫 / `isDeepSeekProvider` 开括号）。
      overlay = `~/.dsh/storages/dsh-context-price-overlay.json`，**3 条 / 2 个 provider / `peakProviders=[]`**；
      主力价目 `commandcode-goat | deepseek/deepseek-v4.1-flash` = `hit 0.0030285 / miss 0.151425 /
      write 0.151425 / out 0.6057`（PLAN.md:450 记：**10-04 00:16 起换成 reasonix 反解的精确值**）。
      **只有 desktop 一份 client bundle**（`~/.dsh/profiles/desktop/node_modules/dsh-context/lib/client.js`）。
      **面板侧**：生效条件 = 重启 App（node_modules 里的 client bundle 不参与 HMR）⇒
      **本轮 22:33 已把 desktop App 重启**（见「desktop 打不开」那条的修复）⇒ 条件满足。
      **注意（踩过的坑）**：Git Bash 的 `/c/Users/...` 路径喂给 Windows python 会 `FileNotFoundError`，
      而同一文件用 `C:/Users/...` 就能打开 ⇒ 判断「文件是否存在」不要用 `/c/...` 形式。

- [x] **★ objective ⑦ mnemon idleReview E2E 验收（2026-10-04 22:5x 定论：**PASS**，推翻 12:05 的旧结论）**
      工具：`python ~/.dsh/storages/tools/mnemon-idlereview-audit.py`
      判据（`rows.mnemonSubagentTokenUsage.val.totals.outputTokens > 0`）：
      **1666 条 projcache 记录中 1663 条带 `mnemonSubagentTokenUsage`**，
      **`outputTokens` 总和 = 1,527,045**，大量非零（56772 / 11322 / 7353 / 6949 / 6943 …）
      ⇒ **review subagent 真的执行过** ⇒ **VERDICT: PASS**。
      **与 PLAN.md:250（10-04 12:05）的「1639/1639 全 0、从未运行」直接冲突** ⇒ 旧结论作废。
      可能原因（未进一步追）：旧脚本取的字段路径不对（**数据本体在 `record.rows`，不在 `record` 顶层**），
      或 12:05 之后才真正触发。
      **顺带明确的字段结构**：projcache 每条 = `{version, record:{identity, rows}}`，
      `rows` 下稳定出现 12 个键：`title / goal / tokenUsage / contextPressure / contextBreakdown /
      subagentTiming / subagent / permissions / todos / plan / sessionStats / sessionListMetadata`。
      **注意 `inputTokens` 全为 0**（只有 `outputTokens` 有值）——subagent 的输入侧未被记账，若要报「费用」需另行处理。

- [x] **★ objective ⑨ 面板 vs 磁盘 session 差额（2026-10-04 22:4x 定论）**
      工具：`python ~/.dsh/storages/tools/session-orphan-audit.py`
      数字：projcache（面板数据源 `storages/session_projcache/sessions/*.json`）**1665**；
      磁盘 session dir **1491**；**matched 1490**；**panel-only 175**（面板有记录、磁盘已无）；**disk-only 1**；
      另有 **570 个 dir 没有 `session.v4.jsonl.zstd`**（磁盘侧空壳）。
      ⇒ 差额真身是这两类，**不是**「面板多算了 569」。
      **我自己的 bug（已修，勿用旧数字）**：首版脚本在 projcache 侧保留 `session-` 前缀、磁盘侧切掉
      ⇒ 交集算成荒谬的 0。两边归一化到裸 `<uuid>` 后得 **1490**。旧数字 1644/1075/569 作废。
      projcache 记录结构 = `{version, record:{identity, rows}}`，**`rows` 才是数据本体**
      （`mnemonSubagentTokenUsage` 等都在 `rows` 下，不在 `record` 顶层）。
      **磁盘大头**：slug `--C-Windows-system32--` **1211** 个 dir（798 带 stream，共 **153.6 MB**）——
      dsh 在 `C:/Windows/system32` 目录被启动产生的；**属用户数据，本轮未擅自清理**。

- [x] **★ objective ⑩ reasoning-autofold 是否打进 asar（2026-10-04 22:4x 定论：没有）**
      工具（新增，均只读）：`node ~/.dsh/storages/tools/asar-list-grep.mjs <asar> <pat...>`（读目录表，不解包）、
      `node ~/.dsh/storages/tools/asar-read-entry.mjs <asar> <entryPath> [needle]`（读单个 entry 内容）。
      判据：asar 内**真实路径**是 `dsh/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js`
      （565,053 B @ offset 19213654）⇒ `__dspDisclosure` **NOT FOUND**，原目标行
      `const { expanded, toggle } = useDisclosure();` **仍在**。
      对照：CLI 那份（`%APPDATA%/npm/node_modules/@deepseek-ai/dsh/node_modules/.../client.js`，565,455 B）
      `__dspDisclosure` **×3** ⇒ **CLI/web 侧已打，desktop 侧没打**。
      `_asar-work.asar`（121,348,951 B，与生产**逐字节同大小**，mtime 10-04 15:33）同样未打 ⇒ 只是副本，不是重建产物。
      **三条使「免重建」不可行的硬约束（重要，推翻 pending ⑯ 的等长路线）**：
      ① 补丁**非等长**：565,053 → 565,455（+402 B）⇒ 不能原地改；
      ② entry header 携带 **`integrity: {algorithm:'SHA256', hash:'a33cbb81…', blockSize:4194304, blocks:[…]}`**
         ⇒ 即使等长也会 hash 不匹配（Electron asar integrity）⇒ **等长 patch 路线本身不成立**；
      ③ `app.asar.unpacked/` **不能手动覆盖**：unpacked 语义由 header 的 `unpacked:true` 决定
         （全库 1497 个 entry 有此标记，`client.js` **没有**）⇒ 往 unpacked 目录放同名文件**不会被读**。
      ⇒ **唯一路径 = 重建整个 asar（12967 entries）**：重排 offset（4 字节对齐）+ 重算 integrity hash。
      **风险/收益**：要动 121 MB 的 desktop 主产物，出错即 desktop 打不开；收益仅「desktop 端思考链自动展开」。
      **故本轮只判定、不实施**；实施前必须先备份 `app.asar` 并备好回滚。


- [x] **★ 2026-10-04 20:1x goat-gateway quota 动态权重口径修正：resetWindow weekly -> month（已上线验证）**
      **起因**：用户质疑「我说的东西你都做了?为什么我现在消耗月重置时间更远的 api?」—— 观察正确，实现方向反了。
      **根因**：2026-10-01 实现时把「月额度更近」写成 `resetWindow: weekly`，依据是注释里那句
      「GOAT 只有 5h / weekly 两个 rolling window 带时间戳、月度池属 billing cycle 没有日期」——
      **这个前提是错的**：`goat-usage.ps1 -Json`（经 quota-http `8790/quota`）一直在返回 `monthReset`。
      而两个号的周/月远近顺序恰好相反：
      `163` weekly 158.2h / month **75.2h**（月剩 4.89/70）；`qq` weekly **139.0h** / month 713.3h（月剩 65.65/70）。
      ⇒ 当天 5326 次请求全打 qq，163 只拿到 24 次，那 4.89 眼看要在 3 天后白白重置掉。
      **改了什么**：① `gateway.mjs` 的窗口映射从二元改成 `RW_COL = {fivehour, weekly, month}`；
      ② `config.json` `resetWindow: "month"`；③ `selftest-quota-priority.mjs` 新增 **T8**：
      故意让 weeklyReset 与 monthReset 顺序**相反**，只有真读 monthReset 才 PASS。
      **验证**：正向 T1-T8 全 PASS；反向（qsw 退回旧写法）T8 精确失败
      （`月重置最近的 goatA 应拿满权重 5，实际 0.2`）；生产 `/health` =
      `163: 剩 75.1h -> w5.00` / `qq: 剩 713.1h -> w0.20`；
      三个全新 session 全部 `SESSION-BIND ... 163` + `key=163`。
      **遗留**：① `strategy=session` 是会话级粘性 ⇒ **已绑定会话不迁移**，
      用户当前对话（`sess=8cebd222`）仍粘 qq，要立刻生效只能开新会话；
      ② 天阙 offline（tailscale `last seen 1d ago`），Linux 侧 `gateway.mjs` / `config.json` /
      `selftest-quota-priority.mjs` 尚未同步；③ 天阙旧记的 LAN IP `192.168.1.13` 已失效
      （应为 `192.168.0.106`，需联网后复核）。
      **踩坑**：`D:\80-系统\Toolbox` 对原生 Windows 进程拒写（python EACCES），
      只有 MSYS 侧能写 ⇒ 走 `%TEMP%\ggpatch\` 中转 + bash `cp` 落地。
      备份 `*.bak-20261004-2003-pre-resetwindow-month`（3 份）。
      详见 memory「本机-D盘-Toolbox-原生进程拒写只能走MSYS」与
      「goat-gateway-quota动态权重-resetWindow必须用month」。

- [~] **★ 2026-10-04 19:3x computer-use 与 browser-use 推生产（配置层已验证，运行层待新会话）**
      用户批准的三件事里的两件；第三件（改用户级 TEMP）**已判定不必要** ——
      重启后 `D:/Temp` 已恢复可写（本轮实测 `WRITE[D:/Temp]=True`、`node os.tmpdir()`+`mkdtemp` 通过）。
      **做了什么**（三个可回滚脚本，均在 `~/.dsh/storages/tools/`）：
      ① `promote-wincu-to-web.py` —— 向生产 `profiles/web/cordis.patch.yml` 追加 `mcp-dsh-computer-use-win` row
         （`serverName: wincu`、`command: !!js process.execPath`、包名解析走 profile 的 `createRequire`、
         `failOnStartupError: false`、`env.TEMP/TMP = C:/Users/27063/AppData/Local/Temp`）。
      ② `enable-pilot-in-web.py` —— 把 `dsh-pilot` 加入生产 `profiles/web/package.json` 的 `dsh.profile.bundles`。
      ③ 两个包的目录从 lab **直接复制**到 `profiles/web/node_modules/`
         （`dsh-computer-use-win` v0.2.2 / 336K；`dsh-pilot` v0.7.2 / 290K，带 `--no-sandbox` patch @ `lib/index.js:244`）。
      **为什么用复制而不是 `npm install`**：① pilot 的 dependency 是 `git+https://github.com/guo6x/dsh-pilot.git`，
      而本机 **CLI 不读 WinINET system proxy**（只有浏览器走 DevSidecar 能到 GitHub）⇒ `git ls-remote` 必失败，
      写进 dependencies 只会让未来每次 `npm install` 都失败。② 该 profile 有 npm 侧翻车史
      （npm 上的 `dsh-web-app` 是过期版 ⇒ `installation rejected`）。
      ⇒ **两个包未在 `dependencies` 声明**，未来跑 `npm install` 会删掉它们，需重跑复制步骤（已写进 memory）。
      **配置层判据（已过）**：`dsh --profile web --dump-config` **exit=0 / stderr 0 字节**，2247 行；
      新 row 合成为 `- id: mcp-dsh-computer-use-win`；pilot 由 bundle auto-discovery 自动加载
      （`# == dsh-pilot` + `- id: pilot`），**不手插 row**。
      **运行层判据 A（已过，不需重启）**：用 `storages/tools/probe-wincu-readonly.mjs` 按**生产副本路径**启动
      `profiles/web/node_modules/dsh-computer-use-win/mcp/server.mjs` ⇒ `list_windows` **真读到桌面**
      （认得 `CabinetWClass`「工具箱 - 文件资源管理器」、Chrome `browser.xhtml`、UIA patterns 齐全）
      ⇒ PowerShell UIA 后端在生产副本上真的能起。
      **运行层判据 B（待新会话）**：
      - computer-use row 在 **profile patch** 里 ⇒ 参与 `patchReload: live`，**开新会话即可验**（应见 `mcp__wincu__*`）。
      - pilot 在 **`package.json` 的 bundles** 里（不是 profile patch）⇒ **可能需要重启**（应见 17 个 `pilot_*`）。
      **回滚**：`profiles/web/` 下已有 `cordis.patch.yml.bak-20261004-193121-pre-wincu`、
      `package.json.bak-*-pre-wincu`、`package.json.bak-*-pre-pilot`、`cordis.patch.yml.bak-*-pre-pilot`。
      **已知残留风险（不阻塞）**：复制过去的 `scripts/windows-uia.ps1` 在 **line 852 / 1060**
      仍有 `[System.Reflection.Assembly]::LoadFrom($dll)`（只改了 `Load-Assemblies` 那一处）；
      但 B3 E2E 已跑通 ⇒ 那两处不在 B3 路径上，疑在 OCR 分支，待适机确认。


- [~] **★ 2026-10-04 19:2x compaction「过早触发」深挖 — 结论：阈值判据已确证；账本值不可从 disk 取得，探针待下次重启**
      复现：`python ~/.dsh/storages/tools/compaction-audit2.py --session a0d5fbf8`
      ① 阈值 = `floor(min(W×thresholdRatio, (W−reserved)−headroom))`；dsh 默认 `thresholdRatio 0.8` /
         `headroomTokens 65536` / `reserved`≈65536 ⇒ **W=1e6 时 800,000**
         （`@deepseek-ai/dsh-compaction-basic/lib/index.js:15,124–142,940–941`）。
      ② 该周期内**主 prompt 峰值仅 167,765**（=16.8% window，seq 28144）
         ⇒ 若阈值 800K 成立，压缩发生在 ~21% 就发生，**确实过早**。
      ③ **被压掉段的真实大小 = 951,425**（`compaction/summary.data.usage`：input 951,297 +
         cacheRead 128 + output 5,505；cacheRead≈0 ⇒ summarizer 每次构造**全新 prompt**，吃的是被压段原文）。
         它与 ② 相差 5.7× —— **这就是本 bug 的核心矛盾**。
      ④ `shadowedTokenCount`(695,718) 是**被压节点的 char/4 估算**，**不是触发账本**；
         它对 CJK 低估 27%（ratio 0.73）⇒ 估价函数本身正常。
      ⑤ **`measure().totalTokens`（真正触发值）从不写进 event log** ⇒ 只能靠运行期探针取得
         ⇒ **本次深挖到此为止，待探针**。
      **已纠正的两处自身误判（勿重踏）**：
      - v1 `compaction-audit.py` 的 `realBefore` 拓的是「日志里更早的某条 assistant/message」（本次 seq 28431），
        **不是触发前的 prompt**（`compaction/start` 前只有 `assistant/attempt`，无 `assistant/message`）
        ⇒ 其 `%window` 列**不可用**。已出 v2：`~/.dsh/storages/tools/compaction-audit2.py`。
      - `~/.dsh/profiles/node_modules/@deepseek-ai/dsh-token-meter` 是**指向全局 npm 包的 Junction**
        （目标在 `%APPDATA%
pm
ode_modules\@deepseek-ai\dsh
ode_modules\...`）⇒ web/headless/desktop 三端**共用一份**，
        `[patch:usage-first-baseline]` 补丁**位置正确且在生效**（此前「打错位置」的怀疑已被推翻）。
      **仍待查**：`tm-usage-first` plugin **未 apply**（其 `log('installed …')` 在 `host-stdio.log` 零命中；
      config entry 存在，`--dump-config` 见 `- id: tm-usage-first / name: file:///…/plugins/tm-usage-first.mjs`）
      ⇒ 疑 `inject:['tokenMeter']` 未满足；下次重启时一并定案。
- [x] **★ 2026-10-04 18:35 重启后「系统异常」排查（用户 m08031 报：任务栏图标全白纸 / 双击弹「打开文件-安全警告」/ Edge 登录态失效 / 「像电脑被重置」/ 「我中病毒了吗」）**
      **结论：系统无损坏；「D 盘不可写-内核故障」与「电脑被重置」两条外部判断均被证伪。**
      证据（原始输出留在 `C:\Users\27063\AppData\Local\Temp\dsh-diag\diag1-9.txt`）：
      ① 磁盘 KINGSTON OM8TAP41024K1 `HealthStatus: Healthy`，开机 NTFS 对 C:/D: 均报「卷运行状况良好」，近 7 天**无** Event 41/6008/1001；
      ② **`D:\Temp` 与 `D:\` 根现在都可写** ⇒ 「D 盘不可写 / 内核故障」在当前状态不成立；
      ③ profile SID `S-1-5-21-973867694-3511247202-1671030120-1001` → `C:\Users\27063`，`State=0`，**非临时 profile**；
         `Windows.old` / `$WINDOWS.~BT` / `$SysReset` **均不存在** ⇒ 未做过就地升级或系统重置；
      ④ 时间正确（UTC+8）、根证书 295 个、`shell32.dll`/`Explorer.EXE`/`notepad.exe`/`msedge.exe` 签名全 `Valid`；
      ⑤ **DPAPI 正常**：6 个 master key 全在（468B），`Protect/Unprotect` 往返实测通过；
      ⑥ **`System32\imageres.dll` 12KB 是 Win11 标准 stub**（真身 `SystemResources\imageres.dll.mun` = 24,280,064）
         —— **我一度误判为「文件被毁」，已自我推翻，勿据此行动**；
      ⑦ `.cmd/.vbs/.exe/.lnk` 关联链正常（`.cmd→cmdfile→"%1" %*`）；`HKCU\Software\Classes` 的 1548 键全是
         VS Code 注册的扩展名（非污染，无 `.lnk/.exe/.cmd` 覆盖）；无 SRP/AppLocker；无 pending reboot。
      **三症状定位**：
      - **白纸图标** = iconcache 于 18:39–18:46 被重建，提取结果落成默认图标。触发源：**10/2 系统由 build 26200 → 26300**
        （Setup 日志 `KB5121794 … Staged → Installed`，需重启），10/4 18:35 重启触发重建。**修：重建 iconcache**。
      - **「打开文件-安全警告」** = Startup 里的 `display-guard.cmd`（10/4 10:43 新建、无 MOTW、不在 `StartupApproved` 记录里）。
        **已处置：移出 Startup**，备份在 `Desktop\工具箱\会话断点\fix-2026-10-04\display-guard.cmd.bak`。
      - **Edge 登录态失效**（`History` 8.3MB / `Bookmarks` 47KB / `Cookies` 786KB 均完好，CT 仍为 2025/7/31）= 密文判不可解被丢弃。
        `os_crypt.encrypted_key` **能用 DPAPI 解开（32B）**；另有 `app_bound_encrypted_key`（前缀 `APPB`）
        ⇒ **ABE 一侧仍未确证**（嫌疑：为跑 CDP 用过 `--no-sandbox`；判别法 `edge://version` 看 Profile Path）。
      **「已共享」状态栏** = `System.SharingStatus` 读真实 SMB 列表，**不是病毒**。本机 7 个共享中 3 个自建：
      `Users`（`C:\Users`，**Everyone Full**）、`网络共享文件夹`（`MaxUses=2`，Everyone Read）、`NetShare`（`D:\NetShare`）。
      所有「可疑」shell extension 已溯源：`Qing*`→WPS `qingnse64.dll`、`OpenGLShExt`→NVIDIA `nv3dappshExt.dll`、
      `YunShellExt`/`WorkspaceExt*`→百度网盘 `YunShellExtV164.dll`。**未确证项**：`Get-SmbSession` /
      `Microsoft-Windows-SmbServer/Operational` 需提权，尚未回答「有没有外部连进来过」。
      **待办**：`Desktop\工具箱\会话断点\fix-2026-10-04\RunFix.cmd`（双击→自提权）执行 ① 删 3 个自建共享（先备份 `LanmanServer\Shares`）
      ✔ **2026-10-04 19:08 已执行并验证**：① `Users` 共享已删除（备份 `Desktop\工具箱\会话断点\fix-2026-10-04\LanmanServer-Shares.reg`），硬验证 `WizTree磁盘空间检测.lnk` 的 `System.SharingStatus` **1 → 0**，对照组 `网络共享文件夹` 自身仍为 1（属性系统正常）；② iconcache 已清空重建（19:07），但 `Stop-Process explorer` 被 `Access is denied` 拒绝 ⇒ **explorer 未重启，任务栏白纸是否恢复待用户确认**；③ `ie4uinit.exe -show` 已执行。
      ② 重建 iconcache；`ShellIconOverlayIdentifiers` 19 个 > 上限 15（`Qing*` 4 个被 `.WorkspaceExt*` 按字母序挤掉）待清理。
      **效率教训（用户 m08031 明确批评「你这命令太慢」）**：本次排查起了 **9 个独立 `powershell.exe`** 冷启动、
      用 PS cmdlet 干 `dir`/`reg query` 的活、每轮写文件再绕一圈 `sed` 读。
      **此后一律：单进程跑完 + `cmd` 内置命令取数 + 并行 tool call。**

- [ ] **★★ 重启交接（用户 m08031）**
      用户逐字：「可以,不过你先把这些目标存入,我要重启电脑,据另外一个会话诊断,d盘无法普通写入,内核故障」
      **用户已批准三件事**：① `--no-sandbox` 上生产（Edge 154 跑 CDP 的唯一条件）；
      ② 把**用户级** TEMP/TMP 从 `D:\Temp` 改到 `C:\Users\27063\AppData\Local\Temp`；③ computer-use 推生产。
      **★ 重启前新诊断（另一个 session 给出）**：「d 盘无法普通写入，**内核故障**」
      ⇒ 这**推翻了我先前基于 ACL 的推断**（`BUILTIN\Users` 只有 `(I)(RX)`）—— `Authenticated Users` 带 Modify 仍拒写，
      内核/文件系统层故障更符合实测。
      **重启后第一件事 = 重测 `D:\Temp` 是否可写**：
      `node -e "console.log(require('os').tmpdir())"` 与 `node -e "require('fs').mkdtempSync(require('path').join(require('os').tmpdir(),'p-'))"`
      ⇒ 可写则无需改环境变量；仍 `EPERM` 则执行 ②。
      **重启后的接管清单（按顺序）**：
      1. ~~重测 `D:/Temp`~~ ⇒ **已完成（2026-10-04 18:5x）**：`D:/Temp` 与 `D:/` 根**均可写**，「D 盘不可写 / 内核故障」在当前状态不成立 ⇒ **无需执行 ②**（改 TEMP/TMP 到 C 盘）；
      2. 两侧（web + desktop）各一次重启，使 `tm-usage-first` plugin、thinking-guard 关闭、session-title 512 生效；
         验收 `python ~/.dsh/storages/tools/compaction-audit.py --since <重启时刻> --assert-usage-first`，
         期望 ratio ≈ 1.0、触发点 ≈ 75–80% 窗口（现在是 9.26 / 15.1%）；
      3. B4：横向对比 `@wxg-prc-cpg/browser-skill-dsh-plugin`（★7385）与 `dsh-builtin-browser`（dl 12583），再出 go/no-go + 推生产方案（含回滚）；
      4. 按 ①②③ 推生产（① 是安全降级，推前再确认一次爆炸半径）。
- [x] **B（computer-use）+ C（browser-use）均已端到端跑通（2026-10-04 18:2x）**
      全部在隔离环境 `DSH_HOME=C:\Users\27063\.dsh-lab` 完成；**生产 `~/.dsh` 的 profile/patch 全程未动**。
      **B**：`profiles/cu-lab` + `dsh-computer-use-win` v0.2.2。两个独立缺陷必须同时修：
      ① 不可写 TEMP（给 MCP 行加 `env: {TEMP,TMP}`，依据 `dsh-mcp-client/lib/index.js:26` `...scrubbedParentEnv(), ...extra`）；
      ② `Add-Type -OutputAssembly` + `LoadFrom` 报 `0x80131515 Operation is not supported` ⇒ 改**纯内存** `Add-Type -TypeDefinition $script:WcuCs`。
      **端到端判据**：自建 WinForms 窗口 `B3PROBE` ⇒ `list_windows` 得 HWND `10751278` ⇒ `snapshot` 得
      `probeBox=uia:rt:42-1511390` / `probeBtn=uia:rt:42-3084006` ⇒ `set_value` `{ok:true,method:ValuePattern}` ⇒ `invoke` `{ok:true,method:Invoke}`；
      **独立判据**（pwsh 读文件，不经 wincu 自证）：`b3-out.txt` = `B3-PROBE-OK`。测试窗口已用 `close_window` 清理。
      **C**：`profiles/browser-lab` + `github:guo6x/dsh-pilot` v0.7.2（零 runtime 依赖，raw CDP，17 个 `pilot_*` 工具）。三个阻塞：
      ① `--profile web` 不收位置参数（`error: too many arguments`）⇒ 一次性 prompt 只能 headless 类；
      ② pilot 声明 `inject = ["webServer","tools"]`（`lib/index.js:9`）⇒ 手插 `@deepseek-ai/dsh-host-webserver`，
         **config 必须显式给 `host`+`port`**（schema `.required()`，否则 `ValidationError: $.host missing required value`）；
      ③ **Edge 154 `Page.enable` 报 `Target crashed` —— 唯一决定因素 = `--no-sandbox`**
         （逐 flag 矩阵：无 / 只 `--disable-gpu` / `--headless=old` / 有头 全 FAIL `{"code":-32000,"message":"Target crashed"}`，
         只加 `--no-sandbox` 则 `{}` OK）；
         修法已落盘 lab：`profiles/browser-lab/node_modules/dsh-pilot/lib/index.js`（60280 → **60468 B**，**CRLF**，
         备份 `.bak-20261004-pre-nosandbox`）在 `:241 const argv = [` 的 `"--headless=new",` 之后插入 `"--no-sandbox",`；上游未带该 flag。
      **端到端判据**（服务端日志，不经 pilot 自证）：`c-server.log` 逐字含
      `2026-10-04T10:17:07.277Z GET /api/clicked?name=HELLO-PILOT` —— `HELLO-PILOT` 是 `pilot_fill` 写进 input 的值，
      该请求是 `pilot_click` 后页面真实发的 `fetch` ⇒ **完整浏览器闭环成立**。
      **详情已存 memory**：`dsh-pilot-browser-lab-e2e-20261004`、`windows-temp-d-temp-unwritable-root-cause-20261004`。
- [x] **★ 本机总根因：`D:\Temp` 不可写（2026-10-04）**
      用户级 EMP/TMP 均指向 `D:\Temp`。一个根因长出三个看似毫不相关的故障：
      ① dsh 的 pwsh/bash 工具 `EPERM ... mkdtemp 'D:\Temp\dsh-subprocess-XXXXXX'`；
      ② computer-use 后端（`Add-Type` 的**编译过程**必然写 `$env:TEMP` 做 csc scratch）；
      ③ dsh-pilot `mkdtemp(join(tmpdir(),…))`（`lib/index.js:238`）。
      **★ 两层 TEMP 语义不同**：
      · MCP 行内 `env: TEMP` = 任意可写目录（**可在 workspace 内**，实测 `.dsh-lab\tmp` 可用）；
      · **进程级 `TEMP`（dsh 自己的工具沙箱用）= 必须在 workspace 之外**，
        否则报逐字 `Windows ACL temp root must be outside the workspace`
        （来源 `@deepseek-ai/dsh-sandbox-windows-acl/lib/types-Cl_DXjhk.js`）。
      **实测可用候选只有 `C:\Users\27063\AppData\Local\Temp`**（`C:\Windows\Temp` EPERM、`C:\dshlab-tmp` 无权建、`D:\Temp` EPERM）。
      生产 host 未受影响（它那条启动链的 TEMP 与登录 shell 不同）。
- [x] **「借鉴社区经验」已完成（用户 m06852）—— 并发现我们正在双重压缩（2026-10-04 15:5x）**
      **社区答案**（用户已装的 `billion-context` v0.1.178，README.zh-CN.md + dsh.bundle.patch.yml）：
      **关掉宿主原生 auto-compaction，改用它自己的模型驱动压缩**。
      它的 bundle patch 逐字：`- id: compaction-basic` / `config: {auto: false}`；README `:169` 逐字「否则 OpenCode 的原生自动压缩会双重压缩」。
      它注入 `<code>compress</code>` / `decompress` / `search_context` / `acp_status` 四个工具，由模型在上下文增长时自行调用（约 50K token 步长 nudge + 超窗硬兜底 #470）。
      **★ 但它自己在 README `:196` 逐字承认在 dsh 上有盲区**：「dsh 自动压缩关（**web profile 除外——preset 内实例无法经 patch 触及，#1772**）」
      ⇒ **社区已开 issue #1772**：preset group 内嵌的 `compaction-basic` 实例无法被 `- id: compaction-basic` patch 命中。
      **本机实测复现（决定性）**：`--profile web --dump-config` 里 `- id: compaction-basic` 共 **5 处** ——
      顶层 `:727` 已被 `@deepseek-ai/dsh-web-app` 设 `disabled: true`；**group 内 4 处**（`:1197`/`:1379`/`:1643`/`:2145`，各在 `- id: compaction / name: cordis:group` 下）
      无 config、无 disabled ⇒ 用默认 `auto: true` ⇒ **活着的自动压缩**。
      overlay 试验 `- id: compaction-basic / config: {auto: false}` 只改到了顶层；**group 内 4 处纹丝不动** ✓ 与 #1772 一致。
      **★★ 因此本机正在双重压缩**：本 session（desktop App pid 2792）27310 个 event 里
      原生 `compaction/summary` **14** 次（十几%就触发，落已修的虚高账本问题）+ billion-context 的 `compress` 工具调用 **104** 次。
      佐证：`host-stdio.log` 有 `[err] bili: attaching to running proxy at http://127.0.0.1:18787 (pid 18396)` ⇒ 代理已 attach、它在真实代理流量。
      ⇒ **「上下文消失」= 两套压缩叠加**。
      **待决策**（未执行）：是否按社区原味彻底关掉原生 auto-compaction（需直接改 `profiles/{web,desktop}/cordis.patch.yml` 里 group 内那 4 处）。
      风险：关掉后若 billion-context 代理失效（它自称「早期」、需独立进程）就**没有兜底压缩**。
      当前折中：先让 usage-first 生效（原生只在真满 ~80% 才触发）⇒ 冲突大幅降低。

- [ ] **⚠️ 待两侧各一次重启：usage-first 修复已装两侧（web 文件 patch + 两侧 plugin row）（2026-10-04 15:4x）**
      **为什么需要两套手段**：web/headless 的 `dsh-token-meter` 从 `~/.dsh/profiles/node_modules/` 解析
      （当年已打文件 patch：`lib/index.js:658` 去掉 `usageTokens(usage) >= estimatedAnchorTokens` 门控）；
      而 **desktop App 从 `resources/app.asar/dsh/node_modules/` 解析**（原版、且 asar 被运行中的 App 锁住写不进去）
      ⇒ 单靠文件 patch 只能修一侧。
      **方案**：新增 profile-level plugin `~/.dsh/plugins/tm-usage-first.mjs`（3990 B）包装活的 `ctx.tokenMeter.measure`：
      只要 upstream 返回 `baseline.kind === 'estimated'`，就改用 `meter._sync(session).anchor.usage` 算真实 token；
      已是 `usage` 时直接 fast path（对已打 patch 的 web 副本是 no-op）。`_sync` 缺失/抛错则降级为 upstream 行为，不传播。
      挂载：`patch-tm-usage-first.py` 已 `--apply` 到两侧 `profiles/{web,desktop}/cordis.patch.yml` 末尾（`- insert:` 新增 entry；
      web 66878→67986 B、desktop 66917→68025 B；备份 `.bak-20261004-pre-tm-usage-first`），`--verify` PASS。
      **已自测**：`storages/tools/test-tm-usage-first.mjs` **18 passed / 0 failed / EXIT=0**；
      真实 headless 进程探针 `plugins/tm-verify.mjs` 证明 `ctx.tokenMeter` 存在、ctor 正确、包装成功；
      `--profile web --dump-config`（exit=0 / 79614 B）第 2227-2228 行可见 `- id: tm-usage-first` / `name: file:///C:/Users/27063/.dsh/plugins/tm-usage-first.mjs`。
      **重启后验收**：`python ~/.dsh/storages/tools/compaction-audit.py --since <重启时刻> --assert-usage-first`
      （期望 ratio≈ 1.0、触发点落在窗口 55%+）。
      **已知残留（可接受）**：`usageTokens()` 含 `outputTokens`（`lib/index.js:593`），而阈值已扣预留输出 ⇒ output 计两次（<1%）；
      usage 为 undefined 时仍回退 `{kind:"estimated"}`。
- [x] **compaction 判据口径已修：auto-compaction 不再按「虚高账本」触发（objective ①③，2026-10-04 13:13）**
      **根因**：`dsh-compaction-basic/lib/index.js:940-941` 的触发判据读 `tokenMeter.measure(session).totalTokens`，
      而 `dsh-token-meter/lib/index.js:654` 的 usage 分支被门控：
      `baseline = usage !== void 0 && usageTokens(usage) >= estimatedAnchorTokens ? {kind:"usage"} : {kind:"estimated"}`。
      这个 `>=` 把 char-based 估算（`CHARS_PER_TOKEN = 4`）当成**下界** ⇒ 只有当真实 usage ≥ 估算时才信真实值。
      per-step 快照注入（`plan-anchor` / `git-context` / `thinking-anchor`，经 `dsh-agent-loop/lib/index.js:1061`
      每 step 无条件 append）把估算撑到真实值的 ~10 倍 ⇒ **真实 usage 永远够不到门槛 ⇒ 判据永远是纯 heuristic 账本**。
      **取证（session a0d5fbf8，13 次压缩，可用 `compaction-audit.py` 复现）**：账本(shadowedTokenCount) ÷ 该次
      summarization 调用的真实 prompt —— 第 1–10 次 **0.60–0.76**（CJK 被 chars/4 低估，健康）；
      第 11–13 次（seq 19010 / 20717 / 23225）**9.50 / 9.75 / 10.56**，且触发时真实 prompt 只有
      **112,311 / 156,898 / 100,051** ⇒ **最后两次分别在窗口的 11.2% / 15.7% / 10.0% 就压缩**，与用户 m00001
      「显示才十几%却已自动压缩」精确吻合。旁证：goat-gateway 日志 10-04 真实 prompt 上限 144,407，
      而 9-30 前后峰值 677,362（那时压缩在真实 60% 触发，行为正确）⇒ 转折点＝per-step 注入上线。
      **修法**：`~/.dsh/profiles/node_modules/@deepseek-ai/dsh-token-meter/lib/index.js:654` 去掉那个 `>=` 门控，
      改成 `baseline = usage !== void 0 ? {kind:"usage", tokens: usageTokens(usage), usage} : {kind:"estimated", ...}`
      ⇒ `totalTokens = 真实 usage + surfaceDeltaTokens`，与 UI 早就用的 `contextPressure.projectedTokens` 同源。
      脚本 `~/.dsh/storages/tools/patch-token-meter-usage-first.py`（幂等 / --check / --apply / --verify / --restore）。
      验证：`--verify` 6/6 PASS、`node --check` SYNTAX OK、`import('dsh-token-meter')` OK（exports: TokenMeter, default）、
      `estimated` 兜底分支保留（usage 缺失时退回旧行为，老 session / 非 routing provider 不受影响）。
      备份 `lib/index.js.bak-20261004-131333-pre-usage-first`。
      验收工具 `~/.dsh/storages/tools/compaction-audit.py`（`--session <id8>`；输出每次压缩的账本/真实/触发时真实占用/百分比）。
      **阈值数值刻意保持 0.8**：社区无更优共识（官方默认 0.8；Claude Code 默认 95% 但社区实践反而建议 65% 主动压；
      官方明确提高 ratio 只减少压缩次数、单次 KV 前缀失效段更长），口径修正后 0.8 = 真实 800K/1M，留 20% headroom ✓。
      **「上下文已用」结论（objective ③）**：**不是渲染 bug** —— UI 走 `contextPressure.projectedTokens`
      （provider 真实 usage 锚 + heuristic 增量），本 session 显示 8.4%，而真实 prompt 峰值 132,682 ⇒ 数字**离真相更近**；
      失真的是压缩判据。UI 侧唯一的真 bug 是 `AUTO_COMPACT_RATIO = .8` **硬编码**
      （dsh-context/lib/client.js，作者注释自承「DSH does not publish the configured ratio to plugins/clients」）
      ⇒ 「自动压缩预留」色带永远画在 80%，与实际 ratio 无关（改 ratio 时需同步改它）。
      ⚠️ **需重启 web 进程才生效**（node_modules 不参与 HMR，同 always-continuable patch）；target 在共享层
      `profiles/node_modules/`，`pnpm install` 会覆盖，需重跑脚本。
      ⚠️ **未定案点（不影响上面结论）**：账本里 272 份 per-step 快照的字符量（~2.3M chars/window）与实际请求体量
      （~500 KB）差 ~9×，按 `deriveMessages()` / `buildRequest` 读到的代码没有任何 messages 裁剪环节
      ⇒ 收窄点未定位。口径修正绕过了它，但该疑点仍挂着。
- [x] **mnemon idleReview 验收：配置侧生效，但 review 从未真正运行（objective ⑦，2026-10-04 12:05）**
      **配置侧 ✓**：`profiles/web/cordis.patch.yml:1211` 的 `idleReview: {maxTokens: 32768}` 已 merge 进 runtime
      （`--profile web --dump-config` 第 1807-1808 行可见）。备份 `.bak-20261003-132841-pre-mnemon-idlereview`。
      **运行侧 ✗（本轮新发现）**：`storages/session_projcache/sessions/*.json` 的 `mnemonSubagentTokenUsage`
      在 **1639/1639** 个 session 里 `totals` 全 0、`last: null` ⇒ **idle review 从未成功执行过**。
      根因不是配置 —— `idleReviewAllowed()` 的每个条件实测都满足（`lifecycleEnabled` / `writeEnabled` /
      `writebackMode: guided` / `idleReview.enabled` 默认 true / `memoryTopology.strategyId` 默认 `default-three-tier`；
      `idleReviewBlockReason` 只在装了 agentTeams + `spawn_teammate` 工具时才 block，本机没装）
      ⇒ 剩余推断（**未实测，待验证**）：触发窗口太窄 —— 要 `agent.status === "idle"` 持续 ≥ `idleReviewMs: 30000`、
      距上次 review ≥ `minIntervalMs: 300000`（5 分钟、`dsh-mnemon/lib/index.js:54-66` 的 `DEFAULT_IDLE_REVIEW`）、
      且 `reviewActivity().eligible`（按 turn 数 / 用户文本长度 / 工具调用数评分）。会话常被重启或新消息打断 ⇒ timer 被清。
      **验收判据（可复现）**：`mnemonSubagentTokenUsage.totals.outputTokens > 0` ⇒ review 真跑过。
      ⚠️ **`~/.mnemon/data/default/mnemon.db` 的 `oplog` 不能用来判 review**：它只记 `import` / `search` / `recall` / `gc`，
      361 条 insights 全是 `source: user`（memory 文件同步产物），没有 review 写入。
- [x] **thinking-guard 配置层级已修正 + 参数调到合理值（objective ②，2026-10-04 11:56）**
      `@ethanwong-hk/dsh-thinking-guard` 的最终配置**不是** `node_modules/<pkg>/cordis.patch.yml`
      （那是 bundle 自带 patch），而是 **profile 自己的同名 row 覆盖它** —— `--dump-config` 会给出
      `# == @ethanwong-hk/dsh-thinking-guard, patched by .../profiles/web/cordis.patch.yml` 这样的确证注释。
      ⇒ 2026-10-03 22:57 我在两侧 bundle patch 里写的 `enabled: false` **对 web 完全无效**：
      `profiles/web/cordis.patch.yml:1271` 早就有一份 `- id: thinking-guard` / `enabled: true` 的 row，
      它排在 bundle patch 之后 ⇒ **web 侧一直启用着**；desktop 侧没有那份 row ⇒ **一直禁用着**。
      两侧行为长期不同，这是最难查的一类不一致。
      **真 trip 证据（推翻 `结果.md` 的「一次都没出手」）**：判据 = session 里含 `思考空转被熔断中止`
      或 `source.plugin='thinking-guard'` 的 `user/message`，实测 4 个 session 命中：
      10-01 14:24 `58c0c7e6`、10-01 19:51 `session-93c8a0ac`、10-02 14:37 `session-a6288d3e`、
      **10-04 00:14 `1dc350c2`（`思考空转被熔断中止` ×6）**。
      **参数**（判据源码 `lib/index.js:381`：`noProgress && reasoningChars > 0 && heldMs >= thinkingOnlyMs`；
      `reasoning-delta` **不**更新 `lastProgressAt`，只有 text / tool-call 更新 ⇒ 该阈值量的是「多久没产出可见内容」）：
      `thinkingOnlyMs` 45000 → **300000**（本机主力 model maxTokens 262144，深度思考 45s 无产出很正常；
      旧值 trip 后 `autoContinue` 注入「继续」开新 attempt ⇒ 重新计时 ⇒ 再熔断，正是用户看到的「莫名中止」）、
      `maxThinkingChars` 80000 → **200000**、`verbose` false → **true**（否则 `lib/index.js:299` 的 `log()`
      是空操作，「已启用：thinkingOnlyMs=…」永不落盘，没有任何可验证痕迹）。
      落点：web **改现有 row**、desktop **新增同款 row**（此前只有 web 有）。备份
      `.bak-20261004-115555-pre-guard-tune` / `.bak-20261004-115615-pre-guard-row`。
      验证：web `--dump-config` 显示新值 + 上面那条 patched-by 注释（exit 0 / stderr 0 B）；
      desktop 无法 `--dump-config`（`lib/bin.js:36` 硬拦 `profile "desktop" is managed exclusively by the Electron application`）
      ⇒ 把该 row 抽成临时 overlay 喂给 `--profile web --patch` 证明语法与 merge 语义 OK，另用带 `!!js`
      豁免的自定义 loader 做 YAML 解析（web 16 顶层 / desktop 21 顶层，各恰好 1 个 guard row，config 完全一致）。
      **生效条件 = 两侧各重启一次**；验证痕迹 = `$DSH_HOME/logs/host-stdio.log` 里出现
      `[thinking-guard] 已启用：thinkingOnlyMs=300000 …`（host-log-tee 的 `[out]` 通道）。
- [x] **熔断机制（step 级工具失败）已在真机上闭环（m04699/m05555，2026-10-04 11:45）**
      `stall-guard.mjs` 的 toolBreaker：同一 session 同一 tool 连续失败达阈值 → 在下一步注入可见的
      `<stall-guard>` 提示，要求换策略或停下来汇报（只在触发时注入，常态零开销）。
      **真根因（前两次误判）**：`result.isError === true` **在 dsh 里永远抓不到「命令失败」** ——
      `dsh-tool-pwsh/lib/index.js:128-135` 注释逐字「Non-zero exits are reported, not errored — the model
      decides how to react; only infrastructure failures (spawn errors, aborts) surface as isError results.」，
      `dsh-tool-bash/lib/index.js:167` / `dsh-tool-pwsh/lib/index.js:172` 逐字
      `else if (result.exitCode !== 0) markers.push(\`[exit code: ${result.exitCode}]\`);`
      ⇒ 必须读**模型可见文本**里的 marker。修法 = `FAILURE_MARKERS` 正则表（exit code / sandbox denied /
      timed out / killed by signal / stopped / ^Error:）+ `resultText()` + `failedOf()`。
      另两处加固：① `exec.agent` 是**可选**字段且 exec 上没有顶层 `session`
      （`dsh-tools/lib/types/index.d.ts:228-229`）⇒ `breakerKeyOf(exec)` 退化时用 agent 对象作 Map key，
      `breakerLabelOf(key)` 让日志不打印 `[object Object]`；② pre-step 与 post-execute 必须用**同一个 key**
      （原 pre-step 用 `sessionIdOf(agent)`、post-execute 用 `breakerKeyOf(exec)`，退化路径下永不 fired）
      ⇒ 统一为 `breakerKeyOf({ agent })`。
      **验证**：`~/.dsh/storages/tools/test-stall-guard-breaker.mjs` → **31 passed / 0 failed**；
      端到端用 `--patch` overlay 把 stall-guard 挂到 headless 跑真任务（3 次 `echo breaker-probe; exit 1`）⇒
      `BREAKER seen#1..3 failed=true` → `armed` → `fired`，并在 session 里留下 durable `user/message`
      （`source.kind = stall-guard`）。判据见 `~/.dsh/logs/stall-guard.log`。
      ⚠️ `.agent-presets/**/*.mjs` 不参与 live reload ⇒ **生产 web 3080 / desktop 须重启才生效**。
      ⚠️ 教训：此前报的「35 项单测 + web 已生效」只证明了纯逻辑与模块加载，**没证明接线**。
- [x] **`usage-overview.py` 双机四 agent 用量总视图（objective ⑦，2026-10-04 11:15）**
      纯 stdlib 脚本 `~/.dsh/storages/tools/usage-overview.py`：每台机器各跑一次 `--json out.json`，
      再用 `--merge a.json b.json` 拼 `{Windows,Linux} × {dsh,reasonix}` 四格总视图。
      数据源：dsh = `storages/session_projcache/sessions/*.json` 的 `tokenUsage.val.totals`（**无 cost 字段**，价按
      `dsh-context-price-overlay.json` 算）；reasonix = `%APPDATA%\reasonix\stats\*.jsonl`（**每行自带 CNY，直接用**）。
      **cost 在采集时就写进 JSON** ⇒ `--merge` 只做加法，不依赖另一台机器的价格表。
      Windows 侧实测：dsh 1639 session / 2,667,151,619 tok / ¥351.4458；reasonix 6119 行 / 1,264,963,934 tok / ¥195.9563
      （**与 reasonix 自报 195.9563 精确吻合 ⇒ 解析口径正确**）；合计 **3,932,115,553 tok / ¥547.4021**
      （cacheRead 3,651,579,811 / uncached 222,020,799 / output 58,514,943）。
      备份 `usage-overview.py.bak-pre-merge-cost`。
      ⚠️ **Linux 机器 Tailscale 已离线 1 天**（`tailscale status` 显示 `offline, last seen 1d ago, tx 8892 rx 0`；
      ping 100.79.96.82 / 192.168.1.13 全丢包；`ssh tianque` connection timed out）⇒ Linux 侧待机器上线后补跑再 merge。
- [x] **`session-title-llm` 的 `maxOutputTokens: 64` 已提到 512（objective ③ 真根因，2026-10-04 11:18）**
      上游 `@deepseek-ai/dsh-base` 给 title provider 的默认值就是 64 —— 而 title 请求**继承主 session 的 route**
      （实测 1070 个 session 里 888 条 `session/title-llm-request` 全是 `maxTokens: 64`，其中 875 条 route =
      `commandcode-goat / deepseek/deepseek-v4.1-flash`，该 model 默认 thinking enabled）⇒ reasoning 吃光 64 token
      ⇒ 上游回 `finish_reason="length"` ⇒ 标题拿不到可见文本（dsh 抛 `session-title-llm: title output reached maxOutputTokens`）。
      **这就是 gateway 侧 `finish=length` 只有 4 条、且 `completion_tokens == reasoning_tokens == 64` 的来源**，
      也解释了用户看到过的「已达到输出 token 上限」通知（m02319）。
      修法：`profiles/{web,desktop}/cordis.patch.yml` 末尾各加一条 `- id: session-title-llm` 覆盖 config（5 项全写全，
      只把 `maxOutputTokens` 改成 512）。验证：web `--dump-config` 显示 `maxOutputTokens: 512`（exit=0 / stderr 0 B；
      **profile patch 的 config 是 merge 语义 ✓ 已验证**）；两侧 YAML 用带 `!!js` 豁免的自定义 loader 解析 OK。
      备份 `profiles/{web,desktop}/cordis.patch.yml.bak-20261004-pre-title-maxtokens`。
      ⚠️ **需重启 web 进程与 desktop App 才生效**；重启后核对新 session 的 title 请求 `maxTokens` 应为 512。


- [x] **desktop 的 `commandcode-goat.models` 死 model 已清（objective ⑩，2026-10-04 11:05）**
      改前 desktop 82 个、其中 **21 个不在 `D:\Toolbox\goat-gateway\model-allowlist.json`**（点了必然 403）。
      删这 21 个 + 补 `stealth/pixel-canary`（web 有 desktop 缺）+ 从 commandcode-goat 块移走 `claude-sonnet-5-5`
      （它按 allowlist 的 `_note_claude` 只走 `/v1/messages`，已由 `commandcode-goat-anthropic` 块覆盖）
      ⇒ **desktop 61 个，与 web 完全一致**（集合相等、`not-in-allowlist` 为空、YAML 解析通过、malformed 0）。
      备份 `profiles/desktop/cordis.patch.yml.bak-20261004-110454-pre-desktop-dead-models` 与 `.bak-20261004-110512-pre-drop-claude-in-ccg`。
      **`reasoningEfforts` 刻意不动**：两侧 60 个共有 model 的文本 0 个相同（web 走 `rewrite-model-list.py` 的实测 verdict，
      desktop 更像手工旧版），而「`zai-org/GLM-5.3` / `MiniMaxAI/MiniMax-M3` 实测 5 档都能出 thinking」与 web 标 `false` 矛盾
      ⇒ 哪侧正确未定论，改了会改 UI 行为且无法自证。
      ⚠️ **`--profile desktop --dump-config` 被硬拦**：`lib/bin.js:36` → `error: profile "desktop" is managed exclusively by the
      Electron application`（exit=1）⇒ desktop 侧只能靠 YAML 解析 + 重启后观察。对照 `--profile web --dump-config` = exit 0 / 79409 B / stderr 0 B。
- [x] **`finish=length` 的真实证据链已抓到（objective ③，2026-10-04）**
      gateway 全量日志里 `finish=length` **只有 4 条**，且**全部是 `completion_tokens == reasoning_tokens == 64`、
      prompt 141–192 的单发小请求**（09-30 一条 + 10-04 三条）；近期 finish 分布 = 535 `tool_calls` / 16 `stop` / 4 `length`（**仅 0.7%**）。
      ⇒ **推翻了「长 prompt 被上游截断」的旧假设**；用户看到的「已达到输出 token 上限」只可能来自这些 64-token 内部小请求。
      这 4 条的 `sess=` 指纹在 1634 个 `session_projcache` 里全找不到 ⇒ 不是 dsh 登记的 session ⇒ **裸 LLM 调用**；
      最可能来源 = `@deepseek-ai/dsh-session-title`（它走可注册的 title provider，配的是 `maxTitleBytes` 而非 maxTokens，
      **注册该 provider 的包尚未定位** —— 若它传了 `thinking:{type:'enabled'}`，64 token 全被 reasoning 吃光、标题永远拿不到可见文本）。
      已存 memory `finish-length-is-internal-64token-20261004`。


- [x] **`dsh-tool-subagent` always-continuable patch 已上线（2026-10-04 10:37）**
      `resolveDelegationRun` 把「这次要不要等结果」和「这个 child 活不活」绑在同一个 `run_in_background` flag 上：
      preset 已设 `backgroundMode: continuable`，但模型传 `false` 就路由到前台 `settleForegroundRun`，
      后者无条件 `run.dispose()` ⇒ child 记成 `mode:"one-shot"` ⇒ web UI 的 `selectReadOnlySubagent`
      把 composer 换成只读（`readonly.oneShot.body`）。实测 `storages/session_projcache/sessions/` 1634 个 session：
      `one-shot` 150 / `continuable` 3 ⇒ agent 调出的子代理 98% 用完即弃。
      改法：`if (options.continuable) return { runInBackground: true };` + 重写 `run_in_background` 的 description
      （原话 "Set false only when your next action depends on the result." 在暗示模型关掉后台）。
      脚本 `~/.dsh/storages/tools/patch-tool-subagent-always-continuable.py`（幂等 / --check / --verify / --restore）、
      说明 `~/.dsh/patches/README-tool-subagent-always-continuable.md`。
      验证：`--verify` PASS、`node --check` SYNTAX OK、5 分支逻辑单测符合预期、`--dump-config` exit=0 / stderr 0 B、
      `import('@deepseek-ai/dsh-tool-subagent')` OK（exports: Config,apply,inject,name）。
      ⚠️ target 在 `profiles/node_modules/`（共享层，desktop 无独立副本）⇒ `pnpm install` 会覆盖，需重跑。
- [ ] **always-continuable patch 需一次 web 进程重启才生效**（3080 那条进程 10:37 之前起的）
- [x] **stall-guard 已上线：turn「永久冻住」在结构上不再可能**（用户 m03713/m04711「不要假设，彻底给他解决」）。
      dsh-llm 与 dsh-agent-loop 里**没有任何 stream 级 timeout**（`dsh-llm/lib/index.js:7` 只 import
      `MAX_TIMER_DELAY_MS`），`for await (const chunk of stream)` 无时限，再叠加 checkpoint-policy 的
      fail-closed flush barrier ⇒ 冻住是结构性的（本机实测 11 次）。新 preset 模块
      `~/.dsh/.agent-presets/anchored-standard/stall-guard.mjs`：`agent/pre-step` 记计时起点 +
      `agent/assistant-stream` 每帧刷 lastActivity + 每 15s 扫一次，idle > 240s 即
      `agent.cancel({kind:'stall-guard', reason:'no-stream-activity'})`，让 turn 以 aborted 干净收尾；
      **故意不 autoContinue**（thinking-guard 的「注入继续 → 新 attempt → 又空转」正是死循环来源）。
      另含 toolBreaker：同 session 同工具连续失败 3 次 → 下一步注入 `<stall-guard>` 提示要求换策略或停下汇报
      （= 用户 m04699「像这样的命令能不能熔断」）。**web 3080 已生效**（10-04 10:37:42 pid=26976）；
      desktop 待 App 重启（`.agent-presets/**` 不参与 live reload）。验证：单测
      `~/.dsh/tmp-probe/test-stall-guard.mjs` 35/35、一键脚本
      `powershell -File ~/.dsh/storages/tools/verify-stall-guard.ps1`、日志 `~/.dsh/logs/stall-guard.log`。

- [x] plan-anchor.mjs：已上线并验证（新进程注入顺序 `git-context → plan-anchor → thinking-anchor` ✓）
- [x] 重启后四条核对 —— **全部通过**（证据见下节）
- [x] `@ethanwong-hk/dsh-thinking-guard` 被我 10-01 20:40 那次 bundles 精简误删（留下悬空 patch row ⇒ 每次 web boot 报
      `patch: entry "thinking-guard" not found`）—— **已修**，`--dump-config` exit=0 且 stderr 干净
- [x] **thinking-guard `failed to import` 真根因已修（裸名 → scope 名）** —— 包自带 `cordis.patch.yml` 写的是
      `name: 'dsh-thinking-guard'`，而真包名是 `@ethanwong-hk/dsh-thinking-guard`；dsh 按模块名去 resolve
      ⇒ `ERR_MODULE_NOT_FOUND` ⇒ entry 的 `fiber` 建不起来。报错点在 `dsh-app-boot/lib/index.js:3910`
      （条件 `entry.fiber === undefined`，原始错误被该分支吞掉，所以日志只给一句 failed to import）。
      **不能改 profile 的 row** —— profile patch 按 (id, name) 匹配，dsh 报 `patch: name mismatch … skipping`；
      必须改源头 `profiles/web/node_modules/@ethanwong-hk/dsh-thinking-guard/cordis.patch.yml`（928 → 942 B）。
      双验证：`--dump-config` exit=0 / stderr 0 B；隔离实例 `--port 3099` boot 日志仅 1 行、err 0 B、无 failed to import。
      脚本 `~/.dsh/storages/tools/patch-thinking-guard-name.py`（幂等 / --check / --verify / --restore）；
      说明 `~/.dsh/patches/README-thinking-guard-name.md`。⚠️ target 在 node_modules 里 ⇒ `pnpm install` 会覆盖，需重跑。
- [ ] thinking-guard 真正生效仍需一次 web 进程重启（3080 那条进程 14:39:11 起，仍是旧的失败状态）
- [ ] desktop 侧要重跑一次确认（CLI 不能 dump desktop：`error: profile "desktop" is managed exclusively by the Electron application`）
- [x] desktop 侧 bundles 已接入 `@ethanwong-hk/dsh-thinking-guard`（15→16，脚本 `~/.dsh/storages/tools/patch-thinking-guard-desktop.py`，
      备份 `profiles/desktop/package.json.bak-20261003-185135-pre-thinking-guard`）—— apply + verify PASS，App 19:00:39 已重启
- [ ] **thinking-guard 在 desktop 上是否真正生效待验证**：全机 1058 session 的 `turn/end aborted` cause 只有 `{"kind":"user"}`×23 / `{"kind":"parent"}`×8，
      `user/message` 的 `source.kind` 里没有 thinking-guard ⇒ 它一次都没熔断过。要么配置没生效、要么 `thinkingOnlyMs: 45000` 从未被触及。
- [x] **10-03 18:51:58「熔断 + 上下文消失」已定案** —— 不是熔断：我 18:51:35 改 `profiles/desktop/package.json` 的 `dsh.profile.bundles`
      触发了 `dsh-app-boot/lib/index.js:1365-1372` `ResolutionRouter.replace()` 的 `requires a process restart` 保护，进程随即停止、turn 未闭合；
      19:00:39 重启 App 后由 `dsh-agent-loop/lib/index.js:1950` resume 补写 synthetic `turn/end interrupted`（与 `step/end` 同毫秒 ⇒ 判据，
      `dsh-session` 的 `openTurnClosers()` 文档「timestamps reuse the last real event」）；那一轮 assistant 内容因进程死而从未落盘
      （`dsh-agent-loop/lib/index.js:1085-1097` 未执行）⇒ 「上下文消失」。教训：**改 profile manifest 是重启级操作**。
      memory fact `dsh-profile-manifest-change-requires-restart-20261003`。
- [ ] `dsh-plugin-message-edit` 1.2.0 在 DSH 0.2 上的 boot 崩溃已本地修（=上游 PR #7：导航改走 `uiWorkspace.openSession`）：
      包已改 + `~/.dsh/vendor/dsh-plugin-message-edit-1.2.0-pr7.tgz` + `profiles/desktop/package.json` 以 `file:` 声明并加回 bundles
      —— **待 desktop 冷启动验证**（红框是否消失 + 悬停旧消息能编辑）；回滚步骤见 `~/.dsh/patches/README-message-edit-pr7.md`
- [ ] dsh-context「费用」只显示 ¥38.56 / 已计价 151 个会话 —— 根因是 models.dev 认不出自建 gateway 的
      `commandcode-goat | deepseek/deepseek-v4.1-flash`（占全机 token 96%）。**已修**：本地价目覆盖表 +
      `patch-dsh-context-pricing.mjs`（三处纯插入、幂等、可 --restore），测试 28/28 过，全机复算
      **¥38.84 → ¥341.49、已计价 153 → 1590 / 1631**（1631 = 10-04 00:1x 的 projcache 总数，比 10-03 的 1599 多 32 个新 session）。
      **10-04 00:16 起价目已换成 reasonix 反解的精确值**（`hit 0.0030285 / miss 0.151425 / write 0.151425 / out 0.6057`，
      由 `config.toml` 的 `cache_hit 0.02019 / input 1.0095 / output 4.038` CNY 乘 0.15 得；旧值 0.003/0.15/0.6 是
      models.dev 刊登价，系统性偏低 0.95%）。apply 后 `client.js` 620423 B、verify PASS。**待重启 App 生效**；说明见
      `~/.dsh/patches/README-dsh-context-pricing.md`

- [x] goat-gateway 的 usage 覆盖率原本只有 ~15%（重启前实测 471 OK / 76 带 usage = 16.1%）：根因是 `gateway.mjs`
      SSE 分支里 `if (tail.length < 65536) tail += chunkStr;` 是**前 64KiB 封顶**，长流一超过 64KiB 就
      停止累积，而 usage 只出现在流末尾 ⇒ 永远读不到。**已修**（滑动窗口 `if (tail.length > 65536)
      tail = tail.slice(-65536);`），回归用例 `~/.dsh/storages/tools/selftest-tail-window.mjs` 双跑对照
      通过（新代码 PASS、patch 前备份 ASSERT FAIL）；**已生效**：16:03:03 用一次性任务 `Goat-Gateway-Restart-Once` 挑空闲窗口重启（新 PID
      24680，重启脚本 `restart-gateway.ps1`），重启后 **13/13 条 OK 行带 usage = 100%**
- [x] **思考链长期锁英文**（用户 m00003 / m02206 / m02462 / m02498 反复追问）：配置侧全部健康（`thinking-language.json` = `{"thinking":"zh"}`、
      persona 的「语言契约（最高优先级）」6 条在 system 里、thinking-anchor 每步注入且位于最尾，本会话共 492 次），
      但本会话 2653 个 reasoning block 的最后 200 块 CJK 中位 0.00–0.02（中文块 0/200），而**新建会话**是 0.42–0.57 中文。
      根因（离线消融 `~/.dsh/tmp-probe/replay-fix{1..9}.py`）：pi-ai 适配层把上一步自己的 thinking 以 `reasoning_content`
      回灌（`@earendil-works/pi-ai/dist/api/openai-completions.js:996-1005`）；同一份真实请求体重复 6 次 ——
      原样 **0/6 中文**、删掉回灌 **4/6**、回灌换中文 **3/6**（Fisher p≈0.033）⇒ 回灌是「语言自锁」的**唯一载体**，
      同时解释了「锁死几天」「compaction/重启后翻转」「短上下文抛硬币」三种现象。
      **被排除的假设**：「调工具 ⇒ 英文」（本会话带 tool-call 的 2565 步 cjk 中位 0.47）、「tools 数量是剂量」
      （0/2/6/10/13/18/26 → 4/3/0/1/1/2/4 次中文，无单调性）、「注入语料质/量」（全中文化后仍 0.000–0.017）、
      「锚点加长/换位置/给 system 角色」（0.000–0.009）。
      **已修**（棘轮：非中文 reasoning 不回灌、中文原样保留 ⇒ 一旦落到中文就自我强化）：落在 gateway 一处 JSON 字段裁剪，
      `D:\Toolbox\goat-gateway\gateway.mjs` 81713 → 85057 B（备份 `gateway.mjs.bak-20261003-reasoning-filter-pre-reasoning-filter`）；
      脚本 `~/.dsh/storages/tools/patch-gateway-reasoning-filter.py`（--check/--apply/--verify/--restore/--write-config）、
      集成用例 `~/.dsh/storages/tools/selftest-reasoning-filter.mjs`（A 关开关字节原样转发 / B 英文被删·中文保留·content-length 重算 /
      C reasonix 的 `Go-http-client/1.1` 不受影响 / D mode=empty 保字段置空 / E minCjk 读自配置）**全 PASS**；
      生产已生效：`ECHO-FILTER id=1 dropped=27 kept=0` → `id=3 dropped=28 kept=1`（出现首条中文 reasoning 并被保留）。
      开关 = `D:\Toolbox\goat-gateway\logs\.reasoning-filter.json`（每请求现读，删掉即关闭，不用重启）。
      说明见 `~/.dsh/patches/README-reasoning-echo-filter.md`。**Linux 侧 `~/goat-gateway/gateway.mjs` 尚未打此补丁。**

- [ ] **mnemon 的 idle checkpoint review subagent 会被 4096 输出上限截断**（用户 m02056 问「为什么其他对话会
      出现『已达到输出 token 上限…发送继续』」）：那些「其他对话」= `origin=subagent` / label `Mnemon idle checkpoint
      review` 的后台 review 会话，`request/header.config.maxTokens = 4096`（显式下发，`adapterDefaults=null`），
      来源 `dsh-mnemon/lib/index.js:63` 的 `DEFAULT_IDLE_REVIEW.maxTokens`，config 路径 `idleReview.maxTokens`
      （schema `lib/index.js:225`，128–131072）。reasoningEffort=high 时思维 token 也计入，4096 常被思维吃光 ⇒
      `turn/end reason={"kind":"max-tokens"}` ⇒ 核心 UI `dsh-client-ui-chat` 的 `TurnMaxTokensItem` 渲染
      `message.maxTokens` 通知。**已修**：两 profile patch 里 mnemon 加 `idleReview: {maxTokens: 32768}`
      （web 61282→61819 B、desktop 64122→64659 B，备份 `cordis.patch.yml.bak-20261003-132841-pre-mnemon-idlereview`）；
      `dsh --profile web --dump-config` exit=0/stderr 空、desktop 经 `dump-desktop-config.ps1` 探针 profile 同样解析出 32768。
      **待验收**：review 的 idle timer 只在 turn 结束后武装（`lib/index.js:5532` + `idleReviewMs: 30000`），
      本轮无法在 turn 内触发 ⇒ 随同下一次 desktop/web 重启后，核对新 review 会话的 `request/header.config.maxTokens`。
      未动：`runtimeMemory.maintenanceMaxTokens`（默认 8192，migration/compaction 用，`lib/index.js:4567`）。
- [x] `已达到输出 token 上限` 通知**已按用户要求隐藏**（10-03 13:47）：「已完成，用时 X」是正常 turn 完成标记
      （i18n `message.turnProcess.took`，`client.js:5423`，不动）；要藏的是第二行，它是核心 UI 的 notice，唯一触发条件
      `turn/end reason.kind === "max-tokens"`（`dsh-client-ui-chat/lib/client.js:9920/:9932`，定义 `kind: "turn-max-tokens"`）。
      实测是假警报：用户的 `session-b65a9a67` turn 15 预算 262144、最后一步 completion 只有 2899 tokens 却被标 length
      （同 turn 并存 `upstream stream ended before a completion event` 的 TRANSPORT + 自动 retry）⇒ 上游提前收流。
      修法 = 只把**两处 UI 判定**里的 `"max-tokens"` 等长换成 `"max-tokenz"`（12 B→12 B，纯 ASCII），harness 内部语义
      （`finish.kind === "max-tokens"`、session 事件里的 reason）**一律不动**：npm-js 偏移 464175/464564、desktop asar
      偏移 19677465/19677854；脚本 `~/.dsh/storages/tools/patch-maxtokens-notice.py --check/--apply/--verify/--restore`。
      verify **PASS**：node --check OK、与备份逐字节 diff 恰 2 处（s→z）、asar header JSON 可解析、内部 finish.kind 语义
      count 仍 1；round-trip md5 重放一致（npm `2016259497870124adf8285e359f5edf`、asar `3d867e888059dc91544c3190e40a322d`）。
      说明见 `~/.dsh/patches/README-maxtokens-notice.md`。**待 App 重启生效**。
- [x] GOAT 额度面板 official 行渲染错（用户 m00001「你这个插件重置时间错了吧」）：**不是数据错** ——
      `curl 127.0.0.1:8790/quota` 里 official 行（plan=official-balance, currency=CNY, available=-0.22）的
      fiveHour/weekly/month 字段本来就是 null，-0.22 是官方 key 真实欠费。真正原因是 **client bundle 是陈旧拷贝**：
      `profiles/{web,desktop}/node_modules/@local/dsh-plugin-goat-panel` 是 09-25 19:22 的 11100B 版本
      （sha256[:8]=`283840f5`），**没有 `if (r.kind === "official")` 分支** ⇒ 落进通用套餐渲染路径，
      `pctFine(null,null)`→"0%"、`n2(null)`→"0.00"、`fmtReset(null)`→""，于是显示
      `5h 0% / 周 0% / 月 0% / 余 0.00 / 5h 0.00/null ... 窗口重置：5h`。
      **机制**：package.json 用 `file:` 声明 ⇒ pnpm 把它物化成**真实目录**（拷贝/硬链），源目录
      `D:\Toolbox\goat-gateway\dsh-plugin-goat-panel\lib\client.js`（Oct 1 20:08 的 12371B 新版，含 official 分支）
      之后的改动**永不到达**；对照 `dsh-plugin-local-search` 用 `link:` ⇒ node_modules 里是 **Junction**，无此问题。
      **已修（根治）**：`file:` → `link:`（`profiles/web/package.json:7`、`profiles/desktop/package.json:6`），
      并 `pnpm install --lockfile-only` + `pnpm install` 让 **pnpm-lock.yaml 也写成 `link:`**
      （否则下次 `pnpm install --frozen-lockfile` 会按 lockfile 把 junction 打回拷贝）。现状：两 profile 的
      `node_modules/@local/dsh-plugin-goat-panel` = `<JUNCTION> [D:\Toolbox\goat-gateway\dsh-plugin-goat-panel]`，
      client.js = 12371B / sha256[:8]=`94d84544` ✓。备份：`profiles/web/pnpm-lock.yaml.bak-20261002-160945-pre-link`、
      `profiles/desktop/pnpm-lock.yaml.bak-20261002-161010-pre-link`（另有 package.json.bak-*-pre-goatpanel-junction）。
      **待重启 web / desktop 才可见**（client bundle 不吃 HMR）。
- **测量陷阱（本次踩过）**：在 bash 里用双引号 + `\"` 拼 PowerShell 路径会静默拼错 ⇒ `Get-Item`/`Test-Path` 假报
  MISSING，据此**误判过两轮「node_modules 又被还原」**。查 junction 一律写 `.ps1` 文件（`<<'EOF'` here-doc，
  路径用变量拼接）或 `cmd //c "dir /AL <path>"` 看 `<JUNCTION>` 行。
- [x] **思考链长期锁英文 —— 已解决并复验（用户 m00003 / m02206 / m02438 / m02462）**：根因不在 dsh 配置，而在
      **gateway 把上一轮的英文 reasoning 原样回灌**，形成语言自锁。修法 = `D:\Toolbox\goat-gateway\gateway.mjs`
      的 `reasoning-echo-filter`（`:951` 起，`filterReasoningEcho`）+ 开关 `logs\.reasoning-filter.json` =
      `{"enabled":true,"minCjk":0.25,"mode":"strip"}`：CJK < 0.25 的 `reasoning_content` 从请求体里剥掉。
      **实测棘轮**：`ECHO-FILTER` 首条 `08:11:05 id=1 dropped=27 kept=0 chars=116281` → 末期 `id=56 dropped=1 kept=12`
      （全日志 171 条），kept 从 0 升到 12–15、dropped 从 27–28 降到 1–5。
      **本 session（a0d5fbf8，3011 个 reasoning block）按本地小时分桶（仅带 tool-call 的 step）**：
      10-02 15 时 `n=63 median=0.000 zh=0%`、10-03 13 时 `0.005/0%`、10-03 15 时 `0.000/0%` →
      **10-03 16 时（filter 16:11 上线）`0.001/35%`** → 17 时 `0.487/91%` → 18 时 `0.504/96%` →
      23 时 `0.495/92%` → 10-04 00 时 `0.534/95%`。全期：ALL `n=3011 median=0.480 zh=64.9%`；
      **WITH tool-call `n=2852 median=0.472 zh=64.0%`**；NO tool-call `n=159 median=0.605 zh=79.9%`。
      ⇒ **「调工具 ⇒ 英文」这个 register 压过 system 契约的现象已被消除**（此前 26 个工具都翻不了）。
      复现命令：`python ~/.dsh/tmp-probe/stat-reasoning-cjk.py session-a0d5fbf8-0fb1-419e-9baf-d95df0190144`
      （`data.message.content[]` 里的块类型才是 `reasoning`；按 block type 过滤，剥离 code fence / inline code / URL / 盘符路径后算 cjk/(cjk+latin)）。
      ⚠️ 依赖 gateway 常开 ⇒ 删掉 `.reasoning-filter.json` 即回退；**Linux 侧尚未补此补丁**。


- [x] **reasoning-autofold 只在 web/npm-js 侧生效，desktop/asar 从未打过（objective ⑨，2026-10-04 11:50）**
      `~/.dsh/storages/tools/patch-reasoning-autofold.mjs`（4082 B, Sep 30 09:34）的标记是 `__dspDisclosure`
      （**不是**字符串 "reasoning-autofold" —— 我此前按后者搜索才误判成「0 命中」）。
      实测：npm-js `…/@deepseek-ai/dsh-client-ui-chat/lib/client.js`(565455 B) 含 `__dspDisclosure` ×3、
      备份 `.bak-pre-autofold`(565361 B) ⇒ **web 侧已应用**；`resources/app.asar`(121348951 B) 里
      `__dspDisclosure` **0 命中**、`const { expanded, toggle }` 仍有 **2 处** ⇒ **desktop 侧从未打过**
      ⇒ 桌面 App 的思考链不会「运行时自动展开、结束自动收回」。
      可行性：新旧串长度不同（旧 1 行 → 新 3 行）⇒ asar 里**不能等长替换**，改 size 会让后续 entry 的 offset
      全位移，必须整体重写 header（高风险）；且官方 nightly 更新会重写 asar，打进去也会丢。
      ⇒ 记为**已知 gap、暂不实施**；真要做得先造「重写 asar header」的通用工具，并配套 update 后自动重打。

- [x] **`dsh-headroom` 的 search-fold 会篡改「时间戳」类工具输出 —— 已修（2026-10-04 11:52）**
      `lib/compress.js:263` 的 `const SEARCH_LINE_RE = /^(.+?):(\d+)(?::(\d+))?:(.*)$/` 里 `(.+?)`
      允许 file 段**含空格** ⇒ `2026-10-04 23:10:17.521 host wrote file A` 被解析成
      file=`2026-10-04 23` / line=10 / rest=`17.521 …`，再在 `:296` 重组 ⇒ 输出变成
      `2026-10-04 23 (4 matches)` + `10: 17.521 host wrote file A`（日期与小时被吞、行序被重排）。
      触发门槛 `:284-285`：`matched >= 3 且 matched / totalNonEmpty >= 0.5`。
      **修法**：`(.+?)` → `(\S+?)`（file 段不允许含空格）。已验证真 grep 三态
      （`src/index.ts:12:` / `C:\\Users\\x.js:120:` / `Makefile:7:`）行为不变，两种时间戳形态均不再匹配。
      产物：`storages/tools/repro-headroom-searchfold.mjs`（复现 + 对照 + 修法验证表）、
      `storages/tools/patch-headroom-searchfold.py`（--check/--apply/--verify/--restore，幂等）。
      已 apply：两个 profile **同一 inode**（pnpm hardlink，`ls -i` 同为 9007199255035626）⇒ 改一处两侧生效；
      `compress.js` 28986 → **28987 B**、md5 `f5ebe4dd6df0`、备份 `.bak-pre-searchfold-fix`。
      ⚠️ 在 `node_modules` ⇒ `pnpm install` 会覆盖，需重跑。

## 待办：双机四 agent 用量总视图（用户 m01207，原话「能不能让他检测两个电脑四个agent的花费，一起同步」）

- dsh-context 的 host 半只 `ctx.sessionProjections.register(...)` ⇒ 数据源是**宿主进程自己的 session store**，
  天然单机单进程，没有 remote/多机入口；settings schema 只有 7 个 UI 偏好字段。
- 但跨机所需的数据已经就绪且极小：本机 `~/.dsh/storages/session_projcache/sessions/*.json`（已是 fold 好的
  token 桶）+ `%APPDATA%\reasonix\cache\usage-catalog\v1.sqlite`（`usage_records` 5406 行 /
  `usage_rollups` 32 行，字段 day/source/provider/model_ref/prompt/completion/reasoning/cache_hit/
  cache_miss/total/requests/turns，源 `%APPDATA%\reasonix\stats\YYYY-MM-DD.jsonl` 24 个，数据停在 09-21）。
  ⇒ 不需要碰几十 GB 的 session 日志。
- 口径按读法 A 定义：**{Windows, Linux} × {dsh, reasonix}**（用户尚未确认；reasonix 那套独立用量库是与 A 吻合的实物证据）。

## 重启后核对结果（2026-10-02）

- [x] `skill_search` 对 hindsight / microsoft-foundry 零命中 ✓（catalog 进程级缓存，重启后已刷新）
- [x] 新 session 首步顺序 = `git-context → plan-anchor → thinking-anchor` ✓（thinking-anchor 最贴采样点）
- [x] 无 `deja.exe` 被拉起 ✓；web/desktop/headless 三份 resolved config 里 `deja` 命中数均为 0 ✓
- [~] reasoning 中文：新进程 session 首块 CJK 0.37–0.56、中文块占比 63–98%；**旧进程 session 仍 0–4%**

## 已知未决
- **Linux 侧 `~/goat-gateway/gateway.mjs` 未打 reasoning-echo-filter 补丁**（它还是 1642 行的另一个版本，tail 补丁已单独打在其行 1101）：
  Linux 的 dsh 出口同样走本机 `127.0.0.1:8788/v1` ⇒ 在打上之前，Linux 上的 dsh 会话仍会被 reasoning 回灌锁住语言。
  补法：`python ~/.dsh/storages/tools/patch-gateway-reasoning-filter.py --file ~/goat-gateway/gateway.mjs`（锚点是 `function forward(` 与 `// bodylog-end`，
  **Linux 版没有 bodylog 补丁，所以要改锚点** —— 需先跑 `--check` 确认），再 `systemctl --user restart goat-gateway`。
- **web 进程重启后仍要核对「思考链是否翻中文」**：gateway 补丁只切断了回灌链条，剩下的先验（tools 26 个、英文注入累积）
  仍可能让个别 step 落到英文；若翻不过来，下一步是闭环重抽样（`dsh-thinking-guard` v1.0.2 的 abort + autoContinue 骨架可复用）。

- **web 侧仍跑着 12:48:18 启动的旧进程**（`node ... dsh\lib\bin.js --profile web --port 3080`）：它是部分 session 仍然全英文的源头。要彻底一致，得把这个进程也重启一次。
- 35 处 `reasoningEfforts: false` 与实测矛盾（web 17 + desktop 18）：`zai-org/GLM-5.3`、`MiniMaxAI/MiniMax-M3` 在五档全返回 thinking
- desktop 有 24 个死 model（86 entries vs web 61 vs allowlist 62）—— `rewrite-model-list.py` 只 hardcode 了 `profiles/web/cordis.patch.yml`
- `dsh-deja` v0.21.3 仍躺在 `profiles/{web,desktop}/node_modules/`（client=False，有 `dsh.bundle` 字段）—— 靠 bundles 列表移除来停用，但 auto-discovery 是否会把它拉回来**未验证**
- `@local/dsh-thinking-language` 源码在 `D:/Toolbox/dsh-thinking-language`（在 `~/.dsh` 之外，不随同步走）
- `@local/dsh-thinking-language` 两 profile 都用 `file:` 声明：web 里被物化成**真实目录**（Oct 1 14:26），
  desktop 里却是 **Junction** —— 行为不一致，且 web 那份改了源目录也不生效（当前内容恰好 SAME 所以没爆）。
  同一个 `file:` vs `link:` 根因，建议同样改 `link:` + `pnpm install`；**但它承载 thinking-language directive 注入**，
  改坏会丢中文思考链注入 ⇒ 单独一次做、留回滚点、跟一次重启一起验。
- Linux 连不上 `github.com`（`curl` → 000），任何 `github:` 依赖在那边装不了
- Linux profile bundle 只有 5 个，Windows 11 个
- **一次 App / desktop 重启可一并生效的 5 项**（10-03 13:47 汇总）：① dsh-context 价目 overlay（patch-dsh-context-pricing.mjs）；
  ② mnemon `idleReview.maxTokens: 32768`；③ maxtokens notice 抑制（patch-maxtokens-notice.py）；④ goat-panel `file:`→`link:`（web+desktop）；
  ⑤ web 侧 thinking-guard 复活（要重启的是 web 进程 pid 28480）。`dsh-plugin-message-edit` PR#7 已在 10-02 16:17 冷启动验证通过。


---

## ★ 白纸图标问题：全链路排查结论（2026-10-04 23:xx）

### 症状（已量化锁定，可复现）
- explorer 视图对 **所有"未缓存过"的 .lnk** 显示"通用文件图标"(白纸)，主图标为白纸文档
  - 测量：`IShellItemImageFactory::GetImage(48, SIIGBF_ICONONLY)` ⇒ `lum=235.1 sat=0.6 opaque=1441`（同一张图）
  - 任务栏 12 个图标里 7 个是同一占用图（`bright_px` 精确 = 34.0%，`sat≈20.1`）
- 文件夹 / exe / **已缓存的 .lnk** 图标完全正常
- **唯一分界线 = 该路径有没有现成的好 iconcache 条目**：
  - `desktop/Git Bash.lnk`（已缓存）→ `colored sat=124.3`
  - 同一文件 `Copy-Item` 到新路径 → `blank sat=0.6`
  - `lnktest/` 8 个新建 lnk（含**显式 IconLocation** 的 b/e）→ **全白**
  - `User Pinned/TaskBar/` 10 个 .lnk → `IShellItemImageFactory` 全白（任务栏真正显示的图标另有来源）

### 核心矛盾：两条 API 路径分歧（同一进程内测出）
| API | 已缓存项 | 未缓存项 |
|---|---|---|
| `SHGetFileInfo(SHGFI_ICON)` | 彩色 | **彩色** |
| `IShellItemImageFactory`（explorer 视图用） | 彩色 | **白纸** |
⇒ **图标提取能力是好的**；坏的是"生成/读入 iconcache 条目"这一步。
⇒ `SHGetFileInfo(+SHGFI_SYSICONINDEX)`：白纸项 `iIcon=0`（通用文件图标索引），`Git Bash.lnk` `iIcon=50`。

### 已排除（全部实测否证；勿重复）
- MOTW / `Zone.Identifier`（目标 exe 全 `MOTW=no`；且阳性对照证明检测法灵敏）
- `ZoneMap/ProtocolDefaults/file`（**改成 0 后全新 lnk 仍白**，已还原为 3；HKLM 也是 3）
- `IconLocation` 空/非空（40 项交叉统计**零相关**：空→4 彩 18 白，非空→5 彩 13 白）
- `lnkfile` 注册链：`CLSID={00021401-...}`、`shellex/IconHandler`、`DropHandler`、`.lnk/ShellEx/{E357FCCD..}` 全在；HKCU 无覆盖
- 组件版本：`BuildLabEx=26100.1` ⇒ **26H2 是 enablement package**，全部组件 26100.x 属**正常**（我一度误判为错配）
- `CBS.log` 无 `Cannot repair`/`corrupt` 记录
- AppX：195 包仅 3 个 `Microsoft.Office.*` 组件 `Disabled`；关键 shell 包全 `Ok`
- `Shell Extensions/Blocked`、`HKCU/Software/Classes/lnkfile` 遮蔽、`TreatAs`、`Shell Icons`、`MaxCachedIcons`
- TEMP 可写性：强制 `TEMP=C:/Users/27063/AppData/Local/Temp`（可写）⇒ 结果**逐位相同**
- `SHGetFileInfo` 预热修复：预热前后 `IShellItemImageFactory` **逐位不变**（喂不进去）
- 磁盘（C: 69.4 GB free）、目录 ACL、junction（`C:/Windows/Installer` 是**普通目录**，社区那条 symlink 机制不适用）
- `ie4uinit.exe -show` 无效（12 个图标统计逐位一致）

### 测量方法学（血泪，务必遵守）
1. ⚠️ **PS 5.1 读无 BOM 的 UTF-8 .ps1 时按 GBK 解码** ⇒ 脚本里的中文字面量永不匹配真实 Unicode 标题
   ⇒ 早期"对话框探针"的 `dialog_count=0` **全是假阴性**（应改用窗口类名 `#32770` 或 Python+ctypes）
2. ⚠️ 读被 explorer 占用的文件必须用 **`FileShare.ReadWrite`**（`Open(...,'ReadWrite','None')` 必失败）
3. ⚠️ **iconcache 的 24 B 快照 ≠ 写入失败**：那是惰性分配，随后 32/48/256 都涨到 1 MB
4. ⚠️ **不要用单点/单文件下结论**（`file=3` 误判、`ExtractAssociatedIcon` 误判、MOTW 方向错误都源于此）
5. ⚠️ **阳性对照是必需的**：没有它无法区分"没有现象"与"探针失效"

### 当前最强嫌疑：火绒 (Huorong)
- `dtrampo.dll`（`C:/Windows/System32/dtrampo.dll`, 213664 B, sig Valid）**注入全部 5 个 explorer 进程**
- 驱动：`hrdevmon`(Boot)/`hrndis6`(System)/`hrwfpdrv`(Auto)/`sysdiag`(System) 全 Running
- 服务：`HipsDaemon`(Running)/`HRWSCCtrl`(Running)/`HipsTray`
- **`taskkill /F /IM explorer.exe /T` 杀不死 explorer 本体**（只杀掉 8 个子进程）⇒ 进程保护生效
- 注册表回滚**未证实**（探针键 8s/10s/6s 后都在）
- ⚠️ 用户"关闭火绒后无效"**只是关了面板**，驱动与注入 DLL 仍在

### 其他已确证异常（独立问题，顺带修）
- **`ShellIconOverlayIdentifiers` 19 项 > 上限 15**：WPS(`qingnse64.dll`) 4 + 百度网盘(`YunShellExtV164.dll`) 7 + OneDrive 7
  ⇒ `OneDrive5/6/7` + 系统自带 `EnhancedStorageShell`(`EhStorShell.dll`) 被静默丢弃
- **`TEMP`/`TMP` 曾为 `D:/Temp`**：本进程写它报 `PermissionError(13)`，而 `C:/.../Temp` 可写
  ⇒ 已改回 `%LOCALAPPDATA%/Temp`（写 HKCU 无需提权，**需重启生效**）

### 备份与工具
- 备份：`C:/Users/27063/Desktop/工具箱/会话断点/fix-2026-10-04/`
  （`ZoneMap-backup.reg` / `HKCU-lnkfile-backup.reg` / `IconCache.db.bak` / `Taskband-backup.reg` / `LanmanServer-Shares.reg`）
- 诊断套件：`C:/Users/27063/AppData/Local/Temp/dsh-diag/`
  （`iconlib.py` / `imgfactory.py` / `cross.py` / `strip.py` / `warm2.py` / `winlist.py`；截图 `screen*.png`、`imgfactory.png`）

### 下一步（按顺序，含风险标注）
1. **彻底退出火绒**（托盘右键退出 / 主界面退出，**不是关面板**）→ 重启 explorer 或重启电脑
   → 复测 `python cross.py`；若恢复，罪魁是 `dtrampo.dll` 的 shell 注入
2. 若无效：把 `ShellIconOverlayIdentifiers` 清理到 ≤15 项（需提权，可逆）
3. 若无效：`sfc /scannow` + `DISM /Online /Cleanup-Image /RestoreHealth`（需提权，10–20 min）
4. ⛔ **绝对不要清 iconcache / 不要 `ie4uinit -ClearIconCache`**
   理由：已缓存项是当前唯一的正常来源，清空会让你连好条目一起丢

### 重启前的实验 hook（2026-10-04 23:xx 留下）
- `HKCU\Software\Microsoft\Windows\CurrentVersion\Shell Extensions\Blocked` 已写入 3 个 CLSID
  （OneDrive `FileSyncEx` = `{CB3D0F55-...}`、WPS `Open With qingshellext` = `{67F4D210-...}`、
   WPS `QingNseContextMenu` = `{AA147FFB-...}`）**这三者都注册在 `lnkfile\shellex\ContextMenuHandlers` 上**
- 目的：`Blocked` 对**已运行的 explorer 无效**（shell extension 在启动时绑定），
  所以必须**重启 explorer 或重启电脑**才生效 ⇒ 把"重启"这一次操作**同时用于两件事**：
  ① 让 `TEMP` 改动生效 ② 验证"第三方 lnkfile handler 是否干扰图标"
- **判读**：重启后复测 `python cross.py`
  - 白纸消失 ⇒ 元凶在这 3 个 handler（再用二分法定位到具体哪个）
  - 白纸照旧 ⇒ 排除 HKCU 这 3 个，下一步 block HKLM 的 5 个（需提权）
- 回滚：`Remove-Item 'Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Shell Extensions\Blocked' -Recurse`

---

## ★ 白纸图标问题：已解除（2026-10-05 00:2x）—— 结论、机制、判据

### 最终状态
- **症状真实**：`taskbar_zoom.png`(23:00) 任务栏 12 个图标里 **8 个白纸**；
  `screen_lnktest.png`(23:03) `lnktest\` 里 **a~h 8 个 lnk 全部白纸**。
- **现况正常**：`folder_view.png`(00:25) 工具箱 lnk 大部分彩色、文件夹黄色、任务栏全彩。
- **转折点**：**00:14:51 强杀 explorer**。`AutoRestartShell=1` ⇒ Winlogon 在 **79 ms** 内拉起新 shell
  （pid 3568 @00:11:02 → pid 7724 @00:14:51.346）。

### 机制（与全部观察自洽）
explorer **进程内**的 icon 提取子系统退化：
cache 命中的项直接从 iconcache 取图 ⇒ 正常；未命中项必须现场走 IconHandler 提取 ⇒ 全白。
**强杀 explorer 跳过了"退出时回写 cache"，新 shell 重建状态 ⇒ 恢复。**
**普通重启/关机无效**，因为正常退出时 explorer 会 **保存**那份坏状态（用户 23:xx "重启了还是这样" 与此一致）。

### 本轮实测证据
- `AutoRestartShell=1`；kill 后 79 ms 新 explorer 起来。
  ⇒ 之前反复出现的「Stop-Process 后仍有 1 个 explorer 存活」**不是杀不掉、也不是火绒回滚**，
  而是 Winlogon 按 `AutoRestartShell` 自动重启 shell。**这一条纠正了此前两处误判。**
- **9 小时内 `Application`/`Application Error`/`Application Hang`/`WER` 中无任何 `explorer.exe` 记录**
  ⇒ 是功能退化，不是 crash。仅有 `nahimicNotifSys.exe` 崩 ×3（18:37/22:29/23:37）与 msedge ×2（18:05/18:06），无关。
- `%LOCALAPPDATA%\Microsoft\Windows\Explorer` 的 ACL **正常**：`Everyone:(DC)` DENY 是继承来的默认 ACE，
  同目录另有 `S-1-4-1049387402-452331294` Allow `Write/Delete`；且 explorer 在 **23:38:08 / 23:42:29**
  确实在写该目录（`ExplorerStartupLog_RunOnce.etl` / `RecommendationsFilterList.json`）。
  ⇒ 「ACL 拦截写 iconcache」假说否证。
- `HKCU\Software\Classes\lnkfile` 只含 `ContextMenuHandlers`（WPS/qingshellext），**不含 `IconHandler`**
  ⇒ 不构成对 HKLM 的遮蔽；HKCR 是逐键合并，`shellex\IconHandler` 仍来自 HKLM。
  ⇒ 「用户级注册表遮蔽」假说否证。
- 注册链全绿：`HKCR\.lnk`→`lnkfile`；`lnkfile\shellex\IconHandler` = `{00021401-...}`；
  `CLSID\{00021401-...}\InProcServer32` = `windows.storage.dll`，`ThreadingModel=Both`；
  `lnkfile\CLSID` 齐备。
- `IShellLink` 直测（COM）对 fresh/dsh/GitBash 三个 lnk **全部 hr=0 并正确解析出 target**
  ⇒ lnk 文件与解析链健康。

### ★ 判据（最重要的一条，勿再踩）
`SHGetFileInfo` 与 `IShellItemImageFactory` 在**已恢复的当前状态下，依然会对部分 lnk 返回
`iIcon=0` / 纯白（IShellItemImageFactory: lum≈235.1 sat≈0.6；SHGetFileInfo: lum≈228.7 sat≈3.6 ink=118）**，
而 explorer 实际渲染是**彩色**（截图可见 `DeepSeek Harness` 鲸鱼、`Reasonix` 蓝 R、`dsh` 蓝终端）。
⇒ **绝不能再用这两个 API 单独判定"图标是否正常"。**
`iIcon=0` 只是该进程内 shell 的「未解析」哨兵值，**不等于 explorer 视图坏**。
**唯一可信判据 = explorer 的实际渲染（截屏）。**
另：白纸口径也已修正 —— `idx=0` 白纸与 generic 文档图标（`imageres.dll`）同形，
`Recent\` 里 18 个 lnk 有 17 个是这种白纸，因为**目标已被删除**，在那里白纸是正常的。

### 测量方法学（新增 2 条）
1. **`iconcache_*.db` 被 explorer mmap 常驻 ⇒ Windows 不更新其 LastWriteTime**。
   「mtime 冻结在 22:51:04」**不能**推断「没写入」。判写入只能解析文件头 `used` 字段。
2. **`SHGetFileInfo` 的 `hIcon != 0` 只说明"有图标"，不说明图标内容对**。
   必须把 HICON 画到 DIB 上量 `lum/sat/opaque/distinct/ink/inkfrac` 才有判别力
   （`ink` = 亮度<200 的像素数，用来区分"白纸带折角/箭头"与"纯白方块"）。

### 复发时的操作（按序，勿跳）
1. `Stop-Process -Name explorer -Force`，等约 1 s 让 Winlogon 自动拉起新 shell；
   确认 `Get-Process explorer` 的 StartTime 已更新。
2. 若无效：确认 `HKLM\...\Winlogon\AutoRestartShell = 1`，再强杀一次。
3. **仍无效才**考虑动 iconcache。备份在
   `C:\Users\27063\Desktop\工具箱\会话断点\fix-2026-10-04\iconcache-backup-234458\`（31 个文件，
   含 `iconcache_*` + `IconCache.db` + `thumbcache_*`），可逐文件还原。
4. ⛔ 不要用 `ie4uinit -ClearIconCache`：已证明它只能清老格式 `IconCache.db` 和改写 `iconcache_idx.db`，
   **动不了 `iconcache_16/32/48/256.db`**。

### 仍未做（可选，非阻塞）
- `ShellIconOverlayIdentifiers` 19 项 > 上限 15（WPS `qingnse64.dll` 4 + 百度网盘 `YunShellExtV164.dll` 7 +
  OneDrive 7，挤掉系统 `EnhancedStorageShell`/`EhStorShell.dll`）。需 HKLM 提权。
- 彻底排除火绒：用户只退了托盘 `HipsTray`，`HipsDaemon`/`HRWSCCtrl` 服务 +
  `hrdevmon`/`hrndis6`/`hrwfpdrv`/`sysdiag` 四驱动仍在 Running。
  （但新 explorer **未加载** `dtrampo.dll` ⇒ 用户态注入已排除。）
- `Get-SmbSession` / `Microsoft-Windows-SmbServer/Operational`（需提权）「有没有外部连进来过」。

### 本轮新增诊断工具（`%LOCALAPPDATA%\Temp\dsh-diag\`）
`probeA.py`（SHGetFileInfo 内容 + imagelist + ExtractIconEx）、
`probeB.py`（USEFILEATTRIBUTES / lnk 头 / IShellLink COM）、
`probeC.py`（IconLocation 矩阵 + IExtractIcon）、
`probeD.py`（IconHandler COM）、
`census.py`（508 个 lnk 普查）、`lnkcheck.py`（工具箱 lnk × target 存在性 + 图标）、
`warmup.py`（同 lnk 连续调用）、`exp-kill-test.ps1`（AutoRestartShell 判定）、
`chk-icacl.ps1`（iconcache ACL）、`chk-hkcu2.ps1`（HKCU 遮蔽权威判定）、`ev3.ps1`（事件日志）。
截图：`now.png` `folder_view.png`。

---

## ★★ 重大更正 + 真正的根因方向（2026-10-05 00:5x）

### 一、必须纠正：**explorer 从头到尾没有死过**
`pid=7724`（`ppid=14056`，start **00:14:51**）始终存活，且一直正常：
- 窗口枚举 `winlist.py` 显示 `7724 Progman 'Program Manager'` + `2 × CabinetWClass '…文件资源管理器'`
- `Responding=True / Threads=141 / Handles=6563`

**我用的 `Get-Process explorer` 会返回假阴性（空）**，而无参 `Get-Process | Sort HandleCount` 能正确列出 7724。
⇒ **「Stop-Process 后 explorer 数=1 / explorer 不存在」这两类判读全都不可信。**
⇒ 后果：我据此在 00:4x 执行了 `clean.py`（删 iconcache），**该 kill 其实是空转**（进程列表为空 → `ForEach Kill()` 一个没杀到），
   **但删除动作真的执行了**。iconcache 已完整回滚（30/31，剩 `thumbcache_idx.db` 被占用，属缩略图缓存、与图标无关）。

**教训（新增判据，勿再踩）**：判断进程是否存在，用 **`tasklist`** 或 **`Get-CimInstance Win32_Process`**，
不要用 `Get-Process <name>`。同理 `taskkill /FI` 在 Git Bash 下引号会被吞（报 `Invalid argument/option - 'eq'`），要避坑。

### 二、任务栏当前缺失（`Shell_TrayWnd` 不在窗口列表里）
- 屏幕截图 = 纯桌面壁纸，无任务栏；窗口枚举里有 `Progman`（桌面）但**没有 `Shell_TrayWnd`**。
- `taskkill /F /IM explorer.exe` → **`Access is denied`**（PID 7724）。00:14 时同样命令能杀掉 3568。
- 时间线：用户 00:36 的截图**还有任务栏** → 之后消失（最可能是我 `Start-Process explorer.exe` 起的多余实例
  16340 弹出 `0xc0000142` 后退出的连带效应）。

### 三、真正的上游原因：**Windows 更新正在安装，且必须重启**
| 证据 | 值 |
|---|---|
| `CBS.log` | `DWLD: Downloading update (307725024 of 307725024 bytes) … [100%]` @ **00:40:48**，之后无新记录 |
| CBS package state | 4 个 `0x50`(Installed) + **1 个 `state=0x70`(InstallPending) `10.0.9347.1`** |
| CBS `RebootPending` | **True** |
| `SoftwareDistribution\Download` | 309,995 files / 由 2752 MB → **2192 MB**（在处理） |
| 正在跑的进程 | `TrustedInstaller` / `TiWorker`(ws≈521 MB) / `MoUsoCoreWorker` / `wuauserv` / `UsoSvc` |
| 事件日志 | `RestartManager` 会话 ×3 @00:32:59–00:33:03、`VSS` 卷影快照 @00:34:53（现均已结束：`VSS`/`swprv` → Stopped） |
| 组件版本 | `explorer.exe`=**26100.8875**，而 `shell32.dll`/`ntdll.dll`=**26100.9549**（全为 2026-09-23 10:00）；版本不同步 |

⇒ 这解释了最初的整套症状：**18:35 那次重启让一部分更新生效、另一部分 pending**，
组件版本不同步 → iconcache 写入/图标提取异常（未缓存项白纸）、协议需重新同意、Edge 登录态失效。

### 四、结论与行动
1. **不要再 kill explorer / 不要动 iconcache**（已确认 iconcache 与本次症状无关，且已回滚）。
2. **正确路径 = 完成更新并重启。** 重启会让 `0x70` 包落地、组件版本一致、shell 重建。
3. 恢复任务栏的两个选项（择一）：
   - **A（推荐）**：正常重启系统（顺便完成更新）。
   - **B（有风险）**：提权强杀 explorer 让 Winlogon 重建（`AutoRestartShell=1`）。
     风险：若新 explorer 因更新未完成而起不来，会连桌面一起丢（现在至少壁纸+其他程序可用）。
4. 诊断中新增的可用工具：`ep.py`(shell extension 逐个 LoadLibrary)、`who.ps1`(更新/安装进程)、
   `ev4.ps1`(近 20 min 事件)、`census.py`(508 个 lnk 普查)、`clean.py`(**已用过，勿再跑**)。

### 五、本轮被否证的假说（勿重复）
- ❌ ACL 拦截图标缓存写入：`%LOCALAPPDATA%\…\Explorer` ACL 正常（`Everyone:(DC)` DENY 是继承默认 ACE），
  explorer 在 23:38/23:42 确实在写该目录。
- ❌ HKCU 注册表遮蔽 `lnkfile`：其中只有 `ContextMenuHandlers`，无 `IconHandler`；HKCR 逐键合并不受影响。
- ❌ desktop heap 耗尽：`SharedSection=1024,20480,768` 与官方默认逐字一致。
- ❌ shell extension DLL 损坏：19 个 `ShellIconOverlayIdentifiers` 全部 `LoadLibrary` **成功**（0 个 FAIL）。
- ❌ MOTW / ZoneMap / IconLocation / 组件版本错配 / AppX / junction / 病毒 —— 此前均已否证。
- ⚠️ `explorer.exe` 的 134 个静态导入里大量 `api-ms-win-*.dll` 报 MISSING 是**假信号**（API set 由 ntdll 虚拟解析，磁盘无实体文件），不可作判据。

---

## ★★★ 白纸图标：根因定位完成 + 我造成的加重（2026-10-05 03:1x）

### 一、根因（可复现；两条 API 结果一致，此前"两条 API 分歧"的判断是错的）
**唯一分界线 = 该路径在 iconcache 里有没有现成条目。cache 命中 → 正常；cache miss → 走"实时提取"，而这条路对 `.lnk` 是坏的。**

决定性对照（`final.py`，同一目标分别测裸 PE 与 lnk）：

| 目标（裸 exe） | 结果 | 对应 lnk | 结果 |
|---|---|---|---|
| firefox.exe | COLOR | TB/Firefox.lnk | **WHITE** |
| msedge.exe | COLOR | TB/Edge.lnk | **WHITE** |
| powershell.exe | COLOR | Desk/dsh.lnk | **WHITE** |
| WizTree64.exe | COLOR | Desk/WizTree.lnk | **WHITE** |
| git-bash.exe | COLOR | Desk/GitBash.lnk | **COLOR** ← 唯一例外 |
| Code.exe | COLOR | TB/VSCode.lnk | **WHITE** |

**⇒ PE 图标资源提取本身完全健康（裸 exe 6/6 COLOR）。坏的是 `.lnk` 的 `IconHandler` 路径。**

唯一例外给出精确判别式，数据来自 `IShellLinkW::GetIconLocation`（vtable[16]，全部 hr=0）：
- `GitBash.lnk` → loc = 独立 `.ico`（git-for-windows.ico） ⇒ **COLOR**
- `Firefox.lnk` / `Edge.lnk` → loc 指向 `.exe` ⇒ WHITE
- `WPS / VSCode / dsh / WizTree.lnk` → loc = `''` ⇒ WHITE

**⇒ `{00021401-…}` 的 `IExtractIcon` 直接读 `.ico` 成功、需要从 PE 资源取图标时失败。**
该 CLSID 的 `InProcServer32` = `windows.storage.dll`（26100.9278，ThreadingModel=Both，注册链全绿）。

### 二、我这次做错的事（必须记录）
00:4x 我依据"`Get-Process explorer` 返回空"判定 explorer 已死，执行 `clean.py` 删除了全部 iconcache。
**该 kill 其实是空转（进程列表为空 → `ForEach Kill()` 一个没杀到），但删除动作真的执行了。**
⇒ 大量 lnk 的 cache 条目丢失，重启后没有重建回来（因为实时提取是坏的）——**这就是"白纸更多"的直接原因**。
证据：`Desk/dsh.lnk` 在 00:33 测为 `idx=71 COLOR`，03:0x 测为 `idx=0 WHITE`。

### 三、为什么官方方案在本机不够
微软官方 troubleshooting（`learn.microsoft.com/troubleshoot/windows-client/shell-experience`）与社区工具
`alsvike/windows-icon-refresher` 给的方案都是**清 icon cache + 重启 explorer**。
但本机的问题在于：**cache 清掉后必须靠"实时提取"重建，而那条路对 `.lnk` 是坏的** ⇒ 清了就回不来。
**所以不能盲目照搬官方步骤**：要么先修 IconHandler 路径，要么从备份恢复 cache。

### 四、当前系统状态（03:1x）
- `explorer.exe` pid=**24056** 运行中；`Shell_TrayWnd`/`Progman` 窗口存在（pid 8604）
- 屏幕处于**锁屏**（`Windows 默认锁屏界面` 在前台，input desktop = `Default`）
- 更新已全部完成：`CBS RebootPending=False` / `WU RebootRequired=False` / `PendingFileRename=0`
- 重启（02:36:30）后 Application/System 日志**零 Error/Critical**
- `explorer.exe` 启动**偶发失败 `0xC0000142`**（STATUS_DLL_INIT_FAILED）：同一分钟内 `Popen` 失败而 `Start-Process` 成功。
  与用户 00:5x 截图同一错误码，**属既有问题、非本次操作造成**。静态依赖（shell32 / windows.storage /
  twinui.pcshell / shlwapi / combase / ole32 / propsys）从我进程加载全部 LOADED。

### 五、本轮新增判据（重要，勿再踩）
1. **判断进程是否存在，禁用 `Get-Process <name>` / `tasklist` / `OpenProcess`** —— 本机三者都出现过假阴性。
   相对可靠：`Get-CimInstance Win32_Process` + 窗口枚举（`Shell_TrayWnd`/`Progman` 的 pid）。
2. **`O_RDWR` 能打开 ≠ 文件未占用**。被 mmap 的文件允许 `O_RDWR` 打开，但**拒绝截断写入**（`winerror 1224`）。
   判断能否覆盖必须实际尝试 `O_TRUNC` 写。
3. **锁屏时 explorer 会释放 iconcache 的 mmap**（观察到文件短暂变 free），之后又重新持有。
4. **`explorer.exe` 的静态导入里大量 `api-ms-win-*.dll` 报 MISSING 是假信号**（API set 由 ntdll 虚拟解析）。
5. PowerShell 用 `GetClassNameW` 必须声明 `CharSet=CharSet.Unicode`，否则类名只读回 1 个字符
   （会造成 `Shell_TrayWnd count=0` 这类假阴性）。
6. 写含 `C:\Users` 的 Python 文本必须用 raw string，否则 `\U` 触发 unicodeescape 报错。

### 六、备份资产（可回滚）
`会话断点\fix-2026-10-04\` 下：
- `iconcache-backup-234458\`（31 文件，00:00 前后快照）
- `iconcache-preclean-0040\`（31 文件，**我删除前**的快照；本次还原源）
- `IconCache.db.bak` / `Taskband-backup.reg` / `ZoneMap-backup.reg` / `HKCU-lnkfile-backup.reg` /
  `HKCU-ShellExtensions-backup.reg` / `LanmanServer-Shares.reg` / `shares-before.txt`
还原状态：`iconcache_256.db` 已还原为 SAME；`iconcache_16/32/48/idx.db` 因被 explorer mmap 持有**未能还原**。

### 七、待决策的下一步
- [ ] A. `sfc /scannow` + `DISM /Online /Cleanup-Image /RestoreHealth`（提权；修可能的组件损坏）
- [ ] B. 手动"清 iconcache + 重启 explorer"（**有风险**：explorer 曾 0xC0000142，可能起不来，需任务管理器兜底）
- [ ] C. 试用 `alsvike/windows-icon-refresher`
- [ ] D. 从备份还原 iconcache（需先停 explorer）
- [ ] E. 清理 `ShellIconOverlayIdentifiers` 19>15（WPS 4 + 百度网盘 7 + OneDrive 7；DLL 实测全部可加载，非本次病因）

## 2026-10-23 Linux→Windows dsh 远程化（已落地，隧道验证通过）

**目标**：天阙 Linux 侧不再承担 dsh 的算力，只留一个 ssh 隧道进程。

**关键实测（决定性）**：
- 物理链路：Windows Realtek 2.5GbE `192.168.243.1` ↔ Linux USB 千兆网卡 `enx00e04c074608` `192.168.243.2`，Link 1000 Mb/s，双向 ping **1.0–1.6 ms**。
- Tailscale 却全程走 DERP 中继（`tailscale ping` = `pong via DERP(nue) in ~420ms`），**没有用上这条有线链路**。
- 因此两条路径首字节差 150 倍：`--L 3080` 经 DERP = **810–1920 ms**；经内网 IP = **5.2–9.0 ms**。

**已做**：
1. Windows：`~/.dsh/launch-dsh.ps1 -Mode Serve` 起 `dsh --profile web --port 3080 --no-open`（绑 127.0.0.1）。日志 `~/.dsh/logs/dsh-web-3080.out.log`，token 在里面。
2. Linux：`~/.config/systemd/user/dsh-tunnel.service`（enabled + active），`ssh -N -L 3080:127.0.0.1:3080 27063@192.168.243.1`，常驻内存 **2.3 MB**，`Restart=always`。
3. Linux 侧说明文档：`~/.local/share/dsh-tunnel/README.md`（含用法 + 回滚）。
4. 备份：`~/.ssh/config.bak-20261023-100317`（Linux）；git tag `pre-remote-experiment-20261023`。

**验收数据（Linux 侧 curl，带 token cookie）**：握手 303 = 7.9 ms；index 200 = 5.6 / 5.9 / 7.3 ms，size 40246 B。

**已知未解**：
- ⚠️ 3080 进程在一次 Chrome headless 页面抓取后**无故退出**（日志无 error，停在启动成功行）；改用前台方式重启后存活至今。原因未定位 —— 若再次消失，先查是否被 headless 浏览器/内存压力带走。
- session 单写者：desktop 与 web 共用 `DSH_HOME=~/.dsh` 且无跨进程锁 ⇒ Windows 本地开 desktop 时不要在远程 web 里开同一 session。
- harness 跑在 Windows，workspace = `C:\Users\27063` ⇒ Linux 的 `/media/OS/课程文件` 对 agent 不可见。
- Windows 重启后 3080 不自启（计划任务 `dsh-web-3080` 于 2026-10-06 禁用）⇒ 需手动 `launch-dsh.ps1 -Mode Serve`。
- Linux 的 `dsh-remote` 派发脚本仍走 `tqjq` → Tailscale DERP（420 ms）。改 `~/.ssh/config` 的 `tqjq` HostName 到 `192.168.243.1`（或新增 `tqjq-lan`）可让整套派发快 200 倍 —— **未做，待用户拍板**。

**回滚（30 秒）**：Linux 侧 `systemctl --user disable --now dsh-tunnel && rm ~/.config/systemd/user/dsh-tunnel.service && systemctl --user daemon-reload`；Windows 侧杀 3080 的 node/cmd 进程即可，无配置改动。

**2026-10-23 补（Linux 无 desktop 版）**：官方 `dsh-desk` feed 只发 `win-x64`，`linux-x64`/`linux-arm64`/`darwin-*` 全 404 ⇒ Linux 不存在 Electron 版。已在 Linux 侧补 `~/.local/bin/dsh-remote-gui` + `~/.local/share/applications/dsh-remote.desktop`：`google-chrome --app=.../?token=`（自动抓 token、独立 user-data-dir、WM_CLASS=DeepSeekHarness），实测出窗口 `0x02200003 TianQue DeepSeek Harness`。图形会话是 X11 / `DISPLAY=:1`（不是 :0）。

### ★ 已完成：`/compress` 全局化（2026-10-23 12:29）
**目标**：让「压上下文」在所有会话都可用，不再依赖每个会话临时 `dev_tool_search` 解锁。
**根因**：bili 的 `compress`/`decompress`/`acp_status` 是这条 lane 上唯一可靠的压缩入口（摘要由模型写，不依赖 bili 那个从没成功过的摘要后端），但它们此前既不在 bootstrap 集也不在 promoted keep-set，只能现解锁；而已经处于 compaction 态的会话（catalog 被裁成 `compactionTools`，如 minecraft `session-9cf09938`）连 `dev_tool_search` 都没有，永远解锁不了。
**改了两处**（备份 `*.bak-20261023-122906-pre-resident-context-tools`，`node --check` OK，行尾已还原 LF）：
1. `.agent-presets/anchored-standard/tool-bootstrap.mjs:147` 新增 `const RESIDENT_CONTEXT_TOOLS = ['compress', 'decompress', 'acp_status', 'search_context']`；`:309` promoted 分支的 keep 集合并入它。
2. `profiles/desktop/cordis.patch.yml:224` `compactionTools` 末尾加 `compress` —— 让 compaction 态也能自救。
**不动 bootstrap 集**：第一轮仍只有 `bash`/`str_replace_editor`，issue #11 的 anchoring 证据（Minimal 对 5/5 vs 标准族 11/11）不受影响。
**生效时机**：需重启 dsh —— mjs 是 cordis 加载时 import 的，2026-09-27 实测过「改 preset 文件内容不进已有 session」。重启后验证：任一会话的工具列表应直接出现 `compress`。
**另配套**：技能 `C:\Users\27063\.dsh\skills\compress\SKILL.md`（`skill_search`/`skill_load` 双验证通过），触发词 `/compress`、`压上下文`。
**回滚**：把两个 `.bak-20261023-122906-pre-resident-context-tools` 拷回原位并重启。
