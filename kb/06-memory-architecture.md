# 06 · 记忆系统架构

> canonical 是 reasonix 的 md fact；mnemon 是它的可重建索引；每轮进上下文的只有 runtime 那一层薄投影 —— 三层不是三份数据，是三种**进上下文的方式**。

## D 定论

1. **三层 = 一个 View 按 role 拼的三个 Source，不是三个 store。** `dsh-mnemon` + `default-three-tier` Strategy 拼出 `working-context` / `narrative` / `durable-evidence`；只有第一层是 eager 常驻，后两层都是「每轮查询、命中才进」。
2. **canonical 只有一份：`~/.reasonix/memory/**/*.md` 的 fact。** mnemon db 里的一切都是它的派生投影 —— 删库后可一条命令重建（实测 195→205 insights、embedding 自动补齐 100%）。这条性质直接决定备份策略：**db 不进备份，md 必须进**。
3. **每轮都进上下文的只有 runtime 层**：`~/.mnemon/runtime/{memories.json,USER.md,MEMORY.md}`，预算 `userLimitBytes: 4096` / `memoryLimitBytes: 10240`（可配置覆盖，上限 1 MB）。当前实测 USER.md 3029 B（74%）/ MEMORY.md 6336 B（62%）/ memories.json 17 entries。
4. **写入纪律是一条单向流**：新知识先落 reasonix 语料（`memory_remember`）→ 自动 sync 进 memory-spaces；只有当某条信息「每轮都必须生效」才另写 runtime hot memory（`mnemon_runtime_memory`）。写反了会两头分叉。
5. **`USER.md` / `MEMORY.md` 是生成投影，禁止直接编辑**（插件源码级约定：memories.json 是唯一事实源）。直改会被控制层覆盖，且不报错 —— 失败是静默的。
6. **常驻层的判据是「三月后是否仍成立」**：会过期的明细（课程进度、软件版本、项目状态）一律进 fact，常驻层只留「一句摘要 + fact 名指针」。这条把 USER.md 从 3294 B 压到 3028 B，信息量不减。
7. **同步是增量且可重放**：`mtime+size` 一级指纹、`sha256` 二级指纹、`rc != 0` 不写状态 ⇒ 任何失败都能原样重跑。全量重喂实测 22 s + 348 条 oplog 空转（其中 `import-skip` 占 99.8%），增量后 0.27 s、零增长。
8. **recall 质量不取决于「embedding 开没开」，取决于「用哪个工具 + 怎么问」。** 三条路径机制完全不同（子串 / 分词打分 / 向量 + strict-v1），同一问题在三处的召回集可以互不相交。
9. **常驻工具集是硬接缝**：persona 里点名要用的工具必须进 resident 集，否则指令指向一个默认不可见的工具 —— 这比缺功能更难诊断，因为模型会「礼貌地跳过」。
10. **冲突副本会累积，`head -1` 会取到陈旧副本。** 冲突文件的排序与新旧无关；判据必须是 mtime（`ls -t`）或「跑两轮收敛到 0」。
11. **mnemon 是 guided，不是 auto**：`recallMode: guided` ⇒ 只有模型主动调 `mnemon_recall` 才进上下文，也才会 `access_count` +1。所以 `access_count=0` 不能读成「无用」（实测 235/398 = 59% 为 0）。

## M 机制

### M1 三层拓扑与进上下文的方式

| role | Source 包 | 数据落点 | 投影方式 | 当前规模 |
|---|---|---|---|---|
| working-context | `dsh-mnemon-source-runtime` | `~/.mnemon/runtime/{memories.json,USER.md,MEMORY.md}` | **eager 常驻**（每轮 snapshot 注入） | 17 entries / 3029 B + 6336 B |
| narrative | `dsh-mnemon-source-documents` | `~/.mnemon/documents/**` | 每轮 1 次 Documents query（4 results / 6000 chars） | index.json 空壳，无文档 |
| durable-evidence | `dsh-mnemon-source-memory-spaces` + `provider-mnemon-native` | `~/.mnemon/data/default/mnemon.db` | 每轮 2 次 recall（6 results / 4800 chars），**命中才进** | 398 insights / 13161 edges / 11.7 MB |

