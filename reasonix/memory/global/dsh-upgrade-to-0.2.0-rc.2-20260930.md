---
id: mem-de752e5631b605451dd494674974574b
revision: 1
created_at: "2026-09-30T05:22:40.448Z"
updated_at: "2026-09-30T05:22:40.448Z"
name: dsh-upgrade-to-0.2.0-rc.2-20260930
description: "dsh 0.1.7-rc.2 → 0.2.0-rc.2 升级完成：4 插件适配+豁免、dump-config 验证、可复用脚本与 PowerShell \\$pid 陷阱"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# dsh 升级 0.1.7-rc.2 → 0.2.0-rc.2 完成（2026-09-30 13:02）

## 结果：成功，无回滚
日志 `~/.dsh/logs/upgrade-0.2.0-rc.2.log`：
```
13:00:20 停 dsh：PID 30032
13:00:25 npm i -g @deepseek-ai/dsh@0.2.0-rc.2   （2m，added 30 / removed 12 / changed 508）
13:02:22 npm exit=0   安装后版本 = 0.2.0-rc.2
13:02:23 dump-config exit=0 bytes=157950 skipped=0 other-stderr-lines=0   ✓
13:02:23 重放 reasoning-autofold patch → patch exit=0
13:02:35 ✓ dsh 已在 3080 监听（PID 12720）
13:02:35 结束。失败原因 = （无）
```

## 升级前必须先做的插件适配（否则静默跳过 4 个插件）
0.2.0-rc.2 的 plugin 兼容性校验会**静默 skipping**（`exit=0`，不报错）：
| 插件 | 原版本 | 处理 |
|---|---|---|
| `dsh-mnemon` | 0.5.16 | **升 0.5.20**（peerDeps `^0.1.7-rc.2 \|\| ^0.2.0-rc.1`，同时兼容新旧） |
| `dshmarket` | 1.66.2 | **升 1.66.6**（同上） |
| `dsh-headroom` | 0.3.0 | 精确豁免（作者 main 停在 2026-08-23，peerDeps 硬上限 `<0.2.0-0`） |
| `@lanbaolu/dsh-wechat-bridge` | 0.9.1 | 精确豁免（0.9.1 已最新，尚未适配） |

**先升前两个再升 dsh 是安全的**：新版本同时兼容 0.1.7，所以旧 dsh 照常跑。

## 豁免语法（`--help` 不可用，从源码 `lib/plugin-BGnVfe_D.js` 读出）
```bash
dsh plugin --profile web allow-version <pkg@ver> --dsh-version <exact> --accept-risk
dsh plugin --profile web revoke-version  ...
dsh plugin --profile web version-exemptions
```
写入 `~/.dsh/profiles/web/compatibility.json`，形如 `{"dsh-headroom@0.3.0": ["0.2.0-rc.2"]}`，
**精确到 (包版本 × dsh 版本)** —— 作者发新版后需重新豁免。

## 升级验证（0.2.0-rc.2 实测）
- `--dump-config`：exit=0、stderr 空、rows 416、77528 bytes
- **60 个 model 的 reasoningEfforts 完整保留**：46 个 `false` + 14 个五档 block + 14 个 `'off': null`
  ⇒ 自写的 model list 不受 "pi-ai 0.85.1 → 0.87.1 部分旧 model id 被移除" 影响
- 插件全在：mnemon 35 / wechat 3 / headroom 3 / dshmarket 2 / replay 4 / deja 11
- **reasoning autofold 补丁在新版上依然有效**：新版 `ReasoningRow`
  （`lib/client.js:5800`）签名仍是 `({ text, running, usePresentation, useDisclosure, t })`，
  `running` 在后续 40 行里被用 10 次，`node --check` OK

## 复用的升级脚本
`~/.dsh/storages/tools/upgrade-dsh-0.2.0.ps1`（160 行，AST OK）
- 停 3080 → `npm i -g` → **dump-config 验证（exit=0 且 skipped=0 且 bytes>=60000）** → 失败即
  `npm i -g @0.1.7-rc.2` 回滚 → 重放 `patch-reasoning-autofold.mjs` → `launch-dsh.ps1 -Mode Serve`
- ⚠️ **必须由 Task Scheduler 拉起**，不能从 dsh 内部 `Start-Process`：
  2026-09-30 02:10 实测，从 dsh 内部重启，杀掉旧进程后脚本自己也被级联终止（空转 51 分钟）。
  排任务：`Register-ScheduledTask -TaskName 'dsh-upgrade-020' -Action (New-ScheduledTaskAction -Execute powershell.exe -Argument '-NoProfile -ExecutionPolicy Bypass -File <script>') -Trigger (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2))`
- ⚠️ **PowerShell 陷阱**：`$pid` 是只读自动变量，拿它当循环变量会抛错；用 `$procId`。

## 仍未解决
`npm i -g` 会重装全局 dsh 的 node_modules，因此 **node_modules 里的所有 patch 都会被还原**。
目前只有 `patch-reasoning-autofold` 写进了升级脚本的自动重放步骤；
`patch-replay-thinking.mjs`（鲸小深动画 → thinking）**尚未纳入**，本次升级后需手动确认。
