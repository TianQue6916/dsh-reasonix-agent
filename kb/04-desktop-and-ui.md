# 04 · 桌面端与 UI 层

> 桌面端（Electron）的 renderer 加载什么、白屏怎么取证、图标为什么白、开机为什么自己亮 —— 全部收敛到三条硬边界：**asar 是产物不是源码树**、**mandatory label 是 UI 可见性的上游**、**shell 的窗口状态只能靠现场测量不能靠 API 返回值推断**。

## D 定论

- **D1｜renderer 加载的不是 node_modules 那份 core bundle。** desktop App 的 core root = `app.asar/dsh`；host 进程 commandline 逐字为
  `"…\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\index.js" "…\resources\app.asar\dsh"`。
  Node 解析规则下引用者位于 `app.asar/dsh/node_modules/@deepseek-ai/dsh-agent-loop/lib/`，向上半步即命中 `app.asar/dsh/node_modules/`，**永不走到 `~/.dsh/profiles/node_modules/`** ⇒ 打在磁盘 node_modules 上的 patch 对 desktop 的 core 无效。
- **D2｜但插件层（`dsh-client-ui-*` 这批）走运行时 bundle，真源是 npm 全局树。** crash log 里的 bundle URL 形如
  `dsh-app://app/plugins/??@deepseek-ai/dsh-client-ui-chat/client.js&rev=572d90f59a46:…`，解析链
  `~/.dsh/profiles/node_modules/@deepseek-ai/<pkg>/lib/client.js` → symlink → `%APPDATA%/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/<pkg>/lib/client.js`
  ⇒ 改全局 npm 那份 = 同时影响 web 与 desktop，重启 App 即生效（`rev=` 会变）。**两条路径并存，别一刀切。**