推理链：**capacity 是稀缺资源** ⇒ 常驻层只放「每轮都改变行为」的约束；事实性知识（fact）价值密度低但总量线性增长 ⇒ 必须放在「按需检索」层；投影层（documents）是给长文留的口子，当前未启用。

### M2 写入链（唯一的写入口）

```
memory_remember / mnemon_runtime_memory
  -> ~/.reasonix/memory/<scope>/<name>.md      (canonical, frontmatter: name/description/metadata.fact_type)
  -> memory.mjs syncToMnemon(): detached spawn python memory-to-mnemon.py --only <name> --src <dir>
  -> mnemon import <draft.json>                (内容 dedup，已存在的 insight 跳过)
  -> ~/.mnemon/data/default/mnemon.db          (durable-evidence 可见)
```

- `--only` 路径成功后才回填指纹，避免下次全量重复喂同一条。
- 开关：`DSH_MNEMON_SYNC=0` 关实时同步；`DSH_PYTHON` 覆盖解释器；日志 `~/.dsh/logs/memory-to-mnemon.log`。
- **失败是静默的**（`stdio:'ignore'` + `unref`），所以「写完就以为同步了」是默认错觉。

### M3 同步脚本的三层防御

1. **scope 自动发现**：`discover_scopes(root)` 扫 `~/.reasonix/memory/*/`（跳过 `.` 开头的 `.revisions`），`global` 第一、`global/.archive` 收尾为 `archive` scope，另追加 `("reasonix-root", ~/.reasonix)` 纳入 `REASONIX.md`。
2. **指纹增量**：`~/.dsh/storages/mnemon-sync-state.json` 结构 `{"<scope>/<file>": {m: mtime_ns, s: size, h: sha256}}`；当前 330 条（global 313 / project 9 / eecdfd87f26b0ddb 4 / archive 3 / reasonix-root 1）。
3. **importance 分层**：`archive` scope 强制 `imp = min(imp, 2)` —— 否则归档内容进 immune 区，永久不被 gc 回收。`fact_type` 优先于 `metadata.type`（后者在本语料里 142/177 都是填充值 `user`，全信它会让所有 fact 跳到 importance 4）。

### M4 三条检索路径（机制完全不同，别混用）

| 路径 | 机制 | 强项 | 失效模式 |
|---|---|---|---|
| `memory_search`（reasonix 侧） | 纯子串；多词要求每词都出现 | 已知精确词、中文短词 | 多词跨主题必归零；`bili` 是 `bilingual` 的子串 ⇒ 串味 |
| `mnemon search`（CLI） | token 分词 + 打分 | 自然语言短语 | 不是向量语义；近邻概念可漏 |
| `mnemon_recall`（dsh 工具） | `nomic-embed-text`（Ollama `:11434`）+ `recallQuality.policy: strict-v1`（low 0.25 / high 0.6 / candidateMultiplier 3） | 语义近似 | **中文陈述式短语落 `GENERAL`，语义路径基本不参与排序** |

⇒ 实用规则：**用问句形式提问**（「自动压缩什么时候触发」），不要用陈述式关键词堆。

### M5 IDL 授权语义（不是普通 CRUD）

- `mnemon_recall`：每轮 1 次初始查询 + 1 次 LLM 选的 refinement，共用同一 evidence envelope；**重复 query 会被回放**。
- `mnemon_related`：每轮最多 1 次遍历，且只能遍历**本轮 recall 已准入**的 id。
- `mnemon_view_route`：只能执行当前 envelope 里出现过的 `routeId`；Host 把它绑定到隐藏 ReadGrant，并强制 call / result / character 预算。
- `mnemon_view_action`：写入要重查 write policy 与 authority，返回 mutation Receipt。**「被 offer」本身不是授权** —— 这条语义必须显式表达，否则模型会把 candidate 当许可。
- `mnemon_runtime_memory`：只接受「用户新提供的事实 / 显式保存或更正请求」；**永不写检索到的证据**。

