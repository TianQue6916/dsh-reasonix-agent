---
id: mem-4a9d8a84617168f2aca4ad90e4b756b6
revision: 1
created_at: "2026-11-20T23:29:47.477Z"
updated_at: "2026-11-20T23:29:47.477Z"
name: wps-watchdog-修复-2026-11-21
description: "WPS 后台守护卡死 17 小时的根因与修复；本机 GNOME Wayland 下 wmctrl 判据失效的实证"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 症状（2026-11-21 排查）
Linux TianQue 内存 used 9.9Gi/14Gi，单进程 `promecefpluginhost --type=renderer`（WPS 的 CEF 内嵌浏览器）PSS 2259 MB，其中 `[heap]` 单块 1767248 kB，已跑 16h42m。

## 根因链（`~/.local/bin/wps-watchdog.sh` + 两个 unit）
1. 脚本硬编码 `XAUTHORITY=/run/user/1000/gdm/Xauthority`，**该文件不存在**；本机正确文件是 `/run/user/1000/.mutter-Xwaylandauth.<随机后缀>`。
2. 循环先试 `:0` → 认证失败（"Authorization required"）→ 落到 `:1`；`/tmp/.X11-unix/X1` 是**已死会话的僵尸 socket**（无 Xwayland :1 进程），连它 `wmctrl` **永久阻塞**。
3. `wps-watchdog.service` 是 `Type=oneshot` 且 `TimeoutStartUSec=infinity` → 卡在 `activating` 永不被回收。
4. timer 用 `OnUnitActiveSec=2min`，依赖 unit 进入 active 才重新计时 → `list-timers` 的 **NEXT 恒为空**，从 11-20 14:08 起 17 小时一次没执行，WPS 后台无人管。

## 第二缺陷（比卡死更危险）
本机 `XDG_SESSION_TYPE=wayland`（GNOME + Xwayland :0）。实测开着 firefox/marktext/gnome-terminal 时 `xprop -root _NET_CLIENT_LIST` **仍为空**，`xwininfo -root -tree` 里只有 mutter/ibus 框架窗口、无应用窗口——mutter 在 Wayland 下不充当 X11 WM，不维护 EWMH 属性，**`wmctrl -l` 永远返回空**。旧判据「无 wmctrl 窗口 → pkill」在这台机器上原理失效，重写成后就会在 WPS 窗口开着时误杀。

## 修法（三层）
- **脚本**：`XAUTHORITY` 自动 glob `.mutter-Xwaylandauth.*`；每个 `wmctrl` 换成 `xwininfo -root -tree` 且包 `timeout`；display 探测要求 2 秒内响应否则跳过。
- **判据反转成 fail-safe**：① `wpsoffice` 不在 → 纯后台残留（wpscloudsvr/promecefpluginhost/wpscloudsvrimp）直接清，不依赖窗口探测；② `wpsoffice` 在 → 只有确证「有 WPS 窗口（标题含 WPS Office/文字/表格/演示 且宽>300 高>200）」才放过，**探测不到只记 logger 日志、不杀**。
- **unit**：service 加 `TimeoutStartSec=25` + `TimeoutStopSec=5`；timer 改 `OnCalendar=*:0/2`（绝对时刻，不受 unit 卡死影响）。

## 验证
单次执行 131 ms → 103 ms（原为无限挂起）；`list-timers` NEXT 恢复有值、07:28:10 自动触发 `Finished`；两场景功能测试通过（假 `wpscloudsvr` 被清、假 `wpsoffice` 存活）。顺带删了僵尸 `/tmp/.X11-unix/X1`（tianque 所有，无进程占用）。

## 备份
`/home/tianque/.dsh/.learn/run/wps-watchdog-backup-20261121-072550/`（原 sh + service + timer 三件）。

## 别的结论
本机内存 15 GB，`MemAvailable` 长年在 5–7.5 GB，swap（zram 7.4G + /swap.img 4G）几乎为零使用，**不存在内存压力**；used 高主要是 WPS CEF renderer 与两个 `dsh web` 实例（3080 = 本 GUI，3081 = 另一个手起实例，各 0.6–0.9 GB）。
