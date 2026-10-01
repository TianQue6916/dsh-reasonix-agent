# dsh 0.1.7-rc.2 · computer-use / remote_control 插件调研与安全落地方案

> 环境：Windows 11 · dsh `0.1.7-rc.2`（`@deepseek-ai/dsh`，安装在 `%APPDATA%\npm\node_modules`）
> 生产实例：`dsh --profile web --port 3080`（长期运行）
> 本文只做调研与方案设计，**没有执行任何安装**。唯一的"写"操作是在临时目录建了一个一次性 profile 做命令验证，已删除。

---

## 0. 证据等级声明（先读这一节，后面所有结论都标了来源）

| 标记 | 含义 | 本次实际做法 |
|---|---|---|
| 【catalog】 | 从 `C:\Users\27063\.dsh\storages\plugins.json` 直接读到的确定事实 | 4377 条，`updated=2026-09-27`，逐条按 owner/name 取字段 |
| 【npm】 | npm registry packument（latest 版本的 `dependencies` / `peerDependencies` / `scripts` / `os` / `unpackedSize` / `fileCount` / `maintainers` / 发布时间） | `registry.npmjs.org/<pkg>` 原始 JSON |
| 【tarball】 | 我下载并解包 `.tgz`，**读了源码 / `cordis.patch.yml` / `PERMISSIONS.md`** | 覆盖 dcu988 / anionex / nuphus / cuwin / computer-user / win-pilot / ds-harness-remote / dsh-pocket / dsh-bridge / pocket-relay / lan-access / webui-mobile |
| 【local-dsh】 | 读本机安装的 `@deepseek-ai/dsh@0.1.7-rc.2` 及其 bundle dist/README | 含 `dsh-web-app/lib/startup.js`、`dsh-base/cordis.patch.yml`、`dsh-app-boot`、`dsh-plugin-manager` |
| 【web】 | `web_search` + **GitHub API**（`api.github.com/repos/...`，取 stars / pushed_at / license / archived / open_issues） | README 原文通过 `raw.githubusercontent.com` 取 |
| 【未确认】 | 我没能核实的 | 明确写出，不编 |

### 0.1 三个必须先纠正的事实

1. **★313 不属于 DSH 插件。** 【web】GitHub API：`mrpulor-gh/nuphus-mcp` = **314 stars**（上游 Rust MCP server repo）；DSH 侧的 `mrpulor-gh/dsh-nuphus-mcp` 只有 **4 stars**、`unpackedSize=9751`、`fileCount=7`。【catalog】同。
   → 把上游 star 记到插件头上，会把采用度高估约 **78 倍**。
2. **`zhu1090093659/dsh-web` 的 ★8037 是 repo 级 star，被复制到了 18 个子包行上。** 子包（`@linxin666/dsh-remote-web-ui` / `dsh-ssh` / `dsh-skill-explorer` …）的 `capabilities` **全是 null**。【catalog】
3. **`dsh-pocket` 的 category 是 `notify`，不是 `remote`。** 【catalog】`category=remote` 的只有 134 条，`dsh-sev` 在其中，`dsh-pocket` 不在。

### 0.2 catalog 自身可信度体检（"未标注"到底意味着什么）

我对 4377 条做了统计：

| 指标 | 数值 |
|---|---|
| `capabilities = null` 的条目 | **399 / 4377 = 9.1%**，且 `capabilityCheckedAt` 同时为 null |
| `capabilityCheckedAt` 的取值分布 | 2910 条同一个时间戳 `2026-09-24T17:02:46.730Z`、573 条 `17:41:52.360Z`、495 条 `2026-09-27T16:27:56.916Z`、399 条 null |
| 同时声明 `credentials` + `network` 的条目 | 420 条 |
| 其中带 red line `reads credentials/secrets AND has network access` 的 | 360 条 |
| **声明了 credentials+network 却 redLines 为 `[]` 的** | **60 条（14%）** |

**结论：`capabilities` 是一条带时间戳的"声明记录"，不是审计结论；`null` 不是"低风险"，是"未知风险"。而且连已标注的部分都存在内部不一致**——420 条命中 red line 模式的条目里有 60 条红线为空。其中一个典型是 `zhu1090093659/dsh-web#packages/dsh-web-all`：`caps=['dynamic-code','network','credentials']`、【catalog】`redLines=[]`。

→ 本机操作规则：**null 一律按"最大能力"对待**，除非我像下面那样亲自读了 tarball。

---

## 1. A：computer-use（桌面控制）

### 1.0 一个必须先知道的架构约束

【local-dsh】`dsh-tool-cordis/lib/types/api-catalog.js:604-613` 定义了 DSH 0.1.7-rc.2 的 `computerUse` 服务：

```
register(name: ComputerUseProviderName): () => Promise<void>
"Reserve the sole provider slot until the contribution is disposed.
 A second registration fails even when it repeats the current name."
```

**这是独占 provider slot：一个 dsh 进程里只能注册一个 computer-use provider，第二个（哪怕同名）也会注册失败。**
→ 所以不要同时装两个 computer-use 插件，无论它们各自多安全；A 的结论必须是"选一个"。

### 1.1 A 候选对比表

`caps` / `redLines` 列 = 【catalog】。`cua-driver 等外部二进制` / `隔离模式` 列 = 【tarball】+【web】。

