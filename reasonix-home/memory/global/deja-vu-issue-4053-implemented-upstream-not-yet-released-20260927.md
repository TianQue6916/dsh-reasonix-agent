---
id: mem-35e0a0066d6f85a416da2437006d6719
revision: 1
created_at: "2026-09-27T07:31:29.405Z"
updated_at: "2026-09-27T07:31:29.407Z"
name: deja-vu-issue-4053-implemented-upstream-not-yet-released-20260927
description: "deja-vu issue #4053 被维护者直接实现并合入（aa900c96 + f9af3803 引用 #4053/#4067 后关闭，0 评论）：新增 internal/sources/reasonix.go +489 等 167->217 文件，Reasonix 成为一等支持的 store 并接上 MCP/skill/sidecar 扩展；但尚未发版（release v0.21.2 / nightly ddda1c05 均早于该提交，npm latest 仍是 0.21.2），本机暂用 DEJA_COMMANDCODE_ROOT 绕行"
metadata:
  type: user
  fact_type: reference
  scope: global
---


# deja-vu issue #4053 已被上游实现并合入（未发版）—— 2026-09-27

## 结果：不是「收到回复」，是上游把它实现了

我 2026-09-26 提的 vshulcz/deja-vu#4053（harness: Reasonix — flat role/content JSONL in a flat sessions/ store），
维护者 vshulcz 自己写代码关掉了，**0 条评论、直接出 commit**：

| commit | 时间 (UTC) | 说明 |
|---|---|---|
| aa900c96 | 2026-09-26T21:08:40Z | feat: read Reasonix's session store (#4053) |
| f9af3803 | 2026-09-27T07:09:13Z | feat: Reasonix — read its stores, and wire MCP, skill and a sidecar extension (#4053) (#4067) ← 关闭它 |

判据（issue events API）：referenced -> referenced -> closed，actor 全是 vshulcz。

## 实现了什么

#4053 那次（167 文件）：
- internal/sources/reasonix.go  **+489（全新 source 实现）**
- internal/sources/reasonix_test.go +327
- cmd/deja/resume_reasonix_test.go +44
- docs/registry/reasonix.md +57 / .html +116（新文档页）
- cmd/deja/resume.go +16 / doctor.go +5 / harness_count.go +2

合并那次（#4067，217 文件），提交信息里的子项：
- feat: read Reasonix's session store (#4053)
- fix(reasonix): read the sidecar once per transcript, dedup legacy names case-insensitively on Windows
  ← 专门修了 Windows 上 legacy 名字大小写不敏感去重，对双机场景是实打实的必要修复
- docs: regenerate sitemap / feed

结论：不是「打个补丁能用」，是「Reasonix 成了一等支持的 store」，连 MCP / skill / sidecar extension 都接上了。

## 但现在还拿不到（关键，别误以为已生效）

| 渠道 | 状态 |
|---|---|
| GitHub Release 最新 | v0.21.2（2026-09-24）← 早于该 commit |
| nightly tag | 指向 ddda1c052795 = 2026-09-26T07:53:33Z ← 也早于 21:08 那次提交 |
| npm @vshulcz/deja-vu | latest = 0.21.2（本机装的就是它） |

所以本机 deja.exe 里没有这个功能。

用户可自行复验：
  npm view @vshulcz/deja-vu version --registry=https://registry.npmmirror.com
  若仍为 0.21.2 -> 上游还没发版
  查 nightly 指向： https://api.github.com/repos/vshulcz/deja-vu/git/ref/tags/nightly

## 在拿到新版之前的替代（本机已生效）
用 DEJA_COMMANDCODE_ROOT 把 reasonix 的 sessions 目录挂成 Command Code 的 ROOT
（用户级环境变量）—— 851 个 session 里 49 个来自 reasonix，能搜到。
这是临时绕行，上游发版后应改为原生路径、并撤掉这个环境变量。

## 元层面
提一个高质量 issue 是能改变工具的。这次从「我记录一个本地绕行方案」
变成「上游把它做成一等支持」——判据是 commit 引用了 issue 编号并关闭，
不是看有没有人回复评论。「被回应」不等于「有人回话」，可能直接是代码。