- **D3｜asar 内的同名文件是内嵌 runtime，不是 renderer 加载的那份。** `app.asar` 里确有 `/dsh/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js`（565,053 B），但同一 URL 取回的活体 bundle 是 **565,106 B / `source.kind`=7 / guarded=1**，磁盘版是 **565,462 B / raw=0 / guarded=8** ⇒ 12:42 打在 node_modules 上的 13 处 guard 对 App 完全无效，而 asar 版才是活体。
- **D4｜改 asar 只能整体重建，不能等长替换。** 三条硬约束：① 补丁非等长（565,053 → 565,455，+402 B）；② entry 带 `integrity`（`SHA256` + `blockSize: 4194304` + `blocks[]`），内容变了 hash 就不匹配；③ `app.asar.unpacked/` 的语义由 header 的 `unpacked: true` 决定，**不是「目录里有同名文件就优先」**，`client.js` 无该标记 ⇒ 放进去不被读。
- **D5｜`app.asar` 被运行中的 App 锁住**（`File.Open(...,'ReadWrite','None')` → "being used by another process"）⇒ 替换必须在 App 退出时做。可行做法 = append 式重建：新内容追加到 data 区末尾、只改各自 `offset`/`size`（offset 相对 data 区 ⇒ 其余 12,963 个节点不动），121,348,951 → 123,195,923 B。
- **D6｜本机 desktop 必须带 `--no-sandbox`。** 不带 ⇒ 立即退出，`ExitCode = -2147483645` = `0x80000003` `STATUS_BREAKPOINT`（Chromium `CHECK` 失败路径 `base::debug::BreakDebugger()` 打 `int3`），进程数 0。崩溃点在**最底层 sandbox 初始化（C++）**，早于 `lib/main.js` @281631 的 `claimDesktopSingleInstance()` ⇒ `requestSingleInstanceLock()` 到不了 ⇒ 「已有实例在跑时点图标也不激活窗口」。与同一台机 Edge 154 的 CDP 结论同源（非 admin 账户下 Chromium 系 sandbox 起不来）。
- **D7｜`--no-sandbox` 要补三处快捷方式，缺一不可。** 任务栏 pin / 桌面 `工具箱\` / 开始菜单；2026-10-04 只修了开始菜单那个、漏 pin ⇒ 症状持续两天。**NSIS 更新会重建快捷方式、参数丢失 ⇒ 每次更新/重装/重新 pin 后必须重跑修复脚本。**
- **D8｜Node 的硬门槛是 20.12，不是「平台不支持」。** `@deepseek-ai/dsh-app-boot/lib/index.js` 第 4 行 `import { inspect, parseEnv } from "node:util"`，`parseEnv` 是 Node 20.12+ 才有；在 v18.19.1 上直接 `SyntaxError: The requested module 'node:util' does not provide an export named 'parseEnv'`。49 个依赖声明 `engines: node >=20` / `>= 20.19.0`（`readdirp@5.1.1`），但 npm 只 `WARN EBADENGINE` 不拦 ⇒ **`npm install` EXIT=0、装得像成功、一跑就炸在第一个 import**。desktop 用 Electron 内嵌 Node，不受系统 node 影响；web/profile 侧受影响。
- **D9｜「白纸图标」的最终根因 = profile 树的 `Mandatory Label\Low Mandatory Level`，不是 cache 损坏。** 决定性实验（同目录 / 同内容 / 同 DACL / 全新文件名）：`t5c.lnk` 设 `setintegritylevel Medium` → `idx=50 nongray=511` **彩**；`t5d.lnk` 设 `Low` → `idx=0 nongray=48` **白**。唯一变量 = mandatory label，可逆可控。
- **D10｜根因可端到端根治**：`icacls C:\Users\27063\acltest /setintegritylevel "(OI)(CI)Medium" /T /C`（10 files，**无需 admin**）之后，同一路径同一文件 `t0.lnk` 由 `idx=0/48` → `idx=50/511`。
- **D11｜触发点在「读 lnk 自身 / 读显式 `IconLocation` 指向的文件」，不在解析 target。** lnk 放 `D:\`、target 指向 C 树内 Low IL 文件 → 仍 `idx=50`（能取到图标）。DACL 明明允许读（`天阙九泉\27063:(F)`）⇒ **不是权限拒绝**；给 Low IL 文件加 `Everyone` / `INTERACTIVE` / `ALL APPLICATION PACKAGES` 全部无效。
- **D12｜`explorer.exe` 从头到尾没有死过。** `pid=7724`（`ppid=14056`，start 00:14:51）始终存活，`Responding=True / Threads=141 / Handles=6563`，窗口枚举有 `Progman` + 2×`CabinetWClass`。`AutoRestartShell=1` ⇒ 强杀后 Winlogon 在 **79 ms** 内拉起新 shell（pid 3568 @00:11:02 → 7724 @00:14:51.346）。
- **D13｜`SHGetFileInfo` / `IShellItemImageFactory` 不能作为「图标是否正常」的判据。** 在**已恢复**的当前状态下二者依然对部分 lnk 返回 `iIcon=0` / 纯白（`IShellItemImageFactory: lum≈235.1 sat≈0.6`；`SHGetFileInfo: lum≈228.7 sat≈3.6 ink=118`），而 explorer 实际渲染是彩色。`iIcon=0` 只是该进程内 shell 的「未解析」哨兵值。**唯一可信判据 = explorer 的实际渲染（截屏）。**
- **D14｜关机后 13~21 秒自己冷启动 = BIOS `Power On after AC Loss` + EC 对 `AC_PRESENT` 的一次假边沿。** 60 天日志 26 次「109 Shutdown Off + 6006 → 13~33 秒后冷启动」，BootType 全 `0x0`（完整 POST，非 S4/S0ix 恢复），概率 ≈26/74≈35%，延迟中位数 17 秒；08-28 / 09-11 / 09-25 各出现「关机→自启→再关→再自启」连发 3 次。
- **D15｜桌面版不依赖 3080，但两者共用同一份 session。** `grep 3080 ~/.dsh/profiles/desktop/` 零命中；但 desktop 与 web 共用 `DSH_HOME=~/.dsh` 与同一份 `~/.dsh/sessions/<cwd>/session-<uuid>/session.v4.jsonl.zstd`，**无跨进程锁** ⇒ 同开一个 workspace 会互相追加、互相踩。`launch-dsh.ps1` 的幂等只防 web↔web。
- **D16｜`--profile desktop` 被硬拦。** `dsh --profile desktop --dump-config` → `error: profile "desktop" is managed exclusively by the Electron application`（`lib/bin.js:36`）⇒ desktop 侧只能靠**重启后行为验收**，没有 dump/plugin 子命令可用。
- **D17｜desktop 只在缺失时创建配置模板，绝不覆盖。** 首次启动生成 `package.json` / `cordis.patch.yml` / `cordis.yml` / `pnpm-workspace.yaml`；手工改过后重启 md5 逐一不变（`package.json` 439cbd0f… / `cordis.patch.yml` ea32d122… / `compatibility.json` 3032af33…）⇒ 从 `profiles/web` 移植配置安全。移植时**必须保留** `ui-settings-account` 的 `step: done` / `completion: api-key`（桌面端「首次引导已完成」状态位，覆盖会重跑引导）。
- **D18｜`platform: "web"` 不等于「只能跑在 web profile」。** `@local/dsh-thinking-language` 用 `dsh.client.inject: ["slots"]` + `platform: "web"` 注册 `settings.section` slot，桌面端同样加载（Settings → 思考语言 页正常出现）。
- **D19｜tray / 关窗行为**：官方 README 事实 = `appId com.deepseek.harness`、默认端口 **19387**（Web 是 3080）、Windows NSIS + 代码签名 + `electron-updater`、**托盘常驻、关窗后台续跑**、内嵌 Platform（账号/额度/引导）。⇒ 关窗不等于退出，改配置/换 asar 必须显式 `Stop-Process -Name 'DeepSeek Harness' -Force`。

## M 机制

**M1｜asar 容器格式**（写重建工具时的唯一依据）
```
[u32=4][u32 headerSize][u32 jsonLen+4][u32 jsonLen][JSON 目录表 + pad4][data 区]
dataStart      = 8 + headerSize
entry 绝对 offset = dataStart + entry.offset      # entry.offset 相对 data 区
```
JSON 起点 = offset 16，必须用 `json.JSONDecoder().raw_decode(...)`（`json.loads` 报 `Extra data`）。entry 带 `integrity: {"algorithm":"SHA256","hash":"…","blockSize":4194304,"blocks":[…]}`；`DeepSeek Harness.exe` 内 `ELECTRONASAR` 0 命中 ⇒ **未启用 embedded asar integrity 校验**（Electron 44.0.0）。

**M2｜bundle `rev` 是 stat 哈希，不是内容哈希。**
```
dsh-client-modules/lib/index.js:
artifactRevision(baseline) = framedHash("plugin-artifact", [String(mtimeMs), String(ctimeMs), String(size)])
comboSearch(ids, rev)      = "??" + ids.map(id => id + "/client.js").join(",") + "&rev=" + rev
```
baseline 由 `statSync(clientPath)` 得来 ⇒ **只 touch 不改内容也会换 rev**；反过来，asar 内同名文件改了也不影响这条 URL。

**M3｜renderer 崩溃被 slot 边界吃掉，表现为「全黑」而不是报错。** `ChatView` 在 render 期 useMemo 里无条件读 `message.source.kind`：
```js
const inboxSteering = react.useMemo(() => inbox?.["next-step"].filter((m) => m.source.kind === "user") ?? [], [inbox]);
```
收到一条 `source: null` 的 inbox 消息即抛 `TypeError: Cannot read properties of null (reading 'kind')` ⇒ `dsh-client-ui-renderer/lib/client.js:618` 的 `SlotErrorBoundary` 隔离该 entry、`render()` 返回空 `<div data-slot-error="conversation.view">` ⇒ 用户看到全黑，而 tabs（对话/轨迹/版本/上下文/Replay）仍在。

**M4｜Low IL 为什么吃掉图标（行为已铁证，机制为高置信假说）。** Low IL 是 Windows 的「不受信任内容」标记（与 IE Protected Mode 临时文件同类）。shell 的图标提取对位于 Low IL 位置的文件**跳过内容解析**，直接退化返回空白文档图标 `iIcon=0`。当前 profile ACL：`C:\Users\27063` 无任何 `(I)` 继承标记 + `Everyone:(CI)(DENY)(DC)` + 未知 SID `S-1-4-1049387402-452331294:(OI)(CI)(W,D,DC)` + `Mandatory Label\Low Mandatory Level:(OI)(CI)(NW)`；`(OI)(CI)` 继承到每个子对象，**连 `NTUSER.DAT` 都是 Low IL**；另有 `S-1-15-3-65536-…` 形式的自定义 capability SID（`C:\Users` 与 profile 上各一条）。对照（全部无 mandatory label）：`C:\Users\Public` / `C:\ProgramData` / `C:\Windows\Temp` / `D:\` / `D:\Desktop` / `D:\ExplorerData` / `C:\Users\admin|dev|runner|Default` ⇒ **另一个账户不会白纸**（问题只在本账户 profile 被打标）。

**M5｜iconcache 是二进制 mmap 常驻的惰性结构。** 24 B 快照 ≠ 写入失败（随后 32/48/256 都涨到 1 MB）；被 mmap 常驻时 Windows **不更新 LastWriteTime**（判写入只能解析文件头 `used` 字段，`mtime 冻结在 22:51:04` 不能推断「没写入」）；被 mmap 的文件允许 `O_RDWR` 打开但**拒绝截断写入**（`winerror 1224`）；锁屏时 explorer 会释放 mmap，之后又重新持有。`ie4uinit -ClearIconCache` 只能清老格式 `IconCache.db` 和改写 `iconcache_idx.db`，**动不了 `iconcache_16/32/48/256.db`**。

**M6｜BIOS 侧的时间尺度。** 13~21 秒 = 适配器空载稳定 + 去抖窗口的时间尺度（关机后负载骤降 → 适配器电压漂移 → 假边沿 → 执行 Power On），不是「等唤醒源」。`AC_PRESENT` = 带阈值 + 去抖的比较器输出 ⇒ 物理上「一直插着电」与逻辑上「EC 认为 AC 掉过再回来」可同时为真；且假边沿与真实「断电→通电」（远程开机判据）在信号层不可区分 ⇒ **单个 BIOS 选项无法两全**，`Last State` 也不能用（远程开机时机器本就在 S5）。

**M7｜状态栏 / 标题的刷新链路。** Reasonix CLI 的 `config.toml` `[statusline] command` 注释写的是「first stdout line **replaces the built-in data row**」，stdin 收 `{"model","contextUsed","contextWindow","cwd"}`；**桌面版状态栏是固定 16 项、无自定义插槽** ⇒ 只能改窗口标题（`D:\Toolbox\goat-gateway\goat-title.ps1` 每 20 s 拉 `127.0.0.1:8790/quota`，user32 `SetWindowText` 写标题，格式 `Reasonix  —  GOAT 5h 2%  周 65%  月 56%`；计划任务 `GoatTitle` = AtLogOn + `run-hidden.vbs` 隐藏宿主 + `ExecutionTimeLimit=0`，不改 Reasonix 任何文件）。

**M8｜状态栏「看起来不刷新」是重渲染绑在会话事件上。** 后端拉 `/balance` 中位间隔 **51 秒**（`logs\balance-hits.log` 30 条：<30s 占 1/3、30–90s 占 1/4、>180s 占 1/3）⇒ 数据不旧；但界面值随 `o.statusBarVisible ? {...}` 一起从会话状态给（`assets/AppRuntimeView-*.js`，442 KB）⇒ 不触发会话事件就不重绘，`config.toml` 改不了。

**M9｜额度面板的三处时间都是滚动窗口 resetAt，不是固定时刻。** 163：`fiveHourReset` = 09-25 22:45、`weeklyReset` = 09-27 07:53（= 09-20 07:53 起算 7 天）；qq：5h 09-25 22:37、周 09-30 15:46（两账号窗口起点不同 ⇒ 重置时刻天然不同）。「余」按显示口径算 `round(月上限) − 月已用`，否则与统一显示的 70 差 0.02。

## J 判据

| 现象 | 判据 | 期望值 |
|---|---|---|
| desktop 起不来 / 点图标没反应 | `Start-Process $exe -Wait` 的退出码 | `-2147483645`（`0x80000003`）= 缺 `--no-sandbox` |
| desktop 正常 | 进程数 + `MainWindowTitle` | 6 进程（main + gpu + renderer×N）；title **约 35 s** 后才非空（20 s 查是空的） |
| renderer 读的是哪份 bundle | 活体 URL 取回 vs 磁盘文件大小 / guarded 数 | asar 版 565,106 B guarded=1；磁盘版 565,462 B guarded=8 |
| 「对话」tab 为什么全黑 | `%APPDATA%/@deepseek-ai/dsh-desktop/logs/crash-*-renderer.log` | `slot entry crashed in 'conversation.view': TypeError: Cannot read properties of null (reading 'kind')` |
| 前端 bug 而不是后端 | 有 `crash-*-renderer.log` 且 session JSONL 零损坏 | 是；反过来 502 场景是每条消息 `502 preflight_compress_failed` + **35,355 行 JSONL JSON 零损坏** |
| IPC / host 侧断了 | 同 logs 目录的 `crash-*-host.log`（现存 16,044 / 1,214 B） | 与 renderer crash 分文件，别混读 |
| 白纸图标（病因） | 同目录同内容同 DACL 的唯一变量实验：`setintegritylevel Medium` vs `Low` | Medium `idx=50 nongray=511`；Low `idx=0 nongray=48` |
| 白纸图标（现状） | **只看 explorer 实际渲染（截屏）** | 彩色 = 正常；两个 shell API 都会误报 |
| 进程到底在不在 | `Get-CimInstance Win32_Process` + 窗口枚举（`Shell_TrayWnd`/`Progman` 的 pid） | 禁用 `Get-Process <name>`（本机假阴性） |
| 是不是真的重启过 | `(Get-CimInstance Win32_OperatingSystem).LastBootUpTime` vs `Win32_LogonSession -Filter 'LogonType=2'` 最新 StartTime | 2026-09-28 实例：Boot 09/26 11:26:32 / Logon 09/26 11:26:54 → **用户只重启了应用**，所有 logon-triggered 自启都没机会跑 |
| 谁启动的进程 | 父链 `Get-CimInstance Win32_Process -Filter 'ProcessId=<ppid>'` | 父 = `explorer.exe` ⇒ 手动；`svchost.exe`/`powershell.exe` ⇒ task |
| 3080 是谁拉起的 | 直读 UTF-16 的 `C:\Windows\System32\Tasks\dsh-web-3080` | `LogonTrigger` + `<Delay>PT20S</Delay>` + `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "…\launch-dsh.ps1" -Mode Serve`；Principal `InteractiveToken` / `LeastPrivilege` |
| 写不进 D 盘 | `/c/Windows/System32/whoami.exe /groups | grep "S-1-16"` | `Mandatory Label\Low Mandatory Level … S-1-16-4096` ⇒ 与 `sandbox-policy.mode` 无关 |

```bash
# 活体 bundle 判据：token 从 host-stdio.log 取，别用 sort -u（字典序拿不到最新）
timeout 30 awk '/\[tee\] installed/{n=NR}{a[NR]=$0}END{for(i=n;i<=NR;i++)print a[i]}' ~/.dsh/logs/host-stdio.log \
  | grep -a -o -E 'token=[A-Za-z0-9_-]{16,}' | tail -1
