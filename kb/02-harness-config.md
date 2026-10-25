# 02 · dsh 配置面与重启边界

> dsh 的配置不是一个文件，而是四层 patch compose 加三个互不替代的生效时机；**先把「改了什么」分类，「要不要重启」才有答案**。

## D 定论

1. **四层 compose，越靠后越优先。** 出厂 bundle 自带 patch → `~/.dsh/profiles/<name>/cordis.patch.yml`（profile 层，日常唯一该改的地方）→ `~/.dsh/cordis.patch.yml`（home 层，**outranks profile 层**，作用于所有 profile）→ `dsh --profile <name> --patch <file>`（overlay，最后应用，可重复）。`--dump-config` 输出里的 `# == <来源>, patched by <路径>` 注释就是层归属的现场标签：2026-10-26 实测 web profile 有 24 处 `patched by`，其中 **12 处**指向 `C:\Users\27063\.dsh\profiles\web\cordis.patch.yml`。

2. **三个生效时机，必须分开记：**

   | 改动对象 | 生效条件 | 依据 |
   |---|---|---|
   | `profiles/<name>/cordis.patch.yml`（`patchReload: live`） | **开新 session 即生效**，进程不必重启；已存在的 session 保持旧值 | 3080 的 PID 52540 从 2026-09-27 13:12 起未变，新装 mnemon 在当晚新建的 session 里已全套可用 |
   | `profiles/<name>/package.json` 的 `dsh.profile.bundles` / `dependencies` | **必须重启进程**，且会打到正在跑的 turn 上 | `dsh-app-boot/lib/index.js:1365-1372` `ResolutionRouter.replace()` 逐字抛 `profile resolution: replacing "X" requires a process restart` |
   | `.agent-presets/**/*.mjs`（preset plugin 代码） | **必须重启进程**，不参与 live HMR | `plan-anchor.mjs` / `stall-guard.mjs` 落地时都要等 App 重启 |
   | `node_modules/**/lib/client.js`（client bundle，如 `dsh-context` 面板、`tm-usage-first`） | **必须重启**，且 `pnpm install` 会覆盖 | client bundle 不吃 HMR |
   | `~/.dsh/PLAN.md` | **不需要重启**，因为 `readPlan()` 每 step 现读、无缓存 | 刻意设计，理由见 M5 |
   | `~/.dsh/.env`、`.credentials.yaml` | 新进程读；已跑进程不感知 | 隔离实例必须显式 `cp ~/.dsh/.env ~/.dsh-lab/.env`，否则 `MISSING_CREDENTIAL` |

3. **实例边界只有两条：`patchReload` 和「bundle 解析集合」。** 前者决定「新 session 是否重读 patch」，后者决定「进程是否还活着」。

4. **「重启」与「生效」是两个独立问题。** 重启只解决「改的东西被加载」；服从度、采样状态、模型侧行为不是重启能改的。先想清楚在问哪一个，否则会反复做无效重启。

5. **桌面端与 CLI 是两条独立升级线。** 桌面端 `DeepSeek Harness.exe` 自带一份 dsh runtime（`app.asar` 121 MB 里检出 `0.2.0-rc.2`），`npm i -g @deepseek-ai/dsh` **不会**让它变成新版。profile 插件（`profiles/*`）两端共用，但两侧 runtime 版本各自演进。

6. **`defaultPreset: danger-full-access` 不等于「无沙箱」。** 它只选了 `sandbox: danger-full-access` + `approval: never` 这个 preset 组合；Windows 上并不解除 integrity level，写限制另有一套机制（细节留给 09 篇）。

## M 机制

**M1 · compose 的物理形态。** patch 文件本身是 YAML 列表。`- id: X` 是**替换已有 entry**，`- insert: [ ... ]` 是**新增 entry** —— 两者语义不同，混用会得到「配置写了但不生效」或 `dsh: patch: entry "X" not found`。`profiles/web/cordis.patch.yml:2-4` 自己写着：旧机制（`$DSH_HOME/.agent-presets/<id>/` 目录 + `dsh-agent-presets` 插件）在 **0.1.7 已废除**，目录不再被扫描。

