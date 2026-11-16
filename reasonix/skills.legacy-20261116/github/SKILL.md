---
name: github
description: GitHub 全栈操作 —— clone / push / 建仓 / 改仓库信息（description, topics, visibility, archive, delete）/ 列仓库 / 取用与轮换凭据；内置本机（TianQue6916）18 个仓库清单、三条传输通道决策（SSH:443 / HTTPS+PAT / gh-proxy 只读镜像）、凭据拓扑与已踩过的坑（insteadOf 改写泄露 PAT、22 端口被封、GCM 交互挂住、巨仓库瘦身）
whenToUse: 需要 clone / pull / push GitHub 仓库、查询或修改仓库元信息、新建或删除仓库、排查传输失败（429 / timeout / 认证失败）、取用或轮换 PAT 与 SSH key 时
---

# GitHub 操作台（TianQue6916 / 本机 Windows · Git Bash）

## 0. 先跑自检（30 秒，别跳过）

```bash
bash ~/.dsh/skills/github/scripts/gh.sh doctor
```
它会依次打印：git 版本、SSH 到 github.com 是否通（走 443）、token 是否取得到（只打印长度与前缀，不打印值）、API 速率余量。
**任何一步红，先看第 5 节诊断树，不要盲试 push。**

## 1. 身份与三条通道（决策表）

| 通道 | 何时用 | 为什么 |
|---|---|---|
| **SSH（`ssh.github.com:443`）** | 默认。clone / push 私有与公开仓库都用它 | 22 端口在大陆常被封，443 已验证可用（`ssh -T git@github.com` → `Hi TianQue6916!`）；不吃 PAT、不受 `insteadOf` 影响 |
| **HTTPS + PAT** | 需要 API 操作（建仓 / 改信息 / 删仓）、或 CI 场景 | API 只能走 https + token；但 **git 的 https 操作在本机会被 `insteadOf` 改写到第三方 proxy**（见第 6 节），不要用它推私有内容 |
| **gh-proxy 镜像（只读）** | 拉公开大仓库、下 release / raw 文件，SSH 慢时 | `bash gh.sh mirror <owner>/<repo>` 显式拼镜像 URL，不依赖 insteadOf；`insteadOf` 白名单只覆盖 6 个常用 owner。只读，绝不带凭据 |

身份常量：`login = TianQue6916`，`email = 2706352190@qq.com`，`name = TianQue6916`。
仓库地址统一用 SSH：`git@github.com:TianQue6916/<repo>.git`。

## 2. 取 token（不落盘、不进上下文）

```bash
bash ~/.dsh/skills/github/scripts/gh.sh tok          # 打印 token（慎用，会进 stdout）
bash ~/.dsh/skills/github/scripts/gh.sh api GET /user # 内部取用，永不打印 token
```

取用顺序（脚本已实现）：
1. **Windows Credential Manager**（GCM）：`printf 'protocol=https\nhost=github.com\n\n' | git credential fill` → `password=` 即 PAT（length 40，classic `ghp_`）。
   Target 两个：`LegacyGeneric:target=git:https://github.com`（user `TianQue6916`）、`GitHub - https://api.github.com/TianQue6916`。
2. 回退：`~/.dsh/.credentials.yaml` → `dsh-mnemon/github` → `payload.accessToken`（length 40，scopes `repo`）。
3. GCM 弹窗会卡住非交互 shell —— `git credential fill` 若超过 10 s 无输出，改用第 2 条来源。

**当前 token scopes = `gist, repo, workflow`**（2026-11-02 实测）。够建仓 / 改仓 / 触发 workflow；**不够**改 org、不够 `admin:public_key`（自动加 SSH deploy key 需要）。

## 3. 高频任务 → 命令

```bash
GH=~/.dsh/skills/github/scripts/gh.sh

# 克隆（默认 SSH，自动选本地目录 ~/repos/<repo>）
bash $GH clone inbox                       # 私有仓也走 SSH
bash $GH clone Information-Theory --depth 1 # 655 MB 级仓库必加 --depth 1

# 已有本地目录 → 新建远端仓 → 首推
bash $GH newrepo my-proj --private --desc "一句话描述" --push-from ~/projects/my-proj

# 列仓库（名称/可见性/语言/大小）
bash $GH repos

# 查 / 改仓库元信息
bash $GH api GET  /repos/TianQue6916/inbox
bash $GH api PATCH /repos/TianQue6916/inbox '{"description":"新描述","topics":["daily"]}'
bash $GH api PATCH /repos/TianQue6916/inbox '{"archived":true}'   # 归档（只读化）
bash $GH api DELETE /repos/TianQue6916/inbox                       # 删除（不可逆，先确认）

# 推送到已有仓（在仓库目录内）
git add -A && git commit -m "..." && git push origin HEAD
```

## 4. 上传前必查的三件事

1. **有没有 secret 混进去**：`git diff --cached | grep -Ei 'ghp_|github_pat_|BEGIN (RSA|OPENSSH) PRIVATE|password\s*='`
   本机 `~/.dsh` 自身就是 git 仓库且 `skills/` 被跟踪 → **skill 里永远只写「怎么取 token」，绝不写 token 值**。
2. **大文件**：`git ls-files -s | awk '$4>1000000'`。>50 MB 用 Git LFS（`git lfs track "*.pdf"`，本机已装 git-lfs），>100 MB 会被 GitHub 直接拒收。
3. **推送目标对不对**：`git remote -v`。本机只有 `~/dsh-reasonix-agent-reading` 有 origin；其余本地 repo（`.dsh`、`journal`、`fluxscope`、`projects/gugong`）**没有 origin**，push 前要先 `newrepo`。

