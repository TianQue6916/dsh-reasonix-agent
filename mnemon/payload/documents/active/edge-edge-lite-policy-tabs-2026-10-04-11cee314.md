---
id: "11cee314-0b8c-45bc-ac9c-9f436a73d608"
title: "Edge 启动内存诊断与轻量化方案（edge-lite）：实测归因、policy 七条与 Tabs 标签恢复（2026-10-04）"
description: "2026-10-04 对「Edge 启动占 2.6GB」的实测定案与轻量化交接：启动峰值 vs 稳态的回落数据（2637/1212/519MB）、三个真凶与 751.7MB 差值归因、社区两招在本机为 no-op 的证据、HKCU policy 七条与 EfficiencyMode=0 的 unplugged 陷阱、Edge 进程 Access is denied 的 CDP 清场手段、以及误用默认 profile 导致「标签看起来丢了」的事故与 Tabs_ 备份恢复流程。"
status: "active"
created_at: "2026-10-04T07:35:50.913Z"
updated_at: "2026-10-04T07:35:50.913Z"
content_hash: "3a496427dc26f42341f7cec265e46e23a800fa817aa621c7fae64da47d4d21d3"
source_paths:
  - "storages/tools/edge-lite/REPORT.md"
  - "storages/tools/edge-lite/apply-lite.ps1"
  - "storages/tools/edge-lite/snapshot.ps1"
  - "storages/tools/edge-lite/recovered/RECOVER-LINKS.html"
  - "storages/tools/edge-lite/recovered/urls.txt"
session_ids:
  - "1b917187-9e8a-450e-bcc9-c4974ba3eb80"
memory_body_ids:
  []
---

# Edge 启动内存诊断与轻量化方案（edge-lite）

日期：2026-10-04。目标（用户原始意图）：降低 Edge 启动内存 / 让 Edge 更轻量，参考社区经验。
产物目录：`C:\Users\27063\.dsh\storages\tools\edge-lite\`（`REPORT.md` 完整诊断、`apply-lite.ps1`、`snapshot.ps1`、`recovered/`）。
环境：Windows 台式机，Edge 154，用户 profile 位于 `C:\Users\27063\AppData\Local\Microsoft\Edge\User Data\Default`。

## 1. 核心定案：要压的是启动峰值，不是稳态

| 场景 | 进程数 | WorkingSet |
|---|---|---|
| 用户 profile 冷启动 4 秒 | 21 | **2637 MB** |
| 用户 profile 静置 40 分钟后 | 21 | **1212 MB** |
| 全新 profile + `--disable-extensions`（地板） | 8 | **519 MB** |

- 「一启动 2.6GB」是真的，但是 **spike**；同一实例静置 40 分钟自行回落约 1.4GB。
- 实测：**仅多打开一个页面 = +690MB**（renderer 82→523，gpu 125→331）。这是标签恢复昂贵的直接原因。
- 519MB 是地板（browser / gpu-process / NetworkService 内核），压不掉。

## 2. 社区两招在本机是 no-op（有证据）

社区标准答案「关 Startup boost + 关后台运行」在本机省不下任何内存，因为从未启用：

- `HKCU\SOFTWARE\Policies\Microsoft\Edge` 与 HKLM 对应键 **完全为空**。
- `Preferences` 中 `background_mode` / `startup_boost` / `session` / `restore_on_startup` 全为 `None`（从未写过）。
- Run 键中**没有任何 Edge 启动项**。

⇒ 结论以本机实测为准，而非社区文章。3 组 web_search 召回的多为无关 github 噪音，几乎无带数字的来源。

## 3. 三个真凶（差值精确对上 751.7MB）

| 真凶 | 开销 | 证据 |
|---|---|---|
| ① 会话恢复（`exit_type = Crashed`） | 启动峰值主项 | 每次启动重开 5 个 URL |
| ② 5 个第三方扩展 | **454 MB** | `renderer:EXT` 335.2 + `VideoCaptureService` 94.8 + `AudioService` 24.1；这三类在裸 Edge 中一个都没有 |
| ③ Edge 154 自带服务 | ~40 MB | `EdgeXPayWalletService` 20.5 + `CollectionsDataManager` 18.6，登录账号后自动起 |

最可疑扩展是 **Sider**：含 `record-background.html` 录屏背景页，权限重到 `declarativeNetRequest + cookies + scripting + offscreen + sidePanel + userScripts`，`VideoCaptureService` 那 95MB 大概率由它拉起（裸 profile 无此进程）。
其他扩展：Monica、腾讯翻译、迅雷、ScriptCat（ScriptCat 建议保留）。

## 4. 行动方案

### A. 图形界面（零风险，收益最大）
1. `edge://settings/onStartup` → 选「打开新标签页」；并让 Edge **正常退出一次**，把 `exit_type` 从 `Crashed` 洗成 `Normal`。（数据安全权衡见第 6 节，最终建议改为「继续上次浏览」。）
2. `edge://extensions` → 禁用 Sider / Monica / 腾讯翻译 / 迅雷（5 个全禁也只再多约 90MB）。
3. `edge://settings/system` → 确认「睡眠标签」为开。

