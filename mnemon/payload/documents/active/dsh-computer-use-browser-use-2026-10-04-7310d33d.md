---
id: "7310d33d-3321-46c3-8416-9c61ec08941b"
title: "dsh computer-use 调研结论与隔离落地状态 + browser-use 空白盘点（2026-10-04 复核）"
description: "2026-09-28 调研、2026-10-04 复核：computer-use 只落在隔离 lab（~/.dsh-lab/profile cu-lab，dsh-computer-use-win v0.2.2 + dsh-mcp-client，工具名 mcp__wincu__*），生产 profile 零痕迹；browser-use 完全未调研未安装。含推荐/否决清单、隔离阶梯、computerUse 独占 slot 约束与三个待决策选项。"
status: "active"
created_at: "2026-10-04T07:53:56.849Z"
updated_at: "2026-10-04T07:53:56.849Z"
content_hash: "c2a0272efe04af70b8f1a101355784b05de2c349c632e96504f43a3c6ee225da"
source_paths:
  - "scratch/computer-use-remote-research.md"
session_ids:
  - "02d0985b-899f-4e0b-942b-d16521d91948"
memory_body_ids:
  []
---

# computer-use / browser-use 落地状态（2026-10-04 复核）

用户提问背景：用户问「computeruse 和 browseruse 上了没」（checkpoint event 27356），并称之前提过。复核结论：**computer-use 上过但只在隔离 lab，生产零痕迹；browser-use 完全没有。**

## 1. 现状事实（有证据）

| 项 | 值 |
|---|---|
| 调研产物 | `~/.dsh/scratch/computer-use-remote-research.md`（46227 B / 466 行，2026-09-28 12:18）——**这是真正的研究成品，位于 scratch 而非 managed Document** |
| 隔离环境 | `~/.dsh-lab`（独立 `DSH_HOME`，非生产 `~/.dsh`） |
| profile | `cu-lab` |
| 已装包 | `dsh-computer-use-win` **v0.2.2**（当时 npm 最新 0.2.3），落在 `~/.dsh-lab/profiles/cu-lab/node_modules/`，2026-09-28 13:10 |
| 接线 | cu-lab 的 `cordis.patch.yml`：`- insert: id: mcp-dsh-computer-use-win / name: '@deepseek-ai/dsh-mcp-client'`，`serverName: wincu`、`transport: stdio`、`command: !!js process.execPath`、`args: createRequire(new URL('package.json', baseUrl)).resolve('dsh-computer-use-win/mcp/server.mjs')`、`toolCallTimeoutMs: 60000`、`failOnStartupError: false` |
| 模型可见工具 | `mcp__wincu__<tool>`：health / snapshot / click / type_text / ocr / window 管理 等 |
| 是否跑过 | `~/.dsh-lab/sessions` 存在 ⇒ lab 内真跑过 |
| 生产 | `~/.dsh/profiles/*` 内 grep `computer-use` 含 `*.bak*` = 0 命中；`profiles/{web,desktop,headless}` 的 `bundles` 无该行 ⇒ 从未装过 |
| npm 全局 | 只有 `puppeteer`（当初为绕 GFW 做联网核实、读 system proxy 的独立脚本用途，**不是 dsh 内的 tool**） |
| browser-use | 无调研、无候选、无安装 |

## 2. 供应链结论（dsh-computer-use-win）

`package.json` 逐字：`"os": ["win32"]`、`"engines": {"node": ">=22"}`、**无 dependencies / 无 peerDependencies**、scripts 仅 `selftest`/`mcp-test`/`profile-resolution`/`test`/`e2e` —— **无 install/postinstall/prepare**，安装期不执行代码。自带 fail-closed 语义：输入前校验目标窗口是否真前台（否则报错）、物理鼠标停屏幕角落 500ms 触发急停、合成输入丢失时如实报 `verified:false` 而非假装成功。

## 3. 未推生产的两个架构约束（决策理由）

1. `computerUse` 在 dsh 里是**独占 slot**，契约原文「A second registration fails even when it repeats the current name」⇒ **只能装一个，装上就占死**。
2. 「DSH 的 sandbox 管不住插件自己 spawn 出来的进程，也管不住『以你的身份注入鼠标键盘』。真正的隔离只有 Windows 用户账号 / VM。」⇒ 因此当初定为「先 lab 跑通 → 再决定是否进生产」，卡在 lab 这一步。

