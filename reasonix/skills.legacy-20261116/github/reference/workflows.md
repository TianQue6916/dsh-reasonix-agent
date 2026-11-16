# 命令全集（verbatim，Windows Git Bash 实测）

`GH=~/.dsh/skills/github/scripts/gh.sh` · 全部命令在 `C:\Users\27063` 下执行过或已验证语法。

## 0. 三条通道各自的正确写法

```bash
# A. SSH（默认，推荐）——~/.ssh/config 已把 github.com 指向 ssh.github.com:443
git clone git@github.com:TianQue6916/inbox.git
git -C repo push origin HEAD

# B. HTTPS + PAT（只用于 API，不用于 push）
TOK=$(bash $GH tok)
curl -s -H "Authorization: Bearer $TOK" https://api.github.com/user/repos?per_page=100

# C. 镜像（公开仓 clone / release / raw；不带凭据）
bash $GH mirror <owner>/<repo> [dir] --depth 1            # 不依赖 insteadOf，显式拼完整镜像 URL
bash $GH mirror <owner>/<repo> --host ghfast.top          # 换镜像
curl -L -O https://gh-proxy.com/https://github.com/<owner>/<repo>/releases/download/<tag>/<file>
```
> 实测：`git -c 'url.…insteadOf='` **不能**临时取消已有规则（空值只是追加空规则，原规则仍生效）。要绕开全局配置用 `GIT_CONFIG_GLOBAL=/dev/null`（实测可行，但本站网络下 git-https 直连常被 `Connection was reset`，所以第三方仓优先 SSH）。

镜像域名可用性（2026-11-02 用 `curl .../info/refs?service=git-upload-pack` 逐个实测，只列 smart-http 真能用的）：

| 镜像 | 实测 | 备注 |
|---|---|---|
| `gh-proxy.com` | **200，ls-remote 正常出 refs** | 当前白名单默认镜像 |
| `ghfast.top` | **200，ls-remote 正常** | 备选，已同步禁用 credential helper |
| `hub.glowp.xyz` | 200 | 备选 |
| `fastgit.cc` | 200 | 备选 |
| `ghproxy.cxkpro.top` / `gh.idayer.com` | **429** | 限流，别用 |
| `gh.xxooo.cf` | 连不上（000） | 作废 |
| `gitproxy.mrhjx.cn` | **429** | 原全站 insteadOf 的目标，已废弃 |

`.gitconfig` 已对上述域名预置 `proxy=""`（绕过本地代理直连）。**用镜像时永远不带凭据**：白名单 host 的 `credential.helper` 已置空，`git credential fill` 会直接失败而不是弹窗。

## 1. 新建仓库并首推（三步，全自动）

```bash
bash $GH newrepo my-proj --private --desc "一句话" --push-from ~/projects/my-proj
# 等价手工版：
TOK=$(bash $GH tok)
curl -s -X POST -H "Authorization: Bearer $TOK" -H 'Accept: application/vnd.github+json' \
  -d '{"name":"my-proj","private":true,"description":"一句话"}' https://api.github.com/user/repos
cd ~/projects/my-proj && git init -q && git add -A && git commit -m "init"
git remote add origin git@github.com:TianQue6916/my-proj.git && git push -u origin HEAD
```
> 默认分支：API 建仓后首次 push 的分支名即默认分支（GitHub 会用 `init.defaultBranch` 或首个 push）。本机已有仓 master/main 混杂，见 `repos.md` 末节。

## 2. 已有本地仓库挂远端（本机 4 个仓当前没有 origin）

```bash
cd ~/fluxscope
git remote add origin git@github.com:TianQue6916/fluxscope.git
git branch -M main            # 统一到 main（若要保留 master 就别跑这行）
git push -u origin main
```

## 3. 仓库元信息（只改元数据，不动代码）

```bash
bash $GH api GET   /repos/TianQue6916/inbox
bash $GH api PATCH /repos/TianQue6916/inbox '{"description":"每日流水","homepage":"","topics":["daily","journal"]}'
bash $GH api PATCH /repos/TianQue6916/inbox '{"private":true}'        # 转私有（public→private 会丢 star/watch）
bash $GH api PATCH /repos/TianQue6916/inbox '{"archived":true}'       # 归档：只读
bash $GH api PATCH /repos/TianQue6916/inbox '{"has_issues":false,"has_wiki":false}'
bash $GH api DELETE /repos/TianQue6916/desktop-tutorial                # 删除，需 delete_repo scope
```
> `gho_` 这两把 token 都没有 `delete_repo` → 删仓会 403。要么在网页删，要么新签发一个带 `delete_repo` 的 classic PAT。

