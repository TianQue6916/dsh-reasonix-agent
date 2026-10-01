---
id: mem-8f89d415dc1b71309287a6608ca32b07
revision: 1
created_at: "2026-10-01T08:00:37.954Z"
updated_at: "2026-10-01T08:00:37.954Z"
name: dual-machine-sync-convergence-pitfalls-20261001
description: "双机同步收敛的三个坑：冲突副本会累积故 head -1 会取到陈旧副本；收敛要跑两轮；胜出方要先备份"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 现象
双机同步里同一批文件反复产冲突：22 → 8 → 0 才收敛。中间我把 22 个冲突「让 Windows 胜出」时，
用 `ls X.conflict.win.*.bak | head -1` 取副本 —— **取到的是更早一轮的陈旧副本**，
于是把旧内容写成了 live 文件，下一轮又变成冲突。

## 关键事实
**冲突副本会累积，同一文件可以有多份**：
```
元规则-自动记忆规则.md.conflict.win.45c5b55c22.bak   (Sep 27, 1000 B, 旧)
元规则-自动记忆规则.md.conflict.win.464d7a73d3.bak   (Oct 1, 1114 B, 新)
```
`ls` 默认按名字排序，`head -1` 选到哪个纯属巧合，**与新旧无关**。

## 规则
1. 要取「对方最新版」时，**不要用 `head -1`**。要么按 mtime 取最新
   （`ls -t X.conflict.win.*.bak | head -1`），要么**直接从对方机器推当前 live 文件**（更可靠）。
2. 收敛判定要跑**两轮**：第一轮消除冲突，第二轮确认 `冲突 0`。
   只跑一轮会把「挑错副本」误判成已收敛。
3. 每次「让某一侧胜出」都要先备份另一侧（本例落在
   `~/.reasonix/memory/global/_bak-pre-winwins-<ts>/`），否则归一不可回滚。

## 收敛结果（可复用的验收数字）
```
上传 3 / 下载 3 / 冲突 0 / 相同 564   用时 4.8s
fact 数 Windows 235 = Linux 235
MEMORY.md 双机 md5 一致
```

## 另一条同源教训
`sync_dsh.py` 的冲突判定是 **size 比较**（`lsize == wsize → 视为相同`），
所以**等长的不同内容永远不会被判定为冲突**，也就永远不会同步 —— 这与
`dsh-dual-machine-sync-migration` 里记的「size 相同即视为相同」是同一个坑的两面。
