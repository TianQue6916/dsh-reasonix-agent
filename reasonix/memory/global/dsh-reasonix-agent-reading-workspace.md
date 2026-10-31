---
id: mem-c1310cd559168054ab3467ac52d4a1a9
revision: 1
created_at: "2026-10-26T15:50:19.640Z"
updated_at: "2026-10-26T15:50:19.640Z"
name: dsh-reasonix-agent-reading-workspace
description: "dsh-reasonix-agent 阅读工作区位置、用法、加目录姿势与不重写历史的决定"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 工作区位置
`C:\Users\27063\dsh-reasonix-agent-reading`（**不是** `D:\Toolbox` —— 那是 High IL 写不进）
内含 `README-WORKSPACE.md` 记录全部背景与用法。

## 已有内容（262 文件 / 12 MB）
```
kb/            13 篇工程经验库（00-index.md 起）
agents/       198 个 skill
trae-cn/ 14   trae-solo/ 18   zcode-home/ 17
```
**不要试图全量 clone**：`dsh/` 19M、`reasonix/` 50M、`reasonix-home/` 8.7M 拉不动。

## 加目录的正确姿势
```bash
cd C:/Users/27063/dsh-reasonix-agent-reading
timeout 30 git sparse-checkout set kb agents <新目录>   # set 是【替换】不是累加！
timeout 110 git checkout
```
遇到 `sparse-checkout.lock` / `index.lock` 残留：`timeout 10 rm -f .git/info/sparse-checkout.lock .git/index.lock`
（`timeout` 杀掉一个 `git checkout` 必留这两个锁。）

## 仓库状态（2026-10-26）
- 远端 `git@github.com:TianQue6916/dsh-reasonix-agent`（旧名 reasonix，301 重定向）
- **push 可用**（小对象）；**clone 不可用**（blob 阶段必断）
- 已 push 一次剔除提交 `cb70ace`（1450 个重复/运行期文件：reasonix-home 与 reasonix 的 memory 369 个路径 100% 重复、skills 201/204 重复、三份历史备份、sessions/desktop-shell/stats）
- **但 `.git` 体积没变**——`git rm` 只改新 commit 的 tree，历史 blob 全在

## 不做的决定
**不走 `git filter-repo` 重写历史**。原因：即使本地 rewrite + force push，**GitHub 端还要联系 Support 做 GC** 才会真正释放空间（社区案例 falkcorp/audiobook-organizer 记录过）；代价是历史 hash 全改、不可逆、可能损坏仓库。收益不抵风险。

## 三个 git 的现状
| git | 状态 |
|---|---|
| Windows `~/.dsh` | auto commit 约 40 分钟一次，无 remote |
| Linux `~/.dsh` | 2026-10-26 新建，cron `20 * * * *`（`storages/tools/dsh_autocommit.sh`） |
| GitHub 仓库 | push 可以，clone 不行 |
