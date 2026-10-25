---
id: mem-06b360b99d9f0b99815ecd7ae879d129
revision: 1
created_at: "2026-10-25T19:45:53.539Z"
updated_at: "2026-10-25T19:45:53.539Z"
name: mnemon-dedupe-by-title-and-cli-batch
description: "mnemon 记忆库去重实战：按标题分组择优保留（最长优先）+ CLI 批量软删，含两个必踩的写法坑"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 症状

`mnemon` 库里的 recall 结果位被同一来源的碎片占满：2026-10-26 实测 **441 条存活 insight 里，51 组同标题、涉及 158 条（36%）**，最大两组是 `discrete-math ×22`、`advanced-math ×18`（同一课程会话被切成多段入库）。
每段 recall 只给 6 个结果位 ⇒ 一问相关话题就被同源碎片吃满。

## 关键认知：**完全同内容的重复 = 0**，所以"去重"不能靠 md5

这 158 条的正文各不相同（182 B → 5052 B 都有）。它们是**同源多版本/多片段**，不是复制粘贴。
⇒ 判据必须按 `content` 首行标题分组，然后**组内择优**，而不是查重复内容。

## 诊断 SQL（只读，别直连写 db）

```python
rows = c.execute("select id,content,length(content),updated_at from insights where deleted_at is null")
by[content.split('\n',1)[0].strip()].append(row)   # 按标题分组
dup = {k:v for k,v in by.items() if len(v)>1}
```

## 处置（B 方案，2026-10-26 实测有效）

1. **每组保留内容最长的一条**（并列取 `updated_at` 最新）—— 抢救"信息量"而非"时间"，短碎片往往是被截断的部分；
2. 其余用 **`mnemon forget <id>`** 软删（CLI 自带；只写 `insights.deleted_at`，内容保留、查询排除、可回滚）；
3. 结果：441 → **335 条存活，唯一标题 335，重复组 0**；`recall "离散数学 Chernoff Bound"` 从 22 条碎片变成**只返回 1 条最完整版**。

## ★ 批量执行的两个坑（都实测过）

1. **`if timeout 20 mnemon forget "$id" >/dev/null 2>&1; then` 在 `while read` 循环里会 100% 失败**（60/60、106/106 全 rc≠0），而同样命令改成
   `out=$(timeout 20 mnemon forget "$id" 2>&1); rc=$?` 就 102/105 成功。**原因未确证**（已排除：行尾 `\r`、文件编码、db 锁、单条耗时 362 ms）。
   ⇒ 批量调 CLI 时固定用「赋值捕获 + `rc=$?`」这一种写法，别用 `if <cmd> >/dev/null`。
2. **`rc=1` 的真实语义是"已删过"（幂等）**，不是失败。105 条里 3 条 rc=1，正是先前已删的那 3 条。⇒ 判据要看 db（`deleted_at is null` 计数），不要看退出码。

## 根因（未确证，需单独查）

疑似 `dsh-mnemon-strategy-auto-capture` 把同一会话按轮次切段入库。**只清理不修根因会复发** —— 下次出现时先确认捕获策略，再决定是否限制单会话最多入库 N 段。
