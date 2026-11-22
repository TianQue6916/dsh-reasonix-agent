---
id: mem-2a6a6253674537f53fb2bdd551104992
revision: 3
created_at: "2026-11-22T11:33:44.757Z"
updated_at: "2026-11-22T12:00:07.144Z"
name: lalfd-note-pipeline
description: "LaLFD 译者注工程：路径、行尾、写盘选择、回填纪律与 effort 分档（本机实测，含 sha-vs-mtime 教训）"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 仓库与产物
- 仓库：`D:\gh-publish\Linear-Algebra-and-Learning-from-Data\01-教材双语翻译\`
- 产物：`C:\Users\27063\_wb\lald\_out\lalfd\p003_{a,b,c2,d,e,f}` / `p001_g` / `p001_new` 等
- 工具：`~/.dsh/.learn/run/lalfd/`：`lalfdlib.py` / `task2.py`（`--out` 必须带目录，已修）/ `verify_out.py` / `final_check.py` / `apply2.py` / `gen_wb_prompts.py` / `three-lane-and-effort.md`

## 行尾（实测）
`part001` LF、`part002` LF、`part003` CRLF（3898/3932）。给 worker 写行尾前必须当场测，别复用别的文件结论。

## 关键坑
1. **`C:\...\Python313\python.exe` 写不了 `C:\Users\27063` 以外任何位置**；写 `D:\gh-publish` 用 `D:\miniconda\python.exe`，写既有文件也可以用 pwsh `[IO.File]::WriteAllText`（bash/python 在 Low IL 下对既有文件 EACCES）。
2. **工具入参经一次 JSON 解码**：Python 字面量的 `\t`/`\a` 会变真 TAB/BEL。落盘后必须扫 `ord<32 且 c!='\n'`（**TAB 也算违规**，白名单里不许放 `\t`）。
3. **`--expect-sha256` 是硬闸门**，不给或不符合 exit 2 且不写一个字节。
4. **回填按组号降序**；但**能合并就合并**——一次 `--only-groups 17-44` 比拆 4 批快且少 4 轮校验。`apply2.py` 的 `--outdir` 只扫该目录下一层 `g<k>.md`，要一次跑多批就把产物只读复制进 `_merged_*/`。
5. **「防吃到旧版」的判据是 sha 对账，不是 mtime 阈值**（实测教训：我要求「全部 mtime ≥ 19:57」，结果 24 个产物本来就没被改、sha 与上一轮逐字节相同，被我的阈值误判成「可能旧」）。正确做法：产物 sha == 写手交付报告里的 sha。
6. **块级替换判据**：首块位置换、组内其余 note 块删、中间正文原样留；无损 = 「全文非 note 行序列逐字相等」（旧判据「区间外一致 + 组数不变」对删中间正文无感：2223→2219 仍判 OK）。
7. **「color 块数变化 = 组数」在块级替换下恒为 0**；替代判据 `dshort = -N` 且 `dblocks = 0` 且 `dcolor = 0`。
8. **`[note]` 块 ≠ 一条注**：三种容器形态，按「注组」聚合；OCR 修正/图注/交叉引用属功能注不扩。
9. **审稿定位不能用行号**（回填会改文件），用「组号 + page_NNN/小节锚点 + 引文前 12 字」。
10. **effort 显式写**：审稿/审计 `max`；写注/扩写/按清单改 `high`。`list_subagent_models` 只列 5 档枚举（off/low/medium/high/max），**不报默认值**，所以不许用「省略」代替判据。
11. **顺序**：写 → 审 → 修 → **回填** → 体检 → commit。落盘前必须过审稿，否则回滚重跑白付（2026-11-22 实测：5 批回填因审稿后改动整批作废）。
12. 统计口径（19:57）：part001 真注 3 组 ✅；part002 真注 33 组 ✅（含 2 条扩写 817/837）；part003 真注 43 组（26 ✅ 已落盘，17 组待回填：p003_a 8 + p003_b 8 + g2 待插）。