timeout 30 curl -c jar -b jar "http://127.0.0.1:19387/?token=$TOK"     # 303 + dsh-auth-* cookie
timeout 30 curl --path-as-is --globoff -b jar \
  "http://127.0.0.1:19387/plugins/??@deepseek-ai/dsh-client-ui-chat/client.js&rev=572d90f59a46"
  # 必须 --path-as-is + --globoff；rev 不对就 404
```

```bash
# 桌面端启动验收（唯一权威）
timeout 60 powershell -NoProfile -Command "
  \$exe='C:\Users\27063\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe'
  \$p=Start-Process \$exe -ArgumentList '--no-sandbox' -PassThru; Start-Sleep 35
  \$p.HasExited; (Get-Process -Id \$p.Id).MainWindowTitle"
```

## X 反例

**X1｜「改 node_modules 就该对 desktop 生效」→ 错。** core 包（token-meter / agent-loop 一类）从 `app.asar/dsh/node_modules/` 解析，磁盘 patch 完全无效（活体 bundle 字节数证据见 D3）。反方向也错：插件层 core client 只打 asar、指望 node_modules 那份先被读，同样不成立。

**X2｜「两个 API 都白，所以图标坏了」→ 错，而且这是本事件最贵的一条。** 先误判成「iconcache 写入坏了」，后来发现两条 API 的分歧本身就是假信号；更致命的是**在已恢复状态下两者依然白** ⇒ 根本不能作判据（D13）。连带一条：`SHGetFileInfo` 的 `hIcon != 0` 只说明「有图标」，不说明内容对 —— 必须把 HICON 画到 DIB 量 `lum/sat/opaque/distinct/ink/inkfrac`（`ink` = 亮度<200 的像素数，用来区分「白纸带折角/箭头」与「纯白方块」）。

**X3｜「`idx=0` 都是白纸」→ 错。** `idx=0` 的白纸与 generic 文档图标（`imageres.dll`）同形；`Recent\` 里 18 个 lnk 有 17 个是这种白纸，因为**目标已被删除** ⇒ 在那里的白纸是正常的。

**X4｜「explorer 杀不掉 / 被火绒回滚」→ 错。** 真相是 `AutoRestartShell=1`，Winlogon 79 ms 内自动拉起（D12）。据此我曾执行 `clean.py` 删 iconcache —— **那次 kill 其实是空转**（进程列表为空，`ForEach Kill()` 一个没杀到），但**删除动作真的执行了**，造成自伤（iconcache 回滚 30/31，剩 `thumbcache_idx.db` 被占用）。

**X5｜「火绒是元凶」→ 未证实，且用户「关闭火绒后无效」只是关了面板。** `dtrampo.dll`（`C:/Windows/System32/dtrampo.dll`，213,664 B，sig Valid）注入全部 5 个 explorer 进程、`HipsDaemon`/`HRWSCCtrl`/`HipsTray` Running、`hrdevmon`(Boot)/`hrndis6`(System)/`hrwfpdrv`(Auto)/`sysdiag`(System) 四驱动 Running 都属实，但**新 explorer 未加载 `dtrampo.dll`** ⇒ 用户态注入已排除；火绒 `hips.db` 的 `HipsUser_60`/`HipsUserAuto_60` 都是 0 行、`HrLogV3_60` 159 条无一与图标/D 盘写入相关。

**X6｜「ACL 拦截 iconcache 写入」→ 错。** `%LOCALAPPDATA%\Microsoft\Windows\Explorer` 的 `Everyone:(DC)` DENY 是继承来的默认 ACE，同目录另有 `S-1-4-1049387402-452331294` Allow `Write/Delete`，且 explorer 在 23:38:08 / 23:42:29 确实在写该目录（`ExplorerStartupLog_RunOnce.etl` / `RecommendationsFilterList.json`）。**注意区分**：此前「否证 ACL」只排除了 DACL，真凶在 SACL 的 mandatory label。

**X7｜「HKCU 遮蔽 lnkfile」→ 错。** `HKCU\Software\Classes\lnkfile` 只含 `ContextMenuHandlers`（WPS/qingshellext），**不含 `IconHandler`**；HKCR 逐键合并，`shellex\IconHandler` 仍来自 HKLM。

**X8｜「组件版本错配 / 更新坏了」→ 一度成立但不是根因。** `BuildLabEx=26100.1` ⇒ 26H2 是 enablement package，全部组件 26100.x 属正常；`explorer.exe`=26100.8875 与 `shell32.dll`/`ntdll.dll`=26100.9549 不同步只是 pending update 的表征（`CBS` 有 `InstallPending 0x70` + `RebootPending=True`）。10-05 曾把它当作「真正的上游原因」，10-06 的 Low IL 对照实验才是定论。

**X9｜「清 iconcache 刷新图标」→ 危险，别照搬社区。** `alsvike/windows-icon-refresher` 一类方案都是「清 cache + 重启 explorer」，但本机问题是 **cache 清掉后必须靠实时提取重建，而那条路对 Low IL 下的 `.lnk` 是坏的** ⇒ 清了回不来。

**X10｜「自启没生效 = 脚本有 bug」→ 常见误判。** 用户说「我重启了」时先证明确实发生过 logon（J 表第 10 行），否则所有 logon-triggered 机制根本没机会跑；2026-09-28 就据此误判过 `ollama-serve.vbs` 有 bug（手动 `wscript` 一跑就成功）。

**X11｜「`Start-Process <.lnk>` 弹安全警告 = 故障一部分」→ 不是。** 那是 Attachment Manager 对**非 explorer 发起**的 .lnk 启动的确认；三处 .lnk 的 ADS 都只有 `:$DATA`，无 MOTW。验应用要**直接启动 exe 加参数**。

**X12｜「asar 里也有一份同名 client.js，所以打 asar 就够了」/「`@mingozhou/dsh-replay` 注释说桌面端前端资源全在 asar 内」→ 只对部分资源成立。** `dsh-client-ui-*` 走 `dsh-app://app/plugins/` 运行时 bundle，读 node_modules（D2）。