**M2 · `.agent-presets/` 现在是「源码仓」，不是「加载点」。** 真正生效的是 preset 声明行：`profiles/{web,desktop}/cordis.patch.yml` 里 `- id: preset-anchored-standard` / `name: '@deepseek-ai/dsh-agent-preset'` 的 `config.plugins` 列表，列表里每项形如 `name: ../../.agent-presets/anchored-standard/plan-anchor.mjs`。这个相对路径相对 **profile 目录**解析（`~/.dsh/profiles/web/../../.agent-presets` = `~/.dsh/.agent-presets`）。同目录的 `agent.cordis.yml` 只是同内容的源头副本，**改它不生效** —— 这是本库最容易改错的文件。

**M3 · `patchReload` 的两个取值，本机三种 profile 全用到了。** `profiles/web/package.json:31` 与 `profiles/desktop/package.json:41` 是 `"patchReload": "live"`；`profiles/headless/package.json` 是 `"patchReload": "startup"`。headless 也确实更「窄」：`--profile headless --dump-config` 只有 **1056 行**（web 2394 行），**没有** `agent-preset-registry`、**没有** `plan-anchor` / `thinking-anchor` row —— 它的 `bundles` 只有 `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-headless` + `dsh-plugin-local-search`，preset 机制整套不在场。

**M4 · HMR 只 watch exact path，不是「watch 目录」。** `@deepseek-ai/dsh-hmr/lib/index.js` 的 `watchConfig()`：

- `findWatchRoot(filename)` 从 `dirname(filename)` 起向上找到第一个存在的目录，返回 `{ filename, root: canonicalRoot, depth }`，把缺失的父目录链记成 `depth`；
- `watch(target.root, { awaitWriteFinish: true, depth: target.depth, ignored: p => { const remainder = relative(resolve(p), target.filename); return remainder === ".." || remainder.startsWith(".." + sep) } })`；
- 回调里还有第二道过滤：`if (observed !== filename && observed !== target.filename) return;`；
- `refresh()` 串行化：`state.dirty` 置位后若已有 `running` 就直接返回，避免连写触发并发重载；
- 文件头注释逐字：`/** Exact-path watching for live profile patch files outside Cordis module roots. */`

为什么必须是 exact path：profile 目录里同时躺着 `node_modules/`（几万个文件）、几十个 `.bak-*`、`compatibility.json`。全目录 watch 会（a）在 Windows 上烧 watch handle，（b）把「写备份」误判成「改配置」而反复重载。`awaitWriteFinish` 则是对付编辑器「先截断后写入」的两段式保存。

**M5 · preset 的每 step 重注入与顺序。** `plan-anchor.mjs` 挂 `agent/pre-step` + `{ prepend: true }`，每步把 `$DSH_HOME/PLAN.md` 的 head（默认 30 行）作为 `source.kind='plan-anchor'` 的 user 消息追加到**最贴采样点**的位置。`prepend` 的语义在 `cordis/lib/index.js:336` 逐字是 `const method = options.prepend ? "unshift" : "push";` —— unshift 到 listener 数组头 = 外层 = **最后改写结果** = 消息最终最靠后。于是注册顺序决定最终顺序：`git-context`（无 prepend，最靠前）→ `dsh-mnemon` → `plan-anchor` → `thinking-anchor`（最外层）。`profiles/web/cordis.patch.yml` 里 plan-anchor 的 row 必须排在 thinking-anchor 之前，理由就是「语言契约优先级最高，要最后改写」。`PLAN.md` 本身每 step 现读（刻意不用 `mtimeMs:size` 当缓存键 —— 两个不同 JSON 恰好同字节数且同毫秒切换时会读回旧值），所以改计划文件不重启。

**M6 · 升级与版本线，三条线的适配动作可复用。**

