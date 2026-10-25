---
id: "2a3a3f1e-f17c-470d-a66e-f595588d583a"
title: "2026-10-04 重启后「系统异常」排查：白纸图标 / 安全警告 / Edge 登录态 / SMB 共享与 shell extension 审计"
description: "2026-10-04 18:35 重启后用户报「任务栏图标全白纸 / 双击弹安全警告 / Edge 登录态失效 / 像被重置 / 是否中病毒」的实测定案：系统健康证据链（磁盘、DPAPI、profile、签名、证书）、三症状定位（iconcache 重建、Startup 里的 display-guard.cmd、登录 token 失效而非数据丢失）、本机 7 个 SMB 共享与 System.SharingStatus 语义、shell extension 审计（WPS/NVIDIA/百度网盘）、以及 imageres.dll stub 误判与 DPAPI 假阴性等防误判教训。"
status: "active"
created_at: "2026-10-04T11:04:47.204Z"
updated_at: "2026-10-04T11:04:47.204Z"
content_hash: "ee14ea6ce581f31b50a360bc7d7b7005c0cdf42885c8db821757dc1bc696fa0b"
source_paths:
  - "PLAN.md"
session_ids:
  - "267ff28d-031b-457f-89bd-64c8bab9e923"
memory_body_ids:
  []
---

# 2026-10-04 重启后「系统异常」排查

## 背景

2026-10-04 18:35 用户重启后报告：任务栏图标全白纸、双击文件弹「打开文件 - 安全警告」、Edge 登录态失效、部分协议需重新同意、「就像电脑被重置了一样」（历史记录与收藏仍在），随后追问「这个共享是什么，我中病毒了吗」。另有 session 给出「D 盘无法普通写入，内核故障」。

## 结论

**系统无损坏；「D 盘不可写 / 内核故障」与「电脑被重置」两条外部判断均被实测证伪；未发现恶意迹象。** 三个症状互不相干，各有独立成因（见下）。

## 一、系统健康证据链（逐项实测通过）

