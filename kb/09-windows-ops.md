# 09 · Windows 宿主环境运维：integrity level、计划任务、终端、双机与电源

> 在这台机器上，**配置写对了不等于行为变了**。
> 同一个"写文件失败"，可能来自 integrity level、junction、WDAC、坏掉的 `schtasks`、或 UAC 提权边界 —— 四层的判据各不相同。
> 本篇按"会挡路的顺序"排列：能不能写 → 用什么 shell → 怎么查任务 → 怎么开机 → 怎么跨机。

---

## D 定论

**D1 · agent 的 bash tool 在 Windows 上固定跑 Low Mandatory Level（`S-1-16-4096`），与 `sandbox-policy.mode` 无关。**
实测：`sandbox-policy.config.mode = danger-full-access`、preset 表 `defaultPreset: danger-full-access`（`sandbox: danger-full-access / approval: never`），**配置正确、重启也确认过**，但进程仍是 Low。
⇒ `danger-full-access` 在 Windows 上**不解除 integrity level**（landlock 是 Linux only，两者不在同一层）。重启 dsh 不会解决。

**D2 · 表现：`D:\` 全盘对 agent 只读。**
`D:\` 的 ACL 明明给了 `Authenticated Users:(M)`，仍写不进去 —— 因为 **IL 的 no-write-up 检查发生在 ACL 判定之前**。
`C:\Users\27063` 可写（它带 `Low Mandatory Level:(OI)(CI)(NW)`）。
**`C:\Users\27063\Desktop` 是 junction → `D:\Desktop`** ⇒ "桌面也写不了"其实是 D 盘写不了，不是桌面本身特殊。

**D3 · 解法：给目标目录降 integrity level，需 UAC 提权，且不加 `/T`。**

```powershell
Start-Process -FilePath icacls.exe -Verb RunAs -Wait -ArgumentList @(
  'D:\目标目录', '/setintegritylevel', '(OI)(CI)Low')
