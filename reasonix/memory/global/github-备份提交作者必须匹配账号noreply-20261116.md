---
id: mem-a04e09e40393c596edac4bd8cff50d9c
revision: 1
created_at: "2026-11-16T09:38:12.686Z"
updated_at: "2026-11-16T09:38:12.686Z"
name: github-备份提交作者必须匹配账号noreply-20261116
description: "GitHub 自动备份「推成功了但主页看不到记录」的根因：提交作者用 backup@reasonix.local 导致 API author=null、贡献图不计入；改用账号 noreply 邮箱修复"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 症状
自动备份跑得好、`git push` 也成功、仓库 Commits 页能看到 commit，**但个人主页的贡献图（绿格子）和 Activity 一条都没有**，用户三次反馈「GitHub 还是没有记录」。仓库是 public、默认分支 master、`pushed_at` 也是对的 —— 从仓库角度看一切正常。

## 根因
提交作者写成 `Reasonix Backup <backup@reasonix.local>`。这个 email 没有绑定任何 GitHub 账号，于是：
- 仓库 Commits 页：**显示**（作者名是一串不认识的名字）
- API 里 `commit.author`：`null`
- 个人主页贡献图 / Activity：**不显示**（GitHub 无法把 commit 归到某个账号）

验证一眼就能看：
```
curl -s https://api.github.com/repos/TianQue6916/dsh-reasonix-agent/commits/master | grep -E '"login"'
# 之前永远是 "author": null
```

## 修法（2026-11-16 已改）
`C:\Users\27063\Desktop\reasonix-ops\backup-to-github.ps1` 第 6 步的 `-c user.name/-c user.email` 换成账号的 noreply 邮箱：

```
git -C $RepoDir -c user.name='TianQue6916 (auto-backup)' \
    -c user.email='276356153+TianQue6916@users.noreply.github.com' commit -q -m $msg
```
`276356153` = TianQue6916 的 GitHub user id。改完新 commit 的 `author.login` 立刻变成 `TianQue6916`。
**历史 commit 不会追溯**（除非 rewrite history，不值得）。

## 通用规则
任何「以机器人身份提交但希望计入本人贡献图」的自动化，author email 必须是
`<user_id>+<login>@users.noreply.github.com`（或账号里已绑定的邮箱），不能用 `xxx@local` 这类自造域名。

## 相关
- 备份仓：`TianQue6916/dsh-reasonix-agent`（public，master），本地 `C:\Users\27063\Desktop\reasonix-ops\repo`
- 用户 GitHub：`TianQue6916`（id 276356153，公开名 TianQue，18 个 public repo）
- 本机全局 git 身份：`TianQue6916 <2706352190@qq.com>`
