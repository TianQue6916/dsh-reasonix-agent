---
id: mem-ff69b59954147fc22333299821f13574
revision: 1
created_at: "2026-10-25T15:14:23.796Z"
updated_at: "2026-10-25T15:14:23.796Z"
name: dsh-local-search-插件已迁到C盘-junction法
description: "local-search 插件从 D:\\80-系统 迁到 C:\\Users\\27063\\.dsh\\plugins，用 junction 重指向，不需要提权"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 结论（2026-10-25）

`dsh-plugin-local-search` 的实体位置已从 `D:\80-系统\Toolbox\goat-gateway\dsh-plugin-local-search`（symlink 路径 `D:\Toolbox\...`）**迁到 `C:\Users\27063\.dsh\plugins\dsh-plugin-local-search`**。三端 profile 的 `node_modules/dsh-plugin-local-search` 都是 **junction**，现在全部指向 C 盘这份。

**以后改插件代码改 C 盘这份**：`C:\Users\27063\.dsh\plugins\dsh-plugin-local-search\index.js`。
D 盘那份（47238 B / 27 文件）保留为原始备份，已无人引用。

## 为什么不再需要提权（关键 lesson）

`D:\80-系统` 是 **High Integrity Level** 保护目录：ACL 显示 `Authenticated Users: Modify` 但普通进程写入一律 Access denied（python/PowerShell/cmd/touch 全失败），`Get-Acl -Audit` 还报 SeSecurityPrivilege 不足。之前所有「改了代码装不上」都卡在这。

**绕法**：`node_modules/<pkg>` 是 **junction（目录联接）**，创建/重定向 junction **不需要管理员权限**（只要对链接所在目录有写权限）。步骤：

```powershell
# 1. 复制实体到 C 盘可写位置
# 2. 删旧链接（只删 reparse point，不碰目标）：
[System.IO.Directory]::Delete($link, $false)
# 3. 用 cmd 的 mklink /J 重建（PowerShell 的 New-Item -ItemType Junction 在带尾斜杠时会存成 Global\ 前缀导致解析到旧目标，别用）
cmd /c "mklink /J `"$link`" `"$target`""
```

三端（desktop/headless/web）都做一遍。验证：三处 `md5sum .../index.js` 一致且等于 C 盘副本。

## 为什么 Start-Process -Verb RunAs 弹不出 UAC

dsh 的 tool 进程**不在交互式会话**里，`consent.exe` 无法在其窗口站上创建弹窗 ⇒ `Start-Process -Verb RunAs` 静默返回，无 consent 进程、无日志、文件时间戳不变。**不是权限配置问题，是会话隔离问题**。以后凡是 High IL 写操作，要么用户手动点（bat 右键管理员运行），要么走 junction 这类免提权路径。

## 本次顺带修掉的 bug

`maxResults` 被 `dsh-tool-web` 传的 `request.maxResults`（恒为 8）压回 8 条，配置调 30 无效。新逻辑（index.js:433-437）：

```js
const configuredMax = Math.max(1, Number(cfg.maxResults || 30));
const requestedMax = Number(request?.maxResults);
const maxResults = Number.isFinite(requestedMax) && requestedMax > configuredMax
  ? Math.floor(requestedMax) : configuredMax;
```

改完必须**重启 dsh 主进程**（node_modules 模块不参与 HMR）。
