# 本机约定（~/.dsh/AGENTS.md）

## subagent 的 preset 选择（2026-11-15）

`tool-subagent` 现在暴露 `agent_preset` 参数，枚举两个值。**按任务性质选，不要一律用默认。**

| 任务性质 | `agent_preset` | 理由 |
|---|---|---|
| 工程 / 工具链 / 代码改动 / 排查 | 省略（默认 `anchored-standard`） | 首轮 2 工具锚定，晋升后渐进解锁；适合执行型任务 |
| 学习 / 数学推导 / 讲解概念 / 审阅证明 | `learn` | 「先攻后守」人设（先闭卷自推再给原证）、禁甩未学概念、工具齐全可直接跑代码验证反例 |

不传时默认 `anchored-standard`。传 `learn` 的 subagent 也会继承同样的 provider / model / reasoningEffort。

## 生效边界

改 `profiles/desktop/cordis.patch.yml` 的 row **需要重启 dsh** 才生效（不是"开新会话"，是重启进程）。
改 `.agent-presets/**/*.mjs` 需要新会话。两者不同，别混。

## 验证 subagent 是否被收窄

```bash
python - <<'PY'
import zstandard as zstd, io, json, glob, os
f=max(glob.glob(os.path.expanduser('~/.dsh/sessions/*/*/session.v4.jsonl.zstd')), key=os.path.getmtime)
with zstd.ZstdDecompressor().stream_reader(io.BytesIO(open(f,'rb').read())) as r: raw=r.read()
for l in raw.decode('utf-8','replace').splitlines():
    o=json.loads(l)
    if o.get('type')=='request/header': print('tools =', len(o['data']['header']['tools']))
PY
```

首轮应看到 `tools = 2`（主会话）或 `tools = 2`（anchored subagent）。看到 101 就是没生效。

## 下载 / 拉取通道（2026-11-15 实测，先查这张表再动手）

**别先试直连。** 本机出口 = 随身 WiFi（不能换），国内 1.3~1.6 MB/s 正常，国际链路**分钟级剧烈波动**。

| 场景 | 走什么 |
|---|---|
| **GitHub 文件 / clone** | `https://ghfast.top/https://github.com/<path>`（`git config --global url.…insteadOf` 已配；**私有仓库 clone 前先 unset**） |
| PyPI | `https://mirrors.aliyun.com/pypi/web/simple/` |
| HuggingFace | `HF_ENDPOINT=https://hf-mirror.com` |
| npm（Linux 侧） | `npm config set registry https://registry.npmmirror.com` |
| GitHub 单文件 | `https://cdn.jsdelivr.net/gh/<user>/<repo>@<branch>/<path>`（官方 CDN） |

### ⚠️ 测速陷阱（踩过，浪费一小时）

`curl -w %{speed_download}` 对 **302 重定向的文件**（如 aliyun 的 `ubuntu-*.iso`）和 **小文件**
（HTML 首页 / `SHA256SUMS` 几百字节）会**假报 ~1 KB/s**，看着像"运营商限速"。
**必须**用确定有实体的大文件，下 12~15 秒后算 `size_download / time_total`：

```bash
curl -s -L -o /dev/null --max-time 15 -w "%{http_code} %{size_download} %{speed_download}\n" \
  "https://mirrors.aliyun.com/pypi/web/simple/"    # 21 MB / 15s ≈ 1.34 MB/s 才是真值
```

### ⚠️ hosts 优选别抱期待

ghprobe（Windows）/ ghauto（Linux）确实能挑出手工枚举不到的活 IP（如 `20.175.192.147`），
但**有效期是分钟级**。A/B 实测：有 hosts 2/3 成功、删掉 hosts 2/5 成功 →
**收益（±5 KB/s）远小于链路波动（0 ↔ 30 KB/s）**。GitHub 网页晚上不稳是物理事实，不要反复调 IP。

### 已证无效的方案（别再试）

ClientHello 分片（GoodbyeDPI/zapret 原理）、Cloudflare WARP 端点、workers.dev、
Cloudflare 66 个 IP 抽样（0/66 能握手）—— 在本线路全部失败。

> 详细版（含 dev-sidecar 2.3.5 ECH 能力边界、各通道实测数字）见 reasonix fact
> `国内下载通道与本机代理配置-2026-11`。

## skill 停用必须移出目录，改名无效（2026-11-15 实测）

给 skill 目录改名（如 `study-coach` → `_study-coach.retired-v45`）**不能停用它**：
skill-search 按 SKILL.md frontmatter 的 `name:` 字段索引，**不看目录名**。
旧目录仍留在 `~/.dsh/skills/` 下，就仍会被 `skill_load` 命中，它的铁律会被注入上下文，
而且**优先级高于 preset 的 persona**（persona 说「不要出题」，skill 说「先攻后守，先不给答案」，模型跟 skill 走）。

证据（headless reasoning 原文）：
> 有 skill `study-coach` … 这符合，应该 load skill。
> 按 study-coach 铁律 1：先攻后守。这是概念问题，我先不给完整答案，要他自己想。

正确停用法：把整个目录移出 `~/.dsh/skills/`，例如 `mv ~/.dsh/skills/X ~/.dsh/.retired/`。
校验：`grep -rl '<旧铁律关键词>' ~/.dsh/skills/ | head` 必须为空。

## 删技能必须双机同时做，否则同步会复活它（2026-11-16 实测）

