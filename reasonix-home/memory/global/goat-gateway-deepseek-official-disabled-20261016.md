---
id: mem-a27eabd61ddd29f0d95c02bc7ab12493
revision: 1
created_at: "2026-10-16T03:41:29.065Z"
updated_at: "2026-10-16T03:41:29.065Z"
name: goat-gateway-deepseek-official-disabled-20261016
description: "goat-gateway 的 deepseek-official key 已禁用（UAC 提权 + reload），以及 D 盘非提权写入的真实边界"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 事件
`D:\80-系统\Toolbox\goat-gateway\keys.json` 里 `deepseek-official` 的 `enabled: true` → `false`，2026-10-16 11:37:51 CST 通过 UAC 提权完成，随后 `curl -X POST http://127.0.0.1:8788/_gateway/reload` 热生效。

## 为什么禁
该 key 余额 **-0.22（欠费）**（2026-10-07 起，比 2026-10-01 记录的 ¥1.02 已耗尽）。它是 `priority: 0` 的兜底 key，只在 `qq` 冷却时被 failover 选中；上游回 **402 `Insufficient Balance`**，gateway 判成 `quota` 并把 402 body 原样透传给 dsh ⇒ dsh 归一化成 `QUOTA` ⇒ 界面显示「本轮运行失败 / 当前请求的额度已用尽」，**但真实原因是 qq 被上游 CF `Error 1102` / `ECONNRESET` / `ENOTFOUND api.commandcode.ai` 打挂**，qq 自己的额度一直很充足（10-07：5h 0.53/14、周 9.30/35、月剩 60.70）。禁掉它之后报错会如实显示为网络错误，不再误导。

## 回滚
把 `"enabled": false` 改回 `true`（`deepseek-official` 段内），再 curl reload。备份：`keys.json.bak-20261016-113751`（同目录）与 `C:\Users\27063\.dsh\storages\goat-gateway-keys.json.bak-20261016-113543`（C 盘副本，1265 B = 原全文）。

## ★ D 盘非提权写入的真实边界（踩坑结论）
- 2026-10-07 记录「D 盘全 DENY」；2026-10-16 重测**部分可用**：PowerShell `[IO.File]::WriteAllText('D:\...\__wtest.tmp','x')` + `Remove-Item` → **WRITE OK**；`[IO.File]::Open('...\keys.json','Open','ReadWrite','None')` → **keys.json OPEN RW OK**。
- **但 python 全失败**：`shutil.copy2` 新建 `.bak` → `PermissionError: [Errno 13] Permission denied`；`io.open(p,'w')` 覆写 keys.json → 同样 `PermissionError`。
- ⇒ **判定标准不同**：`[IO.File]::Open(...,'ReadWrite')` 打开已存在文件可过，但 **create-new 语义（.bak / open('w')）被拦**；`.tmp` 扩展名疑似被火绒放行。**不要用「PowerShell 能写」推断文件可替换**。
- ⇒ 结论：**改 D 盘 gateway 配置一律走 UAC**。可用通道 `Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','<ps1>'`（本机有 `C:\Windows\System32\sudo.exe`，未用）。**提权脚本必须把日志写到 C 盘**（`~/.dsh/logs/`），否则无法验证是否真的跑到。

## 替换算术（历史事故教训）
`'"enabled": true'` = **15** 字符，`'"enabled": false'` = **16** 字符 ⇒ **delta = +1 是正确预期**。2026-10-07 写坏 keys.json 的原因是用 PowerShell `Substring($j + 16)` 硬编码，多切 1 字符吃掉了后面的逗号 ⇒ JSON 非法（`Invalid object passed in, ':' or '}' expected. (187)`）。正确写法用 `needle.Length` 或 python `s[:j] + new + s[j+len(needle):]`。

## 相关脚本
`~/.dsh/storages/tools/_elev-disable-official.ps1`（3126 B，`Parser::ParseFile` SYNTAX OK，含备份 → 定位 `"name": "deepseek-official"` → 精确长度替换 → `ConvertFrom-Json` 验证 → 失败自动回滚），日志 `~/.dsh/logs/elev-disable-official.log`。

截至 2026-10-16 状态：`163 = false`、`qq = true`、`deepseek-official = false`；gateway 侧只有 `qq` 一个可用 key（**无 failover 对象**）。
