---
id: legacy-0fd5be973a70faae4b8c6159
revision: 1
created_at: "2026-07-24T04:30:38.010000146Z"
updated_at: "2026-07-24T04:30:38.010000146Z"
name: bilingual-translator-output-path
title: 双语翻译默认输出目录
description: bilingual-translator 技能的默认输出路径为 /home/tianque/桌面/课程文件/
metadata:
  type: user
  scope: global
---

## 双语翻译默认输出路径

**路径：** `/home/tianque/桌面/课程文件/`

**何时使用：** 每次调用 bilingual-translator 技能翻译文件时，应将翻译后的 `.bilingual.md` 文件输出到此目录。

**文件名规则：** `<源文件名>.bilingual.md`

**沙箱限制：** 如果在 Reasonix 工作区内无法直接写入该路径，先将文件写入 `.reasonix/attachments/`，然后提供 `cp` 命令供用户自行复制：

```bash
cp /home/tianque/.reasonix/global-workspace/.reasonix/attachments/<file>.bilingual.md /home/tianque/桌面/课程文件/<file>.bilingual.md
```

**来源：** 用户在处理 prob7sol.pdf 翻译时明确要求将此路径计入技能。