- **0.1.5 系（→ 0.1.5-rc.2 / rc.3）四处必改**：`str_replace_editor` 不再默认挂载（不补 → tool-bootstrap keep 集缺名 → warnOnce 后暴露全量工具，锚定静默失效）；`session.events` 被移除（`for (const event of session.events)` 抛 TypeError 被 catch 吞掉 ⇒ headless 锚定静默退化为全量目录）；`dsh-persona` 的 `text` → `prefix`（不改 → preset 挂载失败 → 会话建不出来，且错误**只在浏览器 console**）；junction 重建。同期会话日志升 V4。
- **0.2.0-rc.2**：插件 peerDeps 先升（`dsh-mnemon` 0.5.16→0.5.20、`dshmarket` 1.66.2→1.66.6，二者同时兼容新旧 ⇒ 旧 dsh 照常跑）；`dsh-headroom` / `@lanbaolu/dsh-wechat-bridge` 用**精确豁免** `dsh plugin --profile web allow-version <pkg@ver> --dsh-version <exact> --accept-risk` 写进 `profiles/web/compatibility.json`，形如 `{"dsh-headroom@0.3.0": ["0.2.0-rc.2"]}` —— 精确到「包版本 × dsh 版本」，作者发新版后要重新豁免。验证：`--dump-config` exit=0 / stderr 空 / rows 416 / 77528 bytes。
- **0.2.1-rc.2**：`dsh-hooks-claude-code`、`dsh-hooks-codex`、`dsh-tool-ralph`、`dsh-webhook`、`dsh-webhook-github`、`dsh-experimental-schedule-bundle` 被移除；凡引用它们的 row 必须删，否则 dump 直接坏。`@deepseek-ai/cordis` 4.0.4→4.0.5（第三方插件 peer 要求 `^4.0.1` 仍满足）。
- **桌面端「没走官方安装器」的就地升级法**：官方 NSIS 在这台机器上**永远 rc=2**（`/S`、`/S --updated`、`/S /NCRC`、`/S /D=<临时目录>`、taskkill 后重试，全部 rc=2 且耗时 0.6–51 s 不等；UI 里点「安装并重启」卡十几分钟）。可行路径：在 `deepseek-harness-0.2.1-rc.2-win-x64.exe`（289,385,456 B，sha512 与 nightly.yml 一致、签名 Valid）里按 7z 签名 `37 7A BC AF 27 1C` 找偏移（本次 **863248**，换版本要重找，**不能写死**）→ 从该偏移切到文件尾 → `py7zr` 解包 → 整目录 rename 替换。路径不变 ⇒ 快捷方式与任务栏 pinned 全保留；旧版留在 `%LOCALAPPDATA%\Programs\DeepSeek Harness.old-20261023`（1.06 GB）可回滚。

**M7 · 平台门槛是 Node，不是 OS。** npm 上 29 个版本的 `os` / `cpu` / `engines` 全为 `None`；真硬要求是 `@deepseek-ai/dsh-app-boot/lib/index.js:4` 的 `import { inspect, parseEnv } from "node:util"`，而 `node:util.parseEnv` 是 **Node 20.12+** 才有。Linux 上 apt 的 v18.19.1 直接 `SyntaxError: The requested module 'node:util' does not provide an export named 'parseEnv'`。**危险点**：49 个依赖声明 `engines: node >=20`（含 `readdirp@5.1.1` 要 `>= 20.19.0`），但 npm 只 WARN EBADENGINE 不拦 —— `npm install` 报 `added 535 packages in 2m`、**EXIT=0**、380 MB，装得像成功，一跑就炸在第一个 import。

## J 判据

**J1 · 唯一权威判据是 `dsh --profile <name> --dump-config` 的 exit code。** 2026-10-26 本机实测：