`sync_dsh.py`（以及它复用的 `sync_reasonix.py`）的语义是**纯并集**：
`all_rel = set(lfiles) | set(wfiles)`，一方独有 ⇒ 复制到另一方。**删除永远不传播**，
而且 `size 相同` 直接判 same（连内容都不比）。所以：

- 只在一台机器上删/合并技能 ⇒ 下一轮同步用对端那份补回来（「明明整理掉了怎么又出现了」）。
- 结论：**删技能 = 双机各删一次**；或者先把两侧的同名目录都改名留档再同步。
- 同理适用于任何「结构性删除」：目录改名、根目录搬家，旧家必须清，否则它就是复活的种子。

历史证据：10-01 的整理（`ai-skills-pruned-20261001-1431` / `skills.mirror-legacy-20261001-1430`）
做的是**改名留档不是删除**；11 月初真身从 `%APPDATA%\reasonix\skills` 搬到 `~\ai-skills`，
旧家（101 项，含已退役的 `bilingual-ocw-translator`）一直留着，而 `sync_dsh.py` 的
`EXTRA_PAIRS` 到 11-16 还指着它 ⇒ 那半个月双机同步搬的一直是旧副本。
2026-11-16 已把两处旧家改名留档（Windows `%APPDATA%\reasonix\skills.legacy-20261116`、
Linux `~/ai-skills.legacy-20261116`），现役双机各 99 项且内容一致。

## 中文路径 + git = 两个必须加的开关（2026-11-16 实测，血泪）

`.git/hooks/pre-commit` 与两个 autocommit 脚本里，凡是读 `git status` / `git diff --cached`
的地方都必须带 `-c core.quotepath=false`：

- 默认 `core.quotepath=true`，git 把非 ASCII 路径输出成 `"skills/\345\205\203..."` ——
  **带双引号 + 八进制转义**。拿它去 `git add` 一个都匹配不上；拿它做域分类，
  首字符是 `"` 就落不进 `skills/*` 分支，全归 `misc`。
- 实测症状一：退役 50 个技能后，157 个改动只提交了 3 个（其余路径全部匹配失败）。
- 实测症状二：一个纯 `toolkit` 的 80 文件批次，被 hook 判成「toolkit misc 混域」拒绝。
- 两处都已修：`storages/tools/dsh-autocommit.ps1`（status + add）、
  `storages/tools/dsh_autocommit.sh`（status + add）、`.git/hooks/pre-commit`（diff --cached）。

另一个坑（同一天）：`dsh-autocommit.ps1` 的失败分支原来用 `2>$null` 吞掉 commit 的错误，
日志只写「head 未前进」。现在把 git 的原文前 12 行写进日志（`git| ` 前缀）——
**没有错误原文的「失败」等于没记录**。

## learn preset 的 row 清单 = anchored-standard 减两行（2026-11-17 查清）

`preset-learn` 原来只有 23 行（web）/ 22 行（desktop），缺 8 行：`host-log-tee`、
`concurrency-discipline`、`session-age-warn`、`plan-anchor`、`subagent-language`、
`git-context`、`tool-goal`、`planning`。症状：**learn 会话完全没有任务规划**
（`~/.dsh/plans/<session>.md` 不建、不注入，TodoPanel 也没有 plan 投影）、
无会话水位提醒、无 git 上下文、无 plan mode / goal 工具。

根因是抄来源本身就没有：当初按 `.agent-presets/learn/preset-declaration.yml` 逐字搬，
而那份文件 **0.1.7 起目录不再被扫描、从未被加载过**（2026-11-17 已改名
`preset-declaration.yml.retired-20261117`），它的 plugins 只有 8 行。

现在的约定：`preset-learn` ≈ `preset-anchored-standard` **只减 `tool-bootstrap` + `context-gate`**
（那两个是「首轮 2 工具锚定 + 首轮清空注入」，learn 故意不要：学习场景首轮就该工具齐全）。
改动任一边必须同步另一边，两份 patch（web / desktop）都要改。

## 用脚本改 profiles/*/cordis.patch.yml 必须保住原行尾（2026-11-17 血泪）

- `profiles/web/cordis.patch.yml` 是**纯 CRLF**；`profiles/desktop/cordis.patch.yml` 是**混合**
  （636 CRLF + 1764 LF）。别「顺手统一」，那会让 diff 变成全文件重写。
- 踩法：`open(p,'rb').read().decode()` → `split('
')` 后原行仍带 `''`，
  给插入行再补一个 `''` ⇒ `
`。67 行变 CRCRLF 后 `git diff --numstat` 直接报
  2291 增 / 2208 删（全文件重写），比真实改动 83 行大 27 倍。
- 判据：`git diff --ignore-cr-at-eol --numstat -- <file>` 应等于真实改动行数；
  写回后立刻查 `b.count(b'
') == 0`。

## dsh-mnemon 的 Git 备份一直失败（2026-11-17 发现，未修）

`logs/host-stdio.log` 反复报：
`[err] dsh-mnemon: automatic Git backup failed Error: runtime user memory holds 5747 bytes and exceeds its 4096 byte limit`。
USER.md 实际 5747 B，而投影到 prompt 的上限是 8192 B —— **两套限额不一致**，
所以「memory 读得到、备份永远失败」。要么把 mnemon 侧上限提到 ≥8192，要么把 USER.md 压到 4096 以下。