```

- 只对目录本身设 `(OI)(CI)Low`，**不要 `/T`**（递归会遍历大量文件，违反"命令必限时"铁律）。
- 子目录与新建文件自动继承 Low ⇒ low 进程可写；Medium 进程（explorer、git）对 Low 对象仍可写（write-down 允许），**副作用为零**。
- 非提权执行会 `Access is denied`（改 label 需 `SeRelabelPrivilege`）。
- **新建的一级目录不会自动继承** —— 以后每新建一个要写的目录，都要重跑一次。

**D4 · PowerShell 5.1 在本机全盘失效，交互 shell 与所有脚本走 pwsh 7。**
5.1（`10.0.26100.9711`）里任何 `.ps1` 都报 `is not digitally signed`；`-ExecutionPolicy RemoteSigned / AllSigned` 均被拒，只有 `Bypass` 通过。
这不是 ExecutionPolicy 设置问题：机器级 **WDAC script enforcement**（`CiPolicies\Active` 下 8 个 `.cip`，`CodeIntegrityPolicyEnforcementStatus=2`）被 `SystemPolicy.GetLockdownPolicy()` 判成 Enforce，覆盖了 RemoteSigned 的"本地文件免签"豁免。`LanguageMode` 仍是 FullLanguage（强制签名 ≠ ConstrainedLanguage）。
⇒ **判据不是"改策略"，是"换 7"**：pwsh **7.6.8** 跑同一文件正常。

**D5 · 计划任务不能靠 `schtasks` 查；本机非提权一律报错。**
- `schtasks /query` → `ERROR: The system cannot find the path specified.`（从 `C:\Windows\System32` 里跑也一样）；
- Git Bash 里还会被 MSYS 路径转换吃掉：`ERROR: Invalid argument/option - 'C:/Git/query'`（需 `MSYS_NO_PATHCONV=1`）；
- `Get-ScheduledTask` → `ObjectNotFound ... HRESULT 0x80070003`。
⇒ **正确姿势：提权 + 直接读 XML** `C:\Windows\System32\Tasks\<任务名>`（UTF-16）。注意：该**目录** `ls` 报 `Permission denied`，但**按文件名 `cat` 能直接读** —— 这是绕开坏 `schtasks` 的关键手法。

**D6 · pwsh 已常驻化（P1），收益 3.59×，但带来语义不对称。**
`pwsh` 工具从"每次 cold-spawn"改为"每 agent 一个常驻 ConPTY shell"：tool-call 往返 median **677 ms → 189 ms**（省 488 ms/次，−72%）。首次调用 1134 ms（起 shell）只付一次。
关键修正：`677 − 209`（纯 `pwsh -NoProfile` 启动）= **~468 ms 是 `dsh-tool-pwsh` 自身的 seam 开销**（它套在 bash executor seam 之上）—— 常驻化把"启动 + seam"两层一起砍掉了。
⇒ `pwsh` **有状态**，`bash` **无状态**：pwsh 里的 `cd` / `$env:` 会跨调用保留（会累积污染），bash 不会跟。**`timeoutMs` 绝不调小**：工具级超时会 `Reset, never repair` —— 关掉 shell 并丢掉全部状态（命令内部的 `timeout 30` 是子进程级，不受影响）。

**D7 · "关机后 13~21 秒自己开机" = BIOS AC 假边沿，不是软件唤醒。**
60 天日志：**26 次**「正常关机（109 Shutdown + 6006）→ 13~33 秒后冷启动」，BootType 全 `0x0`（完整 POST），出现「关机→自启→再关→再自启」连发，概率 26/74 ≈ 35%，延迟中位数 17 s。
根因：BIOS `Power On after AC Loss`（用户主动开启，用于智能插座远程开机）+ **EC 在 S5 下对 `AC_PRESENT` 的一次假判定**。
`AC_PRESENT` 是**带阈值 + 去抖窗口的比较器输出**，不是导线通断 ⇒「一直插着电」与「EC 认为 AC 掉过再回来」可同时为真；关机后负载骤降 → 适配器电压漂移 → 假边沿 → 执行 Power On。**13~21 秒 = 适配器空载稳定 + 去抖窗口的时间尺度**，不是"等唤醒源"。
不可解的硬冲突：`Power On` 的判据就是"AC 出现 0→1 边沿"，而远程开机（断电→通电）与关机后假边沿**是同一信号**，信号层不可区分；`Last State` 也不能用（远程开机时本就在 S5）。

**D8 · 双机分工已反转：笔记本不跑 dsh。**
2026-09-04 起「本机跑 dsh + 主力机 gate」的旧架构废弃，所有 pro/dsh 调用转发主力机（现行 `dsh-remote` 系列）。**记忆里旧的 `dsh-gate` 铁律文件仍留着"铁律一 / 铁律二"，读它之前必须先读文件头的作废声明。**

---

## M 机制

### M1 为什么"给了 M 权限还写不了"：Windows 的两个独立闸门

写文件要通过两道判定，顺序是固定的：

```
① Mandatory Integrity Control（IL）：no-write-up —— 低 IL 不能写更高 IL 的对象
② ACL（DACL）：用户/组是否被授予写权限
```

`danger-full-access` 改的是"沙箱策略"这一层（Linux 上映射成 landlock），**在 Windows 上不落到 IL**。所以进程仍是 Low，而 `D:\` 是 Medium ⇒ 在 ① 就被拦，② 根本没被检查。
**推论**：任何"把 ACL 放宽"的尝试都无效；正确操作是**降低对象的 IL**（让 ① 通过）。

### M2 为什么 junction 让"桌面"变成"D 盘"

`C:\Users\27063\Desktop` 的 reparse point 指向 `D:\Desktop`（`dir /AL` 可查）。
IL / ACL 判定发生在**目标对象**上，不在路径字符串上 ⇒ 所有"桌面路径"的读写实际都在 D 盘上被判。
**推论**：桌面路径的写入失败，判据要落在 `D:\Desktop`，而不是 `C:\Users\27063`。

### M3 为什么 WDAC 能压过 ExecutionPolicy

`Get-ExecutionPolicy -List` 显示 CurrentUser RemoteSigned、LocalMachine Unrestricted、无 GPO —— 全都不该拦本地文件。但 5.1 仍拒。
因为 5.1 的 `SystemPolicy.GetLockdownPolicy()` 会先看 **WDAC 的 script enforcement**（`CiPolicies\Active` + `CodeIntegrityPolicyEnforcementStatus=2`），一旦判 Enforce，就**跳过** RemoteSigned 对"本地文件免签"的豁免。
**推论**：这不是"策略没配对"，而是"另一个机制先说了话"；`LanguageMode` 仍是 FullLanguage 也印证了这一点（强制签名 ≠ 受限语言模式）。

### M4 为什么读任务 XML 比查任务服务可靠

任务服务（`schtasks` / CIM）在本机非提权会失败（`0x80070003`），而任务定义是**磁盘上的文件** `C:\Windows\System32\Tasks\<name>`（UTF-16）。
目录列举被 ACL 拒，但**按已知文件名打开**是允许的。
**推论**：只要知道任务名，就能不依赖任何服务读到 trigger / action / principal 的真值 —— 这比"猜服务为什么坏"便宜得多。

### M5 pwsh 常驻化的成本分解

一次 cold tool-call 的 677 ms 由三部分组成：

```
677 ms = 209 ms（pwsh -NoProfile 启动）
       + 468 ms（dsh-tool-pwsh 的 bash executor seam 开销）
       + ~0    （实际命令）
