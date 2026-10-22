#!/usr/bin/env python3
# Correct an over-strong claim in PLAN.md: two tailscale nodes sharing one account does NOT prove
# they are the same machine. The measured facts are: this box has a single disk (Disk 0) whose five
# partitions are all Windows types (no Linux partition) and WSL is absent; and tianque is offline
# with ssh timing out. Rewrite the passage to state only what was measured.
# No backslash characters in this file on purpose.
import hashlib, pathlib, sys

P = pathlib.Path.home() / ".dsh/PLAN.md"
raw = P.read_bytes()
OLD = (
    "**物理原因（关键）**：`100.84.67.49 node windows` 与 `100.79.96.82 tianque linux` **两个 tailscale 节点同属\n"
    "      `TianQue6916@`** ⇒ **同一台机器的双系统**，当前跑着 Windows ⇒ Linux 侧不可达，\n"
    "      **在 Windows 会话内无论如何都完不成**。"
).encode("utf-8")
NEW = (
    "**可达性结论（两条路都不通，但原因要分开说）**：\n"
    "      ① 网络路：`tailscale status` 里 `tianque` 是 `offline, last seen 1d ago`，`ssh -o ConnectTimeout=5` 超时；\n"
    "      ② 本地文件系统路：`Get-Partition` 显示**本机只有 `Disk 0` 一块盘，5 个分区全为 Windows 类型**\n"
    "         （System / Reserved / C / D / Recovery，没有任何 Linux 分区），且 **WSL 未安装**（`wsl -l -v` 提示要先装）。\n"
    "      ⇒ **Linux 环境既不可达、也不在本机可读的文件系统上** ⇒ Windows 会话内完不成。\n"
    "      **注意（勿过度推断）**：两个 tailscale 节点同属一个账号 `TianQue6916@` **不等于**就是同一台机器\n"
    "      （同一账号可有多台设备），本轮先前那句「同一台机双系统」是**证据不足的推断，已撤回**。\n"
    "      **这是环境约束，不是配置错误 ⇒ 不要反复重试 ssh / tailscale。**"
).encode("utf-8")

n = raw.count(OLD)
if n != 1:
    sys.exit("expected exactly 1 match, got %d" % n)
new = raw.replace(OLD, NEW, 1)
P.write_bytes(new)
print("PLAN.md %d -> %d B / sha256 %s" % (len(raw), len(new), hashlib.sha256(new).hexdigest()[:16]))
