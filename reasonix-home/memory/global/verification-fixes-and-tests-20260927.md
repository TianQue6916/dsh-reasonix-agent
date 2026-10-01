---
id: mem-a9479e6cdfc443274e66d157b3a70421
revision: 2
created_at: "2026-09-27T07:55:36.207Z"
updated_at: "2026-09-27T07:57:09.157Z"
name: verification-fixes-and-tests-20260927
description: "近三天核验中 4 个可修缺陷的修复与测试闭环 + 可重复运行的验收脚本 verify-4-fixes.sh（19 条判据，实测 PASS=19 FAIL=0）：backup-to-github.ps1 副本一致（junction + 两份真实副本，缺 user_ 脱敏与 3b 全量扫描已同步）、github 加速 fact 与实现一致（gh-proxy.com 硬编码 -> 指向 ~/.ghmirror-git）、skill 用量加权端到端可用（账本生成 + A/B 排序改变）、3080 开机自启（任务 Ready/LogonTrigger/IgnoreNew + 冷启动 5.45s + 幂等 2s 返回）。含四条元教训：判据写错会伪装成产品缺陷（当天犯了 4 次）、配置类 fact 应指向真相文件、同一失效模式跨层传导"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# 近三天核验中发现缺陷的修复与测试（2026-09-27）

对着 64 条近三天 fact 做核验时暴露了 4 个可修的缺陷。**每个都按「修复 -> 测试 -> 不过再修」走完**，
判据全部是真机可复现的，不靠「我觉得好了」。

---

## 第 1 项：backup-to-github.ps1 副本漂移  [已解决]

### 先纠正一个我自己的误判
我一度报「三份副本」，实际是：

- `~/Desktop/reasonix-ops` 是 **junction（ReparsePoint）**，Target = `~/Desktop/工具箱/reasonix-ops`
- 所以它和 `工具箱/reasonix-ops` 是**同一个真实文件**，md5 相等是我在拿同一文件自比
- 真实副本只有**两份**：那份真实的 + `工具箱/学科总结文档生成/reasonix-ops/`（vendored 快照）

判据：`fsutil reparsepoint query` 对 `~/Desktop/reasonix-ops` 报「是 reparse point」。

### 漂移内容（真实语义差 17 行）
vendored 那份是 **09-23 07:50 的修复前版本**，缺的正是两个安全修复：
- `user_` 前缀脱敏规则（`@{ rx='user_[A-Za-z0-9]{20,}'; to='user_REDACTED' }`）
- 3b 全量扫描块（`git ls-files` 并入待扫描清单）
- 外加 source 表里的 `goat-gateway` 备份项

### 修复与测试
用 live 那份覆盖 vendored。四项判据全过：

| 判据 | 结果 |
|---|---|
| 语义 diff（去行尾） | `0` PASS |
| 四处标记 user_ 规则 / ls-files / PRIVATE KEY / goat-gateway | live = vendored PASS |
| 字节级 `cmp -s` | byte-identical PASS |
| PowerShell 语法 `Parser::ParseFile` | OK PASS |

> 测试自身也修了两次：第一次 grep 用了花括号转义写法（basic grep 里是字面花括号）导致假 FAIL；
> 第二次提取 gitconfig base 的 sed 没去掉 `.insteadof` 后缀。
> **判据写错会伪装成产品缺陷** —— 这轮里发生了 3 次。

---

## 第 2 项：github-加速体系 fact 与实现漂移  [已解决]

fact 第 20 行写「git clone/fetch 走 **gh-proxy.com 固定**」，
而实测 `gitconfig url.*.insteadOf` 的 base 是 **edgeone.gh-proxy.org**。
更关键：**该 fact 自己第 52 行就说 repair 用 `~/.ghmirror-git` 重写** —— 自相矛盾。

真值（三处自洽）：

```
~/.ghmirror      = https://gh-proxy.com/            (下载用)   11:18 写
~/.ghmirror-git  = https://edgeone.gh-proxy.org/    (git 用)   11:20 写
gitconfig insteadOf base = https://edgeone.gh-proxy.org/       <- 与 ~/.ghmirror-git 一致
```

**根因：文档没跟上自动化。** watch-agent.ps1 每天重探 25 个镜像并改写这两个文件，
fact 是快照，不跟着动。

修复：改写第 20 行为「由 `~/.ghmirror-git` 决定（每日/边沿选优，非固定）」，
并追加更正段说明两个文件的分工与复验命令。

测试：表格行不再有旧说法；新句在；更正段在；`gitconfig base == ~/.ghmirror-git` 且 doc 写出该实际值（4 处）。

**判据升级：这类「配置类 fact」不该硬编码值，应指向真相文件（`~/.ghmirror-git`），否则必然漂移。**

---

## 第 3 项：skill 用量加权机制从未触发  [已解决 · 端到端验证]

现象：`skill-search.mjs` 里常量与公式齐全（`RECENCY_HALF_LIFE_DAYS=14`、`USAGE_WEIGHT=0.6`、
`frequency + Math.exp(-ageDays/14)`），但账本 `~/.dsh/storages/skill-usage.json` 不存在。

原因：**重启后只有 `skill_search` 调用、`skill_load` 0 次** -> 记账发生在 skill_load 里 -> 账本必然为空。

