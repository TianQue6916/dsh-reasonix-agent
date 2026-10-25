---
id: "7b240924-34c9-481c-b563-b6eff03fef56"
title: "Windows 本机免安装部署 Disk Write Monitor + smartmontools（2026-10-10）：7z 解 NSIS 取 smartctl、PATH 注入受限、非管理员 SMART 层不可用"
description: "本机（非管理员 Windows，用户 27063）免 UAC 部署 Disk Write Monitor 与 smartmontools 的落地路径、解包手法、三条环境限制（HKCU\\Environment 写不了 / 物理盘句柄需 admin / winget 仅符号链接）与未完成的端到端实测。关联 2e5441ee、63c87fcc。"
status: "active"
created_at: "2026-10-10T12:22:53.521Z"
updated_at: "2026-10-10T12:22:53.521Z"
content_hash: "c4a5a1a7a597896f95f2b1bcf2843bdaa104ad725864f5d062bc11ab97901621"
source_paths:
  []
session_ids:
  - "c63540f6-2b4b-406d-b8b2-e2dcfa1b64e7"
memory_body_ids:
  []
---

# Windows 本机免安装部署 Disk Write Monitor + smartmontools（2026-10-10）

## 一、结论

Disk Write Monitor 装好了，走的是**免安装解包路线**（用户在上一次尝试中取消了 UAC 弹窗，改用零提权方案）。三层监控里 **Logical / Disk 两层不提权即可出数，SMART 层必须提权**。

## 二、落地布局

```
C:\Users\27063\.dsh-lab\tools\
├── disk-write-monitor\          ← 主程序（166 KB，28 个 unit test 全绿）
│   ├── DiskWriteMonitor.py
│   ├── test_diskwritemonitor.py
│   └── run-monitor.bat          ← 入口，双击运行
└── smartmontools\               ← 7.8 MB
    ├── bin\smartctl.exe         ← 7.5 r5714，x64（解包后重命名整理）
    ├── bin32\
    └── doc\
```

- 启动方式：双击 `C:\Users\27063\.dsh-lab\tools\disk-write-monitor\run-monitor.bat`（同时是桌面快捷方式目标）。
- `run-monitor.bat` 自己做三件事：**内联注入 smartmontools\bin 到 PATH**、切到脚本目录、启动 dashboard。
- 脚本内部 `ShellExecuteW(None,"runas",...)` 在 `DiskWriteMonitor.py:107-120`，调用点在 line 1200-1201；非管理员运行时弹 UAC。
- 验证：`find_smartctl()` 在注入 PATH 后返回 `C:\Users\27063\.dsh-lab\tools\smartmontools\bin\smartctl.EXE`；`get_smartctl_devices()` 返回 `[('/dev/sda', 'nvme')]`。

## 三、解包手法（可复用）

来源 `C:\Users\27063\.dsh-lab\tools\smartmontools-7.5.win32-setup.exe`，1508408 B，**md5 = bb1e199ad6a3db3e1c27ae54b835cbd5**（校验通过，原件与校验记录保留）。

- `D:\7-Zip\7z.exe` 直接识别为 **NSIS-3 Unicode** 容器：`SubType = NSIS-3 Unicode`、`Method = LZMA:23`、`Solid = +`、`Headers Size = 129660`。
- `7z x` 解出 **37 个文件 / 8.18 MB（压缩前）**，其中 `bin\smartctl.exe` 1165312 B、`bin32\smartctl.exe` 1246222 B、`smartd.exe`、`drivedb.h`、`smartd.conf`、`doc\*`（AUTHORS/ChangeLog/COPYING/checksums32|64.txt 等）。
- 免 UAC 可用：`smartctl 7.5 2025-04-30 r5714 [x86_64-w64-mingw32-w11-b26300] (AppVeyor)`。
- 排除项：`$PLUGINSDIR\System.dll`、`uninst-smartmontools.exe` 等安装器专用文件，解包后清理掉。
- 反面教训：官方 `smartmontools-7.5.win32.zip` 下载得到 **HTTP 404**（9 字节 ASCII 文件），zip 路线不可用，只能用 setup.exe 解包。

## 四、三条环境限制（实测）

1. **当前 shell token 写不了 `HKCU\Environment`**。`[Environment]::SetEnvironmentVariable(...)` 报
   `Exception calling "SetEnvironmentVariable" with "3" argument(s): "Requested registry access is not allowed."`（`FullyQualifiedErrorId : SecurityException`，LanguageMode 已是 FullLanguage）。
   ⇒ 放弃改持久 User PATH，改用 bat 内联注入。原 User PATH（**996 字符**）已备份到 `C:\Users\27063\.dsh-lab\tools\_path-user-backup.txt`。
2. **非管理员下 SMART 一律读不到**。`smartctl -a -d nvme /dev/sda` 返回
   `Smartctl open device: /Device/Harddisk0/Partition0 failed: Invalid argument`；
   `smartctl -a /dev/sda`（不带 `-d`）则报 `Unable to detect device type / Please specify device type with the -d option`。
   物理盘句柄在 Windows 上要求 admin。而 `smartctl --scan` 非管理员也能返回 `[/dev/sda -d nvme # /dev/sda, NVMe device]`，所以「能扫到盘」≠「能读 SMART」。
3. **`winget` 存在但是符号链接**：`...\WindowsApps\winget.exe -> ...\Microsoft.DesktopAppInstaller_1.29.380.0_x64__8wekyb3d8bbwe\winget.exe`；`where 7z` 找不到（7-Zip 装在 `D:\7-Zip\`，不在 PATH）。⇒ 用 winget 安装仍会走 UAC，这正是选择解包路线的原因。

## 五、当前未完成 / 待验证

- **未做端到端实测**：dashboard 是每秒重绘的 ANSI 全屏 TUI 且需要 UAC，在工具管道里只能看到转义码，必须由用户开窗口手动跑一次并回报报告里的三层数字。
- 报告落盘位置：`...\disk-write-monitor\disk_write_reports\disk_write_report_YYYY-MM-DD_HH-MM-SS.txt`；界面与报告正文是作者写好的**意大利语**（"TOTALI DALL'AVVIO"、"Logical writes (somma processi)"），数字可读、需要时再翻译。
- 刷新率常量在脚本顶部：`REFRESH_SEC=1`、`SMART_REFRESH_SEC=45`。
- 判读规则：`Logical > Disk` ⇒ 写缓存/写回聚合；`Disk > Logical` ⇒ 内核写、文件系统 metadata、swap、杀软；`SMART Host Writes` 是硬件级累计计数、**不依赖 POH**，因此绕开了本机 Kingston OEM 盘 POH 不可信的问题（SMART 报 422h vs 事件日志 ~7200h）。

## 六、关联文档

- `2e5441ee-ef83-4b18-ac46-c80cb61b7fec` —— 弟弟机 LAPTOP-SDOQT8E5 NVMe SMART 实测与「免安装取 SMART」绕行流程（同属 7z 解 NSIS 手法，但那台机是远程通道场景，与本机部署不重复）。
- `63c87fcc-77fb-49ae-814c-3b07b3b709ab` —— 双机 SSD 写入量对照与 QLC/TLC 额度量化，本文的 SMART 数据应回流到那条对照线。