```

常驻化消除的是前两项的**重复支付**，不是让命令变快。
**推论**：同类收益（每 agent 一个常驻 worker）在任何"每次都要跨进程边界"的工具上都成立 —— 这是 11 篇「提效优先级 ③ 长驻 worker」的实证来源。

### M6 AC 假边沿的物理机制

`Power On after AC Loss` 的判据是 `AC_PRESENT` 的 0→1 边沿。`AC_PRESENT` 由 EC 用**比较器 + 阈值 + 去抖窗口**给出：
- 关机瞬间负载骤降 → 适配器输出空载电压上漂 → 比较器在阈值附近抖动；
- 去抖窗口（十几秒量级）结束后若判成"AC 重新出现"，即执行 Power On。
**推论**：这是**信号层**的不可区分性，不是配置错误 ⇒ 只能从 OS 侧自愈（见 R5），不能靠换 BIOS 选项两全。

---

## J 判据

| 症状 | 先查 | 判据 |
|---|---|---|
| 写文件 `PermissionError` / `Access denied`，但 ACL 有 M | IL | `cmd //c "whoami /groups" \| findstr S-1-16` → 出现 `S-1-16-4096` 即 Low |
| 想知道某目录是否已降 IL | label | `icacls "<dir>" \| findstr /i Label` → `Low Mandatory Level` 才对 |
| 桌面路径写不进 | junction | `cmd //c "dir /AL C:\Users\27063" \| findstr /i desktop` → 看它指向哪个盘 |
| `.ps1` 报 `is not digitally signed` | shell 版本 | `$PSVersionTable.PSVersion` → 5.1 就是它；换 pwsh 7 |
| `schtasks` 报 `cannot find the path` | 别修它 | 提权后直接 `cat C:\Windows\System32\Tasks\<name>` |
| 任务"在跑但没效果" | Last Result | `Get-ScheduledTaskInfo` 或 `TaskScheduler/Operational` 事件日志（`Last Run Time` 对 LogonTrigger 不可信） |
| 关机后又自己开机 | 时间差 | 本次 boot 时间 − 最近 `Kernel-Power 109` 时间 < 60 s，且 BootType = `0x0` |
| pwsh 行为"串味" | 是否有状态 | 连续两次 `$PID` 相同即常驻；`$env:` 会累积 |

**写测试永远比读配置可靠：**

```bash
timeout 20 python -c "open(r'<目标路径>/_wtest','w').write('x')" && echo WRITABLE
```

---

## X 反例

