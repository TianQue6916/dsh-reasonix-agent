---
id: mem-df38d9f49e628e94f69c0fd82371d847
revision: 1
created_at: "2026-09-30T05:38:15.613Z"
updated_at: "2026-09-30T05:38:15.613Z"
name: dsh-desktop-profile-full-port-20260930
description: "官方桌面端全量 profile 移植：desktop profile 由 Electron 独占、不重写已有文件、移植清单与验收证据"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# 官方桌面端（Electron）的全量 profile 移植（2026-09-30 完成）

## 桌面端的基本事实
- 安装：`C:\Users\27063\AppData\Local\Programs\DeepSeek Harness\`
  - `DeepSeek Harness.exe`（244 MB，主程序）
  - `resources/app.asar`（121 MB）、`resources/runtime/{bin,cli,pnpm,primary-runtime,office-skills,versions.json}`
  - **自带 Node 24.21.0 + pnpm 11.7.0 + Python 3.12.14**（含 numpy/pandas/python-docx/python-pptx/openpyxl/Pillow…）
- **自带 dsh 版本** = `resources/runtime/primary-runtime/runtime.json` 的 **`desktopVersion`**
  （2026-09-30 实测 = `0.2.0-rc.2`，与当时全局 npm 一致 ⇒ 插件兼容性前提天然满足）
- userData：`AppData/Roaming/@deepseek-ai/dsh-desktop/`；其 `logs/` 目录**平时是空的**（无错才不写）
- **共享 `~/.dsh` 作为 DSH_HOME**，但用**独立 profile：`~/.dsh/profiles/desktop`**

## ⚠️ 关键约束：desktop profile 是 Electron 独占的
命令行入口有硬编码守卫（在 `app.asar` 里 strings 挖到）：
```js
if (profile.toLowerCase() === "desktop")
  program.error('error: profile "desktop" is managed exclusively by the Electron application');
```
⇒ **`dsh --profile desktop ...` 一律被拒**，`dump-config` / `dsh plugin` 全部不可用。
验证只能靠：桌面端**自己的日志**、各插件的**全局数据目录**、以及从桌面端 UI 发起的真实对话。

## ✅ 桌面端不会重写已有文件（实测）
首次启动（13:28）它会**生成** `package.json` / `cordis.patch.yml` / `cordis.yml` / `pnpm-workspace.yaml`
的最小模板；但**手工改过之后重启，md5 逐一不变**：
```
package.json 439cbd0fe0594b45ac3d45ee46eeb85c  (前=后)
cordis.patch.yml ea32d1221f051bd420b18ee2f01fc21b  (前=后)
compatibility.json 3032af3391db9d23f7c8fd77c99a4bbb  (前=后)
```
⇒ **只在缺失时创建模板，绝不覆盖**。所以直接移植配置文件是安全的。

## 移植清单（从 profiles/web 到 profiles/desktop）
1. **`package.json`**：`dependencies`（9 个插件）+ `dsh.profile.bundles`（11 个）全量继承，
   保留 desktop 自己的 `name`，补上 `dsh.profile.patchReload: live`
2. **`pnpm-workspace.yaml`**：**必须连 `minimumReleaseAgeExclude` 一起复制**，
   否则 pnpm 的 minimumReleaseAge 策略会拦住新包
3. **`compatibility.json`**：精确版本豁免。desktop 的 dsh 同为 0.2.0-rc.2 ⇒ **key 正好匹配**
   （`dsh-headroom@0.3.0`、`@lanbaolu/dsh-wechat-bridge@0.9.1`）
4. **`cordis.patch.yml`**：= web 的全量（1087 行）+ 末尾追加**桌面端专属覆盖段**（26 行）
   - **必须保留** `ui-settings-account` 的 `step: done` / `completion: api-key`
     —— 那是桌面端「首次引导已完成」的状态位，覆盖掉会重跑引导
   - `ui-chat` 合并成 `{transcriptView: verbose, performanceUsage: detailed}`
     （web 的 verbose + 桌面端默认的 detailed）
   - 因为 patch 是 **replace 语义**，追加段放最后即可覆盖 web 的同名 row
5. **`pnpm install`**（用全局 pnpm 即可，`nodeLinker: hoisted` 与 web 一致）
   - 实测 `+116 packages` / 13.7s / `exit=0`，pnpm store 复用 104 个
6. **重启桌面端**（`Stop-Process` 全部 `DeepSeek Harness` → `Start-Process <exe>`）

## 移植后的验收证据
- **排他证据**：`~/.dsh/wechat-bridge/plugin.log` 出现 `web panel routes registered {"count":17}`，
  时间戳 `05:35:24Z` = 本地 **13:35:24**，而桌面端 **13:35:22** 启动
  （`DATA_DIR` 是全局的 `~/.dsh/wechat-bridge`，不按 profile 分，所以哪个实例注册都写这里；
  关键是**同一时刻只有桌面端在启动**）
- 桌面端 5 进程正常、`logs/` 无错误、配置文件 md5 未变

## 数据一律是全局的（不用移植）
`~/.dsh/skills`（技能）、`~/.dsh/sessions`、`~/.dsh/storages`、`~/.dsh/wechat-bridge`、
`~/.mnemon`、`~/.dsh/remote`、`~/.dsh/.agent-presets`
⇒ patch yml 里的相对路径 `../../.agent-presets/anchored-standard/*.mjs` 与 web **等价**
（都从 `profiles/<name>/` 上溯两级到 `~/.dsh/`）。

## 环境变量
`COMMANDCODE_API_KEY` 在 User/Machine/Process **三级全未设置**，但 web 一样没设也能用
⇒ 网关不校验入站 key（curl 不带 Authorization 也 200），所以桌面端同样不需要设。
`agent-default-model` = `{provider: commandcode-goat, model: deepseek/deepseek-v4.1-flash,
reasoningEffort: high}`，网关在 `http://127.0.0.1:8788/v1`。

## 仍未验证（需要一次真实对话）
桌面端启动后**还没发过消息**（`~/.dsh/sessions` 无新 session、Host 无到 8788 的连接）。
端到端要等首条消息才能确认：网关连通、preset 的 tools（skill_search 等）、UI 侧边栏插件入口。
