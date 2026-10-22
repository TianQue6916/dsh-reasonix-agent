---
id: mem-5fe5fb3b34c9003f59328bafdfbcca2f
revision: 1
created_at: "2026-10-04T11:34:06.882Z"
updated_at: "2026-10-04T11:34:06.882Z"
name: python-windows-backslash-heredoc-trap
description: "本机 python 脚本含 Windows 反斜杠路径必炸（已踩 5 次）的根因与唯一可靠修法：文件内零反斜杠 + 正斜杠路径"
metadata:
  type: user
  fact_type: feedback
  scope: global
---

## 症状（截至 2026-10-04 已踩 5 次）

```
SyntaxError: (unicode error) 'unicodeescape' codec can't decode bytes in position NNN-NNN: truncated \UXXXXXXXX escape
```

触发条件：**任何 python 普通字符串（含 docstring、含 heredoc 里的内容）出现反斜杠**。
最常踩的是 Windows 路径 `C:\Users\...` —— `\U` 被当成 Unicode escape 起点。

## 关键事实：heredoc 不能救

`cat > f.py <<'PYEOF'`（带引号、无 shell 展开）**只保证 shell 不处理内容**，
反斜杠照样原样写进文件，然后**由 python 解析时报错**。
所以「用引号 heredoc」不是修法。

## 唯一可靠的修法：文件里零反斜杠

1. **路径全用正斜杠**：`C:/Users/27063/...`。Windows、Node、npm、PowerShell、Git Bash 全都接受。
2. **不要在字符串里提 escape 的名字**：写 `U+XXXXXXXX`，不要写「反斜杠 + UXXXXXXXX」。
3. 若必须含反斜杠，用 `r"""..."""` raw string；但 raw string 不能以反斜杠结尾。
4. 若脚本要处理 Windows 路径，**路径从 argv / os.environ / pathlib 取**，不要写字面量。

## 本机受影响脚本（均在本机环境中踩过）

`~/.dsh/storages/tools/` 下的 python 工具若含 Windows 字面路径，一律按上面改。

## 已确立的替代做法

改 `~/.dsh/PLAN.md`（**混合换行 CRLF + 裸 LF**）时，`str_replace_editor` 的 `old_str` 永远匹配不上，
因此统一用「1-based 行号 + `raw.split(b"\n")` 字节级插入」的独立 `.py` 脚本，
脚本内容遵守上面的零反斜杠规则。
