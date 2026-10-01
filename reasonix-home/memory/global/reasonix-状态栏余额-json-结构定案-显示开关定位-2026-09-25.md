---
id: mem-923a54f10095bdf4eecc9e2437622abb
revision: 1
created_at: "2026-09-25T12:26:11.5321422Z"
updated_at: "2026-09-25T12:26:11.5321422Z"
name: reasonix-状态栏余额-json-结构定案-显示开关定位-2026-09-25
description: Reasonix 的 balance_url 要求 DeepSeek 钱包余额 JSON 结构（is_available/total_balance/balance_infos[currency,topped_up_balance...]）；数据链路已通（日志有 Go-http-client 请求），看不到是因为状态栏由 statusBarVisible 控制、需在设置“信息栏显示项”里勾选“余额”
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 决定性发现：balance_url 的 JSON 结构
`reasonix-desktop.exe`（Go 写的 backend，v1.39.0 里约 71.9MB）内部结构体（直接扫字符串得到）：
```
IsAvailable   json:"is_available"
TotalBalance  json:"total_balance"
BalanceInfos  json:"balance_infos" []struct {
  Currency        json:"currency"
  TotalBalance    json:"total_balance"
  GrantedBalance  json:"granted_balance"
  ToppedUpBalance json:"topped_up_balance"
}
```
→ **就是 DeepSeek 钱包余额格式**（字符串字段，不是数字）。之前 0 命中是因为扫错了二进制：`app\Reasonix.exe`（234MB）只是 **Electron 外壳**，真正干活的是 `versions\v1.39.0\reasonix-desktop.exe`（UA = `Go-http-client/1.1`）+ `reasonix-cli.exe`。

## 数据链路已验证通
`logs\balance-hits.log` 里连续出现 `ua=Go-http-client/1.1`（每 1~2 分钟一次）→ **Reasonix 确实在拉本地端点**。端点已改成默认返回上面的 JSON（`?format=text` 才返回旧的一行文本）。

## 为什么界面看不到（真正的阻塞）
前端 `AppRuntimeView` 里：
```js
status: o.statusBarVisible ? { ..., labelStyle: r.preferences.statusBarStyle, items: r.preferences.statusBarItems, ... } : ...
```
→ **整个状态栏由 `statusBarVisible` 控制**。它的 i18n 词条（zh-DH6SpP_s.js）显示这一块在**设置**里可配：
- `settings.statusBarStyle` = “底部信息栏样式”（图标版/文字版）
- `settings.statusBarItems` = “信息栏显示项”（“勾选要显示的项目，拖拽手柄或用上下箭头调整顺序”；有“全部显示/恢复默认”按钮）
- `settings.statusBarItemsSummary` = “已显示 {visible}/{total} 项”
→ 设置 UI 里还有“余额查询接口”输入框（`settings.balanceUrlHint`：“可选。填了就会查询并在状态栏显示钱包余额。”）

## 结论 / 待办
1. 数据侧无需再改：端点 + `config.toml` 里 `commandcode-goat` 段的 `balance_url = "http://127.0.0.1:8790/balance"` 已就绪（v1.39.0 升级后这个键仍生效）
2. **剩下的是 UI 开关**：在设置的“信息栏显示项”里勾上“余额”（或点“全部显示”）/打开状态栏可见性。`%APPDATA%\reasonix` 下的 UI state 不让外部改（会被 conflict），交给用户点
3. 如果打开后显示不对，看 `logs\balance-hits.log` 对照 + 调字段（displayer 可能只取 currency + total_balance）

## 其它（下次省事）
- 确认过的事实：`PrintWindow(flags=2)` 能抓 Reasonix 窗口（1721x1081，含侧栏/对话，**底部没有状态栏**）；用户窗口逻辑尺寸 1113x963（desktop-window.json）
- 状态栏相关 i18n 位于 `assets/zh-DH6SpP_s.js`；主视图 `assets/AppRuntimeView-yadILPJF.js`（442KB）
- 注意：命令里的中文全角引号会让 PowerShell 解析报错（写输出标签时只能用 ASCII 或普通双引号）
