# PLAN

> 每步由 `.agent-presets/anchored-standard/plan-anchor.mjs` 取 head 重注入。
> 改完这个文件**不需要重启** —— 它是每 step 现读的。
> 需要细节时直接 read 本文件，不要凭注入的截断段猜测后面的内容。

## 当前目标

把 dsh 打磨成能长期跑的主力 harness：目标每步可见 + 思考链中文 + 工具/技能集干净可审计。

## 进行中

- [x] plan-anchor.mjs：已上线并验证（新进程注入顺序 `git-context → plan-anchor → thinking-anchor` ✓）
- [x] 重启后四条核对 —— **全部通过**（证据见下节）
- [x] `@ethanwong-hk/dsh-thinking-guard` 被我 10-01 20:40 那次 bundles 精简误删（留下悬空 patch row ⇒ 每次 web boot 报
      `patch: entry "thinking-guard" not found`）—— **已修**，`--dump-config` exit=0 且 stderr 干净
- [ ] thinking-guard 复活需一次 web 进程重启才真正生效（当前进程仍是 12:48 那份旧代码）
- [ ] desktop 侧要重跑一次确认（CLI 不能 dump desktop：`error: profile "desktop" is managed exclusively by the Electron application`）
- [ ] `dsh-plugin-message-edit` 1.2.0 在 DSH 0.2 上的 boot 崩溃已本地修（=上游 PR #7：导航改走 `uiWorkspace.openSession`）：
      包已改 + `~/.dsh/vendor/dsh-plugin-message-edit-1.2.0-pr7.tgz` + `profiles/desktop/package.json` 以 `file:` 声明并加回 bundles
      —— **待 desktop 冷启动验证**（红框是否消失 + 悬停旧消息能编辑）；回滚步骤见 `~/.dsh/patches/README-message-edit-pr7.md`
- [ ] dsh-context「费用」只显示 ¥38.56 / 已计价 151 个会话 —— 根因是 models.dev 认不出自建 gateway 的
      `commandcode-goat | deepseek/deepseek-v4.1-flash`（占全机 token 96%）。**已修**：本地价目覆盖表 +
      `patch-dsh-context-pricing.mjs`（三处纯插入、幂等、可 --restore），测试 28/28 过，全机复算
      **¥38.84 → ¥321.08、已计价 153 → 1558 / 1599**。**待重启 App 生效**；说明见
      `~/.dsh/patches/README-dsh-context-pricing.md`

- [x] goat-gateway 的 usage 覆盖率原本只有 ~15%（重启前实测 471 OK / 76 带 usage = 16.1%）：根因是 `gateway.mjs`
      SSE 分支里 `if (tail.length < 65536) tail += chunkStr;` 是**前 64KiB 封顶**，长流一超过 64KiB 就
      停止累积，而 usage 只出现在流末尾 ⇒ 永远读不到。**已修**（滑动窗口 `if (tail.length > 65536)
      tail = tail.slice(-65536);`），回归用例 `~/.dsh/storages/tools/selftest-tail-window.mjs` 双跑对照
      通过（新代码 PASS、patch 前备份 ASSERT FAIL）；**已生效**：16:03:03 用一次性任务 `Goat-Gateway-Restart-Once` 挑空闲窗口重启（新 PID
      24680，重启脚本 `restart-gateway.ps1`），重启后 **13/13 条 OK 行带 usage = 100%**

- [x] GOAT 额度面板 official 行渲染错（用户 m00001「你这个插件重置时间错了吧」）：**不是数据错** ——
      `curl 127.0.0.1:8790/quota` 里 official 行（plan=official-balance, currency=CNY, available=-0.22）的
      fiveHour/weekly/month 字段本来就是 null，-0.22 是官方 key 真实欠费。真正原因是 **client bundle 是陈旧拷贝**：
      `profiles/{web,desktop}/node_modules/@local/dsh-plugin-goat-panel` 是 09-25 19:22 的 11100B 版本
      （sha256[:8]=`283840f5`），**没有 `if (r.kind === "official")` 分支** ⇒ 落进通用套餐渲染路径，
      `pctFine(null,null)`→"0%"、`n2(null)`→"0.00"、`fmtReset(null)`→""，于是显示
      `5h 0% / 周 0% / 月 0% / 余 0.00 / 5h 0.00/null ... 窗口重置：5h`。
      **机制**：package.json 用 `file:` 声明 ⇒ pnpm 把它物化成**真实目录**（拷贝/硬链），源目录
      `D:\Toolbox\goat-gateway\dsh-plugin-goat-panel\lib\client.js`（Oct 1 20:08 的 12371B 新版，含 official 分支）
      之后的改动**永不到达**；对照 `dsh-plugin-local-search` 用 `link:` ⇒ node_modules 里是 **Junction**，无此问题。
      **已修（根治）**：`file:` → `link:`（`profiles/web/package.json:7`、`profiles/desktop/package.json:6`），
      并 `pnpm install --lockfile-only` + `pnpm install` 让 **pnpm-lock.yaml 也写成 `link:`**
      （否则下次 `pnpm install --frozen-lockfile` 会按 lockfile 把 junction 打回拷贝）。现状：两 profile 的
      `node_modules/@local/dsh-plugin-goat-panel` = `<JUNCTION> [D:\Toolbox\goat-gateway\dsh-plugin-goat-panel]`，
      client.js = 12371B / sha256[:8]=`94d84544` ✓。备份：`profiles/web/pnpm-lock.yaml.bak-20261002-160945-pre-link`、
      `profiles/desktop/pnpm-lock.yaml.bak-20261002-161010-pre-link`（另有 package.json.bak-*-pre-goatpanel-junction）。
      **待重启 web / desktop 才可见**（client bundle 不吃 HMR）。
