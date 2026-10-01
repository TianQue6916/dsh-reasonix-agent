---
id: mem-9d29bcb0c7d938473eac5f0cc81df8f7
revision: 1
created_at: "2026-09-28T03:50:45.885Z"
updated_at: "2026-09-28T03:50:45.885Z"
name: gitbash-schtasks-arg-conversion
description: "Git Bash 调 schtasks 必须 MSYS_NO_PATHCONV=1 + 单斜杠，否则 //query 被转成 C:/Git/query 输出错误"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# Git Bash 调用 schtasks 的参数转换坑

## 症状（会伪装成"任务不存在"）

```bash
schtasks //query //fo CSV //nh        # 错
# ERROR: Invalid argument/option - 'C:/Git/query'.

MSYS_NO_PATHCONV=1 schtasks //query   # 也错
# ERROR: Invalid argument/option - '//query'
```

两种写法都失败，且**只返回 2 行错误信息**。若用 `| grep -E "Memory|Reasonix"` 过滤，grep 匹配空 → 看起来像"这些计划任务根本不存在"，会导出错误结论。

## 正确写法

```bash
export MSYS_NO_PATHCONV=1
schtasks /query /fo CSV /nh                                  # 列全部（本机 310 个）
schtasks /query /tn "MemoryIndexHeal" /fo LIST /v | grep -iE "Last Run Time|Last Result|Next Run Time|Task To Run"
```

即：**禁掉 MSYS 路径转换 + 用单斜杠**。

## 必查字段

`Last Run Time` / `Last Result`（0 = 成功；`ReasonixGitHubBackup` 是 robocopy，0-7 都算成功）/ `Next Run Time`（`N/A` = 触发器是 AtLogOn/AtStartup，没有固定下次时间，正常）。

## 元教训

排查判据本身出错时（返回的是 usage 错误而非数据），**必须先看 raw output 再 grep**。此为「判据写错会伪装成产品缺陷」的第 6 次实例。
