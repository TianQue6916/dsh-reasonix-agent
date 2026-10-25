---
id: "741c915f-574f-4130-afa9-5d4db87b26e4"
title: "D 盘「不可写」机制层定案（2026-10-07）：dsh Windows sandbox 把工具子进程降为 Low IL，no-write-up 拒绝写 D:\\*"
description: "2026-10-07 定案：D:\\Temp 写入 EPERM 的真正原因是 dsh-sandbox-windows-acl 用 CreateRestrictedToken + TokenIntegrityLevel 把工具子进程降为 Low Mandatory Level（S-1-16-4096），Windows no-write-up 规则拒绝写任何 Medium 客体；含同客体 High/Low 单变量实验、295 进程 IL 全景、desktop vs web profile 分支对比、三条可逆修复路径与唯一未查清点。"
status: "active"
created_at: "2026-10-06T16:34:03.985Z"
updated_at: "2026-10-06T16:34:03.985Z"
content_hash: "d8eed5531c91a0600d546eeeef349c6945e00b02697814583f07320699d27e6d"
source_paths:
  - "PLAN.md"
  - "logs/host-stdio.log"
  - "logs/process-tree.txt"
  - "logs/all-process-il.txt"
  - "profiles/web/cordis.patch.yml"
session_ids:
  - "22b34f55-392f-4237-ae73-73dfc154a4cb"
memory_body_ids:
  []
---

# D 盘「不可写」机制层定案（2026-10-07）

本机 Windows（用户 `天阙九泉\27063`，非管理员）实机实验。结论：**D 盘与文件系统都没有问题**；「D 盘不可写」是 **dsh 自己的 Windows sandbox 把工具子进程降成 Low integrity level** 后，内核 mandatory integrity level 的 no-write-up 规则拒绝了写入，错误文本再被 AI 复述进答复与思考链。

## 一、措辞来源（不是插件 UI 文案）

- 全盘搜索无 UI 文案命中：`app.asar`(121 MB) 内 6 处「不可写」全是帮助文档；`profiles/web/node_modules/*`、`.agent-presets/anchored-standard/*.mjs`、`~/.mnemon/runtime/*`、memory_profile 四份文档均 zero-hit。
- 三条进入用户视野的路径：desktop profile 启动期报错（`logs/host-stdio.log:11356` 逐字 `spill-local (@deepseek-ai/dsh-spill-local): Error: EPERM: operation not permitted, mkdtemp 'D:\Temp\dsh-spill-XXXXXX'`，栈尾 `file:///C:/Users/27063/.dsh/profiles/desktop/#spill-local`）；AI 在 session 的 `turnOutline/turns[*]/response` 里复述；tool 结果面板直接显示 stderr 原文。
- `session-c424a630` 的 `contextTimeline/surface`（225 entries）中「不可写」4 处**全为用户自己的输入**（title / titleInput / turnOutline[0].prompt / surface[0].text），`form=recall` 的 mnemon 注入正文里没有 ⇒ 不是注入进来的。

## 二、机制层：不是 DACL，是 integrity level

同客体、同用户、同 ACL，只换 token ⇒ 结果相反（High 由提权进程验证）：

| 客体 | DACL | 非提权 (Low) | 提权 (High) |
|---|---|---|---|
| `D:\Temp` | `BUILTIN\Authenticated Users:(I)(M)` = Modify | ❌ EPERM | ✅ OK |
| `D:\` | 同上 | ❌ | ✅ |
| `D:\Toolbox` | 同上 | ❌ | ✅ |
| `C:\Windows\Temp` | `BUILTIN\Users:(CI)(special)` | ❌ | ✅ |
| `C:\Users\Public` | 标准公共目录 | ❌ | ✅ |
| `C:\Users\27063\AppData\Local\Temp` | 当前用户 FA | ✅ | ✅ |

- `D:\Temp` SDDL 里**没有任何 deny ACE**，AU 明确有 `0x1301bf`(Modify) ⇒ **DACL 解释不通 EPERM**。
- `fsutil fsinfo volumeinfo D:` → `File System Name : NTFS` / `Is ReadWrite`；`Win32_LogicalDisk` D: → `DriveType 3`（本地固定盘）、`VolumeDirty False`、`FreeSpace 262910869504`(≈245 GiB) ⇒ 卷也正常。
- 唯一变量是 token 的 integrity level：Low 主体受 **no-write-up** 约束，写任何未标 Low（默认 Medium）的客体一律被拒。

## 三、谁把它降成 Low —— dsh 自己的 sandbox

代码级证据在 `C:\Users\27063\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-sandbox-windows-acl\lib\types-Cl_DXjhk.js`：

- `:179` `:714` `:722` `:769` `:893` `:895` → `CreateRestrictedToken`
- `:820` `:839` → `SetTokenInformation` + `TokenIntegrityLevel`
- `:422` `:825` `:831` → `S-1-16-4096`（**Low Mandatory Level**）

即 dsh 的 Windows 沙箱实现 = **restricted token + 显式设 Low IL**。`cordis.patch.yml:382` 的注释 `# No OS sandbox confinement on Windows (landlock is linux-only)` 只针对 landlock；Windows 上 dsh 改用 ACL/IL 沙箱（同目录另有 `dsh-bash-sandbox` / `dsh-pwsh-sandbox` / `dsh-fs-sandbox` / `dsh-sandbox-policy` / `dsh-sandbox-local`）。

