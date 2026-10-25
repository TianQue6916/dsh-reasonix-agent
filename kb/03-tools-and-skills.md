# 03 · 工具集与技能 / plugin 面

> dsh 的工具面是**三层 keep-set**（bootstrap 对 → promoted resident 集 → session unlocked），技能面是**进程级 catalog + invocation 过滤**，`web_search` 是**自建 provider 的并发聚合**，plugin 面受 **bundle / patch 两层不同的热重载边界**支配；四者的共同判据都是「下游可观测物」，不是「配置文件里有没有那行字」。

## D 定论

- **D1 工具面分三层，靠 keep-set 收窄，不靠注册顺序。** 第 1 层 controlled：`DEFAULT_BOOTSTRAP_TOOLS = ['bash','str_replace_editor']`，首请求只给这一对（issue #11 锚定证据：Minimal 对 5/5 anchored，标准族 11/11 失败）。第 2 层 promoted：`keep = bootstrapTools + RESIDENT_DISCOVERY_TOOLS + RESIDENT_MEMORY_TOOLS + unlockedFor(session)`。第 3 层 unlocked：`dev_tool_search` 现解锁。代码在 `~/.dsh/.agent-presets/anchored-standard/tool-bootstrap.mjs:131/133/151`、`:295`、`:303`。
- **D2 resident 集是「白名单 + 注释级理由」设计。** `RESIDENT_DISCOVERY_TOOLS = ['dev_tool_search','skill_search','skill_load']`（`tool-bootstrap.mjs:133`）；`RESIDENT_MEMORY_TOOLS = ['memory_profile']`（`:151`，2026-09-30 加，理由写在注释：persona 要求「实质任务前先调 memory_profile」，但该工具不在 keep 集里 ⇒ **指向不可调用工具的规则永远不会触发**）。加 resident 的代价是一个 schema，收益是省一次 discovery round-trip。
- **D3 unlocked 是 resume-safe 的 durable 机制，不是内存态。** `dev_tool_search` 只把名字写进 `tool/call` 事件参数，`tool-bootstrap.mjs` 从 durable 事件里读回 `toolNames` 再与 `assembled.tools` 求交集 ⇒ 会话恢复后仍有效。
- **D4 空搜索结果 ≠ 工具不存在。** 搜索无命中时正确动作是再调一次 `dev_tool_search({"toolNames":[...]})` 按精确名解锁。这条必须写进工具 description 本体（`dev-tool-search.mjs` 头注释原话："search empty ≠ tool absent — unlock by exact toolNames"，因为「野外观察到的模型只会 search，从不传 toolNames」）。
- **D5 「解锁成功」必须校验，否则工具会说它做了一件没做的事。** 旧实现在 `dev-tool-search.mjs` 里无条件回显入参 `Unlocked for the next request: ...`，真实过滤发生在 `tool-bootstrap.mjs` 的 keep-set 交集，**交集为空时两处都不报错**。修法：先 `ctx.tools.schemas(exec?.agent)` 解析 catalog 一次，把名字分 `known` / `absent`，absent 报 `NOT unlocked — absent from this session's catalog`，并解释「session 创建后才加的 preset row 不回溯」；`schemas()` 抛错提前返回 `catalog unavailable`。附带把 `memory_*` 写进 `UNLOCKABLE_INDEX`，description 1416 → 1538 chars（+122，约 35 token 常驻）。
- **D6 subagent 必须 bypass bootstrap，否则拿到空 catalog。** child 的 catalog 已被 `toolFilter.allow` 精确收窄（纯 mnemon 工具），与 `{bash,str_replace_editor,dev_tool_search,skill_search,skill_load}` 求交 = ∅ ⇒ 模型只能把 tool-call 语法当纯文本吐出来（`stopReason=completed`、零 receipt）。落地修法在 `system-prompt/assemble` 开头、`promotion.status()` 之前：`if (depth > 0 || header?.origin === 'subagent') return assembled`。
- **D7 `includeSubagents: false` 是反向的。** `compaction-epoch.mjs` 对 `!includeSubagents && delegationDepth>0` 直接返回 `{promoted:true}` ⇒ 强制 child 走 promoted 分支 ⇒ 必然空集（曾据此误判并「修复」过一次）。
- **D8 skill catalog 是「进程级」缓存。** 给 50 个 SKILL.md 加 `disable-model-invocation: true` 后，同一 dsh 进程内 `skill_search` 仍会返回它们（2026-10-01 对 4 个孤儿 skill 实测 4/4 命中），必须重启 dsh。`dsh --profile web --dump-config` 是**新进程读文件**，能验证 bundle / `cordis.patch.yml` 层，但看不到 skill 扫描结果。判断「skill 是否真在 catalog」的最短路径：直接调 `skill_search`。
- **D9 `ctx.skills.list()` 不过滤 invocation policy。** `disable-model-invocation: true` 只在 `dsh-tool-skill` **渲染 catalog 时**被读取；`ctx.skills.list()` / `skills.get()` 原样返回所有被发现的 skill（`@deepseek-ai/dsh-skill/lib/index.js:37-39` 的 `isModelInvocable`，`dsh-skill-filesystem/lib/index.js:849-858` 的 `parseInvocationPolicy`）。字段形态是**嵌套的 `skill.invocation.modelInvocable: boolean`**，扁平 `skill.modelInvocable` 只出现在对外 `SkillEntry` 声明里。任何自建 catalog 工具必须自己过滤（`skill-search.mjs` 用 `(skill.invocation?.modelInvocable) !== false`，无字段视为可调用）。
- **D10 技能路由是两段式：`skill_search` 找名字 → `skill_load` 装正文。** `skill_load` 通过 `agent.inject({source:{kind:'skill-invocation', name, form:'instructions'}})` 交给下一步；**返回值里没有 `<skill_content>`**（那是 dsh 渲染时才包的）⇒ 断言必须看 `injected[i].source.kind`。禁用技能在 load 侧再拦一次，返回 `Skill "X" is not model-invocable ...`。
- **D11 排序权重必须归一化，否则「用过一次」压过任何文本匹配。** 旧式 `usage = log1p(loads) + exp(-age/14)` 无上界而 `match ∈ [0,1]`，实测临界 `loads ≈ 0.95`，与文件注释宣称的语义相反（零匹配用过 1 次 → 1.016 反超完美匹配 1.000）。修法：`frequency = min(1, log1p(loads)/log1p(20))`、`recency = exp(-age/14)`、`usage = min(1, 0.6*frequency + 0.4*recency)` ⇒ `USAGE_WEIGHT*usage ≤ 0.6 < 1.0`。参数 `USAGE_WEIGHT=0.6`、`RECENCY_HALF_LIFE_DAYS=14`、`FREQUENCY_SATURATION_LOADS=20`，账本 `~/.dsh/storages/skill-usage.json`，可用 `DSH_SKILL_USAGE` 覆盖路径。
- **D12 技能真源是独立目录 `C:\Users\27063\ai-skills`（Linux `/home/tianque/ai-skills`），其余全是入口。** 用户拍板理由：「新建一个源，而不是复用，复用可能会被影响」。`AppData\Roaming\reasonix\skills` 被活跃进程持续写入（8 分钟内顶层 98→100）、且 `Access denied` 不能改名 ⇒ 只能当**单向 mirror** 目标。现场实测（2026-10-26）：`~/.dsh/skills` = `Junction -> C:\Users\27063\ai-skills`，81 个顶层目录 / 78 个 SKILL.md；`C:\Users\27063\.agents\skills`（第二根）4 个（`deja-history` / `deja-search` / `hindsight-coding-agent` / `microsoft-foundry`，全部 `disable-model-invocation: true`）。
- **D13 junction 会把「测量」变成假警报。** `find` / `du` / `os.walk` **都不跟随 reparse point** ⇒ `find ~/.dsh/skills -name SKILL.md` 返回 0 是测量假象，不是数据丢失。数真实文件用 PowerShell `Get-ChildItem -Recurse` 或 `find -L`。这个坑已经制造过一次「技能目录被清空」的假报警。
- **D14 `web_search` 是并发聚合，不是 fallback 链。** 自建插件 `dsh-plugin-local-search`（provider id `local-wiki-github`）在 `search()` 里 `Promise.allSettled` 打全部源，再按 `SOURCE_RANK` 合并；fallback（`fallbackProviderId`，默认 `multi-search`，本机未安装）只在**全源空**时触发，实际只打一条日志。
- **D15 每源先吃配额再按 rank 回填。** `Math.max(1, Math.ceil(maxResults / ordered.length))`（maxResults=8、3 源 → 3/3/2，「保证每源都露面」）→ 剩余名额按 rank 回填 → 末段稳定排序（github 块 → deepseek 块 → wiki 块），跨源同 URL 只留 rank 最高那份，`interleaveSources: true` 切 round-robin。
- **D16 `available()` 不能当「有没有 key」的判据。** provider 的 `resolveOptions()` 里 `resolveApiKey`/`resolveAccountToken` 恒存在 ⇒ `available()` 恒 true，真凭证检查在调用时抛 `WEB_PROVIDER_CREDENTIAL_MISSING`。凭证**每次搜索时** resolve（`credentials.resolve('DEEPSEEK_API_KEY')` → launch env）⇒ 补 key 不需要重启；凭证类错误触发插件内熔断 `deepseekFailureCooldownMs = 600000`，期间只 warn 一次，其它源照常。
- **D17 provider 的注册 id 与 row id 是两个东西。** deepseek 官方 provider 注册 id 是 `deepseek-official`，row id 是 `web-search-deepseek`；旧配置 `fallbackProviderId: web-search-deepseek` 是解析不到的无效 id。另：`WebSearchSource` 类型里没有 `provider` 字段，插件塞进去只是元数据，`dsh-tool-web` 不渲染（只显示 `title ?? hostname`）。
- **D18 `wiki fetch failed` 的根因在运行时，不在插件逻辑。** dsh 跑在 Electron 里，全局 `fetch` 走 Chromium 网络栈（含系统代理 / PAC），内网地址 `100.79.96.82:8810` 经代理必挂；CLI 里的 node fetch 是 undici 直连所以能通。这解释了为什么日志只有笼统 `fetch failed`——undici 的 `cause` 没被打印。修法：aggregator 从 `fetch` 改 `node:http` 的 `http.request`，并把 `error.cause.code` 拼进错误消息。
- **D19 插件布局：一处实体 + 三端 junction。** 现场实测三 profile 的 `node_modules/dsh-plugin-local-search` 全是 `Junction -> C:\Users\27063\.dsh\plugins\dsh-plugin-local-search` ⇒ 改一处三端同改（web / desktop / headless 共用同一 bundle）。插件实体曾住 `D:/Toolbox/goat-gateway/`（D 盘 High IL 目录普通进程写不进），迁到 C 盘靠**重定向 junction 不需要管理员权限**这一条，不必解 UAC。
- **D20 bundle 与 patch 的热重载边界不同。** 插件是 bundle（node_modules）⇒ **不参与 HMR**，改 `index.js` 或插件自带 `cordis.patch.yml` 必须重启 dsh。想免重启：在 `~/.dsh/profiles/<p>/cordis.patch.yml` 里写一条**完整同名 row**（replace 语义），那条走 `patchReload: live`。preset-local `.mjs` 的文件内容同样不热重载：「新 row 对新 session 即时生效，改文件内容不进已有 session」，判据是**新建一个 session 试**，不是「重启了没有」。
- **D21 装插件用官方 CLI，不要 `pnpm add`。** `dsh plugin --profile web add <pkg>` 会自动把包加进 `dsh.profile.bundles`（实测 `dshmarket@1.66.2` 装完 bundles 里自动出现）；`pnpm add` 不会 ⇒ 手工改 `package.json` 才生效（装 `dsh-mnemon` 时踩过，并因此误判过一次）。
- **D22 hooks 的能力边界：只有 command handler。** `@deepseek-ai/dsh-hooks-claude-code` 支持 `SessionStart / UserPromptSubmit / PreToolUse / PostToolUse / Stop / SubagentStart / SubagentStop`，其中 `Stop` 能 **force another step with a reason**；但 `http`/`mcp_tool`/`prompt`/`agent` handler 被**跳过并 warning**，`configPath` 进程启动时读一次，hook 在 session workspace 里跑，exit 2 = 阻塞、其它 = 非阻塞。**headless profile 三次实测全不派发 hook 事件**（含带 workspace 的一次），`--json` 事件流只有 `status/session/text/thinking/tool_call/tool_result/final`。
- **D23 headless「只有 3 个工具」是 keep-set 名字不存在导致的恒等式。** 根因：`keep = bootstrapTools + RESIDENT_DISCOVERY_TOOLS + unlocked`，而后三个名字在那条 profile 的 catalog 里不存在 → 被 `keepTools` 的 missing 分支丢弃 → keep 恒等于 bootstrap 的 3 个（`['mcp__goatquota__goat_quota','pwsh','str_replace_editor']`）。修法是给 headless 补 `dev-tool-search.mjs` / `skill-search.mjs` / `memory.mjs` 三条 row（工具面 3 → 6 → 8，`read`/`write` 可解锁）。
- **D24 长任务必须后台化，前台 bash 起长命进程会「挂但不报错」。** 2026-09-28 一次 `powershell -Command "Start-Process ... dsh ..."`：子进程继承 bash→powershell 的 stdout/stderr 管道，只要它还活着 bash 就认为命令没结束 → `tool/call` 15:58:20 发出、`tool/result` 16:49:33（用户按停止）才回来，**挂 51 分钟**。规则：长命进程用 `job_list`/`job_output`/`job_kill`；确实要在 bash 里起后台必须 `> file 2>&1 < /dev/null &` + `disown`，`Start-Process` 还要 `-RedirectStandardOutput/-RedirectStandardError` 且父进程不等待。**会挂住的命令的危险在于它不报错。**
- **D25 `compress` 不该是现解锁工具，而应常驻。** bili（billion-context）的 `compress`/`decompress`/`acp_status` 是这条 lane 上唯一可靠的压缩入口（摘要由模型写，不依赖 bili 那个从没成功过的摘要后端）；但已经处于 compaction 态的会话 catalog 被裁成 `compactionTools`，连 `dev_tool_search` 都没有 ⇒ 永远解锁不了。所以两处改：promoted keep-set 并入 context 工具、`compactionTools` 追加 `compress`。
- **D26 pwsh 常驻化后语义不对称：`pwsh` 有状态、`bash` 无状态。** 677 → 189 ms（−72%，3.59×），其中 **~468 ms 是 `dsh-tool-pwsh` 自身的 seam 开销**（描述原话 "over the bash executor seam"，套一层 bash 再起 pwsh），常驻化把「启动 + seam」两层一起砍掉。约束：在 pwsh 里 `cd` / 设 `$env:` 不会传导到 bash，且 `$env:` 会累积污染；**`timeoutMs` 绝不调小** —— README 明说 `Reset, never repair`，工具级超时会关掉 shell 并丢掉全部状态（命令内部的 coreutils `timeout 30` 不受影响，那是子进程级）。

