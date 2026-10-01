---
id: mem-5422a11eaece7288c339045b0a6ffae9
revision: 1
created_at: "2026-09-28T05:33:51.046Z"
updated_at: "2026-09-28T05:33:51.046Z"
name: incident-credential-echo-leak
description: "凭据打印事故（第 2 次）：同一表达式混用 ${VAR:+} 与 ${VAR:-} 会把值打印出来；含安全写法清单"
metadata:
  type: user
  fact_type: feedback
  scope: global
---

# 凭据打印事故（第 2 次）与正确写法

## 事故

2026-09-28，验证计算机使用插件端到端时，我写：

```bash
echo "COMMANDCODE_API_KEY = ${COMMANDCODE_API_KEY:+<已注入 ${#VAR} chars>}${COMMANDCODE_API_KEY:-<空>}"
```

输出里**完整打印了 93 字符的 key**。

**根因**：同一行写了两个展开式 —— `${VAR:+WORD}` 与 `${VAR:-WORD}`。
前者按我的意图输出长度，**后者在 VAR 非空时展开为 VAR 的值**。我以为"两个分支各覆盖一种情况"，
实际**两个都会求值**，于是值被打印。

**这是同一模式的第 2 次**：上一次是查 hindsight profile 时用 `grep -vE '^#|^$'` 打印生效项，
把 API key 明文打进会话记录。

## 铁律

**绝不在同一个表达式里混用 `${VAR:+...}` 和 `${VAR:-...}` 并 echo。**

检查"变量是否已设置"只有这几种安全写法：

```bash
echo "len=${#VAR}"                    # 只打长度
[ -n "$VAR" ] && echo "已设置" || echo "未设置"
printf 'set=%s\n' "$([ -n "$VAR" ] && echo yes || echo no)"
```

要调试"值对不对"时，只打**前 4 位 + 长度**，且要显式截断：

```bash
echo "${VAR:0:4}…(${#VAR} chars)"
```

## 连带风险

本机会话按文件存（`~/.dsh/sessions/`、`%APPDATA%\reasonix\sessions/`），
所以打印进会话 = 落盘。**一旦打印，正确处置是轮换凭据，而不是删除会话文件**（后者会破坏历史且不保证彻底）。

## 相关的更早教训（同一家族）

- `-----BEGIN PRIVATE KEY-----` 字面量写进"警示性 fact" → 备份脚本的 `$Detect` 裸字符串判据把它当泄漏，中止推送（自指陷阱）
- 这两件事的共同点：**"我为了安全而做的检查动作，本身成了不安全/破坏性的动作"**。