## 4. 调研文档的推荐与否决（保留理由）

- **推荐（A 桌面控制）**：正式落地 `dsh-computer-use-win`；想要最强 in-plugin guardrail 用 `PerryLink/dsh-click`；第一次试水最小爆炸半径用 `jing-hy/computer-user`。**只装一个**。
- **硬否决**：`Anionex` 家族（macOS-only）；`988` 系（Windows 未验收 + 依赖版本错配）；`mrpulor-gh/dsh-nuphus-mcp`（boot 阶段自己跑 `npm install -g @nuphus/nuphus-mcp`；`desktop_vision` 把截图发往视觉 API 即截屏出本机；为 CDP attach 需复制 Chrome User Data 目录，内含 DPAPI 加密 cookie/密码且同用户可解密）。
- **Hold**：`JeremyWangCY/win-pilot`（功能最强之一，但 npm ★0、维护者 `jwbo6` 与 GitHub owner 不一致、28.1 MB 未审计 `win-pilot-wgc.exe`）。
- **B 类（remote_control）**：选 `ds-harness-remote`（只出站、Noise_IK E2E、双因子授权、不暴露通用 RPC），但**默认 `serverUrl` 是第三方中继 `https://dsh.r2049.cn`，严肃使用要自建**；拒绝 `@wenbin_wb/dsh-bridge`（默认无密码 + 隧道 = 无认证 RCE，无安全实验方式）、`JUANWANG-BUAA/dsh-full-remote`（宣称远程 `credentials.*` API）、生产 profile 用 `dsh-web-lan-access`。**A 与 B 不要放同一 profile**（会话暴露 + 桌面控制的风险叠加）。

## 5. 隔离阶梯（调研文档 §3，可复用）

L2 = 独立 `DSH_HOME` + 非 shipped profile 名 + 独立端口（A 用 3180 / B 用 3280）+ 只绑回环 + `DSH_PERMISSION_MODE=read-only`；先 `--dump-config` 静态验证再 boot；回滚 = 停实例后 `dsh plugin --profile <p> remove <pkg>`，L2 可 `rm -rf "$HOME/.dsh-lab"`。需备份清单：`profiles/<name>/{package.json,pnpm-lock.yaml,pnpm-workspace.yaml,cordis.patch.yml,compatibility.json}` 以及 home 层 `$DSH_HOME/cordis.patch.yml`（影响所有 profile）。相关安装流程类文档：`b028b5a5-54fd-4679-aeca-79e8b6d7958a`。

## 6. 尚未确认（不要当结论用）

`cua-driver` 的 Windows 真实状态；`ds-harness-remote` 的 `fs-write` 能力来源（README 否认，catalog 标有）；`dsh-click` 的 `prepare: node scripts/prepare.mjs` 内容；`win-pilot-wgc.exe` 内容；`dsh-computer-use-win` 的 C# helper 缓存 DLL 落盘目录，以及 `failOnStartupError: false` 的实际静默降级表现；`saya-ch/dsh-mobile` 的 `capabilities: null` 真实能力面；`computerUse` 独占 slot 的实际竞争行为（本机无任何包实现该服务，未实测）。

## 7. 待决策（截至 2026-10-04 未执行）

| 选项 | 动作 | 代价 |
|---|---|---|
| A 推生产 | 在 `profiles/desktop` 或 `web` insert 该 MCP row，重启生效 | 占死 `computerUse` slot；真实桌面被 AI 驱动 |
| B lab 端到端 | 用 `cu-lab` 起实例自测 `snapshot → click → type_text → ocr` 全链路并留证据 | 不碰生产，但仍需用户确认「动真实桌面」 |
| C browser-use | 从零调研（Python `browser-use` / Playwright MCP / CDP-based），走同一隔离阶梯 | 多一轮调研，爆炸半径远小于桌面控制 |

当时建议 **B + C 并行**（B 现成且 fail-closed，C 补上真正高频需求）。另注：dsh 现有「web」能力全是**取内容**而非驱动浏览器（`@deepseek-ai/dsh-tool-web`、`dsh-web-search-deepseek`、`dsh-web-fetch-http`）。自评：当时该给明确 go/no-go，而不是停在 lab 半路。