## M 机制

- **keep-set 过滤的真实代码**（`tool-bootstrap.mjs` `system-prompt/assemble`）：
  ```js
  const missing = [...keep].filter((n) => !available.has(n))
  if (missing.length > 0) { warnOnce(...); if (missingAllowsFullCatalog) return assembled }
  return { ...assembled, tools: assembled.tools.filter((t) => keep.has(t.name)) }
  ```
  ⇒ 名字不存在时的行为由 `missingAllowsFullCatalog` 决定：controlled 相（`true`）退化成「完整 catalog」，promoted 相（`false`）退化成「交集」。
- **promote 触发事件**：`promoteOn` ∈ `{tool-call, assistant-message, either}`（默认 `either`），由 `createEpochPromotion(promoteEvents, {includeSubagents})` 维护 epoch 状态；`ALLOWED_KEYS = ['bootstrapTools','promoteOn','bootstrapMaxTokens','compactionTools','includeSubagents']`。
- **技能发现是两个根、两种 rank**：`<dshHome>/skills`（rank 400）、`<agentsHome>/skills`（rank 500，`C:\Users\27063\.agents\skills`，由 `npx skills` 安装、锁文件 `.agents\.skill-lock.json` version 3，字段 source/sourceType/sourceUrl/skillPath/skillFolderHash/installedAt/updatedAt）。`~/.agents/skills` **不在双机同步清单里**（`sync_dsh.py` 的 EXTRA_PAIRS 只有 `~/.dsh/skills` 与 `~/.reasonix/memory`）。
- **skill catalog 的过滤链**：发现所有 SKILL.md → `parseInvocationPolicy(frontmatter)` 得 `{modelInvocable, userInvocable}` → 官方 `dsh-tool-skill` 渲染时过滤 → 自建 `skill_search` **再过滤一次** → `skill_load` 第三道闸。
- **`skill_search` 打分**：`haystack = tokens(name + description + whenToUse).join(' ')`，filter 是 **AND + 子串**（`haystack.includes(token)`）；`score = match + USAGE_WEIGHT*usage`，`match` 只看 name，次键 `localeCompare`。空 query 列出全部。
- **web_search provider 接口**：dsh 只传 `{query, maxResults}`（`request.maxResults` 恒为 8），插件用配置值覆盖成 30；`dsh-tool-web` 拿到 30 条后 `slice(0, 8)` —— 这个 8 在 `resources/app.asar`（182 MB）里，config 只有 `fetch: true` 与 `searchTimeoutMs: 60000`，**改不了**（社区 `max_results` 也是 5–10，省 context）。
- **聚合器并发模型**：`Promise.allSettled` 打全部启用源（`enableGithub` / `enableDeepseekSearch` / `enableWiki` / `enableGoat` / `enableDeepseek` 开关），单源失败只 log，不进异常路径；温度计式探针 `console.warn('[local-search] probe wiki=9 github=4 deepseekSearch=30 bing=10 max=30 req=8')` 打 `~/.dsh/logs/host-stdio.log`。`http.request` 的 `'error'` handler **必须在任何 `destroy()` 之前绑定**（先建 req → 立刻 `req.on('error')` → 再处理 parentSignal 已 aborted → 最后设 timeout），否则 `Signal already aborted` 场景下 `'error'` 无人接管会把 node 进程打挂。
- **plugin 三层验证**：配置合成（`--dump-config`）→ 运行时日志（`~/.dsh/logs/dsh-web-<port>.out.log`，或起隔离实例换端口 3099）→ **client module 清单**（首页 HTML 的 preload 清单里逐项核对哪个插件真的交付给浏览器）。
- **boot 期唯一可信的插件体检信号**：启动日志的 `dsh: warning: <N> entry did not activate`；**没被点名的插件就是激活成功的**。
- **agent jobs v2**：`~/.dsh/storages/tools/agent-jobs.mjs` —— CSV in → 并行 `dsh headless` → CSV out（Codex `agent_jobs` 的本地等价物）。任务经 **stdin** 传给 `dsh --profile <p> -`（不经命令行，无注入/转义问题）；参数 `--col/--template/--schema/--concurrency/--timeout-ms/--retries/--keep-cols/--dry-run/--self-test`。schema 模式输出 `原列 + 每个 property + _valid + _errors + _raw + ms`。依赖 `~/.dsh/.env` 的 `COMMANDCODE_API_KEY`（调用方环境不需要有）+ GOAT 网关 `127.0.0.1:8788` 在听。
- **subagent/workflow 的派发真身在 `script` 字段**：`data.arguments` 是 JSON 字符串要二次 parse，任务描述在 `meta.description`；每个 `agent(...)` 调用 = 一条子线程边（→ `thread-edges.mjs` 导出 session→workflow→agent 三层父子树）。