```
dsh --profile web --dump-config         → RC=0, stdout 84612 B (2394 行), stderr 0 B
dsh --profile web --dump-default-config → RC=0, stdout 1371 行, stderr 0 B   # 不带 user 层
dsh --profile desktop --dump-config     → RC=1, stdout 0 B, stderr 76 B
    error: profile "desktop" is managed exclusively by the Electron application
dsh --profile web --dump-config-schema  → RC=1, stdout 907872 B, stderr 1205 B  # 不可当 gate
    error: [/186] unrecognized Loader tree carrier; use cordis:group or cordis:include for native child collection
```

四者分工：`--dump-config` 查生效值；`--dump-default-config` 回答「是 user 层改坏了还是出厂就坏」（default RC=0 而 config RC=1 ⇒ 一定是自己的 patch）；desktop 只能走 `~/.dsh/storages/tools/dump-desktop-config.ps1`；`--dump-config-schema` 在 0.2.1-rc.2 上因第三方插件非 native Schemastery 而必然 RC=1，**别拿它当 gate**。

**J2 · 「改了生效没」的判据是下游可观测物，不是配置文件里有没有那行字。** 三类：`--dump-config` 的行号（**同名 entry 出现多处时看行号最大的那处** —— 例 `tool-result-pruner` 共 5 处，只有 2400+ 那处是 anchored-standard）；新 session 的 `request/header` 里 `tools[]` 数组；新 session 的 `system/message` frame 文本。第 3 条最硬 —— 它直接证明 `personaPrefix` 真进了系统提示词。

**J3 · 判断「开新 session 够不够」，看改的是哪一层，不看改的幅度。** patch 里的任意 row（新增、覆盖、`insert`）→ 新 session；任何 `.mjs` 文件内容、任何 `node_modules` 里的东西、任何 `package.json` 的 bundles/deps → 新进程。

**J4 · 改完 patch 必做体检（每条命令加 timeout）：**

```
timeout 40 dsh --profile web --dump-config >/tmp/w.yml 2>/tmp/w.err; echo RC=$?
timeout 20 wc -c /tmp/w.yml /tmp/w.err        # 期望 RC=0 / err 0 B / bytes ≥ 改动前基线
timeout 20 grep -n '<你要改的字段>' /tmp/w.yml # 行号最大的那处才是生效值
```

**J5 · 判断 patch 是否「被 DSH 自己改过」，不能只看 diff 行序。** `@deepseek-ai/dsh-config-editor/lib/index.js` 的 `documentPath` 就是 `profiles/<name>/cordis.patch.yml`；UI 上一个开关会真的写文件（2026-09-28 18:50:32 的一次重写把 `memoryView` 整段从末尾移到中部，并新增 `include:mnemon-strategy-scoped`）。它会重排字段、重新格式化 —— 手工编辑前先接受这一点。

## X 反例

**X1 · 把 patch 改坏两次，症状一律是 `RC=1 / rows=0`。** 两次都是同一类：找 `        models:` 时命中文件里第一个（`commandcode-goat-anthropic` 的 6 行版），而非要改的 `commandcode-goat` 的 61 个 model。**正确做法：先锚 `      commandcode-goat:`（6 空格），再找它下面 8 空格的 `models:`。**

**X2 · `models` 块的结束边界不能写成「下一个 0 缩进行」。** 块内每行缩进 ≥10 空格（`          - id:`）。用「下一个 `- id: `」当边界会**多吞 421 行**（`- id: permission` 在 1128 行，正确边界是 707 行），后果是整个 provider 配置被当成 block 处理 ⇒ YAML 结构崩坏。正确写法：`end = 第一个非空且缩进 < 10 空格的行`。

**X3 · 用 pyyaml 当 gate 会误报。** patch 里合法使用 `!!js`（`tag:yaml.org,2002:js`），stock loader 报 `could not determine a constructor for the tag 'tag:yaml.org,2002:js'`。这是**误报**，真判据只有 `--dump-config` 的 exit code。

