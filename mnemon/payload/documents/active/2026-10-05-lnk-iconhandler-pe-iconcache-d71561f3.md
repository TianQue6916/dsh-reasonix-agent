---
id: "d71561f3-518a-4e33-ad58-fd71036a1a25"
title: "2026-10-05 白纸图标第三轮：失败点收敛到 .lnk 的 IconHandler（PE 图标提取正常），附 iconcache 删除不可逆与探测假阴性教训"
description: "本轮以裸 exe / 对应 .lnk 的 6 组对照实验把「白纸图标」失败位置收敛到 .lnk 的 IExtractIcon（PE 资源取图标分支失败、读独立 .ico 成功），排除「Windows 更新残缺/组件版本不同步」假说；并记录 iconcache 删除不可逆（dsh.lnk idx=71 COLOR → idx=0 WHITE）、mmap 占用 WinError 1224 导致还原失败、locked() 检测法缺陷、explorer 探测假阴性与其偶发 0xC0000142。结论与既有文档 c97a2a01 的 InstallPending 定案存在张力，需进一步验证。"
status: "active"
created_at: "2026-10-04T19:38:02.936Z"
updated_at: "2026-10-04T19:38:02.936Z"
content_hash: "79078bc11fe6176edfaf8763aa97f4966c6f71b3213b87f46ba095642fda6a93"
source_paths:
  - "PLAN.md"
session_ids:
  - "cd8669a0-8cf7-4784-af06-b586709f7b23"
memory_body_ids:
  []
---

# 2026-10-05 白纸图标第三轮：失败点收敛到 `.lnk` 的 IconHandler

> 来源：本轮会话的时间线约为 2026-10-05 00:4x–03:1x（Windows，用户锁屏中）。
> 本文只记录**本轮实测**与由实测支撑的推理；与既有文档的冲突如实标注，不视为最终定案。
> 承接文档：`2a3a3f1e-f17c-470d-a66e-f595588d583a`（2026-10-04 重启后系统异常排查）、
> `c97a2a01-a6de-4ed5-951c-52cb0d00cd2b`（2026-10-05 定案：InstallPending 组件版本不同步）。

## 1. 症状

- 桌面 / 任务栏快捷方式图标显示为「白纸 / 通用文件图标」；用户报告**重启后白纸变多**。
- 裸 exe 及其它普通文件类型的图标表现与 `.lnk` 不一致。

## 2. 关键对照实验（本轮核心证据）

用两条 API 在同样本上取值：`SHGetFileInfo`（SHGFI，记录 sysidx / 图标索引）与
`IShellItemImageFactory`（ISIIF，记录像素统计 `lum` / `sat` / `ink`，用于判定是否彩色 vs 白色通用图标）。

### 2.1 目标（裸 exe）vs 对应 `.lnk`

| 目标（裸 exe） | sysidx / 结果 | 对应 lnk | 结果 |
|---|---|---|---|
| `firefox.exe` | 50 / COLOR | `TaskBar/Firefox.lnk` | **WHITE/generic (sysidx=0)** |
| `msedge.exe` | 51 / COLOR | `TaskBar/Edge.lnk` | **WHITE/generic (sysidx=0)** |
| `powershell.exe` | 52 / COLOR | `Desktop/dsh.lnk` | **WHITE/generic (sysidx=0)** |
| `WizTree64.exe` | 53 / COLOR | `Desktop/WizTree.lnk` | **WHITE/generic (sysidx=0)** |
| `git-bash.exe` | 54 / COLOR | `Desktop/GitBash.lnk` | **COLOR (sysidx=55)** ← 唯一例外 |
| `Code.exe` | 56 / COLOR | `TaskBar/VSCode.lnk` | **WHITE/generic (sysidx=0)** |

⇒ **PE 图标资源提取本身健康（裸 exe 6/6 COLOR）；坏的是 `.lnk` 的图标解析路径（5/6 WHITE）。**
两条 API 在全部样本上**逐项一致**，不存在「两条 API 结果分歧」。

### 2.2 例外样本给出的判别式（数据来自 `IShellLinkW::GetIconLocation`，全部 `hr=0`）

| lnk | `GetIconLocation` 的值 | 结果 |
|---|---|---|
| `GitBash.lnk` | `C:\Git\mingw64\share\git\git-for-windows.ico`（**独立 .ico**） | COLOR |
| `Firefox.lnk` | `C:\Program Files\Mozilla Firefox\firefox.exe`（指向 exe） | WHITE |
| `Edge.lnk` | `…\Edge\Application\msedge.exe`（指向 exe） | WHITE |
| `WPS / VSCode / dsh / WizTree.lnk` | 空 | WHITE |

⇒ 该 CLSID（`{00021401-…}`，`IExtractIcon` / IconHandler，实现在 `windows.storage.dll`）
**直接读 `.ico` 成功，需要「解析 target 并从中取图标」时失败。**

### 2.3 目录 vs 内容（cache 命中 vs 实时提取）

| 情形 | 结果 |
|---|---|
| A 原地 | `TaskBar/Firefox.lnk`、`Edge.lnk`、`WPS.lnk` → `sysidx=0` WHITE；`Desktop/Git Bash.lnk` → `sysidx=50` COLOR |
| B TaskBar lnk 复制到 TEMP | 全部 `sysidx=0` WHITE |
| C 桌面**彩色** lnk（Git Bash）复制到 TEMP | `sysidx=0` WHITE ← **一换路径就变白** |
| D 桌面彩色 lnk 复制到 TaskBar | `sysidx=0` WHITE |
| E 全新 lnk | `sysidx=0` WHITE |

