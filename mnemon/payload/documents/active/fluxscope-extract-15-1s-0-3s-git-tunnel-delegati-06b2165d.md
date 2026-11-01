---
id: "06b2165d-4459-4fc5-808b-8e5e84b69d37"
title: "fluxscope：extract 增量缓存 15.1s→0.3s、git 安全网与 tunnel 按 delegation depth 分环（2026-11-01）"
description: "fluxscope 一次提交的三项落地记录：extract_agents.py 由全量重解改为 (size,mtime) 缓存的纯函数 parse_file 且合并算子可交换可结合、等价性验证口径；首次 git 入库与 .gitignore 边界；隧道环按 depth 分 bucket（主会话外环 / subagent 内环）以及 bucket 成员资格该按语义而非流量的反面教训。承接 doc 9996766a。"
status: "active"
created_at: "2026-10-31T17:47:40.177Z"
updated_at: "2026-10-31T17:47:40.177Z"
content_hash: "b26a4964c617f691aca00570d8099d25567c5951b6306bc4d0bfcb5cc6a8f54c"
source_paths:
  - "fluxscope/index.html"
  - "fluxscope/server.mjs"
  - "fluxscope/extract_agents.py"
  - "fluxscope/watch_flow.py"
  - "fluxscope/convo.py"
  - "fluxscope/sysprobe.ps1"
session_ids:
  - "5d88d85d-7433-4a59-888d-bc47cc6c178d"
memory_body_ids:
  []
---

# fluxscope：extract 提速、git 安全网、tunnel 分环（2026-11-01）

承接 [fluxscope v10–v11](9996766a-350e-47fe-b820-c142820d52f8)（WebGL2 环形拓扑的文件关联与选样）。本次一轮收敛三件事，提交为 `7b5eceb`（init）、`e693791`（perf）、`70a906e`（C2 分环）。

## 1. 安全网：首次真正入库（`7b5eceb`）

`.git` 目录原本存在但零 commit，工作区 138 项全为未跟踪。建立 `.gitignore` 后入库 22 个源文件（52MB 工作区 → 约 1.6MB pack），排除：

- 97 个探针 png（37MB）——一次性视觉验证产物；
- `agents.json` / `trace.json`（约 14MB）——生成物，可随时由 extract 重建；
- `_*.py` / `_*.js`（10 个）——经头部确认均为 `p='index.html'; s=open(p).read()` 之类直接改写源文件的一次性 patch 脚本，留库只会误导。

判据：**能由源文件确定性重建的一律不入库；改写源文件的一次性脚本不当作工具入库。**

## 2. 延迟 15.1s → 0.3s（`e693791`）

### 先量化再动手

profile 分解（1583 份转录）：

| 阶段 | 耗时 | 量 |
|---|---|---|
| `read()` | 0.79s | 563MB |
| zstd 解压 | 1.33s | → 762MB |
| `json.loads` | 10.86s | 146960 行（74µs/行） |
| `bashlex` 解析 | 4.76s | 6546 条 bash 命令 |

`json.loads` 占约 2/3，但根因不是它慢，而是**这些转录是 append-only 的**：内容没变却每 120s 全量重解一遍。

### 改法

把 `main()` 循环体抽成纯函数 `parse_file(path)`，只返回本文件的 `{agent, calls, file_contrib}`。关键是 `file_contrib` 用 `[path, n, w, max_t, [agent_ids]]` 表示，合并算子分别是 sum / sum / max / set-union —— **全部可交换可结合**，因此缓存命中是 lossless 的而非“近似还原”。

缓存键取 `(size, mtime)` 而不是内容哈希：append-only 语义保证这两个数一变内容必变，省掉一遍全量读。

### 等价性验证（不信自己的地方）

用旧实现输出 `verify_old.json` 与新实现对跑，按 id 建索引比对：

- agents：`only_old=0`；共享的 1582 个里 6 处字段差异，全部落在 `session-baaf1fd1`（就是当时正在写的本会话）；
- calls：1 处 `d` 差异，`old=0 new=17092`（旧版跑时该 result 行尚未落盘）；
- files：集合完全相同，0 处差异。

结论口径：差异只出现在“边写边读”的活跃文件上，属于时序而非算法差异。

### 顺带修通的链路

`loadTopology()` 原先只在页面加载时调用一次，extract 每 120s 重建 `agents.json` 浏览器永远看不到 —— 那 15s 白费。现在 extract 完成后 `broadcast('topo')`，前端收到后重拉。推送加节流：agents 数变化才推，否则 20s 一次（`/topology` 5.9MB，其中 calls 占 5.05MB）。

前端重拉必须注意：`PICK.ag` / `ACTIVE` 持有 agent **对象引用**，若每次刷新换新数组，点击中途会跳回未选中。因此 `loadTopology` 按 id 把新字段 `Object.assign` 进旧对象。

## 3. tunnel 按 delegation depth 分环（`70a906e`）

隧道只有 144 格（6 环 × 24），agents 1583 个。原分配是“按文件调用数排扁平列表再 slice”，depth 完全不参与。改为 **depth 决定 bucket，热度决定 bucket 内名次**：

- `ri 0–2`（离相机最近：格大、亮、唯一带标签）→ depth 0 主会话，cyan；
- `ri 3–5`（向中心球收缩：格小、暗）→ depth ≥1 subagent，violet；
- 内环只给 900s 内活跃的 subagent 出标签，否则 24 个标签在中心糊成一团。

被委派的 agent 在派出它的会话内侧公转，delegation tree 直接成为空间关系。

### 踩过的坑（应长期记住）

第一版 bucket 内纯按 `t1`（最近活动）排序，结果文件环连线 **646 → 190**。原因：真正在读写文件的那批会话常比“刚闲置的最新会话”老几分钟，被挤出主会话 bucket，而上溯 `onRing()` 的 parent 链也找不到落点。改三级排序（hot <2h → 文件调用数 → t1）后连线 715，比改动前更多。

教训：**bucket 的成员资格按语义定，bucket 内的尾部顺序才可以交给流量启发式；把两者混在一起会静默毁掉下游密度指标。**

### 验证口径

统一走 headless Edge + CDP 探针，只看 `DEBUG` 里的 `nanN:0 / quads:216 / links:715` 且无 console error。`links` 与 `quads` 是分环改动最敏感的两个回归信号。

## 4. 暂停点与待办（按判断的优先级）

1. C4 中心球接真实记忆 —— 当前 460 点 Fibonacci 分布纯属装饰；
2. 点击文件格子出调用历史 —— hitTest 有 agent 分支，缺 file 分支；
3. `/topology` 6.4MB payload 中 85% 是几乎不变的 calls，值得做增量端点；
4. 清理 `index.v1..v7`（历史快照）；
5. 记账欠项：`extract_agents.py` 依赖的 `idank/bashlex` 是前序会话引入、star 未补，下次跑 `star-audit.py --star` 一并补上。

待用户定的开放问题：内环紫色目前聚在右侧一个扇形（同一批 spawn 时间相邻，是真实信息）。要更散开就需按 parent 分组排角度 —— 视觉分散 vs “同一批 spawn 挨在一起”的语义，二选一。