## J 判据

- **「工具到底在不在」**：看**第一轮** `request/header` 的 `tools` 长度。取最后一个 header 会误判——成功样本 `720698d1` header#1 `tools=4`，header#2 无 `tools` 键。修复后新建 child 实测 `50706` 字符 / `58` 个工具。
- **「解锁到底成功没有」**：不要信 `dev_tool_search` 的回复文案，看下一轮 request header 的 tool 列表。反例：`memory_profile/memory_search/memory_remember/memory_read` 四个名字曾回显「Unlocked」，实际一个都没进 header。
- **「preset 改动生效没有」**：新建 session 试，不看是否重启。判据链：`dsh web` 启动 09-26 20:44 → row 22:47 加入 → 23:58 新 session 有工具、22:38 老 session 没有。
- **「skill 是否可被模型发现」**：直接 `skill_search`（返的就是该进程 catalog），比读文件可靠；改 disable 后必须重启再看。
- **「subagent 是否真的有用」判据是内容不是 exit code**：`thread-edges.mjs` 三处静默丢数据（`meta.description` 提取、正则捕获组 `mm[2]→mm[1]`、DOT parent 精确匹配）都会「脚本跑通、输出为空」。
- **「插件在该 dsh 版本上能否用」**：`--dump-config` 通过 ≠ 能用；先查 stderr 的 `skipping profile bundle "<名字>"` 计数必须为 0（换大版本时 peerDeps 不满足者在 `exit=0` 下被静默跳过），再起隔离实例看 boot 日志，再看 client module 清单。
- **「headless 是否被新插件破坏」**：必须**真跑一个任务**（`dsh --profile headless "只回复 OK"`），不是看进程起没起来。
- **「命令是否挂住」**：在 session 事件流里找 `tool/call` 与 `tool/result` 的时间差 + `turn/end` 的 `reason.kind`。
- **「web_search 各源是否真在工作」**：解压 session 事件流 grep `web/deepseek-search-llm-request`（deepseek 源每搜一次会 append 该事件）；日志计数法 `grep -c 'wiki source failed'` 必须为 0（修复前累计 199 次）。
- **「插件侧截断 vs tool 侧截断」**：插件内插 probe 打印各源条数。实测 `wiki=9 github=4 deepseekSearch=30 bing=10`=53 条原始、`max=30`、`req=8` ⇒ 结论「插件对、卡在 `dsh-tool-web` 的 `slice(0,8)`」。直调 `new LocalSearchProvider(()=>cfg,{}).search({query, maxResults:8})` 耗时 **11.4 s**（wiki 最慢，libzim 全文搜索）。
- **skill 用量权重的验收方法**：从**真实文件**抽函数来测（`fs.readFileSync(P,'utf8').match(/function usageScore\(entry, now\) \{[\s\S]*?\n\}/)[0]` + `new Function`），对 `.bak-*` 跑同一组用例做前后对比；另写一份复现测的是复现而不是线上代码。

