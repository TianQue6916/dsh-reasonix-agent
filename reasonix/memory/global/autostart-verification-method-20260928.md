---
id: mem-8524b03ba23f88a8e26d69cbcd252d2c
revision: 1
created_at: "2026-09-28T04:17:30.253Z"
updated_at: "2026-09-28T04:17:30.253Z"
name: autostart-verification-method-20260928
description: "自启机制的验证方法与结论：先确认是否真重启，父链判断谁启动，两条路径实测"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 第一步：先确认是不是"真的"重启过

用户说"我重启了"时，**先查 Boot 与最近一次交互式登录时间**：

```powershell
(Get-CimInstance Win32_OperatingSystem).LastBootUpTime
(Get-CimInstance Win32_LogonSession -Filter 'LogonType=2' | Sort-Object StartTime -Desc | Select-Object -First 1).StartTime
```

**2026-09-28 实例**：Boot = `09/26 11:26:32`、Logon = `09/26 11:26:54` → 用户只是重启了应用/进程，**机器并没有重启**。

后果：所有 **logon-triggered** 的自启机制（`dsh-web-3080` 的 `LogonTrigger`、Startup 文件夹的 vbs）**都没有触发机会**。
→ 我据此一度误判「ollama-serve.vbs 有 bug」，实际手动 `wscript` 一跑就成功。**教训：自启"没生效"时，先证明这次真的发生过 logon。**

## 判定某个进程是谁启动的（父链证据）

```powershell
$p = Get-CimInstance Win32_Process -Filter 'ProcessId=<pid>'
(Get-CimInstance Win32_Process -Filter ("ProcessId=" + $p.ParentProcessId)).Name
```

- 父链出现 **`explorer.exe`** ⇒ **用户从桌面手动启动**
- 父链是 `svchost.exe` / `powershell.exe` ⇒ task 触发

2026-09-28 实测：`4300 <- cmd.exe(51712) <- explorer.exe(13220)` ⇒ 3080 是手动启动的。

## 两条自启路径（均已在 2026-09-28 实测可用）

| 路径 | 机制 | 幂等 | 实测结果 |
|---|---|---|---|
| `dsh-web-3080`（计划任务） | `LogonTrigger` + `<Delay>PT20S</Delay>` → `powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\27063\.dsh\launch-dsh.ps1" -Mode Serve` | ✅ 端口忙则 exit 0 | 手动 `schtasks /run /tn dsh-web-3080` → ollama 被拉起、3080 仍单实例 PID 4300 |
| `Startup\ollama-serve.vbs` | `sh.Run "…\ollama.exe" serve, 0, False`（先设 CurrentDirectory） | ❌ 无幂等检查（第二个实例因端口占用自行退出，无害） | 手动 `wscript <vbs>` → ollama 起来（PID 59000） |

`launch-dsh.ps1` 于 2026-09-28 新增 ollama 兜底启动，**位置必须在 dsh 幂等 exit 之前**——否则 dsh 已在跑时 ollama 永远补不起来。测试法：kill ollama → `powershell -File launch-dsh.ps1 -Mode Serve` → 看 ollama 是否被拉起且 3080 未被扰动。

两个机制并存是**有意冗余**：ollama 是 mnemon embedding 的依赖，多一层兜底。

## 注意

- `schtasks /query` 的 `Last Run Time` 对 LogonTrigger 任务**不可信**；用 `Get-ScheduledTaskInfo` 或查 `Microsoft-Windows-TaskScheduler/Operational` 事件日志。
- **真正的 logon 触发至今未被实测**（需要一次整机重启）。开机自启这条严格说仍是"实现正确 + 手动触发验证过"，不是"实测过开机"。