| 候选 | ★ | npm 包 | caps | redLines | 额外 daemon / 二进制 / Python | Windows | 隔离模式 | README 安全声明 |
|---|---|---|---|---|---|---|---|---|
| **Yu-tao-Li/dsh-computer-use-win** ✅**首选** | 14【catalog】/16【web】 | `dsh-computer-use-win` v0.2.2(catalog)/**0.2.3**(npm) | `shell, fs-read, env` | `[]` | **无。** 零 `dependencies`、零 `peerDependencies`、零 lifecycle script；Node ≥22 起一个 stdio MCP server，后端是常驻 PowerShell + `C#` P/Invoke 缓存 DLL【npm+tarball】 | ✅ 声明 `os:["win32"]`，仅 Windows | 有"急停 failsafe"（物理鼠标停屏幕角落 500ms → 所有输入被拒，需人把鼠标移开才恢复）；输入 **fail-closed**（目标窗口不是真前台直接报错）；OCR 走本地 `Windows.Media.Ocr`（无外呼） | `docs/wiki/safety.md` 有明确"Ask Before Continuing / Do Not Automate"清单（UAC、密码管理器、终端审批框等）；对 WinUI/Chromium/Electron 丢合成输入会诚实上报 `verified:false` |
| **PerryLink/dsh-click** ✅**次选** | 14 | `dsh-click` v0.3.15 | `shell, fs-write, fs-read, env` | `[]` | 无外部二进制；Windows 走 bundled PowerShell helper（UIAutomation + Win32 input）【web+tarball】 | ✅ "Windows first"，macOS/Linux backend 是 reserved 且 fail closed | 每个动作过四道闸：**freshness**（`basedOn` 快照 + 动作前重截 + pixel-hash 比对）、**approval**（默认 `ctx.approval` 全量 gating，可 regex allowlist 特定窗口但仍审计）、**process identity**（动作前后校验 pid+exe）、**sanitized audit**（`dsh-click/observed` / `dsh-click/action` 事件） | README 原文：*"every click gated, every action audited"*；交付路径"prefers UIA invoke … **never steals foreground focus**" |
| **jing-hy/computer-user** ✅**最保守** | 2 | `computer-user` v0.3.6 | **`shell`（全库最窄）** | `[]` | **无。** 零依赖、零 lifecycle script；PowerShell + Win32 `SendInput`，无 native module、无编译【npm+tarball】 | ✅ `os:["win32"]` | **settings 卡片四级 dropdown：`disabled` / `readonly` / `manual`（需 `/computer` 人工批准一次才解锁该 session）/ `auto`**；"AI 可自行改模式"默认关 | README：*"Fully local — no external API calls … Nothing leaves the machine"*；建议先 screenshot → picturereader 本地 OCR → 点一次 → 再截图验证 |
| 988hj7tczd-oss/dsh-computer-use | 36【catalog】/38【web】 | `dsh-computer-use` v0.3.1 | `shell, fs-read, network, env` | `[]` | **需要外部 `cua-driver` 二进制**（来自第三方 `trycua/cua`）；npm tarball **不含 `install.sh`**（`check` script 引用它，但 18 个文件里没有）【tarball】 | ⛔ **README 自己的平台表写 `Windows | BLOCKED`**："当前无 Windows 10/11 真机；路径和按键逻辑已测试，真实 GUI 未验收"【web】 | 独立虚拟光标（不抢真实鼠标）、快照 TTL、应用白名单、危险词审批、密码框保护【tarball `PERMISSIONS.md` + `lib/guard.js`】 | `PERMISSIONS.md` 写得很好（明确"不读业务文件/不写宿主文件/无 lifecycle script"），但**平台验收状态是否决项** |
| Anionex/dsh-computer-use | 46 | `@anionex/dsh-computer-use` v0.3.2 | `shell, fs-write, fs-read, network, env, host-runtime` | `[]` | 需要 macOS 原生 helper（Swift，ad-hoc 签名 universal binary，SHA-256 写进 `native/macos/manifest.json`）【tarball】 | ❌ **README:262 "The current provider is macOS-only. Windows UI Automation and Linux providers are not implemented."** 非 macOS 上优雅降级、不注册任何 tool | 极好（app lease、targetHandle 重绑定、`COMPUTER_TARGET_AMBIGUOUS` fail-closed、`pointerInputPolicy: deny`） | 所有 tool 都不接受 AppleScript / JXA / shell / 源码 |
| mrpulor-gh/dsh-nuphus-mcp | **4**（上游 repo 314） | `dsh-nuphus-mcp` v0.2.1 | `shell, env` | `[]` | **需要 `nuphus-mcp` Rust 二进制**；wrapper 在 boot 时若 PATH 找不到会**自动执行 `npm install -g @nuphus/nuphus-mcp`**【tarball `lib/index.js`】；首次 `desktop_perceive` 自动下载 PaddleOCR + YOLO ONNX 模型【web】 | ✅ Windows 是 "Full (Win32 API)"，且是官方推荐平台【web】 | 有 `--confirm-write` 默认开；`NUPHUS_MCP_NO_MODEL_DOWNLOAD` 可控模型下载 | 无独立安全声明；**能力面远超 catalog 标注**（见 1.3） |
| JeremyWangCY/win-pilot | 0（npm 维护者 `jwbo6`） | `win-pilot` v0.1.4 | `shell, fs-write, fs-read, network, env` | `[]` | **打包了 28.1 MB 的预编译 `lib/wgc/win-pilot-wgc.exe`**（Windows.Graphics.Capture）【tarball】；要求 Node ≥22.12、PowerShell 5.1、可选 .NET 8 | ✅ 仅 Windows 10/11 x64 | "background-first verified input"、window-bound screenshot、isolated Edge/Chromium CDP session；claim 在 0.1.7+ 抢 `computerUse` 独占 slot | 无独立安全声明；28 MB 未审计二进制 + ★0 是主要问题 |
| xie129716/computer-user-vision | 1 | `computer-user-vision` v0.4.0 | `shell, fs-write, fs-read, network, env, llm` | `[]` | 零依赖；fork 自 `computer-user` | ✅ `os:["win32"]` | `Ctrl+Alt+Esc` 停所有调用 | 比上游多了 `network`+`llm`（把截图喂给视觉模型），能力面变大 |
| qphotoai/dsh-computer-use-windows | 5 | 无（`github:`） | `shell, fs-read, network, env` | `[]` | 需要 `cua-driver` + 可选 GLM vision | ✅ 仅 Windows | 未确认 | 未确认 |
| wwwort/dsh-win-computer-use | 0 | 无（release tgz） | `shell, fs-write, fs-read, network, env` | `[]` | 无 npm 包，从 GitHub Release 装 `.tgz` | ✅ Windows | 未确认 | 未确认 |
| ZRui-C/dsh-computer-use | 31 | 无（`github:`） | `shell, fs-write, fs-read, network, env` | `[]` | Playwright/CDP + macOS 控制；签名 notarized DMG | ⚠️ 主要是 macOS + 浏览器 | 未确认 | 未确认 |
| Aik358/dsh-cua-pre | 2 | 无（`github:`） | `shell, fs-write, fs-read, network, env` | `[]` | 未确认 | ✅ Windows | 有 "persistent kill switch"、RuntimeId/rect-drift stale 保护 | 未确认 |
| gezi-wen/sage-guikit | 0 | 无（`github:`） | `shell, fs-write, fs-read, env` | `[]` | PowerShell **7** 子进程 | ✅ Windows | 未确认 | 未确认 |
| zzy6-a/vision-use | 1 | 无（release tgz） | `shell, fs-write, fs-read, network, env` | `[]` | 无 npm 包 | ✅ Windows（含 WSL 自动识别） | Esc abort overlay | 未确认 |
| tinqiao-oss/clawtouch-mcp | 11 | `dsh-clawtouch` v0.1.2 | `shell, network, env` | `[]` | **需要外部 USB HID 硬件（Raspberry Pi Pico 2）** | Windows 部分支持 | 硬件级隔离（真实 HID） | — |

### 1.2 A 的推荐与否决

#### ✅ 推荐 1（正式落地）：`dsh-computer-use-win`

推荐理由（每条都能落到证据）：

1. **最窄的"已发布 + Windows 原生 + 多功能"交集。** 声明 `caps=['shell','fs-read','env']`【catalog】，没有 network、没有 fs-write —— 是我在 Windows 候选里见到的唯一"多 tool + 无 network"组合。
2. **供应链面几乎为零。**【npm】`dependencies`=空、`peerDependencies`=空、`scripts` 无 `preinstall/postinstall/install/prepare`；`unpackedSize=208568`、`fileCount=17`。**安装它不会执行任何代码**，也不会拉进任何传递依赖。
3. **接入路径用 DSH in-box 组件。** 【tarball】它的 `cordis.patch.yml` 只做一件事：把 `@deepseek-ai/dsh-mcp-client`（本机安装里已有的第一方包）指向自己的 `mcp/server.mjs`。没有第三方 bridge、没有反向代理、没有自带 listener。而且它用 `createRequire(new URL('package.json', baseUrl)).resolve(...)` 解析路径，注释明确说明"keeps no hard-coded paths"。
4. **它自己的安全语义是 fail-closed 的**：输入前校验目标窗口是不是真前台，不是就报错；物理鼠标停角落 500ms 触发急停；丢合成输入时如实上报 `verified:false` 而不是假装成功。
5. **可验证的替代品**：如果嫌 ★ 低，次选 `dsh-click`（见下）。

风险与应对：
- ★ 低（14/16）、单一维护者、无签名 release → 用第 3 节的 L2 隔离（独立 `DSH_HOME`）。
- 【catalog】标 `fs-read` 但**实际是 `fs-write`**：README 说"C# P/Invoke 助手按 hash 编译成缓存 DLL"。这是 catalog 漏标，不是恶意，但说明**不要把 catalog 的 caps 当保证**。

#### ✅ 推荐 2（想要最强 in-plugin guardrail）：`PerryLink/dsh-click`

- 四道闸（freshness / approval / process identity / audit）是这一批里工程化程度最高的，而且 README 明确写了它在 **`dsh-v0.1.7-rc.2`（GitHub tag, verified 2026-09-25）** 上验证过 —— 和你的 runtime 完全对齐。
- "never steals foreground focus" 是真实增益：它优先 UIA invoke，退化到 post window message，而不是移动你的真实鼠标。
- 代价：`caps` 含 `fs-write`；`scripts.prepare` 存在（**只对 `github:` 安装触发**，从 npm 装不会跑；若从 git 装，pnpm 会拦住 prepare 直到你在 profile 的 `pnpm-workspace.yaml` 里加 `allowBuilds`，CLI 会打印要加的确切 key）；8 个 open issue。

#### ✅ 推荐 3（第一次试水、最小爆炸半径）：`jing-hy/computer-user`

- 【catalog】`caps=['shell']` —— 全库我能找到的最窄声明。
- 【npm】零依赖、零 script、`os:["win32"]`。
- 【tarball】README：*"Fully local — no external API calls … Nothing leaves the machine"*；`disabled/readonly/manual/auto` 四挡，`manual` 需要人打 `/computer` 批准一次才解锁该 session。
- 唯一问题：★2，采用度太低。所以我把它放在"先用它把流程跑通，再决定要不要换"的位置。

> 如果只想动一次手：**先上 `computer-user` 跑通闭环 → 满意后换 `dsh-computer-use-win`**（功能多得多，且 caps 同样不含 network）。

#### ❌ 否决的候选与理由

| 候选 | 否决理由（硬证据） |
|---|---|
| `Anionex/dsh-computer-use` | README:262 原文 *"The current provider is macOS-only. Windows UI Automation and Linux providers are not implemented."* 在 Windows 11 上它什么都注册不了。**硬否决**。 |
| `988hj7tczd-oss/dsh-computer-use` | ① README 自己的平台表：`Windows ⛔ BLOCKED`，明确写"当前无 Windows 10/11 真机 …… 真实 GUI 未验收"。② 【npm】它把 `@deepseek-ai/dsh-tools` 声明为**真 dependency 且 pin 到 `0.1.2-rc.1`**，而 runtime 是 `0.1.7-rc.2` —— DSH 的 runtime resolution 只对 **peer** 名字做安装内替换，普通 dependency 会落到 profile 的物理副本，可能产生第二份 tools service。③ 需要第三方 `cua-driver`，而 npm tarball 里没有 `install.sh`（README 的 `./install.sh` 指的是 GitHub 仓库）。它的 `guard.js`（危险词审批、`AXSecureTextField` 永不让模型输入）确实写得好，但**平台验收未过 + 版本错配**足够否决。 |
| `mrpulor-gh/dsh-nuphus-mcp` | ① ★4 而非 ★313（见 §0.1）。② 【tarball `lib/index.js`】当 PATH 找不到 `nuphus-mcp` 时，插件会**自己执行 `npm install -g @nuphus/nuphus-mcp`** —— 一个插件在 boot 阶段发起全局 npm 安装，直接违反"安装期不执行代码"这条最小权限原则。③ 它 spawn 的 Rust server 的真实能力面**远超 catalog 的 `['shell','env']`**：首调用下载 OCR/YOLO 模型（写盘 + 网络）、`desktop_vision` 把截图发给你的视觉 API（截屏内容离开本机）、为 CDP attach 而**复制 Chrome User Data 目录**（README 教你怎么 `copy "%LOCALAPPDATA%\Google\Chrome\User Data\Default"`，含 DPAPI 加密的 cookie/密码，同用户可解密）。→ 如果你确实想用它：**先自己装好二进制**，并在 config 里把 `command` 设成绝对路径，让 auto-install 永远不会触发；再把 `allowedApps` 收紧。 |
| `JeremyWangCY/win-pilot` | 功能最强之一（background-first verified input、isolated Edge CDP），但【npm】★0、npm 维护者是与 GitHub owner 不一致的 `jwbo6`、`unpackedSize=28573361` 主要由一个未审计的 28.1 MB `win-pilot-wgc.exe` 构成。**"hold" 而非"否决"**：等有人审计那个 exe 再说。 |
| `qphotoai/dsh-computer-use-windows`、`wwwort/dsh-win-computer-use`、`zzy6-a/vision-use`、`gezi-wen/sage-guikit`、`Aik358/dsh-cua-pre`、`ZRui-C/dsh-computer-use` | 全部只能从 `github:` 或 GitHub Release `.tgz` 装（无 npm 包）→ 安装时会走 `prepare`/build 路径（pnpm 需显式 `allowBuilds`），且采用度接近 0（★0–5）。**hold**：等它们发 npm 包、有 issue 历史和第三方审计再说。 |
| `tinqiao-oss/clawtouch-mcp` | 需要 Raspberry Pi Pico 2 + 被控机 USB HID。**不适用**（而且这恰好是最强隔离方案：操作系统看到的是真实硬件输入）。 |
| `xie129716/computer-user-vision` | 不是"坏"，而是相对 `computer-user` 能力面变宽（多 `network` + `llm`，截图会走模型）。有视觉模型时它更好用，但不符合"最小权限优先"的第一轮目标。**备选**。 |

---

## 2. B：remote_control（远程接管 dsh 会话）

### 2.1 B 候选对比表

| 候选 | ★ | npm 包 | caps【catalog】 | redLines | 暴露方式 | 认证 | 支撑证据 |
|---|---|---|---|---|---|---|---|
| **liguobao/ds-harness-remote** ✅**首选** | 224（API 227） | `ds-harness-remote` v0.4.20(catalog)/**0.4.22**(npm) | `shell, fs-write, fs-read, network, env` | `[]` | **Host 只做出站连接，不监听任何公网端口**【tarball README】。传输是 relay + WebRTC（`werift` + `ws`，纯 JS） | `Noise_IK_25519_ChaChaPoly_SHA256`；客户端加密、**只有被选中的 Host 能解密**；账号成员资格 **AND** Host 本地 pin 的设备身份，两个都过才连 | 【tarball】README "Security boundary" 全节；【npm】`dependencies=[@deepseek-ai/schemastery, qrcode, werift, ws, zod]`，无 native 二进制 |
| shaobeichen/dsh-pocket | 1368 | `dsh-pocket` v2.10.6（GPL-2.0） | `shell, fs-write, fs-read, network, env` | `[]` | **云隧道是它的核心设计**：cloudflared quick tunnel（随机域）或命名隧道（固定域 → 指向 `http://127.0.0.1:3081`） | 8 位密码（公网默认每次开启轮换，可自定义固定）；**公网判定 fail closed**：除 loopback 和 RFC1918 外**一切陌生域名一律按公网处理、强制密码**（issue #66） | 【tarball】README「⚠️ 安全（必读）」全节；【npm】`dependencies=[qrcode, qrcode-terminal]`，`bin=dsh-pocket` |
| zexadev/dsh-tether | 49 | `dsh-plugin-tether` v0.1.17 | `shell, fs-write, fs-read, network, env, host-runtime` | `[]` | iroh P2P 直连，relay fallback **只承载密文** | 未确认 | 【catalog】描述；**我没审计** |
| kinderao/dsh-pocket-relay | 0 | `dsh-pocket-relay` v1.0.2（GPL-2.0） | `shell, fs-write, fs-read, network, env` | `[]` | **自建 relay**（不是 cloudflared） | 设备级凭据，可配对/列出/逐个撤销 | 【tarball `package.json` + 】README；【npm】`deps=[qrcode, qrcode-terminal]` |
| saya-ch/dsh-mobile | 319（API 325） | `dsh-mobile` v0.5.0 | **`null`（未标注）** | `null` | 局域网网关（**默认 3443**，自有私有 CA）+ 可选 Tailscale Funnel / cpolar / cloudflared / 自建 FRP / 自有反代 | 设备配对 token + Android Keystore + 精确 Origin 绑定；管理 API 要求 **TCP 对端是本机回环**，公网 IP/任意域名返回 403 | 【web】README 安全节 + 平台矩阵；【npm】`unpackedSize=69185078`、`bin=dsh-mobile`、`deps` 含 `bonjour-service`(mDNS) + `selfsigned`(自签证书) + `qrcode` |
| Buzzso/dsh-sev | 137 | 无（`github:`） | `shell, fs-write, fs-read, network, env` | `[]` | **不是"手机登录本机"**：它在你的服务器上跑 headless dsh，本地 GUI 通过 `ssh -L` 隧道访问 | SSH | 【web】README："Zero local exposure — remote host only listens on `127.0.0.1`; you reach it via an SSH tunnel. Loopback-only API fence." |
| mrRisega/dsh-remote#dsh-remote-web | 62 | `dsh-remote-web` v0.6.17 | `shell, fs-write, fs-read, network, env` | `[]` | 托管云 relay 或自建；声称 tunnel 数据面 E2EE | QR / 一次性链接 desktop grant | 【catalog】描述；未审计 |
| JUANWANG-BUAA/dsh-full-remote | 44 | `dsh-full-remote` v0.3.7 | `shell, fs-write, fs-read, network, env` | `[]` | token-gated 反向代理 | token + 每设备 session + CIDR/idle timeout | 【catalog】描述：**"full server-side API access (`settings.*` / `credentials.*` / `host.listDirectory`)"** —— 这是把 credentials API 暴露给远端的方案，**本轮跳过** |
| @wenbin_wb/dsh-bridge | 177 | `@wenbin_wb/dsh-bridge` v2.10.15 | `shell, fs-write, fs-read, network, env` | `[]` | 局域网 QR + Cloudflare/自建隧道 + 微信/QQ/飞书/Telegram bot | 访问密码门禁（**默认不强制**） | 【tarball】README 自述：反代会在转发时**自动注入合法的回环 session cookie**；且明确警告自建隧道下 *"未设置任何密码时，任何知道隧道地址的访客都能直接访问您的 DSH"* |
| AcidGr/dsh-web-lan-access | 35 | `dsh-web-lan-access` v1.3.2 | **`network`（仅此一个）** | `[]` | **直接绑定 `0.0.0.0`** | 无（依赖 DSH 原生 token） | 【tarball】README 自述：*"its bundle patch sets the webserver bind host to `0.0.0.0` directly"*、*"widens the `/api` trust fence automatically"*、*"re-derives the `/api` trust fence from every non-internal IPv4 … LAN (`192.168.x`), Tailscale (`100.x`), and VPN interfaces"* |
| zhu1090093659/dsh-web 家族 | 8037（repo 级） | `@linxin666/dsh-remote-web-ui` / `dsh-ssh` / `dsh-web-all` | 子包 **null**；`dsh-web-all` = `dynamic-code, network, credentials`（redLines `[]`） | — | `dsh-remote-web-ui` 依赖 `cloudflared` 包（会拉云隧道二进制）；`dsh-ssh` 依赖 `ssh2`+`ws` | token-gated channel / QR | 【npm】三个包的实际依赖见 §2.3 |
| ZSeven-W/dsh-ios / @zseven-w/dsh-android | 308 / 163 | `@zseven-w/dsh-ios` / `-android` | `shell, dynamic-code, fs-write, fs-read, network, env` | `[]` | **不是 remote takeover**：它们是"把 iOS Simulator / adb 设备搬进会话"的设备控制插件 | — | 【catalog】category=remote 是**误分类**；caps 含 `dynamic-code` |
| bbtssama/dsh-webui-mobile | 30 | `dsh-webui-mobile` v0.4.4 | `[]` | `[]` | 纯前端移动布局 | 无 | 【npm】零依赖、7 个文件、233 KB |
| mexiaosqwq/dsh-web-mobile | 105 | `dsh-web-mobile` v3.0.3 | `fs-write, fs-read, network` | `[]` | 纯前端移动适配 | 无 | 【catalog】 |
| huanlanmie/dsh-mobile-access | 1 | 无（`github:`） | `fs-write, fs-read, network, env, host-runtime` | `[]` | PIN 保护的**独立端口** chat-only 客户端 | PIN | 【catalog】 |

### 2.2 B 的推荐与排序

**✅ 首选：`liguobao/ds-harness-remote`**

理由：
1. **它把攻击面从"开一个端口"变成"开一个出站连接"** —— README:"The Host creates outbound connections only; it does not listen on a public port." 这是唯一一个把"不需要公网 IP、不需要端口转发"和"不新增 listener"同时做到的设计。
2. **E2E 是真的**：`Noise_IK_25519_ChaChaPoly_SHA256`，客户端加密、只有被选中的 Host 解密 —— relay/WebRTC 节点看到的是密文。
3. **双因子授权**：账号成员资格 **AND** Host 本地 pin 的设备身份。
4. **功能面主动收窄**：README 明说 *"Remote does not expose general tool RPC, remote desktop, or file-mutation APIs"*，交互式终端默认关闭且需要 Host 本地设置。
5. **工程活跃度对得上**：`0.4.22` 发布于 2026-09-28，peer range 接受 `>=0.1.5-alpha.1`，你的 `0.1.7-rc.2` 在范围内。

**必须注意的两个点（都会影响"安全"结论）：**
- 【tarball `cordis.patch.yml`】默认 `serverUrl: https://dsh.r2049.cn` —— **默认指向维护者托管的中继服务器**。虽然是 E2E 的（中继只见密文），但这仍然是一个第三方运行时依赖。仓库里有 `apps/server` 自建 relay（`DSH_SERVER_ACCOUNT` / `DSH_SERVER_PASSWORD`），**严肃使用应该自建**。
- 同一份 patch 里 `codex.enabled: true, binary: codex` —— 它会去找 Codex CLI。
- 【catalog】`caps` 含 `fs-write`（与 README 的"no file-mutation APIs"表面矛盾，可能是可选终端功能或安装期行为）。我**没有逐行审计 222 个 dist 文件**，所以这条按"声明"而非"已验证"对待。

**次选：`dsh-pocket`（★1368）** —— 如果你要的就是"出门在外扫码即用"。它的安全设计意外地认真（公网判定 fail-closed，换域名绕不过密码；不写密码时体验是"每次开公网换新密码"），文档把风险写得比大多数同类都清楚。代价：**设计上就是公网暴露**、首次使用下载 cloudflared 二进制、GPL-2.0。

**第三：`dsh-pocket-relay` / `dsh-tether`** —— 自建 relay / 只承载密文的 P2P，不依赖第三方云；但采用度低（★0 / ★49），我没审计。

**不同威胁模型的一条路：`Buzzso/dsh-sev`（★137）** —— 它不是"手机连本机"，而是"本地 GUI 管服务器上的 headless dsh"，两端都只监听 `127.0.0.1`，靠 SSH 隧道。如果你真正的需求是"长任务不因关机中断"，这个比任何隧道方案都干净。

### 2.3 关于"未标注（capabilities = null)"本身的风险 —— 专门回答

你说要特别评估"未标注"这件事本身。我的结论：

1. **`null` 在数据模型上等价于"既有 `network` 又有 `credentials` 又有 `dynamic-code`"，因为它是未知集。** 用它做决策等于放弃决策。
2. **`zhu1090093659/dsh-web` 家族正是最坏情况的样本**：
   - 【catalog】repo ★8037 被复制到 18 个子包行上，其中 `dsh-remote-web-ui`、`dsh-ssh`、`dsh-skill-explorer`、`dsh-git-graph` 的 `capabilities` **全是 null**、`capabilityCheckedAt` 也是 null；
   - 唯一的聚合行 `@linxin666/dsh-web-all` 标了 `['dynamic-code','network','credentials']` 而 `redLines=[]` —— **这恰好是红线本该触发的组合，红线却是空的**（见 §0.2，全库有 60 条同样情况）；
   - 【npm】它到底做了什么：`@linxin666/dsh-remote-web-ui@0.4.3` 的 `dependencies` 里有 **`cloudflared@^0.7.3`**（会拉 Cloudflare 隧道二进制）；`@linxin666/dsh-ssh@0.4.3` 有 **`ssh2@^1.17.0` + `ws@^8.18.0`**（完整 SSH/SFTP/端口转发面）；`dsh-web-all` 一次性拖 18 个包。
   - **所以"★8037 + 未标注"不能读作"大家用过所以安全"，只能读作"未审计，且同类包的实际依赖里躺着隧道二进制和 SSH 客户端"。**

**规则**：★ 数只能证明"有多少人点了 star"，不能替代 capability 审计。对未标注条目，唯一可接受的处置是 ① 不装在生产 profile；或 ② 装进 L2 隔离环境并自己读一遍 tarball。

### 2.4 B 的明确不推荐

| 不推荐 | 理由（硬证据） |
|---|---|
| `@wenbin_wb/dsh-bridge` | 【tarball】README 自述反代**自动注入合法回环 session cookie**，并在自建隧道章节明确写：*"未设置任何密码时，任何知道隧道地址的访客都能直接访问您的 DSH"*。**"默认路径等于无认证的 RCE 入口"是设计事实，不是配置失误**，而且它的功能面还叠了 4 个 IM bot + 隧道管理。 |
| `AcidGr/dsh-web-lan-access` | 【tarball】README 自述它绑定 `0.0.0.0` 并把 `/api` trust fence 扩到"所有非内部 IPv4（含 Tailscale 100.x、VPN 网卡）"。它存在的意义就是**撤销 DSH 自带的两道防护**。【local-dsh】`dsh-web-app/lib/startup.js:40` 对 CLI 层做了硬拒绝：`--host 0.0.0.0` → `error: ... it would expose remote code execution to the network; use 127.0.0.1 instead`；而这个插件绕过 CLI 直接改 webserver row 配置（`z.union([z.const("127.0.0.1"), z.const("0.0.0.0")])` 是允许的）。**只在一次性 profile 里用。** |
| `@linxin666/*`（dsh-web 家族） | §2.3。 |
| `JUANWANG-BUAA/dsh-full-remote` | 【catalog】描述明确写着提供 `settings.*` / `credentials.*` / `host.listDirectory` 的完整服务端 API。远端能读 credentials，与"权限最小化"直接冲突。 |
| `ZSeven-W/dsh-ios` / `@zseven-w/dsh-android` | 分类误导：它们是设备控制插件，caps 含 `dynamic-code`。想要的就是 `dsh-android` 的话单独评估，但不要把它当"远程接管"。 |

---

## 3. C：最小风险落地（可直接执行的命令）

### 3.0 三个前置事实（都来自本机代码，不是推测）

**(1) `--host 0.0.0.0` 走 CLI 是被硬拒绝的。**【local-dsh】`dsh-web-app/lib/startup.js:40`：
```
error: --host 0.0.0.0 is intentionally not supported yet for safety:
it would expose remote code execution to the network; use 127.0.0.1 instead
```
→ 默认 `host='127.0.0.1'`、`port=3080`（`dsh-web-app/cordis.patch.yml` 的 `webserver` row）。**"不暴露到 0.0.0.0"这条你什么都不用做就已经满足了。危险来自"装一个帮你还原 0.0.0.0 的插件"，而不是来自配置。**

**(2) home 级 patch 会注入到每一个 profile，并且压过 profile 层。**【local-dsh】`dsh-app-boot` 注释原文：*"the profile's user layer, the home-level user layer (`$DSH_HOME/cordis.patch.yml` — machine-local preferences that apply to every profile, so it outranks the per-profile layer)"*。
**实测证据**：我 dump 了 `headless` profile，输出第 1040 行是
```
# == C:\Users\27063\.dsh\cordis.patch.yml
- id: mcp-deja
```
也就是说你现在这个 home patch 里的 `mcp-deja` / `deja-command` / `deja-auto`（指向 `…\profiles\web\node_modules\@vshulcz\deja-vu-windows-amd64\bin\deja.exe`）会进入**任何**新 profile。**"新建一个干净 profile"并不干净。**

**(3) `DSH_HOME` 是受支持的分级开关。**【local-dsh】`dsh-home-paths`：`explicit configured > $DSH_HOME > ~/.dsh`，空值被忽略。

### 3.1 隔离阶梯（选一层，不要跳级）

| 层 | 做法 | 隔离到什么 | 代价 |
|---|---|---|---|
| **L0（禁止）** | `dsh plugin --profile web add …` 打在**正在运行的生产 profile** 上 | 什么都不隔离 | 你的 `profiles/web/package.json` 里 `patchReload: "live"`，配合 `dsh-hmr` 会**把新 bundle 热合进正在跑的进程** |
| **L1** | 新建 profile 名，共用 `~/.dsh` | 插件依赖、bundle 列表 | ❌ 仍被 `~/.dsh/cordis.patch.yml` 注入；共享 `sessions/ storages/ attachments/ .credentials.yaml` |
| **L2（推荐）** | 新建 profile 名 **+ 独立 `DSH_HOME`** | 上面全部 + home patch + sessions + 凭据 + 日志 | 要在新 home 里重新配一次模型 key，看不到旧 session |
| **L3（computer-use 真需要）** | 再套一层 **独立 Windows 用户账号 / 虚拟机** | **鼠标键盘层级** | 麻烦，但这是唯一真正的隔离 |

**为什么 computer-use 必须考虑 L3**（这条要讲清楚，不然方案是假的）：
- 【local-dsh】DSH 自己的文档写明：peer 检查 *"are not a sandbox against malicious package code"*。
- 【local-dsh】sandbox 栈（`sandbox-policy` → `fs-sandbox` / `bash-sandbox` / `pwsh-sandbox`）约束的是 **DSH 自己的 fs 与 shell 调用**。所有 computer-use 候选都是自己 `child_process.spawn` 一个 PowerShell/Node 后端 —— **这些调用在 sandbox 之外**。
- 更根本的是：computer-use 注入的是**你本人的输入**，它可以把焦点切到任何 app，包括 DSH workspace 之外的一切。**没有任何 DSH 侧配置能约束这一点。** 想约束只能在 OS 层。

### 3.2 A 的安装 + 隔离验证 + 回滚（以 `dsh-computer-use-win` 为例）

#### Step 0 — 建 L2 环境（不碰生产）

```bash
# Git Bash
export DSH_HOME="$HOME/.dsh-lab"
mkdir -p "$DSH_HOME"

# 用 shipped 的 web 模板建一个非 shipped 名字的 profile。
# 关键：这条命令只初始化 + dump，不 boot（已实测：exit 0，只创建 4 个文件）。
dsh --profile cu-lab --from-default-profile web --dump-config >/dev/null && echo "profile created"

# 确认生产实例完全没被碰到
ls -la "$HOME/.dsh/profiles/web"   # 时间戳应该是原来的
cat "$DSH_HOME/profiles/cu-lab/package.json"
```

实测产物（我在临时目录跑过，已删）：
```
$DSH_HOME/profiles/cu-lab/{package.json, cordis.patch.yml, cordis.yml, pnpm-workspace.yaml}
bundles = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]
```
> 注意：`dsh plugin --profile <name> add` 对**不认识的名字**只会用 `["@deepseek-ai/dsh-base"]`（`DEFAULT_PROFILE_BUNDLES`）初始化 —— **不是 web**。所以必须先走 `--from-default-profile web`。

#### Step 1 — 装插件进 lab profile

```bash
export DSH_HOME="$HOME/.dsh-lab"
dsh plugin --profile cu-lab add dsh-computer-use-win
```

- 这条会自动把包追加进 `dsh.profile.bundles`。【local-dsh】`dsh-plugin-manager/lib/index.js` 的 `reconcile()`（约 237–260 行）：
  ```js
  const metadata = bundleManifest(name, dir, anchor)
  if (metadata?.dsh?.bundle === void 0) {
    options.onOutput?.(`dsh: warning: ${name} declares no dsh.bundle — installed as a plain dependency, not a profile layer\n`, "stderr")
    continue
  }
  …
  if (!bundles.includes(name)) bundles.push(name)
  ```
  → **`dsh plugin … add` 会写 bundle 列表；在 profile 目录直接 `pnpm add` 不会。** 而且如果包没有声明 `dsh.bundle`，它会明确警告并只当普通依赖处理。
- 装之前先备份（防手滑）：
  ```bash
  P="$DSH_HOME/profiles/cu-lab"
  cp "$P/package.json" "$P/package.json.bak-$(date +%Y%m%d%H%M)"
  cp "$P/pnpm-lock.yaml" "$P/pnpm-lock.yaml.bak-$(date +%Y%m%d%H%M)"
  cp "$P/cordis.patch.yml" "$P/cordis.patch.yml.bak-$(date +%Y%m%d%H%M)"
  ```
- 如果 CLI 报 peer 版本不兼容，它会打印自救命令：`dsh plugin --profile cu-lab allow-version <pkg>@<v> --dsh-version <exact> --accept-risk`（exemption 写在 profile 的 `compatibility.json`，不动 `package.json`）。**能不加就不加。**

#### Step 2 — 静态验证（boot 之前）

```bash
export DSH_HOME="$HOME/.dsh-lab"
dsh --profile cu-lab --dump-config > /tmp/cu-lab.yml
grep -n -A3 "mcp-dsh-computer-use-win" /tmp/cu-lab.yml
grep -n "^# ==" /tmp/cu-lab.yml | head            # 看每一层来自哪个文件
grep -c "C:\\\\Users\\\\27063\\\\.dsh\\\\cordis" /tmp/cu-lab.yml   # 应为 0：独立 home 已甩掉 deja 注入
```

#### Step 3 — 起服务，只绑回环，只读模式

```bash
export DSH_HOME="$HOME/.dsh-lab"
export DSH_PERMISSION_MODE=read-only          # 见下方解释
cd ~/dsh-cu-sandbox                            # 专用空目录 = workspace root
dsh --profile cu-lab --port 3180 --no-open
```

三个环境变量的作用（全部源码确证，`dsh-base/cordis.patch.yml`）：
```yaml
- id: sandbox-policy
  config:
    mode: !!js process.env.DSH_PERMISSION_MODE ?? 'workspace-write'
    workspaceRoot: !!js process.cwd()
- id: approval
  config:
    policy: !!js "(process.env.DSH_PERMISSION_MODE ?? 'workspace-write') === 'danger-full-access' ? 'never' : 'ask'"
```
- **`DSH_PERMISSION_MODE=read-only`** → sandbox 变 `read-only`（`fs-sandbox` 拒绝一切写入），approval 保持 `ask`。
- **绝对不要设 `DSH_PERMISSION_MODE=danger-full-access`** —— 它会把 approval 翻成 `never`，一次性关掉所有审批。
- 【local-dsh】注意 Windows 上 `bash-sandbox` 是 `disabled: !!js process.platform === 'win32'`，启用的是 `pwsh-sandbox`；同理 `tool-bash` 在 Windows 关、`tool-pwsh` 开。所以"windows 上沙箱是不是真的在拦"取决于 `pwsh-sandbox`。
- **`--port 3180`** 避开 3080；**不要传 `--host`**，默认就是 `127.0.0.1`。

> ⚠️ 再次强调：`read-only` 约束的是 DSH 自己的 fs/shell，**管不住 computer-use 插件 spawn 出来的 PowerShell**。它防的是"agent 顺手改你的项目文件"，不是"agent 点你的银行 App"。后者只能靠 L3。

#### Step 4 — 限制能力面（按需收紧）

**A. 只让它在指定 app 上工作**（cuwin / 988 支持 window 限定，在 profile 层覆盖 row 配置）：
`$DSH_HOME/profiles/cu-lab/cordis.patch.yml` 追加（注意 patch 是**整段替换** config，要保留原有 key）：
```yaml
- id: mcp-dsh-computer-use-win
  config:
    serverName: wincu
    transport: stdio
    # …原样保留 bundle 里那两个 !!js 表达式…
    toolCallTimeoutMs: 60000
    failOnStartupError: false
```
（`mcp-dsh-computer-use-win` 这个 row id 我从它的 `cordis.patch.yml` 里读到的；`dsh-click` 的 row id 是 `dsh-click`，`computer-user` 是 `computer-user`，`dsh-nuphus-mcp` 是 `dsh-nuphus-mcp`，`ds-harness-remote` 是 `ds-harness-remote`。）

**B. 只想让它临时闭嘴（不卸载）**：
```yaml
- id: mcp-dsh-computer-use-win
  disabled: true
```

**C. 想临时叠加一层试验 patch（不改 profile 文件，退出即失效）**：
```bash
dsh --profile cu-lab --patch /tmp/extra.yml --port 3180
```
（`--patch` 在层序里最后应用，优先级最高。）

**D. 隔离到"人不在旁边也跑不了"**：`computer-user` 的 `manual` 模式 / `dsh-click` 的 `~/.dsh-lab/profiles/cu-lab/cordis.patch.yml` 里把 approval 保持 `ask`（read-only 模式下已经是 `ask`）。**不要依赖"AI 自己判断危不危险"。**

#### Step 5 — 首次运行的行为验证清单

1. 只开一个记事本窗口，让它 `snapshot` → `type_text` → 再 `snapshot`，**确认它不会把输入打到别的窗口**（cuwin 是 fail-closed，应该报错而不是乱打）。
2. 故意把鼠标停在屏幕角落 500ms，确认急停生效（cuwin）。
3. 在 DSH 里让它点"删除"类目标，确认审批弹窗出现、拒绝后它**不会**自己绕过。
4. 检查 `$DSH_HOME/logs/` 和 `~/.dsh-lab/sessions/` 里有没有你意料之外的网络活动痕迹。

#### Step 6 — 回滚

**L2 环境（推荐路径）—— 回滚就是删目录：**
```bash
# 先确认生产实例不受影响
ls -la "$HOME/.dsh/profiles/web/package.json"   # 应无变化
rm -rf "$HOME/.dsh-lab"                          # 一行结束，生产零风险
```

**如果是 L1（共用 `~/.dsh`）：**
```bash
export DSH_HOME="$HOME/.dsh"
dsh plugin --profile cu-lab remove dsh-computer-use-win
# 验证 bundle 行也一起没了（reconcile() 会丢弃依赖已被移除的 bundle）
dsh --profile cu-lab --dump-config | grep -c "dsh-computer-use-win"   # 期望 0
rm -rf "$HOME/.dsh/profiles/cu-lab"
```
> 【local-dsh】`reconcile()` 的过滤逻辑：bundle 名若既不在 `beforeDeps` 也已不在当前 `dependencies` 里，会从 `bundles` 数组里被丢弃 —— 所以 `remove` 会同时清掉依赖和 bundle 行。这是源码确证的，不是猜测。

**如果 profile 起不来：**
```bash
cd "$DSH_HOME/profiles/cu-lab"
mv cordis.patch.yml cordis.patch.yml.broken-$(date +%s)
# 下次启动会自动重建一个空的 patch 模板
```
（这正是 `dsh-app-boot` 的 `sanitizeProfile()` 在做的事：把 `cordis.patch.yml` 改名成 `.bak-<timestamp>` 并恢复 bundle 列表，缺失的 profile 下次启动重新初始化。）

**如果万一手滑装进了生产 `web` profile：**
```bash
# 1) 先备份（你的 web profile 本来就有 .bak-* 的命名习惯，沿用）
cd "$HOME/.dsh/profiles/web"
cp package.json package.json.bak-$(date +%Y%m%d-%H%M)-pre-rollback
cp pnpm-lock.yaml pnpm-lock.yaml.bak-$(date +%Y%m%d-%H%M)-pre-rollback
cp cordis.patch.yml cordis.patch.yml.bak-$(date +%Y%m%d-%H%M)-pre-rollback
# 2) 卸载（先停掉正在跑的 3080 实例，避免 live reload 中途 reload）
dsh plugin --profile web remove <pkg>
# 3) 验证 row 已消失
dsh --profile web --dump-config | grep -c "<row id>"   # 期望 0
# 4) 必要时回退
cp package.json.bak-<ts> package.json && cp pnpm-lock.yaml.bak-<ts> pnpm-lock.yaml
```

**要备份的文件清单（profile 粒度）：**
```
$DSH_HOME/profiles/<name>/package.json         ← bundles 列表 + 依赖
$DSH_HOME/profiles/<name>/pnpm-lock.yaml
$DSH_HOME/profiles/<name>/pnpm-workspace.yaml  ← allowBuilds 写在这里
$DSH_HOME/profiles/<name>/cordis.patch.yml     ← 你的覆盖层
$DSH_HOME/profiles/<name>/compatibility.json   ← 若有（version exemptions）
$DSH_HOME/cordis.patch.yml                     ← home 层（会影响所有 profile！）
```

### 3.3 B 的安装 + 隔离验证 + 回滚（以 `ds-harness-remote` 为例）

remote 插件和 computer-use **不要放同一个 profile**：一个把会话暴露给远端，另一个让远端能通过那个会话控制你的桌面 —— 组合起来的风险大于各自之和。

```bash
# 用另一个独立环境（可以和 A 共用 L2 目录，但用不同 profile 名 + 不同端口）
export DSH_HOME="$HOME/.dsh-lab"
dsh --profile rc-lab --from-default-profile web --dump-config >/dev/null

# ⚠️ 先决定中继：默认 serverUrl 是维护者的 https://dsh.r2049.cn
#    严肃使用应自建（仓库里有 apps/server，配 DSH_SERVER_ACCOUNT / DSH_SERVER_PASSWORD）
dsh plugin --profile rc-lab add ds-harness-remote

# 静态验证：确认 row 的 serverUrl / codex.enabled 是你想要的
dsh --profile rc-lab --dump-config | grep -n -A8 "id: ds-harness-remote"

# 起服务：只绑回环
cd ~/dsh-rc-sandbox
dsh --profile rc-lab --port 3280 --no-open
```

验证要点：
1. **确认本机没有多出来的监听端口**：`netstat -ano | findstr LISTENING | findstr -v 127.0.0.1` 应该没有 dsh 相关的新条目（README 声称只做出站连接 —— 这条要自己验）。
2. **确认交互式终端是关的**（README 说默认关、需 Host 本地设置）。
3. **确认远端看不到 `credentials.*` / `shell` 等通用 RPC**（README 明说不暴露 general tool RPC）。
4. **先用一台不重要的设备配对**，在 Host 侧确认出现「待授权设备」，未经 pin 的设备应该进不来。
5. 用完后把 `- id: ds-harness-remote` 改成 `disabled: true`，或直接 `dsh plugin --profile rc-lab remove ds-harness-remote`。

回滚：同 §3.2 Step 6（L2 路径下 `rm -rf "$HOME/.dsh-lab"` 即可）。

### 3.4 明确建议拒绝的（连"隔离装一下"都不值得）

| 拒绝对象 | 为什么连实验都不做 |
|---|---|
| `@wenbin_wb/dsh-bridge` | 它的默认路径（无密码 + 隧道）就是无认证 RCE。要在实验里复现这个风险，等于亲手把 RCE 暴露到公网。**没有安全的实验方式。** |
| `JUANWANG-BUAA/dsh-full-remote` | 宣称提供 `credentials.*` 远程 API。你要"权限最小化"，这是反方向。 |
| `dsh-web-lan-access` 用在生产 profile | 它会把生产实例绑到 `0.0.0.0` 并把 trust fence 扩到 Tailscale/VPN 网段。**只在一次性 L2 profile 里、且用完立刻删**。 |
| `mrpulor-gh/dsh-nuphus-mcp` 直接 `add` | 会在 boot 阶段跑 `npm install -g`。如果一定要试，先手动装好二进制并把 config 的 `command` 指成绝对路径。 |
| 任何 `capabilities = null` 的插件进生产 profile | §2.3。 |

---

## 4. 我**无法确认**的部分（不编）

1. **`cua-driver` 的 Windows 真实状态。** `trycua/cua` 的 Windows 支持我只有 988 插件 README 这一个来源（它自己写 BLOCKED）。我没有审计 upstream repo。
2. **`ds-harness-remote` 的 `fs-write` 能力到底从哪来。** README 说"no file-mutation APIs"，但 catalog 标了 `fs-write`。222 个 dist 文件我没逐行读。**按"未验证声明"对待。**
3. **`dsh-click` 的 `prepare: node scripts/prepare.mjs` 具体做什么。** 我只确认了它是 lifecycle script、且从 npm 装不会触发。脚本内容没读。
4. **`win-pilot` 里那个 28.1 MB `win-pilot-wgc.exe` 的内容。** 完全未审计。
5. **`dsh-computer-use-win` 的两个行为**：C# helper 编译出的缓存 DLL 落在哪个目录（README 只说"缓存"）；`failOnStartupError: false` 意味着后端起不来时**静默降级**而不是启动失败 —— 我读到了这个配置值，但没测过它的实际表现。
6. **`saya-ch/dsh-mobile` 的 `capabilities: null` 对应的真实能力面。** 我只读了 README 和 `package.json`（`bonjour-service` + `selfsigned` + 69 MB unpacked + bundled funnel binaries），没有审计代码。
7. **`computerUse` 独占 slot 的具体竞争行为。** 我在 `api-catalog.js` 里读到了契约文本（"A second registration fails even when it repeats the current name"），但本机安装里**没有任何包实现这个服务** —— 也就是说 0.1.7-rc.2 有契约但没内置 provider。实际装两个插件会怎样，我没测。
8. **`dsh-tether` / `dsh-pocket-relay` / `dsh-remote-web` 的加密实现细节。** 只有描述，没有审计。

---

## 5. 一句话结论

- **A**：选 **`dsh-computer-use-win`**（Windows 原生、零依赖、零 lifecycle script、无 network），跑在 **独立 `DSH_HOME` + 独立 profile + 3180 端口 + `DSH_PERMISSION_MODE=read-only`** 下；先用 **`computer-user`** 做最小爆炸半径的试水。`Anionex` 因 macOS-only **硬否决**，`988` 因 Windows 未验收 + 依赖版本错配否决，`nuphus` 因 boot 期自动 `npm i -g` 否决。**只装一个**（`computerUse` 是独占 slot）。
- **B**：选 **`ds-harness-remote`**（只出站、Noise_IK E2E、双因子授权、不暴露通用 RPC），但**默认 `serverUrl` 是第三方中继，严肃使用要自建**。`dsh-pocket` 作为"就是要公网可达"的备选。`dsh-bridge` 和 `dsh-web-lan-access` **拒绝**，`dsh-web/@linxin666` 家族因"★8037 是 repo 级 + 子包 `capabilities: null` + 实际依赖 cloudflared/ssh2"**不进生产**。
- **最重要的一条**：DSH 的 sandbox 管不住插件自己 spawn 出来的进程，也管不住"以你的身份注入鼠标键盘"。真正的隔离只有 Windows 用户账号 / VM。其余都是降低概率，不是消除。
