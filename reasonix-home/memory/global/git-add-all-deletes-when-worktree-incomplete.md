---
id: mem-7fbe8dfa292f8c9fe8b2db303ee51857
revision: 1
created_at: "2026-10-25T19:37:14.839Z"
updated_at: "2026-10-25T19:37:14.839Z"
name: git-add-all-deletes-when-worktree-incomplete
description: "铁律：git add -A 在工作树不完整时等于删除指令；配套的存在性/内容断言与「push 成功≠内容在」判据"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 铁律：`git add -A` 的语义是「让 index 等于工作树」，工作树不完整时它就是一条删除指令

这是 2026-10-26 亲手踩出来的（代价：一次把远端 13 篇文档 + README 全删了，靠 C 盘副本才恢复）。

### 事故序列（可复现的形状）

1. 因为某目录写不进去（Low IL / 只读卷），文件是**用 GitHub Git Data API 直推远端 tree** 的 ⇒ **本地工作树从来没有这些文件**；
2. 后来做别的修复，执行 `git reset --mixed origin/master`；
3. 紧接着 `git add -A` —— 工作树里没有这些文件，git 就按**「删除」**暂存，commit 上去了，远端内容归零。

### 三条硬规则

1. **工作树可能不完整时，只用精确路径** `git add <path>` / `git add -u <path>`，不用 `-A` / `.`。
   会让工作树不完整的情形：API 直推、`--sparse` 稀疏检出、junctions/挂载缺失、其它进程正在改文件、`reset --mixed` 之后。
2. **commit 前做两类断言**，缺一都会假成功：
   - **存在性**（个数）：`git diff --cached --name-only | grep -c '^kb/'` == 期望值
   - **内容**（新鲜度）：`git show :<path> | grep -c '<本次新增的记号>'` ≥ 1
3. **commit/push 之后对每个关键文件再做一次内容断言**：`git show origin/master:<path> | grep -c '<记号>'`。
   因为 **「push 成功」≠「内容还在」** —— 作者实测遇到过 `commit` 成功、`push` 返回 `old..new  master -> master`，
   而 `git show HEAD:<path> | grep -c` 是 **0**（内容根本没进那个 commit，断言只数了文件个数没验内容）。
   ⇒ 校验查 **tree/内容**，不查退出码。

### 一句话记法

`git add -A` 是「同步」，不是「添加」。同步会把"缺"翻译成"删"。