**X4 · `(absent)` 的 block 不能 append。** 若某 model block 原本没有 `reasoningEfforts` 行，往 block 末尾 append 会破坏缩进（有些 block 以更深缩进的子项结尾，如 `input:` 下的 `- text`）。**只做已有行的原地替换；`(absent)` 一律跳过。**

**X5 · 静默 no-op：`persona` vs `personaPrefix`。** `@deepseek-ai/dsh-system-prompt` 的 schema 是 `z.object({ includeHarnessIdentity, includeRuntimeContext, personaPrefix, personaSuffix, toolOrder })`，而 **`z.object` 不是 strict** ⇒ 未知 key 被 Zod 静默丢弃、不报错、不警告。`profiles/headless/cordis.patch.yml:12` 的 `persona:` 从写下那天起就是彻头彻尾的 no-op，批处理线的系统提示词一直是出厂那句。

**X6 · 把 `- id: X` 当新增用，直接报错。** 在隔离 profile 里写 `- id: memory-reasonix` + `name:` 得到 `dsh: patch: entry "memory-reasonix" not found`。新增必须走 `- insert: [ ... ]`。

**X7 · 假设「只有自己在改这个文件」。** 实测 21:13→21:28 期间有另一个进程往 `profiles/*/cordis.patch.yml` 写了 `thinking-anchor` plugin 注册 + directive 文本（+20 行）。改动前后必须留备份 + 结构 diff，不要假设独占。

**X8 · 把插件写进 home 层，只验证一个 profile。** hindsight 写进 `~/.dsh/cordis.patch.yml` 后 web 启动正常，而 **headless 任何任务都报 `dsh: format v4 message requires a producer-owned source kind`** —— 「能启动」看不出问题，是跑任务时才炸在会话消息组装阶段。回滚：只删那一段（173 字符），保留同文件的 deja 三条。

**X9 · `cmd | head` 之后读 `$?`。** `dsh --profile desktop --dump-config 2>&1 | head -3; echo RC=$?` 拿到的是 `head` 的退出码 **0**，真值 **1**（重定向到文件后再 echo 才是 1）。所有「拿管道读退出码」的判据都踩这个。

**X10 · 路径里塞 shell 变量。** 本库 fact 里出现过 `profiles$VA/` 这种残骸（变量未展开被写进文档）。patch 里的路径写绝对路径；需要求值时用 `!!js`（JS 表达式），不要依赖 shell 展开或 heredoc 传递。

**X11 · 以为「`patchReload: live` ⇒ 改 `.mjs` 也热更」。** 不是。`live` 的范围是 **patch 文件**（`dsh-hmr` 的 exact-path watch）与 **bundle 自带 patch 的加载**（headroom 就是这么当场活的：一轮 session 的 420 个 `tool/result` frame 里 28 个带 headroom marker）。`.agent-presets/**/*.mjs` 是普通 ESM import，改内容对已有进程无效。

## R 复现

**R1 · 零副作用配置体检（只读，不碰生产进程）：**

```
cd /c/Users/27063/.dsh
timeout 40 dsh --profile web --dump-config >/tmp/w.yml 2>/tmp/w.err;          echo "web RC=$?"
timeout 40 dsh --profile headless --dump-config >/tmp/h.yml 2>/tmp/h.err;     echo "hl  RC=$?"
timeout 20 wc -c /tmp/w.yml /tmp/w.err /tmp/h.yml /tmp/h.err
timeout 20 grep -c 'patched by' /tmp/w.yml
```

**R2 · 改 patch 的标准动作（含回滚点）：**

```
TS=$(date +%Y%m%d-%H%M%S)
cp profiles/web/cordis.patch.yml profiles/web/cordis.patch.yml.bak-$TS-pre-<主题>
# 用 python 按行号替换；assert 放在 write 之前（失败就等于什么都没改）
timeout 40 dsh --profile web --dump-config >/tmp/w.yml 2>/tmp/w.err; echo RC=$?
# 坏 ⇒ cp profiles/web/cordis.patch.yml.bak-$TS-pre-<主题> profiles/web/cordis.patch.yml
```

