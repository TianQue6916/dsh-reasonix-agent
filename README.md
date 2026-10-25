# dsh-reasonix-agent

> **dsh agent harness + reasonix runtime** 的配置备份镜像与工程经验库。
> 一台 Windows 主力机（TianQue6916）+ 一台 Linux 副机，2026-06 → 2026-10 的长期运维沉淀。

本仓库由两个互不干扰的部分组成：

| 部分 | 目录 | 内容 | 维护方式 |
|---|---|---|---|
| **备份镜像** | `dsh/` `reasonix/` `reasonix-home/` `goat-gateway/` `agents/` `zcode-*/` `trae-*/` | 各 client 的配置、patch、storages、记忆语料、脚本 | 计划任务每日 **23:30** 自动 `robocopy` 同步 → 脱敏 → commit → push |
| **经验库 `kb/`** | `kb/` | 从 300+ 个 session 与 memory fact 里提炼出的工程定论、判据、反例 | 手工维护（agent 提炼 + 人 review） |

---

## 一、仓库改名记录（2026-10-26）

| 项 | 旧 | 新 |
|---|---|---|
| 仓库名 | `TianQue6916/reasonix` | `TianQue6916/dsh-reasonix-agent` |
| HTTPS | `github.com/TianQue6916/reasonix` | `github.com/TianQue6916/dsh-reasonix-agent` |
| SSH | `git@github.com:TianQue6916/reasonix.git` | `git@github.com:TianQue6916/dsh-reasonix-agent.git` |
| 默认分支 | `master` | `master`（未变） |

**改名动机**：原名 `reasonix` 只说明「这是哪个 client 的备份」，看不出内容。仓库实际装的是
**dsh agent harness 的配置与运维经验**，再加 reasonix runtime 的镜像 —— `dsh-reasonix-agent` 才贴切内容。

**兼容性（2026-10-26 实测）**：

- 旧 HTTPS URL → **301** 新 URL，浏览器打开与 `git clone` 旧地址仍然可用；
- 旧 SSH 地址仍能 `ls-remote` / push（GitHub 保留 redirect）；
- 但 **redirect 不是契约**：旧名一旦被他人注册就会失效，且部分工具不跟随 SSH redirect。所以按下表同步。

**改名后必须同步的位置（漏一处 = 下一次静默断链）**：

| # | 位置 | 现状 |
|---|---|---|
| 1 | `backup-to-github.ps1` 的 `$RepoUrl`（第 31 行）与头部注释（第 4 行） | ✅ 已改（2026-10-26，脚本内注记为 v3） |
| 2 | 本地检出 `repo/` 的 `git remote set-url origin` | ✅ 已改（origin → 新名） |
| 3 | `reasonix/memory/global/*.md` 中提到旧 URL 的 fact | 历史记录，保留原样（它们是当时的事实） |

---

### ✅ 改名时发现的两条活故障，已在本轮修复（2026-10-26）

1. **备份线断链 3 天 → 已修**：`2026-10-25 23:33` 的 push 被 GitHub 以 **GH001（文件过大）** 拒绝，
   元凶是 `dsh/speech-to-text/sensevoice/models/sensevoice-onnx/model.int8.onnx`（**228.2 MB**），
   由 `f3fe6ba`（10-23 备份）引入 ⇒ 其后 3 个 commit 全部推不上去。
   修法：`git reset --mixed origin/master` 把 3 个未推 commit 压平成一个（等价内容、剔除大文件）；
   `*.onnx` / `*.tar.zst` 双写进 `.gitignore` 与脚本 `$XF`；另移出 50.9 MB 的 `dsh/.backup/*.tar.zst`。
   回滚点：tag `bak-pre-gh001-fix`（`ece7a51`）。
2. **改名同步 → 已修**：`$RepoUrl` 与 `origin` 都指向新名。
   原先改不了的硬原因：agent 的 bash tool 固定 **Low IL**，而 `D:`（`C:/Users/27063/Desktop` 是它的 junction）对它只读。
   解法是一次 UAC 的 `icacls <repo> /setintegritylevel (OI)(CI)Low /T`（**13992 个对象 / 12.8 s**），
   之后本机 agent 可直接维护本仓库。细节见 [`kb/09-windows-ops.md`](kb/09-windows-ops.md)。

## 二、备份镜像

| 项 | 值 |
|---|---|
| 脚本 | `C:\Users\27063\Desktop\工具箱\reasonix-ops\backup-to-github.ps1` |
| 计划任务 | `\ReasonixGitHubBackup`，每日 **23:30**，`StartWhenAvailable`（错过则尽快补跑） |
| 日志 | `%APPDATA%\reasonix\github-backup.log` |
| 退出码 | `2`=克隆失败　`3`=发现残留密钥（已中止，不推送）　`4`=commit 失败　`5`=push 失败 |
| 手动跑 | `powershell -NoProfile -ExecutionPolicy Bypass -File "<脚本>" [-DryRun] [-NoPush] [-Full]` |

**本仓库是 public，所以脱敏是硬前提**（见 [`kb/08-backup-and-git.md`](kb/08-backup-and-git.md)）：
两道校验（文本层 + **字节层全扫**），任一命中即 `exit 3` 不推送。历史上有过两次凭据入库、
被迫用 `filter-repo` 重写并 force push 的事故 —— 所以规则是 **配置可以公开，凭据永不上传**。

---

## 三、经验库 `kb/`

素材：`~/.reasonix/memory/global/` 下 **312 条 fact**（canonical 记忆语料）
\+ `~/.dsh/PLAN.md`（1473 行工程作战记录，2026-09-28 → 10-26）。

导航见 [`kb/00-index.md`](kb/00-index.md)。每篇结构固定：

```
D 定论  —— 一句话结论，先给答案
M 机制  —— 为什么会这样（第一性原理层）
J 判据  —— 怎么判断「这次也是它」，可复现的观测
X 反例  —— 试过并已否证的路径，勿重复
R 复现  —— 命令 / 步骤
S 溯源  —— 结论对应的 fact 文件名
```

---

## 四、铁律

1. **public + 脱敏**：`*.env` / `*token` / `keys.json` / 私钥 / 会话原文一律不入库（`.gitignore` 已拦）。
2. **经验必须可追溯**：`kb/` 每条结论都要能指回具体 fact 或 PLAN 段落，不写「据说」。
3. **否证与结论同权重**：`X 反例` 段不是附录 —— 踩过的坑写下来，才不用第二次花三小时。
4. **术语不翻译**：patch / profile / preset / session / token / cache / sandbox 保留英文原词。