## X 反例

- **静默失败族一：报成功但没做。** `dev-tool-search.mjs` 无条件回显入参（D5）；`create_goal/job_list/read_image/subagent/workflow` 五个 harness 原生工具同批全部成功进入 tool surface ⇒ 机制本身是好的，坏的是**对不存在的名字谎报成功**。
- **静默失败族二：配了但没配。** `~/.dsh/profiles/headless/cordis.patch.yml:12` 写 `persona:`，而 `@deepseek-ai/dsh-system-prompt` 的真实 schema 字段是 `personaPrefix` / `personaSuffix`，`z.object` **非 strict** ⇒ 未知 key 被 Zod 静默丢弃、不报错不警告 ⇒ 那行从写下那天起就是 no-op，批处理线一直用出厂 system prompt（`You are an AI agent powered by DeepSeek Harness.`）。判据必须是**下游可观测物**（session 里的 `system/message` frame），不是配置文件里有没有那行字。
- **静默失败族三：警告被降级成 notice。** `dsh-mimir 0.21.0` 与 dsh 0.1.7-rc.2 不兼容（typert-loader 的 `requireStrictCodec` 要求 invocation codec 带 `create()` 工厂，Mimir 的 `research/addEvidenceEdge` 没有）→ boot 时 `dsh: warning: 1 entry did not activate` + `AggregateError`；当时处置成「警告、不影响」⇒ 用户侧表现为「插件都没有、全是故障」。且因 3080 启动早于 Mimir 安装，**只在新建实例才暴露**。
- **`includeSubagents: false` 是加重不是修复**（D7）。
- **`pnpm add` 装插件少了 bundles 那一步**（D21）。
- **写全局 patch 只验 web**：hindsight 的插件行写进 `~/.dsh/cordis.patch.yml`（所有 profile 都 compose 它）⇒ headless 任何任务都报 `dsh: format v4 message requires a producer-owned source kind`，而 web 一切正常。修=只删那一段（保留 deja 的 3 条），验 `headless: OK` / `web: HTTP 401` / `3080: PID 52540` 未受影响。**改全局 patch 的验证矩阵是 web 与 headless 各三行**（启动 / 会话能跑 / dump-config），缺一行等于没验；且「能启动」≠「能用」。
- **`uv` 用 pip 装不上**：`python -m pip install uv` 退出码 0 但 `pip show uv` 查无此包；官方脚本 `irm https://astral.sh/uv/install.ps1 | iex` 一次成功（装到 `C:\Users\27063\.local\bin`）。装完 daemon 仍报 "needs uv on PATH"，因为 dsh 进程启动时快照了 PATH ⇒ 要重启宿主。
- **把 tie 当 bug**：冷启动空 ledger 下 `pdf-tools` 排在 `pdf-translator` 前被判为 match bug，改成「name 按词拆 + 前缀匹配」；用 79 个真实 skill × 25 个 query A/B，**0 个排序差异**（恒等变换），还引入「跨 `-` 的 token 如 `f-trans` 不再命中」的回归 ⇒ 已 `cp` 回退。教训：**先量测，再重写；tie 不自动等于 bug。**
- **`skill_search("translate")` 返回 0 不是故障**：filter 是 AND + 子串，79 个真实 skill 的 name+description 里没有任何子串 `translate`（只有 `translator`×3 / `translation`×1），也没有 `game`。要闭合需 stemming（去尾 `-er/-or/-ion/-ing`），会放宽每个 query 的召回面并有误合并风险（order/ord、paper/pap）⇒ **刻意不做**，等用户拍板。用库里的真实词可正常召回：`translator` → 3 命中。
- **`--dump-config` 当「插件适配」判据**：它只做配置合成、不执行插件代码，schema `$comment` 自己写明「plugin services / startup checks … still require runtime validation」。
- **`find /`**：Git Bash 的 `/` 是 `C:\Git`，`/c`、`/d` 挂在其内 ⇒ `find / -maxdepth 6` 实际是 C: + D: 全盘扫（只算 `C:\Users\27063` 子树 depth ≤ 6 = 23563 个目录 / 9.7 s，其中 `sys 6.98 s`，时间全在内核 stat）；NTFS junction / reparse point 还会造成无限 walk。`2>/dev/null` 吞掉权限错误 ⇒ 外表「没输出但一直在跑」。同一 block 里的多个 tool call 并发下发、一起等 ⇒ 第一个卡住，第二个连 dispatch 都到不了（"aborted before dispatch"）。`-xdev` 对照：2.4 s / 3111 个目录。
- **`~/.dsh/logs/dsh-web-3080.out.log` 未必是当前进程的 stdout**（取决于启动方式）⇒ 不能用它的 mtime/体积推断「有没有 warn」。
- **`~/.dsh/storages/session_projcache/**` 只是投影缓存**，不含完整事件流，不要当证据源（完整事件流是 `~/.dsh/sessions/<cwd-slug>/session-<id>/session.v4.jsonl.zstd`，**zstd 压缩，直接 grep 必然 0 命中** —— 曾据此误判「事件不存在」）。
- **归档目录命名**：`_archive-20260928` **不能**写成 `_archived-*` —— 后者前缀命中 `backup-to-github.ps1` 的 XD 排除规则，脚本会**不再被备份**（跨机同步依赖它们留在备份里）。
- **插件目录规模是口径问题，不是数字矛盾**：`awesome-dsh-plugin.com/plugins.json` 抓到 4377 条（825 KB，`updated: 2026-09-27`；`curl --max-time 40` 会截断成末字符在半截字符串里的坏文件，必须给足超时）；GitHub topic 快照去噪后 476 个仓库；`imsai-sh/awesome-deepseek-harness-plugins` 自称 11000+。
- **官方标注 468 个插件带 `capabilityRedLines`（安全红线字段）** ⇒ 装之前先看这个字段，不是先看 stars。
- **社区调研遗漏是流程缺陷**：做 memory / session-index / token-budget 三项时都没先看社区，用户指出「按理来说这些都有社区的成熟方案和思考」——这条被记为流程教训（社区把 "headroom" 理解成**上下文余量管理**而不只是成本累计，是自己没想到的切入口）。