- **测量陷阱（本次踩过）**：在 bash 里用双引号 + `\"` 拼 PowerShell 路径会静默拼错 ⇒ `Get-Item`/`Test-Path` 假报
  MISSING，据此**误判过两轮「node_modules 又被还原」**。查 junction 一律写 `.ps1` 文件（`<<'EOF'` here-doc，
  路径用变量拼接）或 `cmd //c "dir /AL <path>"` 看 `<JUNCTION>` 行。

## 待办：双机四 agent 用量总视图（用户 m01207，原话「能不能让他检测两个电脑四个agent的花费，一起同步」）

- dsh-context 的 host 半只 `ctx.sessionProjections.register(...)` ⇒ 数据源是**宿主进程自己的 session store**，
  天然单机单进程，没有 remote/多机入口；settings schema 只有 7 个 UI 偏好字段。
- 但跨机所需的数据已经就绪且极小：本机 `~/.dsh/storages/session_projcache/sessions/*.json`（已是 fold 好的
  token 桶）+ `%APPDATA%\reasonix\cache\usage-catalog\v1.sqlite`（`usage_records` 5406 行 /
  `usage_rollups` 32 行，字段 day/source/provider/model_ref/prompt/completion/reasoning/cache_hit/
  cache_miss/total/requests/turns，源 `%APPDATA%\reasonix\stats\YYYY-MM-DD.jsonl` 24 个，数据停在 09-21）。
  ⇒ 不需要碰几十 GB 的 session 日志。
- 口径按读法 A 定义：**{Windows, Linux} × {dsh, reasonix}**（用户尚未确认；reasonix 那套独立用量库是与 A 吻合的实物证据）。

## 重启后核对结果（2026-10-02）

- [x] `skill_search` 对 hindsight / microsoft-foundry 零命中 ✓（catalog 进程级缓存，重启后已刷新）
- [x] 新 session 首步顺序 = `git-context → plan-anchor → thinking-anchor` ✓（thinking-anchor 最贴采样点）
- [x] 无 `deja.exe` 被拉起 ✓；web/desktop/headless 三份 resolved config 里 `deja` 命中数均为 0 ✓
- [~] reasoning 中文：新进程 session 首块 CJK 0.37–0.56、中文块占比 63–98%；**旧进程 session 仍 0–4%**

## 已知未决

- **web 侧仍跑着 12:48:18 启动的旧进程**（`node ... dsh\lib\bin.js --profile web --port 3080`）：它是部分 session 仍然全英文的源头。要彻底一致，得把这个进程也重启一次。
- 35 处 `reasoningEfforts: false` 与实测矛盾（web 17 + desktop 18）：`zai-org/GLM-5.3`、`MiniMaxAI/MiniMax-M3` 在五档全返回 thinking
- desktop 有 24 个死 model（86 entries vs web 61 vs allowlist 62）—— `rewrite-model-list.py` 只 hardcode 了 `profiles/web/cordis.patch.yml`
- `dsh-deja` v0.21.3 仍躺在 `profiles/{web,desktop}/node_modules/`（client=False，有 `dsh.bundle` 字段）—— 靠 bundles 列表移除来停用，但 auto-discovery 是否会把它拉回来**未验证**
- `@local/dsh-thinking-language` 源码在 `D:/Toolbox/dsh-thinking-language`（在 `~/.dsh` 之外，不随同步走）
- `@local/dsh-thinking-language` 两 profile 都用 `file:` 声明：web 里被物化成**真实目录**（Oct 1 14:26），
  desktop 里却是 **Junction** —— 行为不一致，且 web 那份改了源目录也不生效（当前内容恰好 SAME 所以没爆）。
  同一个 `file:` vs `link:` 根因，建议同样改 `link:` + `pnpm install`；**但它承载 thinking-language directive 注入**，
  改坏会丢中文思考链注入 ⇒ 单独一次做、留回滚点、跟一次重启一起验。
- Linux 连不上 `github.com`（`curl` → 000），任何 `github:` 依赖在那边装不了
- Linux profile bundle 只有 5 个，Windows 11 个
