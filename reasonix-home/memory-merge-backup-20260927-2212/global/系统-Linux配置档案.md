---
id: merged-系统Linux配置档案.md
revision: 1
created_at: "2026-08-16T14:30:00.000000000Z"
updated_at: "2026-08-16T14:30:00.000000000Z"
name: 系统-Linux配置档案.md
description: Linux 本机系统配置与踩坑档案
metadata:
  type: user
  fact_type: reference
  scope: global
---

# 系统-Linux配置档案.md

> 2026-08-16 合并生成。来源原始件在 ~/.reasonix/memory-archive-20260816/（信息零丢失）。


## 来源：linux-ntfs-automount-media-os.md

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

## 来源：desktop-exec-gio-parsing-pitfall.md

# .desktop Exec 解析坑：禁止 \" 转义 + 需要 trusted 标记

**坑 1（GIO 解析）**：`.desktop` 的 `Exec=` 里**不能有 `\"` 转义双引号**。`desktop-file-validate` 能通过这种写法，但 Nautilus/GIO 的 GDesktopAppInfo 解析器会解析失败，报"桌面文件未指定 Exec 字段"，导致双击时 .desktop 被判无效 → 被默认文本编辑器（VSCode）抢走打开。

**安全写法（已实测 gio launch 通过）**：
```
Exec=gnome-terminal --title=标题 -- bash -c "bash /path/脚本.sh; echo; echo 提示语; read"
```
规则：外层一对双引号包整个 bash -c 参数，内部不要嵌套转义引号；提示语用不带引号的 token（中文安全）或用 `read` 无提示。复杂逻辑拆到独立 wrapper 脚本，Exec 保持一行简单命令（热点 .desktop 就是 `Exec=gnome-terminal -- bash gui-start.sh` 模式，可靠）。

**坑 2（trusted 标记）**：新创建的 .desktop 即使 `chmod +x`，GNOME Nautilus 默认不信任，双击会交给默认文本编辑器。必须：
```
gio set "<路径>" metadata::trusted true
```
验证：`gio info -a metadata::trusted <文件>` 应为 true；`desktop-file-validate` 校验语法。

**坑 3（跑完即退）**：检查类脚本（秒完）双击后窗口立即关闭，用户看不到结果。用上面安全写法里的 `echo; read` 让窗口停住等回车。

**验证流程**：写 .desktop 后 ① desktop-file-validate ② gio launch 实弹（能真正启动才合格，validate 通过≠GIO 能解析）。

**Why:** 2026-08-12 建「双机互联」「重启指纹」两个 .desktop 时踩坑：先被 VSCode 抢（trusted 缺失），修好后因 Exec 含 `\"` 又被抢（GIO 解析失败），用户连续三次反馈"打不开"。
**How to apply:** 以后任何 .desktop 创建/修改后，必须跑 `desktop-file-validate` + `gio launch` 双重验证，缺一不可；Exec 内禁止 `\"`。

## 来源：workspace-write-lag-fix.md

# 工作区写入卡顿改善档案（2026-08-15）

## 问题
多开任务时「当前工作区正在被写入」卡顿。根因三叠加：
1. auto-rename-daemon 每 20s 轮询，对活跃会话（正在写的 .jsonl）执行重命名 → 与桌面端写锁竞争
2. 工作区 35,220 文件，93% 是 ccgp-download(27,466)/deepseek_data(5,444)/cleanup_backup(37) → watcher 事件风暴
3. 双机同步 cron 09/14/21 点全量 walk 3.5 万文件

## 改动
- `scripts/system/auto-rename-daemon.py`：新增 ACTIVE_SKIP=300 活跃会话保护（.jsonl mtime<300s 跳过重命名），systemd 服务已重启
- 大目录移至 `~/data/`（ccgp-download/deepseek_data/cleanup_backup），原路径留 symlink（不跟随，watcher 不穿透）
- `sync/sync_reasonix.py` EXCLUDE_DIRS += ccgp-download/deepseek_data/cleanup_backup/strang_ocr_pages
- `sync/sync_cron.sh`：cron 前先查 sessions 10 分钟内是否有写入，有则跳过本次同步；cron 改 08:30/12:30/21:30
- 40 个 60 天前旧会话归档至 `~/.reasonix/archive/sessions-20260815/`

## 实测效果
- inotify watch：2,725 → 178（-93.5%）
- 同步 walk：35,220 → 1,595（-95.5%）
- 活跃会话不再被 daemon 改标题

## 注意事项
- daemon 设计策略：标题 >6 字会被重命名（is_good_title 对 6 字以上兜底返回 False）；恢复标题需用 ≤6 字
- deepseek 系列脚本写死绝对路径 ~/.reasonix/global-workspace/deepseek_data，symlink 透明兼容
- 桌面端 watcher 不跟随 symlink 是 Linux inotify 默认行为

## 来源：reasonix-launcher-layout-migrate-fix.md

# Reasonix Linux launcher 布局迁移修复（2026-08-03）

## 症状
- 侧边栏点 Reasonix 图标无反应，只能终端启动 `reasonix-desktop`
- 启动日志刷 `systray error: dbus: connection closed by user`（瞬时 8 次后消失，无害）

## 根因（strace 实锤）
- `.desktop` Exec=reasonix-launcher；launcher 把 `~/.local/bin` 当 install root
- 检测到 legacy 平铺布局（无 current.json）→ 派生 `reasonix-guard --install-root ~/.local/bin --no-relaunch` 迁移
- **迁移写死要求平铺层有 `reasonix-cli` 真实文件（拒绝 symlink，`symlink component is not allowed`），而 v1.19.4 发布包只有 `reasonix`（CLI 已改名）→ 迁移失败 exit 1 → launcher 退出 → 点击无反应**

## 修复步骤（可复用）
1. `cp -p ~/.local/bin/reasonix ~/.local/bin/reasonix-cli`（必须真实文件，symlink 会被拒）
2. `~/.local/bin/reasonix-guard --install-root ~/.local/bin --no-relaunch` → exit 0
3. 迁移产物：`~/.local/bin/current.json`（schemaVersion:1, activeVersion:v1.19.4, activeDir:versions/v1.19.4）+ `versions/v1.19.4/{reasonix-cli,reasonix-desktop}`（desktop 从平铺层**移动**过去，平铺 reasonix 保留为 CLI 入口）
4. 用户级覆盖启动器：`~/.local/share/applications/reasonix.desktop`，Exec 用**绝对路径** `/home/tianque/.local/bin/reasonix-launcher`（系统级 `/usr/share/applications/` 是 root 所有，无 sudo 改不了；用户级同名覆盖优先）

## 行为确认
- launcher 正常路径 = 读 current.json → exec `versions/<ver>/reasonix-desktop`；已有实例时 exit 1（单实例唤醒，属正常）
- 验证方法：关掉现有实例后点侧边栏

## 附带修复
- `~/.reasonix/skills/bilingual-translator/SKILL.md` 缺 frontmatter（无 name/description）→ 反复警告 "has no description" 且技能不进索引。已补 frontmatter，正文未动

**Why:** 双机 Reasonix 若遇到"侧边栏点不动/启动器报 migrate 错误"，本记录直接给出根因与两步修复。
**How to apply:** 升级后先跑 `reasonix doctor` + 一次 launcher 验证；遇到 `migrate: flat CLI binary reasonix-cli is required` 即按上述步骤处理。
