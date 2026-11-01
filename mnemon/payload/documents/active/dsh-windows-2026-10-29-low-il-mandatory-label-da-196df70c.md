---
id: "196df70c-aca7-4ce5-a93e-6458f31e0b40"
title: "dsh Windows 维护定案（2026-10-29）：Low IL 目录可写性只能修 mandatory label（DACL 无效 + 引号语法坑）；版本升级用逐字节 diff 判定\"零改动\""
description: "两条可复用结论：①workspace 外的持久目录（C:\\relay）要让 Low IL 子进程可写，必须 icacls /setintegritylevel \"(OI)(CI)Low\" /T（改 mandatory label，带引号），改 DACL 的 ACE 完全无效；验证标志为 Mandatory Label\\Low Mandatory Level:(OI)(CI)(NW)，附回滚与边界。②评估 dsh 版本升级收益用 npm pack + diff -rq 逐字节对比；rc.2 vs rc.4 四个内核包仅有 package.json 版本号差异，故判定不值得升级。引用 41ce8bea、741c915f。"
status: "active"
created_at: "2026-10-28T16:20:10.918Z"
updated_at: "2026-10-28T16:20:10.918Z"
content_hash: "efbb674eec961efeb428852b55cbcb70f4e066a2638122dc50110752e16e25bc"
source_paths:
  - ".dsh/plans/9302c6d1-f90e-4f20-9278-faf937f3eacd.md"
session_ids:
  - "9302c6d1-f90e-4f20-9278-faf937f3eacd"
memory_body_ids:
  []
---

# dsh Windows 维护定案（2026-10-29）

机制背景不入本文：workspace 全树被 dsh 打 Low label 见 `41ce8bea-bcaf-48a1-bf8b-38bca0fc55a5`；Low IL no-write-up 拒绝写 Medium 对象（D:\* 案例）见 `741c915f-574f-4130-afa9-5d4db87b26e4`。本文只记本轮新增的两条可复用结论。

## 结论 1：让 Low IL 子进程写某个目录，只能改 mandatory label —— 改 DACL 无效

场景：`C:\relay`（Windows↔Linux relay spool，含 `lin2win/ win2lin/ STATE.md relay.ps1`）需要被 dsh 的 Low IL 工具子进程读写。

两次失败的做法与原因：

- `icacls 'C:\relay' /grant "*S-1-16-4096:(OI)(CI)(M)"` —— 改的是 **DACL**。no-write-up 是 **MAC（mandatory label）检查**，在 DACL 之前就拒绝，所以这条 ACE 等于没加。
- 推论：`Everyone` / Authenticated Users 本来就在 restricting token 的 workspace-write SID 列表里，写失败不是"缺 ACE"，而是 **label 层拒绝**（官方 Agent Note 原话大意：Everyone 仍在两份列表中，但不再授予写权限，因为 label 层拒绝它）。所以必须动对象完整性标签。

正确命令（一次 UAC 提权即可，recursive）：

```powershell
icacls 'C:\relay' /setintegritylevel "(OI)(CI)Low" /T /C
```

成功标志：`icacls` 输出末尾多出一行

```
Mandatory Label\Low Mandatory Level:(OI)(CI)(NW)
```

`(NW)` = No-Write-Up，即允许 Low IL 及以下写入。**看这一行，不要只看命令退出码。**

回滚：`icacls 'C:\relay' /setintegritylevel "(OI)(CI)Medium" /T`。

### 语法坑（曾导致误判"已执行"）

```
icacls C:\relay /setintegritylevel (OI)(CI)Low /T     # PowerShell 把 (OI)(CI)Low 当表达式吞掉
```

表现是：**既无输出、也无报错**，日志里第 2 段与第 3 段之间整段空白，极易误判为成功。参数必须写成字符串：`"(OI)(CI)Low"`（PowerShell 中双引号；此前还有 `/match 'Mandatory Label\Low'` 因 `\L` 非法转义报错的坑，正则要转义）。

### 验证与边界

- 打标后实测：Low IL shell 下 `echo > _lowil_ok.txt` 成功；`mkdir -p drop/<date>` 子目录创建 / 写入 / 删除全部通过；读回内容正确。
- dsh 会给 **workspace 树**打持久 Low label，新 session 或升级时可能重置；**workspace 之外的目录**（如 `C:\relay`）不会被 dsh 重新打标，固一次即长期有效 ⇒ 需要长期可写的跨会话共享目录应放在 workspace 外。
- 仅当目标目录不含凭据、且接受 Low IL 进程可写时才可这样放宽（`C:\relay` 满足）。

## 结论 2：评估 dsh 版本升级收益要"逐字节 diff"，不能用"别处升了没事"推断

"Linux 在 rc.4 上跑得好"不构成升级理由 —— 没问题 ≠ 有收益。可复用的本地判定法（不需要另一台机器）：

```bash
npm pack <pkg>@<oldVer>   # 与 @<newVer>，分别落到 old/ new/
tar -xzf *.tgz && diff -rq x_old_*/package x_new_*/package
```

2026-10-28 对 `0.2.1-rc.2` vs `0.2.1-rc.4` 的实证（四个内核包）：

| 包 | JS 文件数 | 差异文件 |
|---|---|---|
| `@deepseek-ai/dsh-sandbox-windows-acl` | 3 | 仅 `package.json` |
| `@deepseek-ai/dsh-agent-loop` | 1 | 仅 `package.json` |
| `@deepseek-ai/dsh-sandbox` | 1 | 仅 `package.json` |
| `@deepseek-ai/dsh-tool-bash` | 1 | 仅 `package.json` |

`package.json` 差异全部是版本号字符串替换（`0.2.1-rc.2` → `0.2.1-rc.4`，含依赖声明）。抽样 md5 确认 `lib/*.js` 完全一致（如 `dsh-agent-loop/lib/index.js` 两版同为 `a69ede59…`，`dsh-sandbox-windows-acl/lib/runner.js` 两版同为 `7642972c…`）。

⇒ **rc.4 对 sandbox / agent-loop / tool-bash 零代码改动**；新增可见收益只有 rc.3 的三条 UI（左/中/右栏「更多」菜单、切会话草稿恢复、API Key 适配器模型列表对齐），rc.4 连 GitHub Release 正文都没有。

判定规则：`diff -rq` 只报 `package.json` ⇒ 零改动，不必升。

成本侧（本机约束）：桌面端升级必须**整目录替换**（`DeepSeek Harness.exe` + `app.asar`），本机 NSIS 恒返回 rc=2，只能 7z 切包 + rename；且升级后**必须重测 `C:\relay` 可写性**（新版本可能改 provisioning 逻辑）。结论：等下一个大版本。

## 相关文档

- `41ce8bea-bcaf-48a1-bf8b-38bca0fc55a5` — workspace Low label 机制定案、icacls 修复路径（限 App 目录）
- `741c915f-574f-4130-afa9-5d4db87b26e4` — Low IL no-write-up 拒绝写 D:\*
- `98942c3e-781e-43e4-a52a-58dd3cf47819` — Electron `--no-sandbox` 仍继承 Low IL 的交叉证据