## R 复现

**R1｜白屏 → 定性（10 分钟）**
1. `timeout 30 ls -la "/c/Users/27063/AppData/Roaming/@deepseek-ai/dsh-desktop/logs/"` —— 有 `crash-*-renderer.log` 且含 `slot entry crashed in 'conversation.view'` ⇒ 前端 bug，不是后端。
2. 没有 renderer crash 但有 `crash-*-host.log`、或每条消息 502 `preflight_compress_failed` ⇒ 走 host / 压缩 lane 分支（后者先查 `session.v4.jsonl` 是否损坏：35,355 行零损坏 = 会话本体没坏，坏的是压缩判定）。
3. guard 修补：`node ~/.dsh/storages/tools/patch-dsh-null-source-guard.mjs --check|--apply|--verify|--restore`（幂等判据：结果里 `source?.kind` 不含子串 `source.kind`），共 13 处 —— `dsh-client-ui-chat` 8（`:5084 :5187 :5203 :8951 :9201 :9250 :9278 :5222`）、`dsh-client-ui-conversation` 2（`:15381 :15384`）、`dsh-api-session-controller` 2（`:2184 :2197`）、`dsh-client-ui-trajectory` 2（`:1032 :1242`）。**改的是 npm 全局树 → 必须重启 App**，`node --check` 全绿后再重启。
4. 若要改 asar 内 core：`node ~/.dsh/storages/tools/asar-core-guard.mjs --check|--build <out> [<src>]|--install`；落地用 `install-asar-guard.ps1`（等 App 退出 → rename `app.asar` → `app.asar.bak-<stamp>` → copy → sha256 + `--check` 探针必须 `ok=true` → 用开始菜单快捷方式重开且**必须带 `--no-sandbox`**；任一步失败则回滚并用原 asar 照样拉起 App）。`-SkipWait -Norelaunch` 干跑。
5. 回滚：`Stop-Process -Name 'DeepSeek Harness' -Force` 后 `Move-Item -Force "…\resources\app.asar.bak-<stamp>" "…\resources\app.asar"`。