## 4. 批量操作模板（python + curl，不走 urllib —— 本机 python 的 CA bundle 缺 AKI 扩展会 SSLCertVerificationError）

```bash
TOK=$(bash $GH tok)
# 4.1 列出全部仓 → TSV
curl -s -H "Authorization: Bearer $TOK" \
 "https://api.github.com/user/repos?per_page=100&affiliation=owner" \
 | python -c "import json,sys;[print(r['name'],r['private'],r['size'],r['pushed_at'][:10]) for r in json.load(sys.stdin)]"

# 4.2 批量给学习资料仓加 topics
for R in Information-Theory Computer-Networking-CS144 Introduction-to-Probability-6.041; do
  curl -s -o /dev/null -w "$R %{http_code}\n" -X PUT \
   -H "Authorization: Bearer $TOK" -H 'Accept: application/vnd.github+json' \
   -d '{"names":["course-notes","bilingual","mit"]}' \
   "https://api.github.com/repos/TianQue6916/$R/topics"
done

# 4.3 批量 clone（跳过超大仓）
mkdir -p ~/repos && cd ~/repos
for R in inbox diary tool-box Structured-Pseudocode-mind-language; do
  [ -d "$R" ] || git clone --depth 1 git@github.com:TianQue6916/$R.git
done
```

## 5. 大仓库策略（本机 3 个仓 >70 MB）

```bash
# 只看最新一版（最省）
git clone --depth 1 git@github.com:TianQue6916/Information-Theory.git

# 要历史但不要 blob（partial clone，按需拉）
git clone --filter=blob:none --no-checkout git@github.com:TianQue6916/Information-Theory.git
cd Information-Theory
git sparse-checkout init --cone
git sparse-checkout set notes/      # 只检出 notes/ 目录
git checkout main

# 已 clone 的仓转浅克隆
git fetch --depth 1 origin && git reset --hard origin/main && git gc --prune=now
```

## 6. LFS（>50 MB 单文件；本机 git-lfs 已在 `filter.lfs` 配好）

```bash
git lfs install                       # 每机器一次
git lfs track "*.pdf" "*.zip" ".gitattributes"  # 生成/更新 .gitattributes 必须一起提交
git add .gitattributes && git commit -m "chore: track lfs"
# 若不慎已提交大文件：先 git lfs migrate import --include="*.pdf" --everything
```
> GitHub 免费额度：LFS 1 GB 存储 + 1 GB/月流量；超出会被拒。`.dsh` 备份仓的 44 MB 打包体积走 LFS 不划算，靠 gc 更省。

## 7. 瘦身（`.dsh` 已做过一次：546 MB → 46 MB / size-pack 44.89 MiB）

```bash
git gc --aggressive --prune=now
git count-objects -vH                 # 看 size-pack
du -sh .git
# 要真删历史里的大文件（独立克隆后操作，别在原仓直接跑）
git filter-repo --path-glob '*.pdf' --invert-paths --force
git push --force-with-lease origin main
```
> `--force-with-lease` 而不是 `--force`：远端被别人推过时会拒绝，避免覆盖。

## 8. 双机同步（Windows ↔ 天阙 Linux，`~/.ssh/config` 已配 tianque / tianque-lan）

```bash
ssh tianque 'cd ~/dsh-reasonix-agent && git pull --ff-only'
# 反向：Windows 上 push 后，Linux 机只做 pull；绝不在两边同时改同一分支
```
> 同一把 `id_ed25519` 服务 GitHub 与天阙机（见 `auth.md` 第 3 节的风险提示）。

## 9. 其它常用 API（用 `bash $GH api` 直接打）

| 目的 | METHOD PATH |
|---|---|
| 我自己 | `GET /user` |
| 速率余量 | `GET /rate_limit` |
| 某仓最近提交 | `GET /repos/TianQue6916/<repo>/commits?per_page=5` |
| 某仓分支 | `GET /repos/TianQue6916/<repo>/branches` |
| 某仓 release | `GET /repos/TianQue6916/<repo>/releases` |
| 建 issue | `POST /repos/TianQue6916/<repo>/issues` `{"title":"x","body":"y"}` |
| 我的 SSH key | `GET /user/keys` |
| 我的授权 App | `GET /user/installations` |
