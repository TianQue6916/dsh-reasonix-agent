---
id: "c97a2a01-a6de-4ed5-951c-52cb0d00cd2b"
title: "2026-10-05 定案：白纸图标 / 任务栏消失的真实上游根因 = Windows cumulative update 处于 InstallPending（组件版本不同步），含三处探测假阴性教训"
description: "延续 2026-10-04 18:35 重启后「图标白纸 / 安全警告 / Edge 登录态失效」事件的第二轮实测：把根因从 iconcache / shell extension / desktop heap 等假说收敛到 CBS 包 state=0x70 InstallPending + RebootPending=True + explorer.exe(26100.8875) 与 shell32/ntdll(26100.9549) 版本不同步；并记录 Get-Process 假阴性、API set 磁盘无实体、iconcache 删除前须先确认 explorer 真死这三条防误判教训。"
status: "active"
created_at: "2026-10-04T16:48:27.377Z"
updated_at: "2026-10-04T16:48:27.377Z"
content_hash: "b4a2fde3945feb8075a924f5c36814458142405b7be3d26cedb743b4e43dfc4d"
source_paths:
  - "PLAN.md"
session_ids:
  - "f1e74b85-2736-4d0e-9a27-f93126c8c583"
memory_body_ids:
  []
---

# 2026-10-05 定案：Windows 更新 InstallPending 导致的 shell 组件版本不同步

承接文档 `2a3a3f1e-f17c-470d-a66e-f595588d583a`（2026-10-04 18:35 重启后「任务栏图标全白纸 / 双击弹安全警告 / Edge 登录态失效 / 像被重置」的实测定案）。
本文记录同一事件的**第二轮排查**：上一轮的结论（iconcache 损坏、shell extension 异常、desktop heap 耗尽等）**全部被实测否证**，真实根因另有其人。

## 1. 最终根因（证据链）

| 证据 | 读数 |
|---|---|
| CBS package state | 4 个 `state=0x50`(Installed)：`10.0.9337.1` / `9340.4` / `9344.1` / `9345.1`；**1 个 `state=0x70`(InstallPending)：`10.0.9347.1`** |
| CBS `RebootPending` | **True** |
| `CBS.log` | `DWLD: Downloading update (307725024 of 307725024 bytes) [100%]` @ 2026-10-05 00:40:48，即一个 **293 MB 的 cumulative update** |
| `SoftwareDistribution\Download` | 309,995 files，2752 MB → 2192 MB（正在处理） |
| 活跃进程 | `TrustedInstaller` / `TiWorker.exe`(ws 521 MB) / `MoUsoCoreWorker` / `wuauserv` / `UsoSvc` 全在 Running；`AppXSvc`/`ClipSVC`/`DoSvc`/`ShellHWDetection` Running |
| 事件 | `RestartManager` 会话 ×3 @ 00:32:59、`VSS` 快照 @ 00:34:53（随后 `VSS`/`swprv` 转 Stopped） |
| **组件版本不同步** | `explorer.exe` = **10.0.26100.8875**，而 `shell32.dll` / `ntdll.dll` = **10.0.26100.9549**（同批文件时间 2026-09-23 10:00） |

**机制**：用户 2026-10-04 18:35 那次重启让**一部分更新落地、另一部分仍 pending**，导致 shell 相关组件（explorer 与 shell32/ntdll）版本不一致。
这一个原因即可解释原始三症状——「图标变白纸」+「协议/安全提示要重新同意」+「Edge 登录态失效、像被重置」。
**不是病毒，不是火绒/安全软件，不是硬件，也（本轮实测）不是 iconcache 损坏。**

**处置选择（当时给用户的 A/B）**：A 推荐 `shutdown /r /t 0`（让 `0x70` 包落地、版本对齐、shell 重建）；B 提权强杀 explorer 让 Winlogon 按 `AutoRestartShell=1` 重建任务栏，风险是更新未完成时新 explorer 可能起不来、连桌面一起丢。

## 2. 本轮被实测否证的假说（不要重复走这些路）

- **desktop heap（`SharedSection`）耗尽** ❌：`SharedSection=1024,20480,768` 与官方默认**逐字一致**。
- **overlay shell extension 超上限(19>15) 或 DLL 损坏** ❌：`ShellIconOverlayIdentifiers` 19 项（WPS 4 + 百度网盘 7 + OneDrive 7）逐个 `LoadLibrary` **全部 `LOADED`**；仅豆包 `shellext.dll` MISSING，且它是 context menu handler（已被 block），与 overlay 无关。
- **ACL 拦截写 iconcache** ❌（上一轮已否证，本轮复核仍成立）。
- **HKCU 遮蔽 `lnkfile`** ❌：该键下只有 `ContextMenuHandlers`。
- **explorer.exe 静态导入缺 DLL** ❌ → 见下条教训，那是**方法本身的假信号**。

## 3. 防误判教训（可复用，最重要）

1. **`Get-Process explorer`（带名字）会出现假阴性**：同一进程用无参 `Get-Process`、`Get-CimInstance Win32_Process` 或 `tasklist` 可见，而 `Get-Process <name>` 返空。
   → 本轮正是**基于这个假阴性判定「explorer 已死」**，进而执行了删 iconcache 的 `clean.py`（其中 `ForEach Kill()` 因进程列表为空而**空转**，没杀到任何东西，但**删文件真的执行了**）。教训：**任何破坏性清理前，必须用两条独立命令（`tasklist` / `Get-CimInstance`）交叉确认进程确实不存在**。
2. **`api-ms-win-*.dll MISSING` 是无效判据**：API set 由 `ntdll` 虚拟解析，磁盘上本来就没有实体文件。对 PE 静态导入表做「文件是否存在于 System32」检查，对 `api-ms-win-*` 必然全量假报 MISSING。
3. **`Taskkill` 的报错要分两类读**：`0xc0000142` 是**额外手动 `Start-Process explorer.exe` 起的多余实例**弹的，不代表用户 shell 坏了；而 `taskkill /F` 对活着的 shell 报 `Access is denied` 与「进程活着但 windows 枚举里缺 `Shell_TrayWnd`」同时出现，指向 shell 组件处于被更新替换/半死状态，而不是普通崩溃。
4. **窗口枚举比进程探测更可信**：`Progman`(桌面) + `CabinetWClass`(文件资源管理器) 都在、`Responding=True`、`MainWindowTitle=` 空，说明进程活着但**任务栏窗口 `Shell_TrayWnd` 缺失**。判断「任务栏没了」应以顶层窗口枚举为准，不要以进程名查询为准。
5. **不要用「一次性探测」推翻进程事实**：本轮同时出现 `explorer pid=7724` 存活与 `Get-Process explorer` 返空两个矛盾结果，正确做法是换命令交叉验证，而不是采信更「方便」的那个。

## 4. 事件中一处自造损伤（如实记录）

`iconcache` 曾被误删，随后**完整回滚（30/31 个文件）**，剩余 1 个 `thumbcache_idx.db` 被占用无法恢复——它是**缩略图**缓存，与图标/白纸症状无关。
任务栏消失最可能是当时**多余 explorer 实例退出时的连带效应**，而非用户环境本身损坏。

## 5. 相关

- 上一轮同事件定案（健康证据链、DPAPI、profile、签名证书、SMB、shell extension 审计）：文档 id `2a3a3f1e-f17c-470d-a66e-f595588d583a`。
- D 盘整卷写失败（同期另一独立问题，避开与「图标白纸」混淆）：文档 id `c45d2064-e5ea-43a2-871b-cac54b75728c`。
- 排查过程与结论同时落盘在 `PLAN.md`（追加段，当时 1003 行）。