**X1 · 以为 `danger-full-access` 能解除 Windows 写限制。** 配置确实生效（dump 可见），进程仍是 Low。**重启 dsh 也不解决** —— 这是 IL 层，不是策略层。

**X2 · 以为"桌面"是 C 盘特权目录。** 桌面只是 junction；真正的对象在 D 盘。判据要落在目标盘上。

**X3 · 用 `icacls /T` 递归降 IL。** 会遍历整棵目录树（课程文件、node_modules）—— 违反"命令必限时"，且无法预估耗时。只对目录本身设，让继承去传播。

**X4 · 改 ExecutionPolicy 去修 5.1 的签名报错。** 无效：拦它的是 WDAC script enforcement，`RemoteSigned` / `AllSigned` 都过不去，只有 `Bypass` 能过 —— 而"到处加 Bypass"是把问题藏起来。正解是 pwsh 7。

**X5 · 用 `schtasks` / `Get-ScheduledTask` 查任务然后debug任务本身。** 本机非提权这两个都坏（`0x80070003` / `cannot find the path`），会把"工具坏了"误判成"任务不存在"。先读 XML。

**X6 · 相信 `Last Run Time`。** 对 LogonTrigger 任务不可信；而且"任务在运行 + Last Result 说得过去"完全可能与"脚本根本没执行"共存（备份链静默断链就是这么来的，见 08 篇）。

**X7 · 把 pwsh 当无状态工具用。** 常驻化后 `cd` 不回到 home、`$env:` 会残留；脚本里必须显式设定工作目录与环境，不能依赖"上次会不会留"。

**X8 · 为了"更快"把 `timeoutMs` 调小。** 工具级超时是 `Reset, never repair`：shell 被关掉、状态全丢，下一次调用重新付 1134 ms 预热。要在命令内部用 `timeout`（子进程级）控制时长。

**X9 · 靠"关掉安全软件面板"来排除它。** 面板关闭 ≠ 驱动卸载 ≠ DLL 不再注入（04 篇有完整证据：`dtrampo.dll` 仍注入 5 个 explorer 进程）。判据要用进程内模块与服务状态。

**X10 · 读旧的双机铁律就照做。** `dsh-gate-双机路由铁律.md` 头部已标「已被 2026-09-04 架构取代」；照做会把任务发到不该发的机器上。**读任何 fact 先看有没有作废声明。**

---

## R 复现

**R1 诊断当前 IL 与 junction：**

```bash
timeout 20 cmd //c "whoami /groups | findstr S-1-16"
timeout 20 cmd //c "dir /AL C:\Users\27063 | findstr /i desktop"
```

**R2 降 IL（UAC 提权，一次一个目录）：**

```powershell
Start-Process icacls.exe -Verb RunAs -Wait -ArgumentList @('D:\目标目录','/setintegritylevel','(OI)(CI)Low')
# 验证
timeout 20 cmd //c "icacls D:\目标目录 | findstr /i Label"
timeout 20 python -c "open(r'D:/目标目录/_wtest','w').write('x')" && echo OK
```

**R3 读计划任务真值（不依赖 schtasks）：**

```bash
timeout 20 python -c "
import io
p=r'C:\Windows\System32\Tasks\ReasonixGitHubBackup'
print(io.open(p,encoding='utf-16',errors='replace').read()[:2000])
"
```

**R4 判定 5.1 vs 7 的实际生效版本（注意两种入口）：**
**R4 判定 5.1 vs 7 的实际生效版本（两种入口不同）：**

```bash
timeout 20 pwsh -NoProfile -Command '$PSVersionTable.PSVersion.ToString()'
timeout 20 cmd //c "where powershell"
timeout 20 cmd //c "reg query \"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\powershell.exe\""
```

- `ShellExecute` 入口（Win+R / 开始菜单 / 资源管理器）查 **App Paths**，HKCU 优先于 HKLM ⇒ 得到 7.6.8；
- `PATH` 入口（cmd 内输入 `powershell`、`Start-Process powershell`）仍命中 `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`（5.1）。
- 覆盖 ② 要改系统 PATH，代价大于收益 —— **兜底是在 5.1 里用 `dsh.cmd`**（npm 的 cmd shim，不经 `.ps1`）。