### M6 与 dsh 的接缝

- `~/.dsh/.agent-presets/anchored-standard/tool-bootstrap.mjs:130` `DEFAULT_BOOTSTRAP_TOOLS = ['bash','str_replace_editor']`；`:133` `RESIDENT_DISCOVERY_TOOLS = ['dev_tool_search','skill_search','skill_load']`；`:151` `RESIDENT_MEMORY_TOOLS = ['memory_profile']`；`:295` `keep = new Set([...bootstrapTools, ...RESIDENT_DISCOVERY_TOOLS, ...RESIDENT_MEMORY_TOOLS, ...unlockedFor(...)])`。
  ⇒ `memory_profile` 必须常驻的理由：persona prefix **点名要求**实质任务前先查画像；它不在 keep-set 就等于「被引用但不存在的函数」，模型只会静默跳过。
- `patchReload: live` 的边界：`~/.dsh/profiles/<name>/cordis.patch.yml` 参与 HMR，**开新会话即生效，不必重启进程**；而 `.agent-presets/**/*.mjs` 与 node_modules 里的 client bundle **都不参与 HMR**（HMR 只 exact-path watch profile patch 文件本身）。⇒ 改 `memory.mjs` 必须重启；改 mnemon 的 config（embedding / `idleReview.maxTokens`）只需新会话。headless 是 `patchReload: startup`，必须重启。
- `agent/pre-step` 是 waterfall，`opts.prepend` 会 unshift 到 listener 头 ⇒ `dsh-mnemon` 用 `prepend: true` 稳坐最外层，把 thinking-anchor 顶离采样点。抢「最靠近采样点」的位置不能靠 `cordis.yml` 里的先后，必须 `prepend` + 依赖加载顺序（后注册 → 后 unshift → 在外层）。

### M7 双机拓扑

- Windows：`~/.reasonix/memory` 是 **Junction** → `%APPDATA%
easonix\memory`（实测 `LinkType=Junction`）；`~/.dsh/skills` 也是 Junction → `%APPDATA%
easonix\skills`。`~/.reasonix` 是旧 CLI 路径，Desktop 读 APPDATA 那份。
- Linux：`~/.dsh/skills` 是 **symlink** → `~/.reasonix/skills`（方向与 Windows 相反，别跨机套用结论）。
- 后果：`find` / `os.walk` / `du` **不跟随 reparse point** ⇒ `find ~/.dsh/skills -name SKILL.md` 返回 0 是测量假象（曾把一次假警报炒成「技能目录被清空」）。数真实文件要用 PowerShell `Get-ChildItem -Recurse` 或 `find -L`。

## J 判据

每层「活着」的判据（都可执行，不是「看起来对」）：

