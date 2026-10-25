---
id: "5d9b86a0-15a7-4082-a9cd-d5f3eea92db8"
title: "双机课程库迁移与「零洞文件」故障诊断（tar 流传输 / 全量 MD5 验收）"
description: "2026-10-04~05 大机 Windows ↔ 小机 Linux 课程视频库迁移的交接记录：tarfile 流 + 裸 TCP 传输方案的实测吞吐与复用脚本、踩坑（路径转义 / 行尾假警报 / PowerShell 删除）、以及「零洞文件」故障的诊断判据（64MB 零块指纹、零字节占比阈值）与遗留待修文件清单。"
status: "active"
created_at: "2026-10-05T07:58:05.904Z"
updated_at: "2026-10-05T07:58:05.904Z"
content_hash: "801ae3bd5360bef985ceeaef5f2dec5b5ea8eb4ed408a8cf448e439765026143"
source_paths:
  - ".dsh/storages/tools/tar-stream-send.py"
  - ".dsh/storages/tools/tar-stream-many.py"
  - ".dsh/storages/tools/tcp-send.py"
session_ids:
  - "1f195ee3-9736-4869-ae94-15da2024765b"
memory_body_ids:
  []
---

# 双机课程库迁移与「零洞文件」故障诊断（2026-10-04 ~ 10-05）

大机（Windows，`D:`）↔ 小机（Linux，`/media/OS`）之间迁移课程视频库，并顺带查出小机侧 9-08 那批
`.realcugan.mkv` 是**带零洞的坏文件**。本文记录可复用的传输方案、诊断方法与本次执行证据。

## 结论速览

1. **传输**：Python `tarfile` 目录级流式 + 裸 TCP 最快（实测 **876–948 Mbps**）；SSH / 管道方案只有 90–153 Mbps。
2. **验收**：只比「相对路径 + 字节数」会漏掉零洞文件（size 正确、内容全零）。必须**全量 MD5**，或用「64 MB 分块零字节占比」扫描。
3. **本次迁移** 4 门课程 + `_audit` 全量 MD5 通过；小机实分析 V12–V16 的坏文件已用大机完好版覆盖并逐条 hash 对齐。
4. **遗留未修**：小机 `实分析/05-视频讲座/` 还有 **7 个** `.realcugan.mkv` 零洞文件，大机没有原件，需从完好的源 `.mp4` 重跑超分。

## 一、传输方案：tarfile 流 + 裸 TCP

| 路径 | 实测 |
|---|---|
| SSH 加密单流（`ssh … "cat > f"`） | 153 Mbps |
| SSH + stdin 重定向 | **103 Mbps**（更差，MSYS2 管道拖累） |
| **Python `tarfile` 流 + 裸 TCP** | **876–948 Mbps** ✅ |

- 复用脚本（已落位）：
  - [`.dsh/storages/tools/tar-stream-send.py`](.dsh/storages/tools/tar-stream-send.py)
  - [`.dsh/storages/tools/tar-stream-many.py`](.dsh/storages/tools/tar-stream-many.py)（多文件/目录映射，`arcname` 顺带做落地改名）
  - [`.dsh/storages/tools/tcp-send.py`](.dsh/storages/tools/tcp-send.py)
- 用法模式：小机先起接收端监听（本次用 `:9212` / `:9213`），大机侧发送。
- 旧档案里的 `giga.py` 是**单文件**协议，对 8111 个小文件场景不适用，不要直接套用。
- 实测规模：282 / 549 / 1140 / 6913 个文件分别在 437 / 255 / 113 / 60 s 内传完，吞吐 90–108 MiB/s。
- 结论：网线本身没问题，瓶颈在协议栈与管道层 —— **换协议比调网络参数有效**。

### 踩过的坑

- Windows 路径拼接写 `D:\...\${v}.mkv` 时反斜杠转义导致 `${v}` **不展开**，报
  `FileNotFoundError: … 'D:\40-媒体\b站视频\解析视频\实分析${v}.realcugan.mkv'`。
  改用正斜杠 `D:/.../${v}.mkv`，并在发送前先跑「参数自检」把 `本机绝对路径 -> arcname` 逐条打印再开传。
- Git Bash 下 `rd //c …` 被路径转义吞掉，报 `The filename, directory name, or volume label syntax is incorrect`；
  删除改用 PowerShell `Remove-Item` 才成功。
- Windows Python 的 `print` 把 `\n` 写成 `\r\n`，跨机 diff 清单时会把整份 `_audit` 报成「全部不一致」——
  这是**行尾假警报**，先排除行尾差异再下结论。

## 二、「零洞文件」诊断（本次最有价值的教训）

**现象**：同名的 12 个 `.realcugan.mkv` 中，有 5 个 **size 分毫不差但 MD5 不同**；前 32 MB 完全相同
（`ee710831af8238ed4dec0e5e1a0dcc81`），编码器签名与参数也完全相同（`x264 core 164 r3192`，同一组 options），
说明差异不在开头，在 32 MB 之后。

**判据**：

- 用「相同 64 MB 块 MD5」识别零块：`md5(64 MB zeros) = 7f614da9329cd3aebf59b91aadc30bf0`。
  若两个完全不同的视频在同一 chunk 序号给出同一个 hash ⇒ 该块就是全零块。
