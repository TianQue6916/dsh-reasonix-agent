---
id: mem-41eeadbe5ee4fc3aef045f5e133eaeb8
revision: 2
created_at: "2026-09-28T07:50:42.644Z"
updated_at: "2026-09-28T10:11:04.233Z"
name: backup-to-github-copies-and-excludes
description: "backup-to-github.ps1 的副本真相与去漂移、tmp-probe 排除、PowerShell 零副作用语法校验法，以及 2026-09-28 新增的 ~/.dsh/remote/ 私钥排除与 robocopy /L 验证法"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# backup-to-github-copies-and-excludes

## 一、`backup-to-github.ps1` 的副本真相（2026-09-28 澄清）
三个"副本"实际上只有 **两个真实文件**：
- `C:\Users\27063\Desktop\reasonix-ops\backup-to-github.ps1` ← 计划任务 `ReasonixGitHubBackup` 引用的路径
- `C:\Users\27063\Desktop\工具箱\reasonix-ops\backup-to-github.ps1` ← **与上面是同一个文件**（同 inode，改一个另一个跟着变）

第三个 `C:\Users\27063\Desktop\工具箱\学科总结文档生成\reasonix-ops\backup-to-github.ps1` 是 **09-27 的旧版**且带"自指陷阱"正则（裸串 `-----BEGIN [A-Z ]*PRIVATE KEY-----`，会把任何*提到*这串文字的内容判为密钥泄漏 → 9/26–9/28 零成功推送）。已用主脚本覆盖，旧版存档为同目录 `.bak-20260928-1625-pre-sync`。

## 二、`tmp-probe` 不再进公开 repo
`~/.dsh/tmp-probe/` 有 **46MB**（45MB 是 wechat bot 调研解包的 npm 源码）且**不在** dsh target 的 `XD` 列表里 → 会被 push 到公开 repo。已在 `XD` 末尾追加 `'tmp-probe'`。

同一列表里**刻意保留**的：`_archive-20260928`（25 个归档脚本，跨机同步需要它们）。

## 三、验收脚本副作用的正确做法
改 PowerShell 脚本后不想触发真实副作用时，用 AST 解析代替真跑：
```powershell
$errs = $null
[void][System.Management.Automation.Language.Parser]::ParseFile('<path>', [ref]$null, [ref]$errs)
if ($errs.Count -eq 0) { 'syntax ok' } else { $errs | Select-Object -First 5 | Format-List }
```

## 四、`~/.dsh/remote/`（ds-harness-remote 设备私钥）已排除 —— 2026-09-28 18:10

**风险**：装 `ds-harness-remote` 后，dsh 自动生成
`$DSH_HOME/remote/servers/<serverHash>/{host,client}/`，内含
- `device.key` —— **x25519 私钥**（44 字节 base64url，明文单行）
- `device.json` —— publicKey + deviceId + 主机名
- `trusted-peers.json` —— 已 pin 的对端设备身份

`<serverHash>` 只由 serverUrl 决定（这里两套 DSH_HOME 共用 `e9988d504cda7c1541adafcc`）。
repo `reasonix` 是 **public**（`git@github.com:TianQue6916/reasonix.git`），私钥入库 = 把"被 pin 的设备身份"交给所有人。

排查确认：**未泄漏**（repo 里 9/28 11:57 的快照早于 remote/ 的诞生，`find` 全树无 `device.key`）。

**三处修复**（都在 2026-09-28 18:10 完成）：
1. dsh target 的 `XD` 末尾追加 `'remote'`
2. 同一 target 的 `XF` 追加 `'device.key','device.json','trusted-peers.json'`（深度防御，万一 XD 漏）
3. repo `.gitignore` 追加 `dsh/remote/` / `**/remote/servers/` / `**/device.key` / `**/trusted-peers.json`

改后：sha256 前缀 `ff4cb06b6a1e851c`，12473 bytes，三路径两个真实文件一致，AST parse OK。

**零副作用验证法（robocopy `/L` 列表模式）**：
```powershell
$out = @(& robocopy 'C:\Users\27063\.dsh' 'C:\Users\27063\.dsh-rc-exclude-test' /E /L /NJH /NJS /NDL `
        /XD 'gate' 'remote' 'sessions' 'cache' 'attachments' 2>&1)
@($out | Select-String -Pattern '\.dsh\\remote\\' -SimpleMatch).Count   # 必须为 0
@($out | Select-String -Pattern '\.dsh\logs\\'   -SimpleMatch).Count   # 对照组，应 > 0
@($out | Select-String -Pattern '\.dsh\gate\\'   -SimpleMatch).Count   # 对照组，应为 0
```
实测 0 / 10 / 0 ✅ —— `/XD <裸目录名>` 确实递归排除任意层级的同名目录。
