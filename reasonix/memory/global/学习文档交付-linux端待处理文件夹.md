---
id: mem-e5956c936517d02168099f66d2c6dee4
revision: 4
created_at: "2026-10-24T14:35:39.920Z"
updated_at: "2026-11-16T17:22:30.719Z"
name: 学习文档交付-linux端待处理文件夹
description: "学习文档双端落盘规则（Windows D:\\Desktop\\课程文件\\待处理文件夹 + Linux 天阙机同名目录），含两端路径、SSH 通道、目录层级差异"
metadata:
  type: user
  fact_type: feedback
  scope: global
---

# 学习文档交付-linux端待处理文件夹

## 规则（用户 2026-10-24，两次确认；2026-11-17 再次生效）

原话 1：「以后像这样的学习文档，完成之后直接在 linux 端放置（桌面有对应文件夹：未处理文件夹），计入记忆，并且在 linux 端打开」
原话 2：「**两边都落盘**不就行了」
原话 3（2026-11-17）：「位置还是放到待处理文件夹（linux）」

⇒ **终态：每篇学习文档/锚点卡写两份**——Windows 主力机一份 + Linux 天阙机一份；内容一致，不搞单一真相源。

## 两端路径与目录层级（2026-11-17 复核）

| 端 | 路径 | 备注 |
|---|---|---|
| Windows 主力机 | `C:\Users\27063\Desktop\课程文件\待处理文件夹\{数学,计算机}\` | Desktop 是 junction → `D:\Desktop`；**平铺，无课程子目录** |
| Linux 天阙机 | `/home/tianque/桌面/待处理文件夹` → symlink → `/media/OS/linux-home/桌面-待处理文件夹` | `/media/OS` 是天阙机自己的 Windows 分区（`nvme0n1p3`, ntfs3, 803G），主力机看不到 |

**层级差异（新发现，重要）**：Linux 端比 Windows 端多一层课程分类，如
`/home/tianque/桌面/待处理文件夹/数学/实分析/课程问题/`（内含 `度量三公理-只依赖-疑问与解答.md` + 同名 `.pdf`）。
⇒ 交付到 Linux 时应对齐**该课程已有目录**，不要一律丢在 `数学/` 根下；Windows 端按其平铺习惯放 `数学/`。

命名风格：英文 slug + 中文说明（如 `dp-mathematical-correctness.md`、`metric-axiom-independence-度量三公理不可省的证明方法.md`）；配套 `.py` 脚本同目录并排。

## 写入通道（2026-11-17 实测可用）

- **Linux 端**：`ssh tianque`（BatchMode 可用）→ `scp` 到 `/tmp` → 远端 `cp/mv` 成中文名 → **两端 `md5sum` 比对**（这是唯一可靠证据）。
- **Windows 端**：当前已 `danger-full-access`，`write` 工具可直接写 Desktop（经 junction 落到 `D:\Desktop`），无需重启。
- **打开**：`marktext` 是 Electron 单实例，`--new-window` 与 `xdg-open` 都返回「Another instance of MarkText is already running」；**无法从 ssh 确认窗口是否真的切换/打开了新文件**。`wmctrl` / `xwininfo` 在该机不可用或不可靠。⇒ 交付时如实报告文件已就位 + md5，不承诺"已打开"。

## 已按此规则落地

- 2026-10-24：`backward-induction-逆向归纳法与最优性原理.md`（287 行）+ `backward-induction-check.py`（Linux md5 `6a7679e7…` / `ea75a31a…`）。
- 2026-11-17：`metric-axiom-independence-度量三公理不可省的证明方法.md`（139 行，md5 `e94edfb25ba256e4d75bcb67fe7b38ff`），Linux 端 `数学/实分析/课程问题/`，Windows 端 `数学/`，两端一致。