1. **canonical 层在长**：`ls ~/AppData/Roaming/reasonix/memory/global/*.md | grep -v -E '\.bak|conflict' | wc -l` —— 当前 **312**（该目录总计 530 项，其中 conflict 副本 199）。
2. **runtime 层没爆预算**：`USER.md` 字节 / 4096、`MEMORY.md` 字节 / 10240；接近 90% 该做 pointer 化瘦身，而不是删信息。
3. **同步追上**：`mnemon-sync-state.json` 条目数 ≈ canonical fact 数（当前 330 条跨 5 个 scope），且 `python memory-to-mnemon.py` 二次运行输出「全部未变，跳过」且 < 1 s。
4. **recall 真可用**：用一个**问句**问已知 fact 的主题，命中集里出现该 fact；`mnemon status` 报 `healthy: true` / `commandFound: true` / `writeEnabled: true`。
5. **embedding 在位**：`mnemon embed --status` → `coverage 100%` / `embedding_available: true` / `protocol: ollama`。注意这是 **CLI/store 层**；dsh 插件层的 `embedding.enabled` 是另一层（Host → mnemon 子进程的环境注入），两层分别验。
6. **idle review 真跑过**：判据是 `storages/session_projcache/sessions/*.json` 里 `mnemonSubagentTokenUsage.val.totals.outputTokens > 0`（1666 条中 1663 条带该字段）。**`mnemon.db` 的 `oplog` 不能用来判 review** —— 它只记 `import` / `search` / `recall` / `gc`。
7. **db 可重建**：把 db 移走 → 跑一次全量脚本 → insights / edges / embedding coverage 三项回到原量级。这条是「db 不进备份」的前提，不验就是赌。
8. **插件真挂上**：抓 index 页的 `plugins/??…&rev=…` 清单（服务端真实注册结果的投影），比看日志、看进程都直接。

## X 反例

- **hindsight 写全局 patch 破了 headless**：`~/.dsh/cordis.patch.yml` 被所有 profile compose ⇒ headless 每条任务报 `format v4 message requires a producer-owned source kind`。教训不是「插件不好」，而是 ①「能启动」≠「能用」，headless 的判据必须是真跑一个任务拿到回复；② 写全局 patch 的插件必须在**所有** profile 上验。已回滚（插件行移除），`~/.hindsight/` 与 skill 仍在磁盘但不再加载。
- **直接编辑 `USER.md` / `MEMORY.md`**：写完读回是空（控制层覆盖），零报错。正确入口只有 `mnemon_runtime_memory`。
- **把 `metadata.type` 当画像信号**：142/177 个 fact 的 `type` 都是默认填充值 `user`，据此打 importance 会让绝大多数 insight 跳进 importance 4（= gc immune 区），importance decay 直接失效。
- **「`includeSubagents: false` 能修 subagent 空 catalog」**：错的。promoted 分支同样收窄，child 的 `toolFilter.allow`（全是 `mnemon_*`）与 bootstrap 集求交仍是 ∅ ⇒ 模型把 tool-call 语法当纯文本吐出来，`stopReason=completed` 却零 receipt（`memory subagent completed without recording its result`）。真修法是在 `system-prompt/assemble` 里按 `delegationDepth > 0 || origin === 'subagent'` 直接 bypass 收窄。
- **用 `head -1` 在 conflict 副本里挑「对方最新版」**：`ls` 按名字排序，与新老无关 ⇒ 把陈旧副本写成 live，下轮再冲突。收敛要跑两轮（22 → 8 → 0）。
- **拿字符数比字节数做部署守卫**：`len(new_txt) < old_bytes * 0.9` 在中日文语料里必然误判（4418 字符 / 6434 字节），14 份里拒了 10 份，差点据此回滚一批好文件。
- **用 staging 快照覆盖线上**：快照之后的并发写入被吞（`MEMORY.md` 21476 → 20735 B，差 3.5% 逃过体积守卫）。正确判据是「备份独有非空行」为空，不是体积。
- **「删库重建」顺手迁移分类**：`mnemon import` 走内容 dedup，**已入库的 212 条不会因脚本修好而更新 category / importance**。想让旧 insight 按新规则重排必须 `--no-diff` 重灌（会丢 dedup 保护）。
- **`.db` 进备份**：二进制无法脱敏且含凭证；同时它是派生数据 ⇒ 移出 `$Targets`。代价是必须实测可重建，这一步不能省。
- **把 boot 时的 Error 降级成 notice**：`dsh-mimir` 在 dsh 0.1.7-rc.2 上 `typert-loader` 报 `parameter codec has no create() factory`，peer 版本号「名义满足」≠ 真兼容。当时当警告处理，结果是新起实例全量插件失效。
- **`shutil.rmtree` 做「掏空后换 junction」**：抛 `OSError: Cannot call rmtree on a symbolic link`，**但抛之前已经把目录里文件全删了**（剩 80 个空目录、`SKILL.md` 归零）。Windows 上删目录树用 PowerShell `Remove-Item -Recurse -Force`。

