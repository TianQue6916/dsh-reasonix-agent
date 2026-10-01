---
id: mem-e010ccc1e1d0ad6fbd19fd6e46cd7286
revision: 1
created_at: "2026-10-01T06:26:05.477Z"
updated_at: "2026-10-01T06:26:05.477Z"
name: gitbash-wc-m-is-bytes
description: "Windows Git Bash 下 wc -m 不按字符计数、返回 byte 数，校验字符数要用 python len()"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 事实（2026-10-01 实测，Windows Git Bash / msys）

`wc -m` 在这台机器的 Git Bash（`LC_CTYPE="C.UTF-8"`，LANG 为空）下**不做 multibyte 解码**，输出等于 `wc -c`（bytes），不是字符数。

实证（C:\Users\27063\.dsh\tmp-probe\refactor\bilingual-ocw-translator）：
- `orig_SKILL.md`：`wc -m` = 58016，`wc -c` = 58016，`python len()` = 30568
- `out/SKILL.md`：`wc -m` = 12709，UTF-8 bytes = 12709，`python len()` = 6881

## 规则

校验中文文本的**字符数**时不要用 `wc -m`，用：

```bash
python -c "print(len(open('f.md',encoding='utf-8').read()))"
```

或 perl -CS。`wc -c` 才是可信的 byte 数。

## 影响过的判断

skill 的 SKILL.md 7000 字符上限：按真字符数 6881 通过；按 bytes 12709 会被判超标。**别用 wc -m 验收 skill 大小上限。**