## 5. 传输失败诊断树

| 症状 | 判定 | 处置 |
|---|---|---|
| `ssh: connect to host github.com port 22` | 22 被墙 | 换 `ssh.github.com:443`（`~/.ssh/config` 已配好 `Host github.com / Port 443`，确认没被别的 config 覆盖） |
| `429` / `Connection was reset` + URL 里出现镜像域名 | 命中 `insteadOf` 白名单，镜像限流 | 换镜像 host：`bash gh.sh mirror <owner>/<repo> --host ghfast.top`；**不要**用 `git -c 'url….insteadOf='`（空值不会清除已有规则，实测无效） |
| `could not read Username` / `terminal prompts disabled` | GCM 拿不到凭据 | 用 SSH；或 `gh.sh api` 走 PAT |
| `fatal: Authentication failed` 但 SSH 正常 | PAT 过期或 scopes 不足 | 重新 `gh auth` 流程，或换回 SSH |
| `remote: error: GH001: Large files detected` | 单文件 >100 MB | 从历史里剔除（`git filter-repo`），或转 LFS 后重写 |
| `RPC failed; HTTP 429 / curl 56` | 镜像限流 | 换镜像域名，或直接 SSH |

## 6. 已知的坑（本机实测，别重踩）

1. **`insteadOf` 已收窄（2026-11-02 用户选「方案 B」并落地）**

   原来那条 `[url "https://gitproxy.mrhjx.cn/https://github.com/"] insteadOf = https://github.com/` 是**全站**改写，已删除，换成 **6 条 owner 级只读白名单**；镜像同时换成 `gh-proxy.com`（mrhjx 实测 429 已废）：

   ```bash
   url.https://gh-proxy.com/https://github.com/<owner>/.insteadOf  =  https://github.com/<owner>/
   # owner: deepseek-ai / ggerganov / huggingface / meta-llama / pytorch / microsoft
   credential.https://gh-proxy.com.helper =      # 硬保险：该 host 禁用凭据，永不弹 GCM
   credential.https://ghfast.top.helper  =
   ```

   不变量（2026-11-02 实测，非推断）：
   - `TianQue6916/*` 与未列入白名单的 owner → **不重写**。`GIT_TRACE` 显示 `git-remote-https https://github.com/TianQue6916/inbox.git`，私有仓 `ls-remote` 正常返回 `refs/heads/main`（GCM 供凭据）。
   - 白名单 owner → 重写进 `gh-proxy.com`，`ls-remote` 正常出 refs；该 host 的 credential helper 为空 → `git credential fill` 直接 `fatal: could not read Username`，**镜像结构上拿不到 token**。
   - **效力修正**：旧说法「GCM 会往镜像请求塞 PAT」实测**不成立** —— `printf 'protocol=https\nhost=gitproxy.mrhjx.cn\n\n' | git credential fill` 返回空，GCM 按 host 精确匹配。真正的代价是**可用性**（429 让所有 https clone 直接失败）与**私有仓 URL 外泄**，收窄把两者一起解决。

   增删白名单 owner：
   ```bash
   git config --global "url.https://gh-proxy.com/https://github.com/<owner>/.insteadOf" "https://github.com/<owner>/"
   git config --global --remove-section "url.https://gh-proxy.com/https://github.com/<owner>/"
   ```
2. **`[http "\"https://gitee.com\""]` 是无效段名**：`.gitconfig` 里几处段名带转义引号（`"\"https://gitee.com\""`），git 不会匹配 → 那几条「禁用代理」实际没生效。写法应为 `[http "https://gitee.com"]`。
3. **全局代理**：`http.proxy = http://127.0.0.1:31180`、`https.proxy = http://127.0.0.1:31181`（本地代理客户端）。SSH 不吃这两个键，所以 SSH 是否通取决于代理软件的 TUN/规则，不是 gitconfig。
4. **`gh` CLI 未安装**（2026-11-02 实测 `which gh` 为空）。所有 GitHub 操作走 `git` + `curl` + PAT，本 skill 的 `gh.sh` 已封装。要装：`winget install GitHub.cli`。
5. **巨仓库**：`Information-Theory` 655 MB、`Computer-Systems-...` 154 MB、`Linear-Algebra-and-...` 74 MB —— clone 一律 `--depth 1`，必要时 `--filter=blob:none` + sparse-checkout。
6. **`.dsh` 瘦身经验**（2026-11-01 做过）：`.git` 546 MB → 46 MB，`size-pack 44.89 MiB`，手法是 `git gc --aggressive --prune=now` + 重打包后 `force push`。同一思路可复用到其它本地仓。
7. **Windows 写权限**：dsh 的 shell 在 Low IL，workspace 之外写不了是 integrity level 而非 ACL。往 `~/.dsh/skills/` 写没问题（已实测），往系统目录写要 `icacls ... /setintegritylevel "(OI)(CI)Low"`。

## 7. 仓库索引

18 个仓库（17 public + 1 private）的完整清单：`reference/repos.md`（名称 / 可见性 / 默认分支 / 语言 / 体积 / 最后推送 / 用途）。
凭据拓扑与轮换：`reference/auth.md`。命令全集与批量操作：`reference/workflows.md`。

## 8. 安全红线

- **secret 值永不写进任何被 git 跟踪的文件**（`~/.dsh/skills/**` 全部被跟踪，且该仓 push 到公开的 `dsh-reasonix-agent`）。
- 删除仓库、改 visibility、force push 前必须把具体命令与影响面告诉用户，等确认。
- 任何「把 token 贴到命令里」的写法用 `$(bash gh.sh tok)` 现取现用，不要 `export` 进持久 shell。
