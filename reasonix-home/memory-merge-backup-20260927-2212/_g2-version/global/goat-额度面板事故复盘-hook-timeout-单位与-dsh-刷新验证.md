---
id: mem-5ad2c636d5ecec75cbfdca0c79296990
revision: 1
created_at: "2026-09-25T09:56:03.525046Z"
updated_at: "2026-09-25T09:56:03.525046Z"
name: goat-额度面板事故复盘-hook-timeout-单位与-dsh-刷新验证
description: 两个事故的根因与修法：Reasonix hook 的 timeout 单位是毫秒（15 → 会话中断，已由 dsh 修为 15000 并移除 UserPromptSubmit）；dsh 面板不刷新的真因是验证时误杀 dsh web 进程 + 刷新不可见（已改 30s + 时间戳 + ⟳）
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 事故根因（2026-09-25）
**hook 的 `timeout` 单位是毫秒**。我写了 `"timeout": 15`（本意 15 秒）→ 实际 15ms → hook 进程来不及启动就被强杀。
- 后果链（用户报「Reasonix 把自己搞死、回复中断」）：每次事件都触发被杀 → `UserPromptSubmit`（每轮都跑）叠加 → 回合中断/桌面版崩溃（`%APPDATA%\reasonix\crash-fatal\`、`repair\config.toml.last-known-good` 都是那时写的）
- **修复**：dsh 会话把两项 timeout 改成 `15000`（备份名 `settings.json.bak-timeout-20260925-174450` 是改前快照）；我随后**删掉 `UserPromptSubmit`**，只留 `SessionStart`（一次注入，风险最低）
- 现状：`reasonix hook status` = ok/1；本会话 `<hook-context event="SessionStart">` 正常注入 ✓
- 铁律：**Reasonix hook 的 timeout 一律写 15000（毫秒）**；能用 SessionStart 就别用 UserPromptSubmit（后者每轮执行，额外破坏 prompt cache）

## dsh 面板「不刷新」根因
1. **我的锅**：验证时反复 `Stop-Process` 杀 `dsh.*web` → 用户浏览器里的页面断连 → 表现为「不刷新」。**教训：修完/验完不要把用户的 dsh web 进程杀掉**；需要启动长期服务时用 `preserve_background_processes`。
2. 面板本身刷新太慢/不可见：已改 `REFRESH_MS 60000 → 30000`，弹层里加「更新于 HH:MM:SS」+ `⟳` 手动刷新按钮（点击徽标即展开并立即刷新）。

## 刷新验证法（关键细节）
- `puppeteer` + 系统 Edge（`executablePath: C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`）无头打开 `dsh web` 的带 token URL，`page.evaluate` 点击含 `GOAT` 的按钮展开，再隔 **75 秒**读一次 `\d\d:\d\d:\d\d`
- 实测：T1=17:53:46 → T2=17:54:42 `CHANGED=true` ✓
- **不能只等 35 秒**：服务端 `quota-http` 有 30s TTL，且 headless 页面的 `setInterval` 会被 Chrome 节流 → 35s 观察会误判成「不刷新」
- 脚本写在 `%TEMP%` 且必须 **`-Encoding ASCII` 时只写英文**（中文字符被替换成 `???` 会写坏正则）

## 当前服务状态
- `dsh web`：`http://127.0.0.1:8136/?token=...`（进程已保留；每次重启 token 会变）
- 额度端点：`http://127.0.0.1:8790/quota`（计划任务 `GoatQuotaHttp`）✓