## 四、现场进程树（提权 dump，295 进程）

```
Medium  explorer.exe(4152)
  └ LOW  DeepSeek Harness.exe(20344)  --no-sandbox          ← 主进程就已经是 Low
      └ LOW  DeepSeek Harness.exe(9116)  dsh-desktop-host
          ├ LOW  DeepSeek Harness.exe(16188) dsh-subprocess-local/runner.js
          │   └ LOW  bash.exe(17136) ← 工具命令就跑在这里
          ├ LOW  node.exe(18360) billion-context
          └ LOW  node.exe(20020) mcp-goat-quota.mjs
```

对比 web profile 那一支（正常 Medium）：

```
Medium  cmd.exe(27004)  /c dsh --profile web --port 3080 --no-open
  └ Medium  node.exe(27072)  .../@deepseek-ai/dsh/lib/bin.js --profile web
      ├ Medium node.exe(2860)  mcp-goat-quota.mjs
      ├ Medium node.exe(8596)  dsh-computer-use-win/mcp/server.mjs
      └ Medium node.exe(27304) dsh-wechat-bridge
```

全机 IL 分布（283 进程）：**System 152 / Medium 71 / LOW 45 / High 8 / Untrusted 5**。`explorer` = Medium、`winlogon`/`dwm` = System ⇒ **不是整个会话被降级**，降级只发生在 dsh 这一支。

## 五、为什么偏偏 C 盘用户目录能写

`C:\Users\27063` 整棵树被显式标成 Low IL（与 2026-10-06「快捷栏图标全部变白纸」同一根因），所以 Low 工具进程在里面畅通；`D:\*`、`C:\Windows\Temp`、`C:\Users\Public` 从未标 Low ⇒ Medium ⇒ 一律拒写。这也解释了 `PLAN.md:457` 的旧记录「`D:\Temp` 与 `D:\` 根现在都可写（2026-10-04）」——那次是提权环境测的，非提权下它们从来不可写。

## 六、修复路径（均未执行，待用户拍板）

1. **只让某个目录对 Low 放行**（最小改动、可秒回滚）：提权跑 `icacls "D:\Temp" /setintegritylevel (OI)(CI)Low`；回滚 `icacls "D:\Temp" /setintegritylevel (OI)(CI)Medium`。
2. **把工具 temp root 指到 C 盘**（已实施）：`profiles/web/cordis.patch.yml:1506-1523` 固定 `TEMP`/`TMP` = `C:\Users\27063\AppData\Local\Temp`。
3. **改沙箱策略**：`profiles/web/cordis.patch.yml:1316-1328` 的 `@deepseek-ai/dsh-permission-presets`（`defaultPreset: danger-full-access`）；注意 `dsh-sandbox-windows-acl` 是独立 seam，光改 preset 不一定摘掉 IL 降权，需实测。

## 七、仍未查清

`DeepSeek Harness.exe`(20344) 的 parent 是 **Medium** 的 explorer，它自己却是 **Low**，且在任何 dsh node 代码跑起来之前就已是 Low ⇒ **不是第四节那个 sandbox 干的**。两种可能：explorer 用低完整性 token 启动它（快捷方式/launcher 层面降权），或有安全软件介入。**此点未定案。**

## 关联文档

- `a8a10cd0-28d7-473f-8466-d7c8c76e3f3c`：2026-10-06 白纸图标机制层定案（profile 树整体 Low IL）——本文第五节的同源根因。
- `b01208b5-6216-4343-b97a-860fa3bfcfd5`：2026-10-04 dsh-pilot / computer-use 与 `D:\Temp` 不可写根因（当时归因于 TEMP 变量指向，本文将其推进到 IL 机制层）。
- `c45d2064-e5ea-43a2-871b-cac54b75728c`：2026-10-04 D 盘整盘写失败 ACL/卷级排查（本文已否证 ACL 与卷假设）。
