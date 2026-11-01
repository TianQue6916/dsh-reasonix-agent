---
id: "f5dd5f7f-4b08-46c5-bd08-587b01272387"
title: "WorkBuddy GUI 队列派发：6 路并发 LaTeX 讲义翻译的操作程序与 Windows 踩坑（2026-11-02）"
description: "在 Windows 弟弟机上用 WorkBuddy GUI（剪贴板注入式 UI 自动化）+ schtasks 做 6 路并发派发批量翻译/生成 LaTeX 讲义的可复跑架构：queue 目录 + File.Move 认领 + 串行 run × 6，以及 heredoc 折反斜杠、schtasks 不可并行、ExecutionPolicy 禁脚本、GUI 13KB 截断等实测坑。"
status: "active"
created_at: "2026-11-01T17:19:08.697Z"
updated_at: "2026-11-01T17:19:08.697Z"
content_hash: "a74264ebf4985ab9219ccda3a7a4abe33e42104bff1364e624989e5db066938e"
source_paths:
  - ".dsh/plans/handoff-20261102-0113.md"
session_ids:
  - "7ac4a336-b7b8-4e34-8103-600b8fc997c2"
memory_body_ids:
  []
---

# WorkBuddy GUI 队列派发（2026-11-02）

**相关文档**：`ad6df72a-866f-4126-83f0-47947d005b98`（Windows 上跨 session 派发 worker 的 Scheduled Task 配置、PyMuPDF 补图流水线）、`b9d446e6-4495-43c0-85f5-3cf694aaac07`（翻译工程内容层审计与自动化边界）。

## 场景

弟弟机（Windows，`C:\Users\27063`）上用 **WorkBuddy GUI** 做批量派发：把 prompt 注入 GUI 输入框、回车，让 GUI 侧的模型产出讲义/翻译 md，再把产物落到 `D:\wb-work\<课程>\out`。本轮目标是把 `D:\wb-work\lald` 下 30 份 L 讲义按批次喂进去，用户明确要求「6 路并发」并强调 WorkBuddy 比宿主机 subagent 效率高。

## 核心架构：queue 模式（本轮唯一真正的架构改动）

**旧法（已废弃）**：写单文件 `D:\wb-work\ui_prompt.txt` 再连续触发 GUI。**连发必互相覆盖** —— 后一次写入先覆盖前一次尚未被 GUI 消费的内容，表现为「8 分钟零产出」。

**新法（队列）**：

1. 每份任务落成独立文件 `D:\wb-work\queue\<ID>.txt`（如 `L07.txt`）。
2. worker 脚本 `C:\Users\27063\_wb\lald\wbui_queue.ps1` 遍历 queue 目录，用 **`File.Move` 原子认领** 一份文件后再注入 GUI —— 天然避免两个 run 抢同一份任务。
3. 触发方式：`schtasks /run /tn WBUI1` … `WBUI6` **串行**执行，**间隔 11–12 秒**；6 路并发 = 「串行 run × 6 次」，不是并发 run。

实测单趟节奏稳定在 **约 8 秒/份**：`queue <ID>.txt chars=… session=3` → `done <ID>.txt`。日志形如
`2026-11-02T00:57:14 queue L07.txt chars=9043 session=3` / `00:57:22 done L07.txt`，据此可判断是否空转。

## 可复用判据

- 派发是否生效：看 GUI 侧产物文件是否新增（`out_*.md`），并核对 `队列剩余` 是否单调下降；只看到 `dispatched HH:MM:SS` 不代表成功。
- prompt 大小要压在 GUI 输入框上限内（见坑 4，>13 KB 会被截断）。
- 每批派完补一遍「缺失扫描」再补派（本轮出现 `miss L24` 这类漏派）。
- 派发本体的输入是 `D:\wb-work\queue\<ID>.txt`，`out` 目录只放产物，二者不要混。

## Windows 实测坑（按踩到频率）

1. **含 LaTeX 反斜杠的脚本绝不用 heredoc**：`\varepsilon` 等会被 shell 折成 `arepsilon`，模型照抄导致公式错。正解是用 `str_replace_editor` 把脚本落盘再执行；已备 `fix_esc.py` 批量修。本题连踩三次。
2. **`schtasks` 同一任务不能并行**：同一 task name 重复 run 不会得到两个并发实例，所以扩并发只能建 `WBUI1..WBUI6` 六个任务名、串行触发。
3. **PowerShell ExecutionPolicy 拦截 .ps1**：直接 `.\status2.ps1` 报 `UnauthorizedAccess` / `about_Execution_Policies`。改为显式 `powershell -File <path>` 或 `-ExecutionPolicy Bypass`。
4. **GUI 输入框截断 13 KB**：单条 prompt 超过约 13 KB 会被砍尾，产物不完整。分批、每份一个文件。
5. **`-Filter` 会命中 8.3 短名**：`Get-ChildItem -Filter *.md` 之类在旧目录会多命中短名变体，改用 `Where-Object` 显式匹配。
6. **`^n`（新建会话）后失焦是正常的**：日志出现 `pre focus ok` / `post-n focus ok (try0)` / `post-v focus ok` 即为正常链路，不要为「失焦」重试；但注入前必须重新聚焦。
7. **行内 `powershell -Command` 长字符串易 parser error**（`ExpectedValueExpression` / 缺失 `)` `}`）：单行内嵌套引号 + 大括号必炸；超过 ~200 字符就落盘成脚本文件。
8. **BOM**：写 cmd/ps1 时带 BOM 会污染首行；另注意**行尾反斜杠**会吞掉换行。
9. **Low IL 进程写不了 `D:/gh-publish`**：GUI 侧进程是低完整性级别，只能写 `D:\wb-work\...`。

## 分工约定（用户拍板）

- WorkBuddy 只负责**翻译/生成**；派发决策与审计留在宿主机侧，不交给 GUI。
- 视频相关不处理。
- 并发固定 6 路。

## 产物位置速查

- 队列：`D:\wb-work\queue\<ID>.txt`
- 产物：`D:\wb-work\lald\out\out_L*.md`
- 状态脚本：`C:\Users\27063\_wb\lald\status3.ps1`（磁盘/负载：cpu%、free GB）
- 队列 worker：`C:\Users\27063\_wb\lald\wbui_queue.ps1`
- 交接：`C:\Users\27063\.dsh\plans\handoff-20261102-0113.md`

## 尚未收口

RA（Real Analysis）L08–L14 在跑未收；Algorithms EX1 卡住、EX14/SUP 两份未出；`assets2/` 下两个 subagent 同名互吃，`_mine/` 是干净版（14 张）而根目录被踩的有切边 —— 需人工裁决用哪套。
