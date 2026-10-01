---
id: mem-006f4902d71e18368b0246a1ea7cdd9d
revision: 1
created_at: "2026-09-25T11:40:20.0084873Z"
updated_at: "2026-09-25T11:40:20.0084873Z"
name: reasonix-状态栏余额打桩为-goat-六额度-2026-09-25
description: Reasonix 桌面版底部状态栏的 balance（“余额”）项数据源 = provider 级 balance_url；已把它指向本地 http://127.0.0.1:8790/balance（返回 2 账号×5h/周/月 共 6 个额度）+ 请求日志观测法，需重启 Reasonix 生效
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 背景
Reasonix 桌面版是**无边框自绘 UI**（顶部那条只是它自己画的工具条，无系统标题栏）→ 改窗口标题用户看不到。真正的内置位置是**底部状态栏**。

## 配置面（`%APPDATA%\reasonix\config.toml`）
- `status_bar_items = ["model","workspace","git_branch","cache","cache_avg","session_tokens","turn_tokens","turn_cost","session_turns","context","compact","cost","balance","turn_tps","turn_output_tokens","turn_cache_tokens"]`（第 30 行，16 项，已含 `balance`）
- `status_bar_style = "text"`（第 28 行：icon|text）
- **`balance_url` 是 `[[providers]]` 段里的 per-provider 键**（官方 deepseek 在第 98 行）。显示“余额”时取**当前 provider** 的 balance_url → 已给 `commandcode-goat` 段（第 113 行）插入：
  `balance_url = "http://127.0.0.1:8790/balance"`（备份 `.bak-balance-20260925`）
- i18n 佐证：`status.balanceLabel`="余额"、`status.balanceTitle`="钱包余额"、`settings.balanceUrlHint`="可选。填了就会查询并在状态栏显示钱包余额。"
- `[statusline] command`（第 185 行）注释写的是“first stdout line **replaces the built-in data row**”，stdin 收到 `{"model","contextUsed","contextWindow","cwd"}` → 值得跟状态栏一起验证是否对桌面版也生效

## 新增端点
`quota-http.mjs` 增加 `GET /balance`：
- 默认 **text/plain 一行**：`163 5h 3% 周 66% 月 56%   |   qq 5h 1% 周 9% 月 54%`
- `?format=json` → DeepSeek 风格 `{is_available, balance_infos:[{currency,total_balance,granted_balance,topped_up_balance} × 6]}`
- 每次请求写 `logs\balance-hits.log`（ISO 时间 + UA + query）→ 用来判定 Reasonix 是否真来拉数据
- **格式仍未知**：前端 assets 与 exe 里都搜不到 `balance_infos/total_balance/is_available`（全量扫 exe 会超时）→ 先按纯文本试

## 待办 / 下一步
1. **重启 Reasonix** 才会读取新 provider 配置（实测 35 秒内无任何请求到达 /balance）
2. 重启后看窗口底部状态栏的“余额”项；若状态栏根本不显示，需在设置里找开关
3. 用 `logs\balance-hits.log` 判定：有非 PowerShell 的 UA 到达 = 它真的在拉；看它拿走的响应格式再调

## 其它有效信息（下次省事）
- 3 个 `Reasonix.exe` 进程（pid 7056 有窗口，标题 hwnd 4982284），exe 在 `C:\Users\27063\Desktop\工具箱\.reasonix\Reasonix\versions\v1.38.10\app\Reasonix.exe`（234MB）；前端资源在同级 `resources\app\assets\*.js`（250 个）+ 中文词条 `zh-*.js`
- 这个会话里 `PrintWindow`（flags=2）+ `CopyFromScreen` **都能用**（之前记忆里的“抓不到窗口/只有壁纸”已不成立）
