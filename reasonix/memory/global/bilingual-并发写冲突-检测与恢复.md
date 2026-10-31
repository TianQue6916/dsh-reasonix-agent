---
id: mem-0287f0709d98b9efd084177a18210375
revision: 1
created_at: "2026-10-27T20:27:57.713Z"
updated_at: "2026-10-27T20:27:57.713Z"
name: bilingual-并发写冲突-检测与恢复
description: "多个翻译 worker 并发写同一个 .bilingual.md 时的症状、检测命令与恢复做法（2026-10-28 Boyd p201-220 事故）"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 症状（2026-10-28 实测）
派多个 worker 翻 `C:/Users/27063/Documents/翻译产出/教材/Boyd凸优化/*.bilingual.md` 时，`Boyd凸优化_p201-220.bilingual.md` 在我的写作期间被另一进程反复改写：04:18–04:26 字节数在 84K → 148K → 163K → 100K → 104.5K 之间跳动。表现两种：
1. 在我完整的 4.1–4.55 之后**追加了重复的 p211–p218 段**（页标记重复 2 次、题号重复）。
2. 之后又**插入一条 895 汉字的 GP 译注**（内容合规，属「补注 worker」所为）。

## 检测（任一都够）
- `stat -c "%y %s %n" <file>` 连测 3 次 / 间隔 10 s，mtime 或 size 变化即有人在写。
- `grep -o "===== p[0-9]*" <file> | sort | uniq -d` —— 页标记重复 = 拼接污染。
- 结构自检一行（期望值写死，最可靠）：
  `python -c "import re;d=open(F,encoding='utf-8').read();print(len(d.encode()),len(re.findall(r'===== p',d)),len(re.findall(r'\*\*4\.\d+\*\*',d)),d.count('<span'),d.count('</span>'))"`
  Boyd p201-220 的期望值：`104813 20 55 64 64`。

## 恢复
1. 先按内容指纹切：找到自己的收尾句（例如「（4.55 的题干在此跨页…）」），`d.find(key)` 之后的部分另存 `Temp/other_<range>.md` 再删。
2. 备份自己的干净版到 `Temp/my<range>.md`；之后每次改动前后 diff（`difflib.SequenceMatcher`，autojunk=False）。
3. **注意 bytes ≠ 字符**：`len(d)` 是字符数，`len(d.encode())` 才是字节；两者差 19% 一度让我误判「文件被污染」，实际内容完全一致。先用 diff 再判断。
4. 交给父 agent 的交付报告里必须写明「该路径曾被并发写」并给出结构自检期望值，否则父 agent 可能读到漂移后的状态。

## 预防
同一 `.bilingual.md` 路径**只允许一个 writer**；补注/审计 worker 必须先声明「只 append 译注、不动结构」，或改写到独立 `.notes.md` 再合并。
