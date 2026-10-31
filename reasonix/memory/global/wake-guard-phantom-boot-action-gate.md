---
id: mem-6824213e18d10b176fa6dfc7cfcf40f0
revision: 1
created_at: "2026-10-27T08:40:07.793Z"
updated_at: "2026-10-27T08:40:07.793Z"
name: wake-guard-phantom-boot-action-gate
description: "wake-guard.ps1：旧判据把「用户重启」和「自己发的关机」都当假自启，导致连环关机；修法=按 Kernel-Power 109 的 Action 门控"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 文件
`C:\Users\27063\.dsh\storages\tools\wake-guard.ps1`（2026-10-25 建，2026-10-27 修，137 行）
计划任务名 `WakeGuard`。日志 `C:\Users\27063\.dsh\logs\wake-guard.log`。

## 它原本要防什么
BIOS 的 "Power On after AC Loss" + EC 在 S5 下对 AC_PRESENT 的假判定 ⇒ 正常关机后 **13~21 秒**系统自己重新加电、完整 POST。60 天 26 次，约 35% 概率。判定后立刻 `shutdown /s /t 0 /f` 强制关回去。

## 旧判据的致命缺陷（2026-10-27 实测暴露）
只比两个时间：`LastBootUpTime − 最近一次 Kernel-Power 109 的 TimeCreated < 60s`。
**但 Kernel-Power 109 有三种 Action，旧版完全不区分**：

| Action | 谁发起 | 旧版行为 | 实测时间戳 |
|---|---|---|---|
| `Reboot` | 用户从开始菜单点「重启」 | ❌ 判 PHANTOM → 关机 | 10-27 16:29:42 |
| `Shutdown` | `shutdown.exe /s`（**含本脚本自己发出的那条**） | ❌ 判 PHANTOM → 又关机 | 10-27 16:30:50、16:32:11 |
| `Shutdown Off` | `winlogon.exe` 发起完全关机 | ✅ 应该判 | 10-27 00:25:33 |

于是形成**连环关机**：用户重启 → 判 phantom → 脚本关机 → 开机看到「自己刚才发的那条 109」→ 又判 phantom → 又关机。用户根本没法重启电脑。

## 修法（已落地并 DryRun 验证）
**加 Action 门控**：只有 `Shutdown Off` 才进入时间判定；`Reboot` / `Shutdown` / 其他一律放行。
```
ACTION last109 (Shutdown) → OK: last transition was Shutdown (shutdown.exe, incl. this guard's own)
```

## 关键技术事实
**Action 字段不在 `ToXml()` 的 EventData 里**。109 的 EventData 只有三个：
```
ShutdownActionType = 4    ShutdownEventCode = 0    ShutdownReason = 5
```
`ShutdownActionType` 的 4 对 Reboot 和 Shutdown 都是 4（不可区分）。**必须从 `$ev.Message` 文本解析**：
```powershell
if ($ev.Message -match 'Power Action ([A-Za-z ]+?)\s*(?:\u4e8b\u4ef6|Event|$)') { $action = $Matches[1].Trim() }
```
（中文系统 Message 是「内核电源管理器已启动关闭转换。 Action： Power Action Shutdown 事件代码： 0x0 原因： Kernel API」，英文系统同一位置是 `Power Action Shutdown Off`。）

## 历史数据
`wake-guard.log` 11 条 CHECK：`<60s` 的 4 条**全部是 2026-10-27 的误判**；10-25 那些 gap 是 38601s（真远程开机，正常放行）。**历史上没有一次真 PHANTOM**。

## 相关事件 ID（排查用）
- `1074` User32：谁发起了关机 —— `startmenu`(用户点重启) / `shutdown.exe` / `winlogon.exe`
- `109` Kernel-Power：内核启动关机转换（带 Action）
- `13` Kernel-General：OS 即将关机时间戳
- `41` Kernel-Power：**非正常断电**（意外断电才记，正常关机不记）

## 回滚
`cp wake-guard.ps1.bak-20261027-163910-pre-action-aware wake-guard.ps1`
临时停用：`schtasks /delete /tn WakeGuard /f`
干跑：`pwsh -NoProfile -File wake-guard.ps1 -DryRun`

## 仍未覆盖的边界
若用户**用命令行 `shutdown /s` 关机**，Action 也是 `Shutdown` ⇒ 会被放行，那种情况下的真假自启抓不到。判断依据是：命令行关机通常是脚本行为，与「按电源键/开始菜单关机」的物理场景不同，而假自启恰恰发生在物理关机后 EC 的假加电。要更严可以再叠加「1074 的发起进程是不是 `shutdown.exe`」这一层，但会让脚本自己发出的关机也被判 phantom，风险大于收益。