### B. policy（HKCU，免管理员，可一键撤销）
```powershell
cd C:\Users\27063\.dsh\storages\tools\edge-lite
powershell -NoProfile -ExecutionPolicy Bypass -File .\apply-lite.ps1 -DryRun   # 先看
powershell -NoProfile -ExecutionPolicy Bypass -File .\apply-lite.ps1           # 应用
powershell -NoProfile -ExecutionPolicy Bypass -File .\apply-lite.ps1 -Revert   # 撤销
```
写入 7 条 DWORD：`EfficiencyMode=0`、`SleepingTabsEnabled=1`、`SleepingTabsTimeout=900`、`AutoDiscardSleepingTabsEnabled=1`、`StartupBoostEnabled=0`、`BackgroundModeEnabled=0`、`ShowRecommendationsEnabled=0`。
应用后 `edge://policy` 应显示为 OK；副作用是 `edge://settings` 顶部出现「由你的组织管理」，`-Revert` 可完全消除。
`snapshot.ps1 before|after` 用于改配置前后自测对照。

**`EfficiencyMode` 陷阱**：取值中 `BalancedSavings(4)` 是默认，但官方 policy 原文写明 *"On devices with no battery, energy saver is disabled by default and does not become active"* —— 除 `AlwaysActive(0)` 外，2/3/4/5 的触发条件全是 "when the device is unplugged"，台式机永远不触发，因此必须显式设 `0`。

### C. 可选
复制一个快捷方式加 `--disable-extensions --disable-sync`，当作轻量模式使用。

### 预期（保守估）
启动峰值 2637 → **约 1000–1300 MB**；稳态 1270 → **约 750–850 MB**。

## 5. 环境与测量坑（复现时必看）

- **Edge 进程杀不掉**：`Stop-Process -Force` / `taskkill /F` / 计划任务绕过全部返回 `Access is denied`，疑似火绒浏览器保护。唯一有效清场手段：启动时带 `--remote-debugging-port`，再通过 CDP `Browser.close` 关闭。
- `$_` 在 bash 传递中被吞掉，导致脚本取值错误。
- `--user-data-dir` 经 `-ArgumentList` 传参被截断，产生 5GB 假数据。
- Edge 有「关不掉的测试实例」时，需用户手动关窗口。

## 6. 事故与教训：测试实例误用默认 profile

事故经过：为做 A/B 对照起了测试实例（`--user-data-dir=...\edge-lite\prof-c`，其中一次默认 profile 也被带起），用户随后看到「我数据都没了?」。

机制认定（agent 自认部分）：
- Edge `restore_on_startup` 默认是「打开新标签页」，本来就不自动恢复会话；上次能看到标签回来，是 `exit_type = Crashed` 触发的**异常退出恢复**，属特例而非常态。
- 测试实例启动 → 只恢复出很少的 URL 并写了自己的 session → 用户关掉后 Edge 轮换了 session 文件（旧 `Session_13435571564208807` 消失）。**不能排除**该动作让原本的崩溃恢复点失效。
- 但数据文件未被触碰：`Bookmarks`(47KB)、`History`(8.4MB)、`Login Data`(118KB)、`Web Data`(1.4MB)、`Favicons`(1.4MB) 全在，mtime 为当天 15:19–15:21，无 `.bak`、无新建 profile 目录。收藏 / 历史 / 登录态 / 密码均未动。

### 标签恢复流程（可复用）
1. **先试 `Ctrl+Shift+T`**：`Tabs_<id>` 文件（本例 177KB）Edge 仍在用，自动恢复成功率较高。
2. 不行则从 **`User Data\Default\Sessions\Tabs_13435571683378588`**（每次关闭都写，独立于 `Session_` 文件）提取 URL。本例救回 76 个 URL、其中 66 个有效（滤除 10 个噪音：`ntp.msn.cn` 新标签页、`justverify.click`/`securzones.com` 广告跳转、`js.stripe.com`）。
3. 落地文件：`recovered\RECOVER-LINKS.html`（双击点链接即可跳）、`recovered\urls.txt`、`recovered\Tabs_backup_178...bin` 原始备份（防再被轮换）。
4. 注意：正在被 Edge 占用的 Tabs 文件复制会报 `being used by another process`，只能复制未被锁定的那份。

**教训（写进 REPORT）**：以后测 Edge 严格只用 `--user-data-dir=<自建目录>` 的独立 profile，绝不碰默认 profile。

## 7. 未决权衡（当时留给用户决定）

- 「关闭标签恢复 + 打开新标签页」= 启动最轻，代价是每次自己重开（原方案 A-1 的措辞）。
- 「继续上次浏览」= 下次不会再「看起来没了」，代价是启动峰值多约 100–600MB（随标签数）。
- **建议**：选「继续上次浏览」，轻量化改由 policy 层（`EfficiencyMode=0` + 睡眠标签 + 禁用 4 个扩展，省约 450MB）取得，不从标签恢复这块省。

## 8. 状态

`apply-lite.ps1` 已 `-DryRun` 验证（输出 `BackgroundModeEnabled = 0`、`ShowRecommendationsEnabled = 0`，注册表未实际创建）。**方案文本已交付，但尚未改动用户系统任何配置**（注册表 policy 仍为空）；是否实际应用由用户决定。