- 磁盘 `KINGSTON OM8TAP41024K1`：`HealthStatus: Healthy`；开机 NTFS 对 C:/D: 均报「卷运行状况良好」；近 7 天**无** Event 41 / 6008 / 1001。
- **`D:\Temp` 与 `D:\` 根现在都可写** ⇒ 重启前的「D 盘不可写 / 内核故障」在当前状态不成立 ⇒ 无需把用户级 TEMP/TMP 迁到 C 盘。
- profile：SID `S-1-5-21-...-1001` → `C:\Users\27063`，`State=0`，**非临时 profile**；`Windows.old` / `$WINDOWS.~BT` / `$SysReset` **均不存在** ⇒ 未做过就地升级或系统重置。
- 时间正确（UTC+8）、根证书 295 个在位、`shell32.dll` / `Explorer.EXE` / `notepad.exe` / `msedge.exe` 签名全 `Valid`。
- **DPAPI 正常**：`Protect\<SID>\` 下 6 个 master key 全在（各 468B），5 个在当天 18:36:35–39 被正常 touch；`Protect`/`Unprotect` 往返实测通过。
- 关联链正常：`.cmd→cmdfile→"%1" %*`；`HKCU\Software\Classes` 的 1548 个键全为 VS Code 注册的扩展名（无 `.lnk/.exe/.cmd` 覆盖）；无 SRP / AppLocker；无 pending reboot。
- **Edge 登录态失效 ≠ 数据丢失**：`History` / `Bookmarks` / `Cookies`（786KB，18:54 仍在写）文件都在且 CT 仍是装机日 ⇒ **数据文件在、解密密钥不可用**，重新登录即可。同源现象「部分协议需重新同意」亦属凭据/同意状态而非重置。

## 二、三症状定位

| 症状 | 根因 | 处置 |
|---|---|---|
| 任务栏图标全白纸 | iconcache 于 18:39–18:46 被重建，提取结果落成默认图标；触发源是 **10/2 系统由 build 26200 → 26300**（Setup 日志 `KB5121794 … Staged → Installed`，需重启），10/4 18:35 重启触发重建 | 重建 iconcache（`RunFix.cmd` 第 2 步；会关闭所有资源管理器窗口） |
| 双击弹「打开文件 - 安全警告」 | Startup 里的 `display-guard.cmd`（10/4 10:43 新建、无 MOTW、不在 `StartupApproved` 记录里） | **已移出 Startup**，备份 `Desktop\工具箱\会话断点\fix-2026-10-04\display-guard.cmd.bak`；下次登录验证不再弹 |
| Edge 登录态失效 | DPAPI/凭据链正常但浏览器登录 token 失效，非数据丢失 | 重新登录 |

修复脚本：`桌面\工具箱\会话断点\fix-2026-10-04\RunFix.cmd` → `Fix-All.ps1`（PS 语法检查通过，514 tokens）。步骤：0 备份（`net share` 快照 + `LanmanServer\Shares` 注册表导出 + Startup 备份）→ 1 逐个询问删除自建共享 → 2 重建 iconcache → 3 打印结果与备份路径。

## 三、「已共享」语义与 SMB 暴露面

- `System.SharingStatus` 是**资源管理器 shell 属性**，反映「该条目是否落在某个 share 的范围内」，**不是病毒特征**。选中 `C:\Users\27063\...` 下任何文件都会显示「已共享」。
- 本机共 7 个共享，其中 4 个为系统默认（`C$` / `D$` / `ADMIN$` / `IPC$`），**3 个非默认**：

| 共享名 | 路径 | 权限 | 备注 |
|---|---|---|---|
| `Users` | `C:\Users` | Everyone: Full ⚠️ | 建议删除（粒度过粗） |
| `网络共享文件夹` | `...\Desktop\工具箱\网络共享文件夹` | Everyone: Read | CT 2026/3/2，`MaxUses=2`，内含一份 MIT 18.100 讲义 PDF，疑为用户自建传资料 |
| `NetShare` | `D:\NetShare` | 天阙九泉\27063: Full | CT 2026/8/27 |

- **暴露面判断**：SMB-In 防火墙规则**只对 Private profile 放行**，`以太网 2` 是 Public ⇒ 常规网络路径被挡；但 **Radmin VPN 适配器是 Private** ⇒ 同房间机器在规则层面可达。故这三个共享的安全性取决于「谁在 Radmin 房间里」。工具箱里另有 `RustDesk.lnk`，远程工具口令强度值得单独确认。
- **能力边界**：`Microsoft-Windows-SmbServer/Operational` 与 `Get-SmbSession` 均需管理员（`Access is denied`）⇒ **「有没有人连进来过」当时无法回答**；需提权后补查。

## 四、shell extension 审计（全部可追溯到已知软件）

| 注册名 | DLL | 归属 |
|---|---|---|
| `QingOverlayIcon*`（4 个）、`qingshellext`、`QingNseContextMenu` | `D:\wps\WPS Office\12.1.0.28505\office6\qingnse64.dll` / `qingshellext64.dll` | WPS 金山文档云同步 |
| `OpenGLShExt` | `...\DriverStore\FileRepository\nvtfsi.inf_...\nv3dappshext.dll` | NVIDIA 3D 设置 |
| `YunShellExt` / `WorkspaceExt0` | `D:\视频播放器\BaiduNetdisk\YunShellExtV164.dll` | 百度网盘 |
| `EnhancedStorageShell` | 系统自带 | Microsoft |

- `EnableShellExecuteHooks = 1`（非默认值）允许第三方 shell extension 拦截所有 `ShellExecute`，配合 `lnkfile` 下多个 Handler 会放大影响面——本例中实现者全部为已知软件，非入侵证据。
- **配置问题（非白纸图标成因）**：`ShellIconOverlayIdentifiers` 有 19 项 > Windows 上限 15，`Qing*` 4 项被字母序挤出。
- **版本不一致**：WPS CLSID 注册指向 `D:\wps\...\12.1.0.28505`，而任务栏 `WPS Office.lnk` 指向 `D:\30-软件\wps\...\12.1.0.28043\office6\wps.exe` ⇒ 两套版本路径并存（WPS 被移动/重装过），会导致同步角标失效并拖慢 explorer 加载 shell extension。记入待办，未处置。

## 五、防误判教训（可复用）

- **`%SystemRoot%\System32\imageres.dll` 只有 12KB 是 Win11 正常 stub**，真身在 `SystemResources\imageres.dll.mun`（约 24MB）；曾据此误判「系统文件被毁」，已自我推翻——遇到「系统 dll 很小」先查 `.mun` 再下结论。
- **DPAPI 测试假阴性**：漏了 `Add-Type -AssemblyName System.Security` 会得到 `Unable to find type [Security.Cryptography.ProtectedData]`，看起来像 DPAPI 损坏。取证脚本必须先加载程序集。
- **批量系统文件时间戳**：`System32` 下 1642 个 dll 的 `LastWriteTime = 2026-09-23` 是 26H2 特性升级（build 26200 → 26300）批量写入，不是篡改痕迹。
- **效率**：初版用 9 个独立 `powershell.exe` 冷启动 + `Get-WinEvent -MaxEvents 3000` 全量扫日志 + 写文件再 `sed` 读，用户明确批评「效率太低了,你这命令太慢」。改法：**单次进程跑完 + `cmd` 内置命令取数据 + 并行 tool call**。
- **工具坑**：`command` 参数走 JSON 时写 `\\` 到文件里只剩 `\`，导致 Python 脚本里的正则被拆坏（`bad escape \T`）；生成补丁脚本应改用**零反斜杠 + 占位符**方案。

## 六、相关文档

- `c45d2064-e5ea-43a2-871b-cac54b75728c` —— D 盘整盘写失败（Access denied）排查：ACL/磁盘标志正常、卷级只读嫌疑（本次复测 D: 已可写，与本文第 1 节互为补充）。
- `11cee314-0b8c-45bc-ac9c-9f436a73d608` —— Edge 启动内存诊断与轻量化方案（edge-lite）。

原始诊断输出：`C:\Users\27063\AppData\Local\Temp\dsh-diag\diag1-9.txt`；计划与交接见本工作区 `PLAN.md`。