## R 复现

- **当前配置合成 + bundle 跳过闸门**（零副作用）：
  ```bash
  cd ~/.dsh && timeout 60 node <dsh>/lib/bin.js --profile web --dump-config >/dev/null 2>err.txt
  timeout 30 grep -c 'skipping profile bundle' err.txt   # 必须为 0
  ```
- **看真实工具面**（判据取第一轮 header）：
  ```bash
  timeout 120 dsh --profile headless "只回复 OK"
  # 解压该 session 的 session.v4.jsonl.zstd，取第一个 request/header 的 tools 长度
  ```
- **解压事件流**（grep 前必做）：
  ```python
  import zstandard
  zstandard.ZstdDecompressor().stream_reader(open(path,'rb')).read().decode('utf-8','replace')
  ```
- **隔离实例验插件**（不干扰主线 3080）：
  ```bash
  timeout 60 dsh --profile web --port 3099 --no-open > /tmp/dsh.log 2>&1
  grep -n 'did not activate' /tmp/dsh.log   # 没被点名 = 激活成功
  ```
- **验 skill catalog（进程级）**：新建 session → `skill_search({"query":"<被禁用的名字>"})` → 期望 `No skills match "..."`；再对同名字调 `skill_load`，期望 `is not model-invocable` 拒绝。
- **验用量权重（无需 dsh 进程）**：`node ~/.dsh/storages/tools/test-skill-search-weight.mjs`（fake ctx 驱动 `apply(ctx)` 注册的两个 tool，30 条断言 + 真实库 79 skill × 7 query）。
- **验 web_search 各源活着**：搜一个已知实体，看 8 条里的源指纹 `[github]` / `[deepseekSearch]` / `[wiki] http://100.79.96.82:8810/wiki/...`；对应用 `grep -c 'wiki source failed' ~/.dsh/logs/host-stdio.log` 必须为 0。
- **验 pwsh 常驻**：同一 session 连续两次 `$PID` 应相同；`$ExecutionContext.SessionState.LanguageMode` 应为 `FullLanguage`（README 警告的 ConstrainedLanguage 未发生 = 当前 sandbox 不是 ACL read-only 模式）；`$PSVersionTable.PSVersion` 实测 7.6.8。
- **agent-jobs 冒烟（不需要模型）**：
  ```bash
  timeout 120 node ~/.dsh/storages/tools/agent-jobs.mjs --self-test   # 26 项确定性断言
  timeout 300 node ~/.dsh/storages/tools/agent-jobs.mjs --in t.csv --out r.csv --col task --dry-run
  ```