## R 复现

```bash
# 1 三层拓扑的现场读数
ls -la ~/.mnemon/runtime/          # USER.md / MEMORY.md / memories.json 即常驻层
python -c "import json,io,os;d=json.load(io.open(os.path.expanduser('~/.mnemon/runtime/memories.json'),encoding='utf-8'));print(d['version'],len(d['entries']))"
ls -la ~/.mnemon/data/default/*.db*  # durable-evidence；当前 11.7 MB

# 2 canonical 语料规模（排除备份/冲突副本）
cd ~/AppData/Roaming/reasonix/memory/global && ls *.md | grep -v -E '\.bak|conflict' | wc -l   # 312

# 3 junction 是否生效（Windows）
powershell -NoProfile -Command "(Get-Item 'C:\Users\27063\.reasonix\memory').LinkType"

# 4 同步状态与增量语义
python -c "import json,io,os,collections;d=json.load(io.open(os.path.expanduser('~/.dsh/storages/mnemon-sync-state.json'),encoding='utf-8'));print(len(d),collections.Counter(k.split('/')[0] for k in d))"
python ~/.dsh/storages/tools/memory-to-mnemon.py --dry-run    # 应输出「全部未变，跳过」

# 5 embedding 两层分别验
mnemon embed --status                                         # 层 1：CLI/store
curl --noproxy '*' -X POST http://127.0.0.1:11434/api/embed -H "Content-Type: application/json" -d '{"model":"nomic-embed-text","input":"hello world"}'   # 层 2：端点，实测 200 / 768 维

# 6 dsh 侧配置（零副作用）
dsh --profile web --dump-config | grep -A3 -E 'embedding:|idleReview'

# 7 db 可重建实证（动库前先 mv 不删）
mv ~/.mnemon/data/default/mnemon.db ~/.mnemon/data/default/mnemon.db.pre-rebuild-test
python ~/.dsh/storages/tools/memory-to-mnemon.py
mnemon status && mnemon embed --status
```

## S 溯源

mnemon-three-tier-memory-deployed-20260927.md
dsh-memory-layering-persona-bridge-20260930.md
dsh-mnemon-realtime-sync.md
memory-to-mnemon-增量同步-20261023.md
memory-system-efficiency-audit-20261022.md
user-md-分层瘦身-20261023.md
dsh-mnemon-embedding-enabled-20261006.md
codex-gap-6-7-recon-and-mnemon-recall-quality-20260927.md
dsh-patchreload-live-new-session-and-mnemon-dsh-side-verified-20260928.md
dsh-pre-step-prepend-vs-mnemon-20261001.md
dsh-mnemon-subagent-empty-catalog-and-language.md
incident-includeSubagents-broke-mnemon-subagents-20260929.md
mnemon-db-rebuild-verified-20260928.md
mnemon-four-graph-store-verified-20260928.md
mnemon-acceptance-evidence-20260928.md
mnemon-idlereview-never-ran-20261004.md
mnemon-idle-review-maxtokens-truncation-fix-20261003.md
memory-index-self-heal-20260928.md
reasonix-memory-fully-integrated-into-mnemon-20260928.md
dsh-skills-and-memory-bridge-20260926.md
hindsight-project-memory-installed-20260928.md
hindsight-broke-headless-incident-20260928.md
headless-profile-mnemon-not-viable-rolled-back-20260928.md
dual-reasonix-home-memory-fork-and-junction-unification-20260927.md
skills-memory-junction-topology-both-machines-20261001.md
dual-machine-sync-convergence-pitfalls-20261001.md
memory-merge-deploy-two-pitfalls-20261001.md
dsh-mimir-incompatible-with-017rc2-typert-codec-20260927.md
deja-0213-upgrade-dsh-integration-and-dual-reasonix-home-20260927.md
元规则-02-自动记忆规则.md

