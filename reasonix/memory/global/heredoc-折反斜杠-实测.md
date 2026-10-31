---
id: mem-97ee7137c4f28a777b2c063f5dd9f079
revision: 1
created_at: "2026-10-28T06:16:10.621Z"
updated_at: "2026-10-28T06:16:10.621Z"
name: heredoc-折反斜杠-实测
description: "bash heredoc 写 .py 检查脚本时 \\\\ 会被折成 \\,连 << 'PYEOF' 单引号形式也折,导致检查脚本自身静默失效"
metadata:
  type: user
  fact_type: feedback
  scope: global
---

## 事实（2026-10-28 实测，Boyd 凸优化 p521-540 翻译块）

在 Git Bash 里用 `cat > x.py << 'PYEOF' ... PYEOF` 写 Python 检查脚本，**即使 heredoc 定界符加了单引号**，脚本里的 `\\mbox`、`\\begin{bmatrix}` 仍被折成 `\mbox`、`\begin{...}`。

后果是**检查脚本自己静默失效**，输出假通过：

- `s.count("\\mbox")` → `s.count("\mbox")`：`\m` 是非法转义 → SyntaxWarning，但计数照样返回，结果是**假 0**。
- `s.count("\\begin{bmatrix}")` → `"\begin{...}"`：`\b` = **退格符 0x08** → 永远匹配不到 → 报 `bmatrix begin: 0`，而实际有 13 个。
- `re.finditer(r"\begin\{bmatrix\}")` → `bad escape \e` 直接抛 PatternError。

## 判定方法

看 Python 输出里有没有 `SyntaxWarning: invalid escape sequence`。**有 = 脚本已被折，全部数字作废，重写**。这是唯一可靠信号。

## 正确做法

1. 检查 / 改稿类 `.py` 一律用 `write` 工具落盘，**不用 heredoc**（写已存在文件要先 `read`，否则报 "file has not been read"；换个新文件名更快）。
2. 必须用 heredoc 时，脚本里所有反斜杠写成 `BS = chr(92)` 再拼接，不用字面 `\\`。
3. 交付前的控制字符自查要包含 `\b`(0x08) —— 它是 heredoc 折叠留下的指纹。

## 曾误导的结论

第一次跑出的「ctrl 0 / mbox 0 / `\[` 0 / odd-$ 0 / bmatrix begin 0」里有 3 条是折痕造成的假值，实际文件当时并未验证过。重写脚本后真实结果：ctrl 0、mbox 0、`\[` 0、odd-$ 0、bmatrix 13/13、aligned 8/8，KaTeX 1019 条 0 失败。