- **长任务后台化**：`job_list` → `job_output(job_id, wait=true)` → `job_kill`；不要 `bash ... &`，不要 `Start-Process` 收尾式等待。
- **一切 bash 命令前置 `timeout 30..60`（重活 ≤120）**：超时给 exit 124 这个可观测信号；搜索根边界化（从 `~/.dsh`、`D:/Toolbox` 起手），找包位置用 `node -p "require.resolve('<pkg>')"`，不用 `find`。

## S 溯源

fact 文件名清单（`C:/Users/27063/AppData/Roaming/reasonix/memory/global/`）：

- `dev-tool-search-false-unlock-fix-and-preset-reload-boundary-20260927.md`
- `dsh-agents-skills-second-root-and-catalog-cache-20261001.md`
- `dsh-skill-catalog-not-filtered-by-invocation-20261001.md`
- `dsh-skill-usage-weighting-20260926.md`
- `skill-usage-weight-normalization-fix.md`
- `skill-search-weight-verified-and-false-bug-20260930.md`
- `skills-canonical-source-独立真源.md`
- `skills-memory-junction-topology-both-machines-20261001.md`
- `元规则-技能路由16条.md`
- `技能-安装与归档历史.md`
- `dsh-web-search-三源聚合最终形态.md`
- `dsh-web-search-三源齐活-20261025.md`
- `dsh-web-search-四源聚合最终形态.md`
- `dsh-web-search-wiki-fetch-failed-修复.md`
- `dsh-local-search-插件已迁到C盘-junction法.md`
- `强制搜索优先级-local-wiki-github.md`
- `dsh-hooks-claude-code-setup-and-headless-finding-20260927.md`
- `headless-profile-degraded-3-tools-no-persona-20260927.md`
- `dsh-agent-jobs-v2.md`
- `tool-bootstrap-subagent-catalog-real-mechanism.md`
- `dsh-mnemon-subagent-empty-catalog-and-language.md`
- `codex-gap-4-5-filled-agent-jobs-and-thread-edges-20260927.md`
- `rule-long-running-process-needs-job.md`
- `dsh-bash-windows-禁find全盘与session事件流zstd.md`
- `dsh-bili-压缩正确姿势.md`
- `dsh-pwsh-常驻化-p1.md`
- `dsh-plugin-catalog-4377-and-evaluation-20260928.md`
- `dsh-plugin-compat-verification-method.md`
- `dsh-market-installed-20260928.md`
- `dsh-mimir-incompatible-with-017rc2-typert-codec-20260927.md`
- `hindsight-broke-headless-incident-20260928.md`
- `hindsight-project-memory-installed-20260928.md`
- `dsh-community-plugin-landscape-20260926.md`
- `dsh-isolated-instance-verify-recipe.md`
- `dsh-tools-dir-archived-20260928.md`