## 存疑

- **「`userLimitBytes` / `memoryLimitBytes` 上限 1 MB」**：两个字节预算在 fact 里被记为 `dsh-mnemon-source-runtime` 的可覆盖配置项，但本机 `~/.dsh/profiles/web/cordis.patch.yml` 里 grep 不到这两个 key（只有 fact 转述的默认 4096 / 10240 与「上限 1 MB」）⇒ **未现场定位到声明点**，可能只是插件源码内部常量、并非 patch 可写字段。
- **`dsh-mnemon` 版本号不一致**：09-27 的 fact 写 0.5.16，09-30 的 fact 写 0.5.20；本轮未跑 `dsh plugin list` 复核。
- **embedding 覆盖率未复验**：fact 记 383/384 或 205/205，本轮未跑 `mnemon embed --status`（避免起进程），此处如实记 fact 记录值。
- **narrative 层（documents）是否真有用**：`~/.mnemon/documents/index.json` 38 B、无文档，fact 里也没有「documents 层被实际使用」的实例 ⇒ 目前是**在位但空转**的机制，不是已验证的价值。
- **画像的 single writer 未定**：reasonix 侧画像 fact 更新（`user-persona-*` / `academic-level-*`）不会自动同步进 runtime `USER.md`，现在靠会话内 `mnemon_runtime_memory` 手改；若自动化，必须走 dsh 侧插件写路径（协议禁止直改 memories.json）。
- **`edges 13161 / 398 节点 = 33 条/节点`**（entity 边占 82%、weight 均值 0.97）意味着 `mnemon_related` 区分度低 —— 是否已在后续版本改善，未验证。
- **compaction 与记忆写入的竞态**：`PLAN.md` 记录了 compaction 触发判据（`tokenMeter.measure(session).totalTokens`）与 `runtimeMemory.maintenanceMaxTokens`（默认 8192）的存在，但**没有一条实测记录证明「compaction 期间写入 memory 会丢或串行化」** —— 这个因果关系目前只是合理怀疑，不写进定论。

---

## 2026-10-26 附：一次真实的库内整理（软删 107 条，含判据与两个坑）

### 症状

recall 的结果位被**同源碎片**占满：441 条存活 insight 里，**51 组同标题、涉及 158 条（36%）**，
最大两组 `discrete-math ×22` / `advanced-math ×18`（同一课程会话被切成多段入库）。
每次 recall 只给 **6 个结果位** ⇒ 一问相关话题就被同组碎片吃满，等于把检索预算烧在重复内容上。

### 关键判据：**完全同内容的重复 = 0**

所以「去重」不能靠 md5 —— 这 158 条正文各不相同（182 B → 5052 B）。
它们是**同源多版本/片段**，判据必须换成「按 `content` 首行标题分组，组内择优」：

```python
rows = c.execute("select id,content,length(content),updated_at from insights where deleted_at is null")
by[content.split('
',1)[0].strip()].append(row)   # 按标题分组
dup = {k: v for k, v in by.items() if len(v) > 1}
```

### 处置（B 方案）与结果

每组保留**内容最长**的一条（并列取 `updated_at` 最新 —— 抢救「信息量」而非「时间」，短碎片往往是被截断的那半），
其余用 `mnemon forget <id>` **软删**（只写 `insights.deleted_at`，内容保留、查询排除、可回滚）。

| 指标 | 前 | 后 |
|---|---|---|
| 存活 insight | 441 | **335** |
| 唯一标题数 | 390 | **335**（= 存活数，重复组 0） |
| `recall "离散数学 Chernoff Bound"` | 22 条碎片挤满结果位 | **只回 1 条最完整版** |

### 两个批量执行坑（都实测过，别凭直觉写循环）