备份命名固定为 `<文件名>.bak-<YYYYMMDD-HHMMSS>-pre-<主题>`（无时间戳的老备份如 `.bak-20260927-pre-unlock-validate` 属早期遗留）。回滚工具：`node ~/.dsh/storages/tools/dsh-profile-rollback.mjs --point 20260927-2313`（默认 dry-run，`--apply` 才执行；`--restore` 还原到**备份所在目录**，不是 cwd）。

**R3 · isolated instance 验证配方（不碰 3080）：**

```
DSH_HOME=C:/Users/27063/.dsh-lab \
DSH_REASONIX_MEMORY=C:/Users/27063/.dsh-lab/probe-corpus \
MNEMON_DATA_DIR=C:/Users/27063/.dsh-lab/probe-mnemon \
timeout 60 dsh --profile mem-verify '<让 agent 调某工具的 prompt>'
```

三件套缺一不可：`DSH_HOME` 隔离 profiles/sessions/storages/.env，后两个把语料与库分到 lab。**先 `cp ~/.dsh/.env ~/.dsh-lab/.env`**（不要打印内容），否则 `MISSING_CREDENTIAL`。实测 8.3 秒完成一轮。判据是三类落盘物（新 fact 文件 / mnemon 命中 / `done rc=0` 日志），不是「进程起来了」。

**R4 · 判断「我这次改动属于哪一类」的三问：**

1. 改的是 patch 文件里的 row 吗？→ 新 session 即可验（`live`），`startup` profile 例外。
2. 改的是某个 `.mjs` / `client.js` 的内容吗？→ 新进程。
3. 动的是 `package.json` 的 `dsh.profile.bundles` / `dependencies` 吗？→ **先告知用户「要重启 App」再动手**，否则正在跑的 turn 会被 `requires a process restart` 保护打断，那一轮的思考与文本不落盘，现象像「熔断 + 上下文消失」。

**R5 · 就地升级桌面端（无官方安装器）：**

```
# 1) 在安装器里扫 7z 签名 37 7A BC AF 27 1C（本次偏移 863248，别写死）
# 2) 从该偏移切到文件尾 → 完整 7z
# 3) py7zr 解包到临时目录 → App 完全退出 → 整目录 rename 替换
# 4) 用原快捷方式拉起（桌面端必须带 --no-sandbox）
```

任何一步失败用 `.old-<日期>` 目录改名回去。`npm i -g` 线单独走，且**必须由 Task Scheduler 拉起升级脚本** —— 从 dsh 内部 `Start-Process` 会在杀掉旧进程时被级联终止（2026-09-30 02:10 实测空转 51 分钟）。PowerShell 侧注意 `$pid` 是只读自动变量。

**R6 · 升级后必查三件：** `dsh --version`；`dsh --profile web --dump-config`（RC=0 且 dump 里不再出现已移除插件名）；`node_modules` 里的 patch 是否被 `npm i -g` 还原（目前只有 `patch-reasoning-autofold` 写进了升级脚本的自动重放步骤，`patch-replay-thinking` 仍需手动确认）。

## S 溯源

`C:/Users/27063/AppData/Roaming/reasonix/memory/global/` 下被本篇直接引用者：