现场只读核对（2026-10-26）：`~/.dsh/.agent-presets/anchored-standard/tool-bootstrap.mjs:131/133/151/246/295/303`、`dev-tool-search.mjs:1-30`、`~/.dsh/storages/{plugins.json,skill-triage-manifest.json,skill-usage.json,agents-skills-triage.json}`、`~/.dsh/profiles/{web,desktop,headless}/node_modules/dsh-plugin-local-search`（三端 Junction）、`C:\Users\27063\ai-skills`（81 dirs / 78 SKILL.md）、`C:\Users\27063\.agents\skills`（4）、`~/.dsh/plugins/`。

## 存疑

1. **技能根拓扑已变**：fact `dsh-agents-skills-second-root-and-catalog-cache-20261001` 记 `~/.dsh/skills` 是 junction → `%APPDATA%\reasonix\skills`（rank 400 / 78 个）；现场实测已是 `Junction -> C:\Users\27063\ai-skills`（`skills-canonical-source-独立真源` 的 2026-10-01 改造）。rank 400/500 的说法可能只剩历史意义，未再实测。
2. **skill 数量三个口径**：fact 记「79 个」「46 disabled of 77」「顶层 97 项 / 78 SKILL.md」「50 个被禁用」；现场 `Get-ChildItem` 得 81 个顶层目录 / 78 个 SKILL.md。`skill-triage-manifest.json` 记 162 项（`keep` 62 / `disable-filler` 60 / `disable-superseded` 26 / `disable-broken` 8 / `disable-collection` 6），root 字段仍是旧的 `.dsh\skills` 与 `.reasonix\skills` 各 81。三者关系未裁定。
3. **`RESIDENT_CONTEXT_TOOLS` 在现文件里不存在**：PLAN 记 2026-10-23 12:29 在 `tool-bootstrap.mjs:147` 新增 `const RESIDENT_CONTEXT_TOOLS = ['compress','decompress','acp_status','search_context']` 并在 `:309` 并入 promoted keep-set；2026-10-26 现场 grep，该常量与字符串 `compress` 在 `tool-bootstrap.mjs` 里**零命中**（只有 `RESIDENT_DISCOVERY_TOOLS` 与 `RESIDENT_MEMORY_TOOLS`）。是后续重构覆盖还是回滚，未查证。
4. **web_search 源数与 rank 有三套互不相同的说法**：三源版 `SOURCE_RANK = {github:0, goat:1, deepseek:2, wiki:3}`（2026-10-01）；2026-10-25 版 `{github:0, deepseekSearch:1, goat:2, deepseek:3, wiki:4}` 且开关 `enableDeepseek:false` / `enableGoat:false`；probe 输出里还出现 `bing`。本文件只记「并发聚合 + 配额 + rank 回填」这条不变式，不裁定当前到底几源。
5. **「三源/四源」与「谁修好了 wiki」的时序**：`dsh-web-search-wiki-fetch-failed-修复`（fetch→node:http）、`dsh-web-search-三源齐活-20261025`（重启后 `wiki source failed` 计数 0）、`dsh-web-search-四源聚合最终形态`（goat 关掉）三条的日期与结论交叠，未排出唯一时间线。
6. **插件目录规模 4377 / 476 / 11000+** 三个数字来自三种口径（market 的 `plugins.json` / GitHub topic 快照 / 社区自述），不可互证。
7. **dsh 版本号在 fact 间不一致**：`0.1.7-rc.2`、`0.2.0-rc.2`、`0.2.1-rc.2`、`0.2.1-rc.2 + bili 0.1.204` 并存，各条时间戳不同但无统一版本线标注，本文件不引用单一版本号。
8. **`skill-usage.json` 现为 2 条**（`pdf` loads=1、`compress` loads=1，`firstUsedAt` 相同），fact 记「只有 `{"pdf":{"loads":1}}` 一条」——属后续追加，不是矛盾，但「账本近乎为空 ⇒ 权重机制不产生实际差异」这个结论的强度已减弱。
9. **技能安装批次**：「第二批 4 个」「第三批 Anthropic/Vercel」等编号来自 2026-08-16 合并归档，与当前 78 个 SKILL.md 无法一一对应，只能当历史信息。
10. **hooks 在 web 模式下是否派发未验证**：fact 只做了 headless 三次否定实测 + web「待验证（需 UI 交互或 API）」，至今无 web 侧确认记录。