1. **`if timeout 20 mnemon forget "$id" >/dev/null 2>&1; then` 在 `while read` 循环里 100% 失败**（60/60、106/106 全 rc≠0）；
   改成 `out=$(timeout 20 mnemon forget "$id" 2>&1); rc=$?` 后 102/105 成功。
   已排除的原因：行尾 `
`、文件编码、db 锁、单条耗时（362 ms）。**真因未确证** ⇒ 批量调 CLI 固定用「赋值捕获 + `rc=$?`」这一种写法。
2. **`rc=1` 的语义是「已删过」（幂等）**，不是失败。105 条里 3 条 rc=1 正是先前已删的。**判据看 db 计数，不看退出码**（同 08 篇 D2 的原则）。

### ★ 根因（2026-10-26 已确证）：两条写入通路的语义不一致

**不是"数据脏"，是一条路 upsert、另一条路 append。**

| 路径 | 语义 | 结果 |
|---|---|---|
| vault（`~/.reasonix/memory/**`）→ `memory-to-mnemon.py` | 按 `name` **upsert**；脚本**主动跳过 `.revisions`**（源码注释：「`.` 开头的目录是修订快照，不是记忆本体」）；自带去重 + `mnemon-sync-state` 增量 | 同一 fact 只有 1 条 |
| **auto-capture / idle checkpoint review**（`mnemon-strategy-auto-capture` `disabled: false`；`idleReviewMs: 30000`） | **直接写 mnemon，绕过 vault**；每次 idle 检查 append 一条，**不按标题去重** | 同一主题越积越多 |

证据链（可复验）：

1. `discrete-math` 在 vault 里**根本不存在**（`ls ~/.reasonix/memory/global | grep -i discrete-math` 为空）⇒ 这批 insight 不是 vault 同步来的；
2. vault 有 323 个 md，mnemon 有 337 个唯一标题 —— 数量级吻合，但 mnemon 反而**更多**，差额来自第二条通路；
3. `profiles/web/cordis.patch.yml:1429` `mnemon-strategy-auto-capture: disabled: false`（无自定义配置）；`:1393` `idleReviewMs: 30000`（30 秒 idle 就跑一次 review）；
4. oplog 里 `import`（vault 同步）与 auto-capture 的写入是两类记录。

⇒ **推论**：这条通路的产物质量不差（它独立写出的 `git-github-clone-index-pack-failure` 事实准确到"DevSidecar 加头改写流导致 pack 损坏"），
所以问题不在"要不要它"，而在 **"它没有 name 幂等"**。

### 治标（已落地）

`~/.dsh/storages/tools/mnemon-dedupe.py`：默认只报告，`--apply` 才软删；策略=组内保留最长（并列取最新）；
判据=**存活条数 == 唯一标题数**；已挂进 `backup-to-github.ps1` §5.5（只报告不删，`-DryRun` 也跑）。

### 治本（三个选项，未执行，需拍板）

| | 做法 | 代价 |
|---|---|---|
| ① | `idleReviewMs` 30 s → 300 s（profile patch，HMR 生效，开新 session 即可） | 只降低产生速率，零风险 |
| ② | `mnemon-strategy-auto-capture: disabled: true` | 彻底不碎片，但丧失"不用手动 memory_remember 也沉淀"的能力 |
| ③ | 改插件让写入按标题 `replace`，或让 auto-capture 改走 vault（从而享受 upsert） | 治本，但要改插件行为，风险最高 |

### 与 D 定论的关系

这条实测给 06 篇的 D 系列补了一个反例式的注脚：**「canonical 是可重建的投影」不等于「投影可以无脑堆积」**。
memory-spaces 里的 insight 数量是有成本的（检索预算 6 位/次），所以「入库策略」本身是需要设计的，
和 runtime 层「4096/10240 字节预算」在本质上是同一个问题：**稀缺资源是上下文，不是磁盘**。
