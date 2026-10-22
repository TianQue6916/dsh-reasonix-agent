---
id: mem-49ba26e5a91cfbbc229e075db472810e
revision: 1
created_at: "2026-10-04T10:18:53.343Z"
updated_at: "2026-10-04T10:18:53.343Z"
name: dsh-pilot-browser-lab-e2e-20261004
description: "C 任务：browser-use 在隔离 browser-lab 里端到端跑通（dsh-pilot v0.7.2 + Edge --no-sandbox）"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 结论：browser-use 实测通过（隔离环境），生产未推
用户 m07486「行,开始」+ m07731「开始吧」授权 B（computer-use）+ C（browser-use）并行实测。

## 隔离环境（生产 `~/.dsh` 完全未动）
- `DSH_HOME='C:\Users\27063\.dsh-lab'`，profile `browser-lab`
- `~/.dsh-lab/profiles/browser-lab/package.json`：`dsh.profile.bundles = ['@deepseek-ai/dsh-base','@deepseek-ai/dsh-headless','dsh-pilot']`
- patch：`~/.dsh-lab/profiles/browser-lab/cordis.patch.yml`（1401 B）含 `webserver` row（`@deepseek-ai/dsh-host-webserver`，`host: '127.0.0.1'` / `port: 3180`）+ `agent-default-model` + `llm-pi-ai`
- ★ **bundle auto-discovery 会自动加载 `dsh-pilot` 自带的 `cordis.patch.yml`** ⇒ **不要手插 `- insert: {id: pilot, name: file://…}`**（会 `failed to import`）

## 三个真实阻塞（逐个挖出）
1. **`--profile web` 不收位置参数** —— `error: too many arguments. Expected 0 arguments but got 1: …` ⇒ 一次性 prompt 只能用 `--profile headless` 等非 web profile。
2. **pilot 声明 `inject = ["webServer","tools"]`**（`dsh-pilot/lib/index.js:9`）⇒ headless 栈缺 `webServer`，插件 `pending (waiting for service: webServer)`、17 个 `pilot_*` 工具一个都不出。修法 = 手插 `@deepseek-ai/dsh-host-webserver`，且 **config 必须显式给 `host` + `port`**（schema `z.union([z.const("127.0.0.1"), z.const("0.0.0.0")]).required()` + `z.natural().max(65535).required()`），否则 `ValidationError: invalid config: - $.host missing required value`。
3. **★ Edge 154 CDP `Page.enable` 报 `Target crashed`** —— 根因 = renderer sandbox 被拒（受限 token `isAdmin=False`）。**判据矩阵**（`~/.dsh-lab/tmp/cdp-probe.mjs`）：
   | 启动 flag | `Page.enable` | `Runtime.enable` |
   |---|---|---|
   | 无（`--headless=new`） | **FAIL `{"code":-32000,"message":"Target crashed"}`** | FAIL TIMEOUT |
   | 只 `--disable-gpu` | FAIL 同上 | FAIL TIMEOUT |
   | **只 `--no-sandbox`** | **OK `{}`** | **OK `{}`** |
   | `--headless=old` / 有头 | FAIL 同上 | FAIL TIMEOUT |
   ⇒ **唯一决定因素是 `--no-sandbox`**（与 headless/有头无关、与 TEMP 无关）。
   - 修法已落盘 lab：`~/.dsh-lab/profiles/browser-lab/node_modules/dsh-pilot/lib/index.js`（60280 → **60468 B**，**CRLF**，备份 `.bak-20261004-pre-nosandbox`）在 `:241 const argv = [` 的 `"--headless=new",` 后插 `"--no-sandbox",`。**上游未带该 flag。**

## ★★ 端到端成功（独立判据，不经过 pilot 自证）
- 测试页 `~/.dsh-lab/tmp/c-test-server.mjs`：node `createServer` 监听 `127.0.0.1:18777`，页面含 `CTEST-PAGE` / `<h1 id="hdr">CTEST-READY</h1>` / `<input id="name">` / `<button id="go" onclick="fetch('/api/clicked?name=…')">GO</button>` / `<a id="lnk">second-link</a>`；**所有请求 append 到 `c-server.log`**。
- 命令：`timeout 300 env DSH_HOME='C:\Users\27063\.dsh-lab' TEMP='C:\Users\27063\AppData\Local\Temp' TMP=<同> node "$APPDATA/npm/node_modules/@deepseek-ai/dsh/lib/bin.js" --profile browser-lab "<5 步任务>"`
- agent 输出：title `CTEST-PAGE`；元素 `[1] <input> type here` / `[2] <button> GO` / `[3] <a> second-link`；`pilot_fill` on `name` → `filled 1 field(s): name`；`pilot_click [2]`。
- **★ 服务端日志逐字（决定性）**：
  ```
  2026-10-04T10:16:53.381Z GET /
  2026-10-04T10:16:58.906Z GET /
  2026-10-04T10:16:58.935Z GET /favicon.ico
  2026-10-04T10:17:07.277Z GET /api/clicked?name=HELLO-PILOT
  2026-10-04T10:17:14.191Z GET /done
  ```
  ⇒ `pilot_fill` 写入的 `HELLO-PILOT` 经 `pilot_click` 触发了真实 `fetch` ⇒ **完整浏览器闭环成立** ✓