**R2｜图标变白纸 → 四步，别跳**
1. **只看截屏**确认（任务栏 / 开始菜单 / 桌面树各一张），不用 shell API 判（D13）。
2. 量 mandatory label：`icacls "C:\Users\27063\<可疑目录>" | grep -i Label`。若是 `Low Mandatory Level` ⇒ 病根已知，别再折腾 cache。
3. 复测用**同目录、同内容、同 DACL、全新文件名**的对照 lnk（一个 Medium、一个 Low）—— 这是唯一能证伪「是别的变量」的实验形状。验完删掉 `acltest/`。
4. `Stop-Process -Name explorer -Force` 等约 1 s（`AutoRestartShell=1` 会自动拉起），**确认 `Get-Process explorer` 的 StartTime 已更新**；只有这一步也不管用时才考虑动 iconcache，先备份
   `C:\Users\27063\Desktop\工具箱\会话断点\fix-2026-10-04\iconcache-backup-234458\`（31 文件：`iconcache_*` + `IconCache.db` + `thumbcache_*`）。
5. ⛔ 别 `ie4uinit -ClearIconCache`；别盲目 `icacls /T` 递归（既有铁律，也有合规风险，见存疑第 2 条）。

**R3｜开机自己亮 / 弹出命令行窗口**
1. `(Get-CimInstance Win32_OperatingSystem).LastBootUpTime` + 事件 109/6006/12 判 BootType（`0x0` = 完整 POST ⇒ 不是 S4/S0ix 恢复）。
2. 排除面：`powercfg /waketimers`（空）、`powercfg /a`（快速启动是否禁用）、`HiberbootEnabled`、`BatteryStatus`、`WakeUpType`、WoL 能力。
3. 命令行窗口：直读 `C:\Windows\System32\Tasks\dsh-web-3080`（UTF-16；**目录 `ls` 报 Permission denied，按文件名 `cat` 却能读**）。本机 `schtasks` / `Get-ScheduledTask` 在非提权下一律报错（`ERROR: The system cannot find the path specified.` / `HRESULT 0x80070003`），Git Bash 里还要 `MSYS_NO_PATHCONV=1` 防路径转换。
4. 禁用（只 disable 不 delete）：`disable-dsh-web-autostart.ps1` 经 `Start-Process powershell -Verb RunAs -Wait` 提权执行；实测 `before: state=Ready triggers=1` → `after: state=Disabled`。回滚 `Enable-ScheduledTask -TaskName 'dsh-web-3080'`；日志 `~/.dsh/logs/disable-dsh-web-autostart.log`。改任务用「XML 备份 → 改 `$t.Settings.*` → `Register-ScheduledTask -InputObject -Force` → 前后快照 diff」，**从不碰 `Actions`**。
5. 以后再问「谁启动了 launch-dsh」→ 看 `~/.dsh/logs/launch-dsh-caller.log`（从 `$PID` 向上追 8 层父链 + 列两个 Startup 文件夹）。

**R4｜桌面端整体回归（换版 / 换 asar 后）**
- 逐项：asar 内版本串；`bili /__bili/sessions` 四个会话 `contextWindow` 全 **868928**；`dsh-headroom-ccr.json` 体积继续长；wechat daemon port 10425 OK；`host-stdio.log`/`stall-guard.log` **零 skip**（靠 `profiles/desktop/compatibility.json` 的精确版本豁免，key 是 dsh 版本号，换版后要跟着改）。
- **整目录换**：Electron 44.0.0→44.7.0 时 `DeepSeek Harness.exe` 244,481,512→246,343,144、`app.asar` 121,348,951→182,794,869；**只换 asar 会崩**。旧版留在 `%LOCALAPPDATA%\Programs\DeepSeek Harness.old-20261023`（1.06 GB）可回滚。

## 存疑

- **白纸图标的「根因」有三版演进**：10-04（iconcache 写入坏）→ 10-05（Windows update pending + explorer 功能退化）→ 10-06（profile 树 Low IL，有可逆对照实验）。前两版都被后一版取代，但 10-06 之后**没有做「恢复 Medium 后长期不复发」的观察** ⇒「周期性被重置」的风险未排除。
- **Low IL 的来源未确证**：火绒已 grep 排除；`aTrust`（深信服；`C:\Program Files\Sangfor`、`aTrustService` 存在但当前 Stopped、`C:\ProgramData\Sangfor\EAIO3_LOG`、`C:\Users\27063\sangfor\aTrust`）属**高嫌疑但无直接证据**。若来源是学校/单位合规软件，擅自 `/T` 恢复 Medium 可能被周期重置甚至触发告警 ⇒ 三条根治选项（只改根 / 分批 `/T` / 维持 junction 现状）**均未执行**。
- **`--no-sandbox` 的根因本身未定位**（sandbox 初始化为什么在这台非 admin 机上崩），`--no-sandbox` 是官方标准规避。安全代价需知情：关掉了 Chromium 的 OS 级 renderer 隔离。
- **`source: null` 的注入源未定位**：4 个 crash 相关 session 的持久化事件流（`5cc47bcb` 4853 / `9cf09938` 3142 / `a0d5fbf8` 31830 / `c424a630` 823 events）里 `data.source = null` 与 `inserted[*].source` 缺失/为 null **全部为 0** ⇒ null 出在运行时投影（inbox projection / optimistic pending submission），不在磁盘事件流上。修的是 containment，不是治本。
- **`reasoning-autofold` 从未打进 asar**（objective ⑨/⑩，已知 gap 未实施）：新旧串长度不同 + entry integrity ⇒ 必须整体重写 header；官方 nightly 更新会重写 asar，打进去也会丢。真要做得先造「重写 asar header」的通用工具 + update 后自动重打。
- **窗口标题显示额度对 Reasonix 桌面版是否可见，两条记录冲突**：一条说「无边框自绘 UI，顶部是自绘工具条、无系统标题栏 ⇒ 改窗口标题用户看不到」；另一条说 `SetWindowText` 写入后 8 秒仍在、**不会被 Electron 还原**。两者不矛盾，但「用户实际看不看得见」没有肉眼确认。
- **状态栏「只有新建对话才刷新」未做区分实验**：待验证「不新建对话、只发一条普通消息」是否触发重绘（可区分「任意 turn 刷新」与「仅会话初始化」）。
- **`ShellIconOverlayIdentifiers` 19 项 > 上限 15**（WPS `qingnse64.dll` 4 + 百度网盘 `YunShellExtV164.dll` 7 + OneDrive 7，挤掉 `EnhancedStorageShell`/`EhStorShell.dll`）—— 需 HKLM 提权，未做；19 个 DLL 实测全部 `LoadLibrary` 成功（0 FAIL），非本次病因。
- **`explorer.exe` 启动偶发 `0xC0000142`**（`STATUS_DLL_INIT_FAILED`）：同一分钟内 `Popen` 失败而 `Start-Process` 成功；与用户截图同一错误码，属既有问题、非操作造成；静态依赖从我进程加载全部 LOADED。**根因未定。**
- **本机 `Get-Process <name>` / `tasklist` / `OpenProcess` 都出现过假阴性** —— 只能退到 `Get-CimInstance Win32_Process` + 窗口枚举，这个不自洽仍未解释。

## S 溯源

fact 语料（`C:/Users/27063/AppData/Roaming/reasonix/memory/global/`，命中关键词 148 篇，精读 15 篇）：

- `dsh-desktop-core-bundles-load-from-asar.md` — renderer 从 asar 加载 core bundle、活体判据、`rev` 算法、`asar-core-guard.mjs`
- `dsh-desktop-blank-conversation-pane-null-source-guard-20261007.md` — 全黑根因 `source.kind` 无判空、13 处 guard、生效路径与未决注入源
- `dsh-desktop-requires-no-sandbox.md` — `0x80000003`、三处快捷方式、两个易误判点、安全代价
- `dsh-desktop-app-status-breakpoint-nosandbox-20261004.md` — 逐 flag 对照实验、与 Edge 154 CDP 同源、可复现判据脚本
- `dsh-asar-inspection-and-objective-9-10-findings-20261004.md` — asar 格式、产物布局（12,967 entry / 1,497 unpacked）、三条硬约束
- `tm-usage-first-plugin-desktop-token-meter-fix-20261004.md` — desktop host 的 core root = `app.asar/dsh`、Node 解析规则、profile-level plugin 包装的替代路径
- `dsh-desktop-renders-package-client-modules-20260930.md` — `platform: "web"` 不影响桌面加载、HMR 边界、`app-update.yml` nightly
- `dsh-desktop-profile-full-port-20260930.md` — desktop 不覆盖已有配置、移植清单、`compatibility.json` 精确版本豁免
- `dsh-requires-node20-not-platform-gated-20260930.md` — `node:util.parseEnv` 需 20.12+、`EBADENGINE` 只 WARN
- `dsh-web-3080-logon-task-REDACTED.md` — `\dsh-web-3080` 全定义、schtasks 坏掉的绕行、caller-trace 探针
- `autostart-verification-method-20260928.md` — 先证明真重启、父链判谁启动
- `dsh-sandbox-windows-写限制与danger-full-access.md` — bash tool 恒 Low IL、`danger-full-access` 不解除、`icacls /setintegritylevel` 修法
- `goat-额度-窗口标题方案与时间含义-2026-09-25.md` — 三处时间语义、`goat-title.ps1` + `GoatTitle`
- `reasonix-状态栏余额刷新时机与本地时区纠正-2026-09-25.md` — 51 秒轮询、重渲染绑会话事件、本机 UTC+4 与 `toLocaleTimeString` 不可信
- `reasonix-状态栏余额打桩为-goat-六额度-2026-09-25.md` — 状态栏 16 项固定、`statusline command` 语义

作战记录：`C:/Users/27063/.dsh/PLAN.md` —— L93–97（BIOS AC 假边沿）、L133–134（整目录换 / asar 尺寸）、L145（计划任务改法）、L199–217（bundle 加载真相 + 白屏）、L231–240（3080 logon task）、L250–276（白纸图标：路径层 → Low IL 机制层）、L300–326（`--no-sandbox` 三处快捷方式）、L1140–1440（白纸图标全链路：症状量化 → 假说否证 → 测量方法学 → 重大更正 → 根因定位）。

只读现场：`%APPDATA%\@deepseek-ai\dsh-desktop\logs\` 现存 `crash-*-renderer.log`（25,645 / 46,375 / 53,461 B）与 `crash-*-host.log`（16,044 / 1,214 B）；`~/.dsh/storages/thinking-guard-desktop-patch.json`（329 B）；`~/.dsh/storages/` 下**没有** desktop 专属 json（只有 `profiles/desktop/` 的 `package.json` / `cordis.patch.yml` / `compatibility.json`）；`%LOCALAPPDATA%\Temp\dsh-diag\` **现已不存在**（本轮 `ls` 无命中 ⇒ `iconlib.py` / `imgfactory.py` / `cross.py` / `probeA-D.py` / `census.py` 已随 Temp 清理消失，需按 PLAN L1219–1229 的清单重建）。

测量方法学（血泪，全篇最贵的五条，不要重犯）：
1. **PS 5.1 读无 BOM 的 UTF-8 `.ps1` 时按 GBK 解码** ⇒ 脚本里的中文字面量永不匹配真实 Unicode 标题 ⇒ 早期「对话框探针」的 `dialog_count=0` 全是假阴性（改用窗口类名 `#32770` 或 Python + ctypes）。
2. **读被 explorer 占用的文件必须用 `FileShare.ReadWrite`**（`Open(...,'ReadWrite','None')` 必失败）。
3. **单点 / 单文件不能下结论**（`file=3` 误判、`ExtractAssociatedIcon` 误判、MOTW 方向错误都源于此）；**阳性对照是必需的** —— 没有它无法区分「没有现象」与「探针失效」。
4. **`GetClassNameW` 必须声明 `CharSet=CharSet.Unicode`**，否则类名只读回 1 个字符（会造成 `Shell_TrayWnd count=0` 假阴性）；写含 `C:\Users` 的 Python 文本必须用 raw string（`\U` 触发 unicodeescape）。
5. **`explorer.exe` 静态导入里大量 `api-ms-win-*.dll` 报 MISSING 是假信号**（API set 由 ntdll 虚拟解析，磁盘无实体文件），不可作判据。
