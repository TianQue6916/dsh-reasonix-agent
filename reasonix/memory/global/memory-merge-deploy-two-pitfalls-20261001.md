---
id: mem-1b8afcfc8d7d2263c7495f4ea8e0aafd
revision: 1
created_at: "2026-10-01T06:26:02.370Z"
updated_at: "2026-10-01T06:26:02.370Z"
name: memory-merge-deploy-two-pitfalls-20261001
description: "记忆归一部署时踩的两个坑：字符/字节单位不一致导致守卫误判；用 staging 快照覆盖线上会吞掉之后的新增"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 坑 1：字符数 vs 字节数的守卫会误判（2026-10-01 实操踩到）

我写了个部署守卫「产物不小于原文件的 95% 才允许写入」：

```python
new_txt = open(src, encoding='utf-8').read()   # str
old = os.path.getsize(dst)                     # bytes
if len(new_txt) < old * 0.9: 拒绝写入          # ⛔ 单位不一致
```

中文 memory fact 里 1 字符 ≈ 1.5–1.8 字节，于是**完好的产物被误判成"缩水"**：
`02` 实测 4418 字符 / **6434 字节**，对比原文件 6440 字节 → 守卫直接拒绝，14 份里拒了 10 份。
更糟的是我据此得出「`--apply` 把产物写坏了」的错误结论，差点回滚一批没问题的文件。

**规则：任何体积/阈值比较，两侧必须同为 bytes 或同为 chars。
比文件大小用 `os.path.getsize()` / `wc -c`；比文本长度才用 `len(str)` / `wc -m`。**

## 坑 2：用 staging 快照覆盖线上文件会吞掉快照之后的更新

workflow 的 merge 是「读 win/lin → 产 merged」，快照发生在 14:07 左右；而
**并发 session 与我自己后续的 `memory_remember` 都会往同一个索引里追加条目**。
14:25 我把 merged 部署回线上时，`MEMORY.md` 从 **21476 B 掉到 20735 B** ——
被吞掉的是快照之后新增的 3 条索引 + 1 条被替换成旧版的描述：

- `dsh-web-search-三源聚合最终形态`
- `dsh-bash-windows-禁find全盘与session事件流zstd`
- `skills-memory-junction-topology-both-machines-20261001`
- `dual-machine-sync-channels-and-conflict-semantics`（描述从「+ skills 结构治本（含两个并发 actor 的事故…）」退回旧短版）

**体积守卫救不了**：差 739 B ≈ 3.5%，低于 95% 阈值。

**正确做法（已实施并复验为 0 丢失）**：
1. 部署前先把**当前线上文件**完整备份到一个独立目录（不是从 staging 拿旧快照）；
2. 部署后做「**备份独有非空行**」检查（`备份行 - 部署后行` 应为空），而不是只看体积；
3. 发现丢失就按 key 逐条补回（替换描述用更丰富的那版、缺的条目插回原段落），
   再复验到 0。

## 复用的检查片段（值得常备）

```python
bl = [x.strip() for x in open(backup, encoding='utf-8').read().split('\n') if x.strip()]
dl = set(x.strip() for x in open(live,   encoding='utf-8').read().split('\n') if x.strip())
lost = [x for x in bl if x not in dl]      # 必须为空才算部署干净
```

注意它会**故意报出** `revision:` / `updated_at:` / 旧 `description:` 这类被有意 bump/替换的行，
以及 heading 降级导致的标题行差异 —— 这些要按语义判定，不是自动一律补回。
