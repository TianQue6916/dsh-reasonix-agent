---
id: mem-6a80d9f8ca3bbc5672ee5418a6b7ef92
revision: 1
created_at: "2026-10-28T08:58:34.777Z"
updated_at: "2026-10-28T08:58:34.777Z"
name: 本机使用模式-linux常驻不切系统
description: "本机常驻 Linux 不切系统 + 真正的 Windows 是天阙九泉另一台常开机器 —— 决定了双系统/分区/休眠类判断的前提"
metadata:
  type: user
  fact_type: user
  scope: global
---

## 事实（2026-10-28 用户原话：「注意社区经验，我一般本机不切系统」）

- **本机（机械革命笔记本 / TianQue6916）常驻 Linux，不切回本机 Windows。**
  本机硬盘上那块 NTFS（`/dev/nvme0n1p3`，本机 Windows 用户 `Admin1`，含 `C:\hiberfil.sys`）因此**是静态的**：
  不存在「两个 OS 先后挂载同一分区」的脏缓存回写问题，可以直接挂载读写，不必先问休眠/快速启动。
- **真正在跑的 Windows 是另一台常开机器**：hostname「天阙九泉」，用户 `27063`，Tailscale `100.84.67.49`。
  Linux 侧通过 SSH 写它（`~/.reasonix/global-workspace/sync/sync_reasonix.py` 里有 HOST/USER/PASS）。
- 由此推论：`hiberfil.sys` 存在 ≠ 有风险。**只有当 Linux 直接 `mount` 某块 NTFS 分区去写、之后又把同一分区交回
  Windows 从休眠唤醒时，才有回写冲突**（R10 只在这个场景成立）。走 SFTP 的读写是 Windows 内核自己收的，不适用。

## 教训（为什么记这条）

2026-10-28 我把「双系统通用风险」硬套到用户的真实用法上，在协议里写成「每次必查」，还在回复里两次提醒 —— 属于
**不看实际使用模式就搬通用经验**。以后涉及双系统 / 分区 / 休眠的判断，先确认「这台机器上到底是谁在跑、跑多久」。

## 连带影响（2026-10-28 已按此修正）

- `C:\relay\README.md` 的 R10 已重写为「只对同一分区被两个 OS 先后挂载成立」，并从硬规则降为条件性提醒。
- 本机 `/media/OS/relay` 已删除（那份是给本机 Windows 用的，本机不跑 Windows ⇒ 无人消费 ⇒ 双头）。
