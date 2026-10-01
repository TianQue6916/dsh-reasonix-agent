---
id: mem-b5aa19125ee18c9d86a23d03188b06b8
revision: 1
created_at: "2026-08-06T19:52:35.0038985Z"
updated_at: "2026-08-06T19:52:35.0038985Z"
name: linux-ntfs-automount-media-os
title: Linux NTFS 自动挂载 /media/OS 配置
description: NTFS C 盘已配置开机自动挂载到 /media/OS（fstab + systemd 验证通过），含 sudo -S 管道陷阱教训
metadata:
  type: user
  fact_type: reference
  scope: global
---

# Linux NTFS 自动挂载配置（/media/OS）

**配置时间：** 2026-08-07，TianQue Linux（Ubuntu 24.04）

## fstab 条目（已生效）
```
UUID=F48CCA758CCA31C2 /media/OS ntfs3 uid=1000,gid=1000,umask=022,nofail,x-systemd.device-timeout=5,windows_names 0 0
```

- `/media/OS` = Windows C 盘（卷标 OS，803G，约剩 661G），用途：存放课程视频/跨系统文件
- `nofail` 兜底 Windows 快速启动/休眠导致的挂载失败；`x-systemd.device-timeout=5` 防启动干等
- 挂载单元 `media-OS.mount` active + generated，重启自动挂载
- 注意：udisks2 旧的临时挂载点 `/media/tianque/OS` 仍存在（同分区双挂载，安全），统一用 `/media/OS`

## sudo 用法（用户已授权密码 TQJQ6916 用于本机管理）
```bash
echo 'TQJQ6916' | sudo -S -p '' <命令>
```

## 教训：sudo -S 管道陷阱
`echo '密码' | sudo -S tee -a file` 时，**stdin 第一行是密码，其余行传给命令**。正确写法：
```bash
printf '密码\n<内容>\n' | sudo -S -p '' tee -a /etc/fstab
```
本次曾误写：`echo '内容' | echo '密码' | sudo -S tee -a` 把密码写进了 fstab，用 `sed -i '/^TQJQ6916$/d'` 修复。**密码绝不能出现在写入内容里。**

## 磁盘布局备忘（nvme0n1 ≈ 953G）
p1 EFI(256M) / p2 MSR(16M) / p3 NTFS OS(803G) / p4 WinRE(1G) / p5 ext4 /(150G，用 34%，**末尾分区不可在线扩容**；要扩容需收缩 C 盘+左移 WinRE+移动根分区，风险极高，已建议不做)

**Why:** 课程视频将存入 NTFS 分区；记住挂载点、fstab 条目和 sudo -S 管道坑，避免下次重复排查。
**How to apply:** 视频路径用 `/media/OS/课程视频/`；涉及本机 sudo 操作直接用 `echo 'TQJQ6916' | sudo -S`；不要再尝试给 p5 扩容。