**R5 假自启自愈（wake-guard）：**

```
脚本   C:\Users\27063\.dsh\storages\tools\wake-guard.ps1
安装   C:\Users\27063\.dsh\storages\tools\wake-guard-setup.ps1
任务   WakeGuard（AtStartup + Delay=PT20S + SYSTEM/Highest + ExecutionTimeLimit=5min）
日志   C:\Users\27063\.dsh\logs\wake-guard.log（安装日志 wake-guard-setup.log）
逻辑   开机读最近一条 Kernel-Power 109；若 boot − 109 < 60s → 判假自启 → shutdown /s /t 0 /f
保护   1 小时内最多处理 3 次（防无限开关机）；事件日志就绪重试 ≤120s
参数   -DryRun / -GraceSeconds / -ThresholdSeconds
回滚   schtasks /delete /tn WakeGuard /f
```

**R6 计划任务排障顺序（勿跳）：**

```
1) 提权读 XML          —— 任务是否存在、trigger/action/principal 是什么
2) Get-ScheduledTaskInfo —— Last Result / Last Run
3) TaskScheduler/Operational 事件日志 —— 有没有"启动失败 / 找不到文件"
4) 脚本日志末行时间    —— 脚本到底有没有被执行
```

顺序的理由：①② 区分"没装 / 装了没跑 / 跑了失败"，③④ 才定位失败原因；反过来先怀疑脚本，会在服务层坏掉时白绕一圈。

---

## S 溯源

- `dsh-sandbox-windows-写限制与danger-full-access.md`（Low IL 的第一手结论 + icacls 解法）
- `dsh-desktop-requires-no-sandbox.md`、`dsh-desktop-app-status-breakpoint-nosandbox-20261004.md`
- `dsh-web-3080-logon-task-disabled-20261006.md`（`schtasks` 坏掉 + 直接读 XML 的手法）
- `autostart-verification-method-20260928.md`（`Last Run Time` 不可信、logon 触发未实测）
- `dsh-pwsh-常驻化-p1.md`（3.59× 与 seam 成本分解）
- `ds-harness-remote-installed-20260928.md`、`dsh-gate-双机路由铁律.md`（已作废，仅溯源）、`dsh-dual-machine-sync-migration-20260930.md`、`dual-machine-sync-convergence-pitfalls-20261001.md`
- `dev-sidecar-ca-installed.md`、`dev-sidecar-覆盖-gitconfig-与-npmrc-URL级配置绕过-20260927.md`、`github-加速体系与镜像自动选优-20260927.md`
- `gitbash-schtasks-arg-conversion.md`、`gitbash-wc-m-is-bytes.md`
- `~/.dsh/PLAN.md`：「关机后 13~21 秒自己冷启动 = BIOS AC 假边沿（2026-10-25）」「终端环境定论：5.1 全盘失效 → 交互式 shell 迁到 pwsh 7（2026-10-24）」「Linux→Windows dsh 远程化（2026-10-23）」

---

## 存疑

1. **Low IL 的"来源"未确证**：「`danger-full-access` 不解除 IL」是实测事实，但**谁把进程降成 Low** 没有确证答案。09 与 04 两篇都只能给出"火绒已排除、`aTrust`（深信服）高嫌疑但无直接证据"。
2. **是否存在让 tool 进程跑 Medium IL 的受支持开关**：未找到；目前唯一可行路径是"降目标目录的 IL"。
3. **logon 触发从未被真实开机验证**（需一次整机重启配合）：开机自启这条严格说是"实现正确 + 手动触发验证过"。
4. **`WakeGuard` 的实战验证尚未发生**：只在 `-DryRun` 与手动触发下通过。
5. 两次 `Kernel-Power 41`（`0xEF` CRITICAL_PROCESS_DIED / `0x154` UNEXPECTED_STORE_EXCEPTION，`PowerButtonTimestamp=0`）是**独立问题**，与假边沿无关，未查。