（我第一版判据用 `grep skill_load` 扫原始会话，命中的其实是**工具登记帧**而非调用，报了个假阳性；
改成解析 `type == tool/call` 才看准。）

修复（真跑触发）：
1. `--patch` 叠加层把 `skill-search.mjs` 挂进 headless profile
2. 跑一次性 headless 任务：pwsh echo -> `skill_search({"query":"pdf"})` -> `skill_load(<exact>)`
3. 结果：**账本生成** `{"version":1,"skills":{"pdf":{"loads":1,...}}}`

加权是否真影响排序（隔离 A/B，mock 两个技能名都含 pdf、`match` 完全相同）：

| | 顺序 |
|---|---|
| A 无账本 | `alpha-pdf` -> `zeta-pdf`（纯按名字） |
| B `zeta-pdf` 有 1 次 load | **`zeta-pdf` 跳到第一**，并显示 `[1x, today]` |

唯一变量是 usage -> **加权可证生效**。
测试脚本留档：`~/.dsh/storages/tools/skill-weight-test.mjs`
（用 `DSH_SKILL_USAGE` 指向临时账本，不污染真账本）。

---

## 第 4 项：3080 开机自启的冷启动路径  [已解决]

之前只验了「幂等分支」（端口已占 -> 秒退），**冷启动分支**两次被打断没验完。

用 3089 端口跑同一份脚本的副本（不碰 3080）：

| 判据 | 结果 |
|---|---|
| `-Mode Serve` 自行返回 | **5.45s**（修复前会挂到超时）PASS |
| 脱离后进程存活 | 3089 LISTENING（PID 95648）PASS |
| 带 token 的 URL 已存档 | 写入 `dsh-web-3089.out.log` PASS |
| boot 日志错误行数 | **0** PASS |
| 3080 未被波及 | 仍 PID 52540 PASS |

**为什么修复前会挂**：`UseShellExecute=$false` 让子进程**继承调用方的 stdout 句柄**；
dsh 长期存活 -> 管道永不关闭 -> 调用方等不到 EOF -> 看起来「卡死」。
改用 `UseShellExecute=$true`（系统新建进程、不继承句柄）+ Serve 模式不做长轮询后，5.45s 返回。

> 这个「卡死」和子 agent 卡死是**同一个失效模式在传导**：
> agent 内部也调 bash，一旦子进程挂住管道，agent 就挂住。

---

## 本轮产物

- 备份脚本：vendored 副本已同步（git 显示 `M reasonix-ops/backup-to-github.ps1`）
- 记忆：`github-加速体系与镜像自动选优-20260927` rev 2（含更正段与复验命令）
- 账本：`~/.dsh/storages/skill-usage.json` 首次生成
- 脚本：`~/.dsh/launch-dsh.ps1`（v3，双模式 + `UseShellExecute=$true`）
- 测试件：`~/.dsh/storages/tools/skill-weight-test.mjs`

## 元教训（这轮最值钱的）

1. **判据写错会伪装成产品缺陷。** 4 项里有 3 项我第一次测出的 FAIL 是判据本身错
   （grep 转义 / sed 后缀 / 工具登记帧 vs 调用）。**测试失败先怀疑测试。**
2. **「配置类 fact」必须指向真相文件，不要硬编码值。** 硬编码的值会被自动化改掉，然后文档就成了错的。
3. **同一个失效模式会跨层传导。** shell 管道继承 -> bash 挂 -> agent 挂 -> workflow 被取消。修最底层那一处。

---

## 验收脚本（可重复运行，这是判据的唯一来源）

```
bash ~/.dsh/storages/tools/verify-4-fixes.sh
```

只读、不改动任何东西，退出码 0 = 全通过。覆盖 19 条判据：

| 组 | 判据 |
|---|---|
| ① 副本 | 两份真实副本字节一致；`user_`/`ls-files`/`PRIVATE KEY`/`goat-gateway` 四处标记相等；junction 确认 |
| ② fact | `gitconfig base == ~/.ghmirror-git`；表格行不再硬编码；已指向真相文件；更正段在；写出实际值 |
| ③ 加权 | 账本有条目；无账本 `alpha-pdf` 第一；有 1 次 load 时 `zeta-pdf` 升第一 |
| ④ 自启 | 任务 Ready；触发器 = `MSFT_TaskLogonTrigger`；`MultipleInstances=IgnoreNew`；桌面 lnk 在；幂等分支 < 25s 返回 |

**最后实测：PASS=19 FAIL=0 EXIT=0（2026-09-27）。**

### 第一次跑出 2 个 FAIL —— 又是判据的错
`账本存在但为空` 和 `加权未生效` 两条假 FAIL，根因是**我把 Git Bash 的 `/c/...` 路径喂给了 Windows 版 Python/Node**，
它们解析不了 → 异常被 `|| echo 0` 吞掉 → 看起来像产品缺陷。
修法：脚本里加 `winpath(){ sed 's|^/c/|C:/|'; }`，凡是要交给 python/node 的路径都过一遍。

> **这已经是同一天里第 4 次「判据写错伪装成产品缺陷」。**
> 前三次：grep 花括号转义、sed 漏掉 `.insteadof` 后缀、把工具登记帧当成调用。
> **铁律：测试红了，先证明测试是对的，再去改被测的东西。**