- `dsh-patchreload-live-new-session-and-mnemon-dsh-side-verified-20260928.md`（纠正「改配置需重启 3080」，PID 52540 反证；`patchReload: startup` 对比）
- `dsh-profile-manifest-change-requires-restart-20261003.md`（`ResolutionRouter.replace()` 四条逐字报错；`interruptedTurnClosers` 复用时间戳；全机 turn/end 分布）
- `dsh-preset-effective-path-and-pruner-tuned-20261016.md`（`.agent-presets` 已废除、同名 entry 看最大行号、`patchReload: live` 但改内容要新 session）
- `dev-tool-search-false-unlock-fix-and-preset-reload-boundary-20260927.md`（新 row 对新 session 即时；改 `.mjs` 不进已有 session；overlay 相对路径坑）
- `plan-anchor-plugin-20261001.md`（`prepend: true` = unshift = 最后改写；注册顺序；改 PLAN.md 不需重启）
- `dsh-profile-models-block-parsing-traps-and-probe-choice-20261004.md`（models 块两坑、`!!js` 误报、`(absent)` 不能 append）
- `dsh-maxtokens-上限实测与校正-20260930.md`（393216 硬顶、逐 model 上限表、`prompt+max ≤ context`、并发写入者）
- `dsh-isolated-instance-verify-recipe.md`（三件套环境变量、`- insert:` vs `- id:`、8.3 秒、三条判据）
- `headless-profile-degraded-3-tools-no-persona-20260927.md`（`persona`→`personaPrefix` 静默 no-op；工具面 3→6→8）
- `dsh-config-editor-writeback-and-mnemon-settings.md`（config-editor 写回、两个硬过滤、深比较回滚、home 层/overlay outranks profile）
- `dsh-desktop-就地升级-绕开NSIS-20261023.md`（NSIS 全参数 rc=2 穷举、7z 偏移 863248、整目录 rename）
- `dsh-0.2.1-rc.2-升级全景与进度-20261023.md`（两条独立升级线、被移除的 6 个包、插件升级两批）
- `dsh-upgrade-to-0.2.0-rc.2-20260930.md`（豁免语法、升级脚本、Task Scheduler 拉起、`$pid` 只读）
- `tool-dsh-015-upgrade-20260920.md`（0.1.5 四处必改、`session.events` 移除、`text`→`prefix`）
- `dsh-版本线快照-20260925.md`（无 GA、三条 dist-tag、桌面端默认端口 19387 / web 3080）
- `dsh-requires-node20-not-platform-gated-20260930.md`（`node:util.parseEnv` = 20.12+、EBADENGINE 只 WARN）
- `dsh-profile-backup-inventory-and-rollback-tool-20260928.md`（85 个备份 / 11 个孤儿、settings.yaml 0.1.7 起不存在）
- `hindsight-broke-headless-incident-20260928.md`（home 层 patch 必须在所有 profile 端到端验证）
- `dsh-sandbox-windows-写限制与danger-full-access.md`（与 09 篇衔接）

## 存疑

1. **`patchReload` 的枚举定义与读取位置没找到。** 在 `~/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/`（304 个包）里做文本搜索 `patchReload` 零命中，`--dump-config` 输出里也没有它 —— 说明它由 launcher 层直读 `package.json`、不进入 compose tree。取值 `live` / `startup` 与行为一致，但**没有源码级确认是否存在第三个值**。
2. **home 层与 `--patch` overlay 的相对优先级未定。** 两者都 outranks profile 层（config-editor 的报错文案 `overridden by a home patch or command-line overlay` 把二者并列），但二者互相之间谁高，fact 里没有实证。需要一次构造冲突的隔离实验。
3. **settings.yaml 的终态。** 本机 `~/.dsh/settings.yaml` 已不存在（只剩 `settings.yaml.bak-*` 与 `settings.yaml.imported`），回滚工具把它列的 11 个 `.bak` 标为孤儿。fact 说「dsh 0.1.7 起 `settings.yaml` 已不存在，配置迁到 profile 的 cordis 层」，但**没记录迁移的确切版本与迁移脚本**。
4. **`--dump-config` 的基线字节数随时间漂移。** 历史 fact 记为 rows 416 / 77528 B、198 / 79409 B、2247 行；2026-10-26 实测 2394 行 / 84612 B。数值都在合理区间，但**不能把某个绝对值当成「配置正常」的固定判据**，只能与「改动前同机同 profile 的基线」比较。
5. **desktop 侧没有 `--dump-config`，只有字符串校验 + 重启后观察。** `dump-desktop-config.ps1` 是自建旁路，其输出与 Electron 真实解析是否逐字一致，未验证过。