⇒ 唯一分界线是**该路径在 iconcache 里有没有现成条目**：命中就正常，miss 就走「实时提取」而那条路对 `.lnk` 是坏的。
⇒ 这解释了「重启后白纸更多」：cache 条目被清掉后必须靠实时提取重建，重建失败即回不来。

## 3. 被排除的假说：Windows 更新残缺 / 组件版本不同步

最初怀疑点：`windows.storage.dll` 为 `10.0.26100.9278`，而 `shell32.dll` / `ntdll.dll` 为 `10.0.26100.9549`，
看起来像「更新只应用了一部分」。本轮证据**排除**该方向：

- `shell32.dll` 在 WinSxS 中同时存在 `1591 / 9278 / 9549` 三个版本 ⇒ 系统确实完成过 9278→9549 的升级。
- Windows 各组件版本号本就独立递增（`explorer` 8875 / `ole32` 8875 / `windows.storage` 9278 / `shell32` 9549），
  单纯的版本号差异**不构成异常**。
- `CBS RebootPending = False`；CBS.log 最近 400 行无 `Cannot repair` / `corrupt` / `Failed to`。
- 在 WinSxS 的 34 个候选中未能定位到 `windows.storage.dll` 实体文件，该线索收益已尽。

> ⚠️ **与 `c97a2a01` 的张力**：该文档把根因定案为「cumulative update 处于 InstallPending / 组件版本不同步」。
> 本轮证据指向的是「`.lnk` IconHandler 从 PE 提取图标失败」，且在版本号线索上得出了相反判断。
> 两者尚未被同一组实验裁决，**后续应以「能否用 `sfc` / `DISM` 修复 `.lnk` 图标解析」作为判别实验**。

## 4. 本轮的操作性教训（可复用）

1. **删除 iconcache 不可逆，且在本机是破坏性的。**
   `Desktop/dsh.lnk` 在 00:33 实测为 `idx=71 COLOR`，删除 iconcache 后变为 `idx=0 WHITE`，重启亦未恢复。
   ⇒ 在有「实时提取路径损坏」的前提下，清 cache ≈ 永久丢图标，**不属于安全操作**。
2. **iconcache 文件被 explorer mmap 占用时无法替换**：报 `WinError 1224`
   （请求的操作无法在使用用户映射区域打开的文件上执行），涉及 `iconcache_16/32/48.db`、`iconcache_idx.db`、
   `thumbcache_32/idx.db`。此时 `copy2` 需要截断写入，必然失败。
3. **「文件是否被占用」的检测法有缺陷**：用 `O_RDWR` 打开成功只能证明可读打开，
   无法证明可截断替换；据此判定 `locked=False` 会导致「先报全部释放、随后 4/5 替换失败」的误判。
4. **explorer 是否存在不能用单一 API 判断**：`tasklist`、`OpenProcess`、CIM（`Get-CimInstance`）在本机
   对 explorer 反复给出空结果（假阴性）；而 `Shell_TrayWnd` / `Progman` 窗口仍属于 pid 8604。
   ⇒ 判定 shell 存活应**以窗口（`Shell_TrayWnd` / `Progman` / `WorkerW`）为准**，而非进程列表。
5. **explorer 启动偶发 `0xC0000142`（STATUS_DLL_INIT_FAILED）**：同一分钟内 `Popen(['explorer.exe'])`
   3 秒后退出码 `3221225794`，而 `Start-Process explorer.exe` 成功（pid 24056）。
   同时从诊断进程加载 `shell32` / `windows.storage` / `twinui.pcshell` / `shlwapi` / `combase` / `ole32` /
   `propsys` 全部 LOADED ⇒ 不是这些 DLL 本体损坏。该现象与用户早前截图同码，**属既有问题**。
6. **在锁屏的维护窗口期内 explorer 会释放 iconcache mmap**，文件会短暂变为可替换——但窗口不可靠，
   且需要停 explorer 才能安全替换，风险高，本轮最终选择不动手。
7. 脚本中写 Windows 路径时要避免 Python 字符串转义坑：`C:\Users` 的 `\U`、`\b` / `\f` 等都会触发
   `SyntaxError` / `SyntaxWarning`，应使用 raw string 或去掉标签里的反斜杠。

## 5. 备份与现有方案

- 备份目录：`C:\Users\27063\Desktop\工具箱\会话断点\fix-2026-10-04\`，
  其中 `iconcache-preclean-0040\` 是**删除前的完整快照（31 文件，含 15 个 iconcache 文件）**。
  本轮尝试还原：11 个 SAME、4 个 DIFF（`iconcache_16/32/48/idx.db` 因 mmap 占用始终失败）。
- 官方方案（微软 Learn「Application shortcuts show blank icons」）与社区工具
  `alsvike/windows-icon-refresher` 均为「清 icon cache + 重启 explorer」——
  **在本机因实时提取路径损坏而失效，不推荐直接套用。**

## 6. 推荐方向与未决项

- **推荐（未执行，需一次 UAC）**：`sfc /scannow` + `DISM /Online /Cleanup-Image /RestoreHealth`，
  只修系统文件、不动用户数据；这是目前唯一能作用于「`.lnk` 图标解析路径损坏」的方向。
- 备选：从 `iconcache-preclean-0040` 备份还原（须先真正停掉 explorer）；
  或先试用 `windows-icon-refresher`。
- 未决：`.lnk` IconHandler 从 PE 取图标失败的**具体失效机制**仍未查明（DLL 可加载、注册链正常、CLSID 实现明确）；
  系统还原点查询在本会话因权限不足失败（Access denied），兜底能力未确认。
- 状态快照：本轮结束时 explorer pid=24056 运行中，桌面与任务栏正常；系统 `RebootPending=False`，
  重启后日志零 Error / Critical。
