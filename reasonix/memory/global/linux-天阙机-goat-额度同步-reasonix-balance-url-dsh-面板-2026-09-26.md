---
id: mem-e97f48eb1120db59ce4da547872c08ae
revision: 1
created_at: "2026-09-26T13:08:47.236792Z"
updated_at: "2026-09-26T13:08:47.236792Z"
name: linux-天阙机-goat-额度同步-reasonix-balance-url-dsh-面板-2026-09-26
description: Linux 天阙机补齐 GOAT 额度：重写纯 node 版 quota-http.mjs（原版硬编码 Windows 路径+调 powershell）、建 systemd user service、Reasonix 加 balance_url（~/.reasonix/config.toml 第134行）、补全 dsh 插件 client.js 并注册进 web profile；含远端 ssh 命令一律走 .sh 文件的教训
metadata:
  type: user
  fact_type: project
  scope: global
---

## 症状
Linux 天阙机（Tailscale `100.79.96.82`，SSH 别名 **`tianque`**，User=tianque）上：Reasonix 状态栏余额没有；dsh 额度面板没装。

## 根因（两个独立问题）
1. **`~/goat-gateway/quota-http.mjs` 是旧版且硬编码 Windows 路径**：`SCRIPT = 'D:\\Toolbox\\goat-gateway\\goat-usage.ps1'` + `execFileSync('powershell', ...)`；而 **Linux 上根本没 PowerShell**（pwsh/powershell 均无）→ 即使启动也必失败。旧版只有 64 行、无 `/balance` 路由、`TTL_MS=30000`，且服务未在跑（8790 未监听）。
2. **dsh 插件只同步了一半**：`~/goat-gateway/dsh-plugin-goat-panel/lib/` 只有 211B 的 `index.js`，**缺 `client.js`（实际的 UI，11KB）**；且 `~/.dsh/profiles/web/node_modules/@local` 根本不存在，web `package.json` 的 `dsh.profile.bundles` 也没有它 → 面板必然是空的。

## 已修（2026-09-26）
1. **重写 `~/goat-gateway/quota-http.mjs`（200 行纯 node、零依赖、无 PS）**：直接 `fetch` `api.commandcode.ai/alpha/{billing/credits,usage/summary}`，读 `~/goat-gateway/keys.json`；路由 `/health`、`/quota[?force=1]`、`/balance[?format=text]`；内存 TTL 10s；请求记到 `~/goat-gateway/logs/balance-hits.log`。备份：`quota-http.mjs.bak-20260925`（64 行旧版）。
2. **新建 systemd user unit `goat-quota-http.service`**（`~/.config/systemd/user/`，`Restart=always`，日志 `~/goat-gateway/logs/quota-http.{out,err}.log`）→ 已 `enable --now`，状态 enabled+active，开机自启。
3. **Reasonix**：`/home/tianque/.reasonix/config.toml`（注意 Linux 是 `~/.reasonix/` 不是 `~/.config/reasonix/`）在 commandcode-goat 段（114-133）末尾插入 `balance_url = "http://127.0.0.1:8790/balance"`（现第 134 行）。`status_bar_items` 本来就含 `balance`（第 30 行）。备份：`config.toml.bak-balance-20260925`。幂等脚本：`/tmp/patch-balance-url.cjs`。
4. **dsh 插件完整同步 + 注册**：4 个文件 scp 过去（`client.js` 11100B、`index.js`、`package.json`、`cordis.patch.yml`；旧目录改名 `dsh-plugin-goat-panel.bak-20260925`）；`add-goat-bundle.cjs` 把 `@local/dsh-plugin-goat-panel` 同时写进 web profile 的 `dependencies`（`file:/home/tianque/goat-gateway/dsh-plugin-goat-panel`）与 `dsh.profile.bundles`；文件也拷进 `~/.dsh/profiles/web/node_modules/@local/dsh-plugin-goat-panel/`。备份：`package.json.bak-20260926`。
5. **字段兼容核对通过**：`client.js` 只读 `fiveHourUsed/fiveHourCap/weeklyUsed/weeklyCap/monthUsed/monthCap/fiveHourReset/weeklyReset` + `ok/rows/ts/error`，我的输出全部包含（它不用 `exceeded`，所以我没同步 `fiveHourExceeded` 也没关系）；client.js 里端点硬编码 `127.0.0.1:8790/quota` → 两机通用。

## 验证结果
- `systemctl --user is-{enabled,active} goat-quota-http` → enabled / active
- `/health` → `{"ok":true,"port":8790}`
- `/quota` → `{"ok":true,"ts":...,"rows":[163,qq]}`（566B）
- `/balance?format=text` → `163 5h 6.1% 周 74.7% 月 60.9%   |   qq 5h 7.3% 周 19.9% 月 59.9%`
- 需用户重载才生效：**重启 Reasonix**（读新 balance_url）、**重开 dsh web**（加载插件）。当时 `reasonix-desktop` 在跑（pgrep=1）。

## 遗留/注意
- Linux 上 **dsh 本体不在 PATH**（`~/.local/bin` 里有 `dsh-gate`；`~/.npm/_npx/*` 有 4 个 npx 缓存）→ 未确认启动方式，插件装好即可，下次 `dsh ... web` 会加载。
- **既有依赖冲突（非本次引入）**：`dsh-model-router` 要求 peer `@deepseek-ai/dsh-llm@^0.1.1-rc.2 || ^0.1.2-rc.1`，直接在 web profile 跑 `npm install` 会 `ERESOLVE` 失败（需 `--legacy-peer-deps`）。插件本身不受影响（npm 报错后 `@local/dsh-plugin-goat-panel/lib` 仍在）。
- `reasonix-peak-price.service` 在 Linux 上是 **failed** 状态（与余额无关，未处理）。

## 教训（省下次时间）
- **远端命令不要用 PowerShell 传字符串给 ssh**：含 `|`、`(`、`"` 的命令会被 PS 剥引号/当管道拆，报 `未预期的记号`；一律写成 .sh 文件 scp 过去再 `bash /tmp/x.sh`（且记得把 CRLF 转 LF）。
- `$env:TEMP` 在 bash 里被宿主重定向到**会话级临时目录**（每次调用都变），跨命令要用绝对路径 `C:\Users\27063\AppData\Local\Temp\...`。
