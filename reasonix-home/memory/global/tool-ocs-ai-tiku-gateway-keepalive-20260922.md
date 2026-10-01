---
id: mem-a4a4ccc11e3ced1be7bd05f345272913
revision: 1
created_at: "2026-09-22T07:14:41.3476209Z"
updated_at: "2026-09-22T07:14:41.3476209Z"
name: tool-ocs-ai-tiku-gateway-keepalive-20260922
description: OCS AI 题库网关「用一会儿突然连接失败」的根因排查（非杀软、非逻辑 bug）+ 计划任务与 1 分钟看门狗保活加固与实测验收
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 现象
OCS 用了一会儿后突然报「连接失败」（2026-09-22 15:07 之后）。

## 现场证据
- `Get-Process pythonw` 为空、`127.0.0.1:8899` 无监听 → 网关进程消失
- `gateway.log` 最后一条是 15:07:40 的成功作答，**没有**「网关已停止」（该行只在正常 KeyboardInterrupt 退出时写）→ 被外部强杀，非 Python 异常
- Windows Application 事件日志：无 pythonw 崩溃/WER 记录（TerminateProcess 不留崩溃事件）
- 火絨日志（`C:\ProgramData\Huorong\Sysdiag\log.db` 的 `HrLogV3_60` 表，用 sqlite3 读）：无 pythonw 拦截记录，最近一条是 14:57 的启动项防护放行（action=0）→ **不是杀软**
- OCS `render.log` 显示 15:04:03 有一次 `render store init`（OCS 曾重启）

## 根因假设
不是网关逻辑 bug，而是**启动方式**：该进程是最初由 Reasonix 工具会话里的 `wscript start-hidden.vbs` 拉起的，未声明 `preserve_background_processes`，宿主在会话清理时会连带结束进程组成员（时间上滞后，因此当时看着正常）。

## 加固（已落地）
双层保活，与任何终端会话解耦：
1. HKCU Run 键 → `start-hidden.vbs`（登录启动，**幂等**：先请求 `/status`，200 则直接退出）
2. 计划任务 `OCS-AI-Tiku-Watchdog`（`Register-ScheduledTask`，每 1 分钟，`-MultipleInstances IgnoreNew`）→ `watchdog.ps1`：探测 `/status`（6s 超时），无响应则拉起并写日志
- 新增文件：`watchdog.ps1`、`install-watchdog.ps1`、`watchdog.log`

## 实测验收（真实复现）
手动 `Stop-Process pythonw` → 日志 `15:12:48 DOWN 无响应（旧 pid=），正在拉起…` → `RECOVERED 已恢复 pid=32128` → 8899 恢复监听，新进程由**计划任务**启动（完全脱离工具会话）；因一次端到端新题作答 2.5s 返回 `B / RBP`（答对）。

## 判读方法
- `watchdog.log` 连行 `ok pid=<同一值>` = 稳定；`DOWN`+`RECOVERED` = 被杀过一次已自愈；`FAILED` = 拉起失败去查 config/key
- 区分「被杀」与「正常退出」：gateway.log 有新的「网关启动」但**无**「网关已停止」= 被强杀

## 注意
用户明确要求答题模型锁定 `deepseek/deepseek-v4.1-flash`（不换成 pro 或其他），排查期间同样保持不换模型。