## dsh-pilot v0.7.2 包事实
- 路径 `~/.dsh-lab/profiles/browser-lab/node_modules/dsh-pilot/`：`cordis.patch.yml` / `dsh.plugin.json` / `lib/index.js`(60280 B) / `lib/client.js`(10847 B) + 2 个 `.map`。
- `package.json`：`"type":"module"`、`"engines":{"node":">=22"}`、**无 runtime dependencies**（devDependencies 只有 esbuild）、`dsh.bundle.patch = ./cordis.patch.yml`、`dsh.client = {platform:"web"}`。
- **17 个工具**：`pilot_open/_click/_type/_fill/_press/_snapshot/_screenshot/_eval/_wait/_wait_for/_reload/_back/_close/_assert/_diff/_download/_upload`。
- Edge 候选路径（`lib/index.js:12-14`）：`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`（**本机命中**）/ `C:\Program Files\Microsoft\Edge\Application\msedge.exe` / `D:\environment\edge\msedge.exe`；`:207 findEdge()` / `:210 throw new Error("pilot: no Edge/Chrome executable found; install one or set edgePath")` ⇒ **config 可设 `edgePath`**。
- 端口池 `9222..9262`（`:214-215`，`canBind` 用 `node:net` `createServer`）；profile 目录 `mkdtemp(join(tmpdir(), PROFILE_PREFIX))`（`:238-239`）⇒ **依赖 `os.tmpdir()`**；`waitForVersion` 用 `fetch http://127.0.0.1:${port}/json/version`（`AbortSignal.timeout(1500)`，`:299`）；`newTab` 用 **`PUT /json/new?<url>`**（`:312`）。
- `:280 await this.cdp.call("Page.enable"); :281 await this.cdp.call("Runtime.enable");` 是**无条件调用** ⇒ 这是 crash 的必经点。
- **本机只有 Edge，没有 Chrome**（`/c/Program Files/Google/Chrome/…` 与 `AppData/Local/Google/Chrome/…` 均不存在）⇒ 任何「驱动真实 Chrome」的方案在本机不可用。

## 候选横向对比（catalog `~/.dsh/storages/plugins.json`，4377 条 / 23 个 category / updated 2026-09-27）
| 插件 | ★ | dl | 机制 | 本机可行性 |
|---|---|---|---|---|
| `@wxg-prc-cpg/browser-skill-dsh-plugin` | **7385** | 14475 | 控制可见 Chrome/Edge Agent Window，a11y + VOM 观察 | 待验（★最高，未实测） |
| `github:omdsh-dev/dsh-browser#path:/packages/browser/bridge-browser` | 731 | — | Chrome 侧边栏扩展 | 要装扩展 |
| `dsh-builtin-browser` (npm) | 83 | 12583 | 自带 Electron 窗口 + CDP，20 个 `browser_*` 工具 | 免额外浏览器 |
| `@anweat/dsh-browser` (npm) | 25 | 8283 | 自包含 Playwright chromium | 要下 chromium |
| **`github:guo6x/dsh-pilot`** | 22 | — | **零依赖 raw CDP**，17 个 `pilot_*` | **✔ 实测通过** |
| `dsh-tabbit` (npm) | 101 | 1505 | 控制 Tabbit 浏览器 | 要装第三方浏览器 |
| `dsh-browser-use` (npm) | 1 | 423 | **云端 API 桥** | ✗ 网页内容出第三方 |

## 装机方式
`node …/bin.js plugin --profile browser-lab add github:guo6x/dsh-pilot`（**必须带 `DSH_HOME`**，否则污染生产 `~/.dsh/profiles/`）；12.4s / exit=0；`github.com` 直连可达（curl 200）；`dsh plugin add` **会同时写 `dependencies` 和 `dsh.profile.bundles`**。

## 待办
- 横向对比 ★7385 的 `@wxg-prc-cpg/browser-skill-dsh-plugin` 与 dl 12583 的 `dsh-builtin-browser`（本机 pilot 已够用，但对比数据才支撑 go/no-go）
- B4：出 go/no-go 结论 + 推生产方案与回滚
- 生产侧未推，因为 `--no-sandbox` 是安全降级，需用户拍板
