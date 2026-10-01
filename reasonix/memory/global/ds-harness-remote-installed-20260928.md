---
id: mem-6ab9021f77f1b39811022e9f87eaf567
revision: 1
created_at: "2026-09-28T10:11:04.241Z"
updated_at: "2026-09-28T10:11:04.241Z"
name: ds-harness-remote-installed-20260928
description: "#6 remote_control 收尾：ds-harness-remote 0.4.20 装进生产 web profile 并在 rc-lab 隔离验证（零公网 listener / 未登录零出站），读取的默认配置项、volatile schema 会写回 cordis.patch.yml 的坑、以及待用户做的一次重启+登录"
metadata:
  type: user
  fact_type: project
  scope: global
---

# ds-harness-remote 已装（#6 remote_control 收尾）—— 2026-09-28 18:10

## 状态：**生产已装，未登录**。登录 + 一次重启即可用。

## 装在哪
- 生产 `C:\Users\27063\.dsh\profiles\web\package.json` → `dsh.profile.bundles` 末尾多了 `ds-harness-remote`，version `^0.4.20`
- 隔离 `C:\Users\27063\.dsh-lab\profiles\rc-lab`（`--from-default-profile web` 物化）作为验证机，保留不删
- 备份：`profiles/web/{package.json,pnpm-lock.yaml,cordis.patch.yml}.bak-20260928-1810-pre-harness-remote`

## 静态审计结论（我读的是 `dist/`，213 个文件，非 README 转述）
1. **全包只有 2 处 `.listen(`，且都硬绑 `127.0.0.1`**：
   `dist/index.js:4954` `server.listen(0, "127.0.0.1")`、`dist/loopback-preview.js:98`
   → README 的 "does not listen on a public port" 成立。README 那句 "no file-mutation APIs" 也站得住（没找到通用 fs 写 API）。
2. `dist/config.js` 默认值（决定默认攻击面）：
   `enabled:true / role:'host' / serverUrl:'https://dsh.r2049.cn' / terminal.enabled:false / loopback.ports:[] /
   forceRelay:false / codex:{enabled:true,binary:'codex'} / acp:{enabled:true,backends:[codex,cursor,kimi]}`
3. `normalizeServerUrl` 强制 HTTPS（仅 localhost 允许 http）、禁 URL 内嵌凭据、禁 path/query/hash。
4. `dist/native-rtc-helper.js` 会 spawn `node --eval` 探测候选二进制能否 `require('@roamhq/wrtc')`
   （为了在 Electron 宿主里找能加载 native wrtc 的 node）。只跑固定脚本，无下载行为。
5. **`withVolatileSchema`**：dsh ≥0.1.7-rc.1 时整个 config 段是 `.volatile()` →
   **UI 里改 Remote 设置会由 settings 服务自动写回 `profiles/web/cordis.patch.yml` 的 `- id: ds-harness-remote`**。
   所以别手工预置这段 config，否则和 UI 形成双写源。

## 动态验证（rc-lab，端口 3280，生产 3080 全程未动）
- 进程树 4 个 node，**TCP endpoint 只有一条：`Listen 127.0.0.1:3280`**；wildcard-bound listener **0 个**
- boot 日志：`host identity ready {deviceId, fingerprint, server}` → `ACCOUNT_AUTH_REQUIRED, retryable:false`
  → **未登录时连出站连接都不建**（这是最好的默认行为）
- `Codex App Server communication failed {CODEX_BINARY_UNAVAILABLE}`：本机 `which codex` 空，属预期噪音
- 收工后 3280 listener 0、无残留进程；3080 仍 PID 4300（09/28 11:52:02）

## 待用户做的两件事
1. **重启 3080**（`launch-dsh.ps1 -Mode Serve` 或重启任务）—— 一次重启同时让两样生效：
   ① `memory.mjs` 的 mnemon 实时同步（已隔离验证但生产未加载）② ds-harness-remote 确定加载
   ⚠️ 我不能自己重启：**我就跑在 3080 的 session 里**，重启 = 杀掉当前会话。
2. **登录**：dsh Settings 里的 Remote 面板，或 CLI `ds-harness-remote login [github|zhihu]`（默认 zhihu 扫码，
   会打印 Authorization URL 可直接在浏览器打开）。登录后要再重启一次才 online。
   中继 `dsh.r2049.cn` 实测可达：HTTP 200，`remote_ip=81.68.128.201`（腾讯云），`ssl_verify_result=0`。
   想自建：仓库 `apps/server` + `DSH_SERVER_ACCOUNT` / `DSH_SERVER_PASSWORD`，然后改 `serverUrl`。

## 与既有 fact 的对照修正
`computer-use-l2-isolation-verified` 的「发现 2：`dsh plugin add` 不保证把包注入 bundles」**不可一般化**：
本次 `dsh plugin --profile web add ds-harness-remote`（同样带 `dsh.bundle.patch`）**确实把包追加进了 `dsh.profile.bundles`**。
差异嫌疑：那次走 `DSH_HOME=~/.dsh-lab` 且 cu-lab 是新建 profile；这次走默认 `~/.dsh` 且 web profile 已存在内容。
→ 结论：**`plugin add` 之后必须 `--dump-config` 检查 row 是否真的合成出来，不能靠推测。**

## 回归证据
`dsh --profile web --dump-config` EXIT=0，composed tree **197 个 entry**，
`- id: ds-harness-remote`（serverUrl/codex 段正确）+ `- id: ds-harness-remote-tui`（互斥的 `!!js` disabled 表达式）都在。
9 个原有 bundle 的 row 全部健在。
