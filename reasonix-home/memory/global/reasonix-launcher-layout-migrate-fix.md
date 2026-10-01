---
id: mem-e35da8ec8e5dfdf56b3776f568ed819f
revision: 1
created_at: "2026-08-03T14:48:41.895926588Z"
updated_at: "2026-08-03T14:48:41.895926588Z"
name: reasonix-launcher-layout-migrate-fix
title: Reasonix Linux launcher 布局迁移修复
description: Reasonix Linux 侧边栏启动失败修复：launcher 迁移 bug 根因（缺 reasonix-cli）+ 两步修复法 + 用户级 .desktop 覆盖
metadata:
  type: user
  fact_type: reference
  scope: global
---

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