- 分块统计零字节占比：`.mp4` 正常水平 **2.1–3.6%**（黑色帧）；**超过约 5% 即可疑**。
- 典型坏文件（小机）：V13 94.2%、Midterm-Review 79.4%、V07 77.9%、V12 75.6%、Final-Exam-Review 71.1%、
  V16 74.6%、V14 63.2%、V11 62.9%、V15 59.1%、V10 45.1%、V09 25.9%、V08 13.0%。
  坏文件典型形态是 chunk 5–17 整块全零（如 V12：957,915,256 / 1,266,256,350 = 75.6% 零字节），
  而大机同一文件只有 0.45%（正常黑帧）。
- **对照实验很重要**：`算法导论6.006` 24 个大文件 0 个异常、概率导论与算法进阶也正常 ⇒
  不是普遍现象，能定位到「9-08 那批 `.realcugan.mkv`」。
- 时间线线索：小机实分析是 9-08 00:17 写入；大机那 12 个文件**创建时间 2026-09-09 14:00–14:08 而 mtime 更早**
  ⇒ 9-09 从别处拷入（拷贝保留 mtime，创建时间是新的）。

**为什么 size 校验会漏掉**：有洞文件的 size 是正确的 —— 空间已分配、数据没写完。
9-08 那次传输很可能就是 aria2c 按「同名同 size」判定「已存在」而跳过，留下小机旧的有洞版本。
**所以双机互传后的验收必须是全量 MD5 或零洞扫描，不能只比 size。**

## 三、本次执行与校验

| 项目 | 文件 | 大小 | 耗时 | 吞吐 |
|---|---|---|---|---|
| 线性代数18.065-Strang-矩阵方法 | 282 | 45.41 GiB | 437 s | 106 MiB/s |
| 凸优化-EE364a-Boyd | 549 | 25.09 GiB | 255 s | 101 MiB/s |
| 信息论-MacKay-ITPRNN | 1140 | 11.91 GiB | 113 s | 108 MiB/s |
| 计算机网络-CS144-Levis-McKeown | 6913 | 5.22 GiB | 60 s | 90 MiB/s |
| `_audit` | 1101 | 0.03 GiB | — | — |
| 实分析修复（V12–V16 覆盖坏文件） | 5 | 5.86 GiB | 56 s | — |

小机已有、跳过：`算法导论6.006`（236 / 37.98 GiB）、`实分析`（58 / 18.11 GiB）。

全量 MD5 校验（不是只比大小）：4 门课程 8884 / 8884 ✓、`_audit` 1101 / 1101 ✓、
6.006 236 / 236 ✓、实分析 58 / 58 ✓（含 5 个覆盖修复，逐条 hash 对齐）。

修复后小机 V12–V16 与大机原件逐条一致（12 个 realcugan 中可比对 5 个，一致 5、不一致 0）：

```
84450f67551d60d10122df0124795f42  V12 - Convergence in Metric Spaces; Operations on Sets.realcugan.mkv
42b8fe4cdb45cc52f1630aaa2c505694  V13 - Open and Closed Sets; Coverings; Compactness.realcugan.mkv
76bda70df3b500be4b376571e68d400c  V14 - Sequential Compactness; Bolzano-Weierstrass Theorem in a Metric Space.realcugan.mkv
229efa27415ed075c0f9cbad7becbec0  V15 - Derivatives; Laws for Differentiation.realcugan.mkv
3a5e40a498baa044add9154b30b64820  V16 - Rolle Theorem; Mean Theorem; LHopital Rule; Taylor Expansion.realcugan.mkv
```

修复流程可复用：小机起接收端 → 大机流式发完好文件覆盖 → 重扫零字节占比（V12–V16 从异常列表消失）→ 逐条 MD5 对齐。

## 四、本机（大机）清理

- 删除 `D:\40-媒体\b站视频\解析视频`（10279 文件 / 143.74 GiB）→ **D: 可用 108.99 → 252.75 GiB**。
- 删除前先用 `_audit`（1101 条 相对路径 + MD5 + 字节数）确认与目标端完全一致，再执行。
- 范围控制：`D:\40-媒体\b站视频\` 下还有 DownKyi 程序本体（大量 dll）+ Aria / Cache / ffmpeg / bilibili 等，
  **只动 `解析视频` 这一个子目录**，DownKyi 本体一行未动。
- junction `D:\b站视频` 保留，仍指向 `D:\40-媒体\b站视频`。
- 小机 `/media/OS` 现 465G 已用 / 338G 可用；`/tmp` 临时脚本已清。

## 五、遗留与后续

- **待修（7 个，大机无原件）**：小机 `实分析/05-视频讲座/` 的 V07 / V08 / V09 / V10 / V11 /
  Final-Exam-Review / Midterm-Review 的 `.realcugan.mkv` 仍是零洞文件（13.0%–79.4%）。
  修复路径完整：这些文件的**源 `.mp4` 在小机上且完好**（零占比 2.1–3.6%），需要时重跑超分即可。
- 这正好落在用户既定规划内（「懒得跑视频、要看时现提画质」），**先记账，不必现在动**。
- 通用做法沉淀：以后双机大批量互传，统一走 tar 流 + 裸 TCP，并在落地后跑「全量 MD5 + 零洞扫描」双验收。
