---
id: mem-f9dba3c44aba4d4220a81eda075252cd
revision: 1
created_at: "2026-08-04T05:34:43.825536808Z"
updated_at: "2026-08-04T05:34:43.825536808Z"
name: ssh-passwordless-and-tool-skills-20260804
description: 主力机免密SSH已配置(tqjq/天阙九泉)+12个skill shadow修复+3个工具skill(知识库/Lean/离线维基)
metadata:
  type: user
  fact_type: reference
  scope: global
---

# SSH 免密远程 + skill shadow 修复 + 工具插件化（2026-08-04）

## 1. 主力机免密 SSH 已配置（关键：管理员组用户必须用 administrators_authorized_keys）

- `27063` 是 Windows 管理员组成员，OpenSSH 对管理员**强制**读 `C:\ProgramData\ssh\administrators_authorized_keys`（用户目录 `~/.ssh/authorized_keys` 对管理员无效——这是免密首次失败根因）
- 公钥：本机 `~/.ssh/id_ed25519`（ed25519，指纹 SHA256:xSZE0Z5E9FJjqDfxIuLmUZQai0w2a3Oq/yKPMntVlWU）
- 已追加到 `C:\ProgramData\ssh\administrators_authorized_keys`，ACL 设为 `SYSTEM:(R)` + `Administrators:(R)`（icacls /inheritance:r）
- `~/.ssh/config` 已写：Host `tqjq`（192.168.1.16, User 27063, IdentityFile ~/.ssh/id_ed25519, IdentitiesOnly yes）+ 别名 `天阙九泉`/`tianque-jiuquan`
- 验证：`ssh tqjq 'echo OK'` 免密成功，连续两次通过
- Reasonix「远程 SSH 主机」功能从 ~/.ssh/config 导入，现在可识别并连接

## 2. skill shadow 修复

- 12 个技能存在「单文件 .md（6月旧版）+ 目录版 SKILL.md（7月14日批量安装）」重复，内容完全一致 → 单文件版已归档到 `~/.reasonix/skills/.archive-shadowed-20260804/`，保留目录版
- bilingual-translator：workspace 项目版（7月26日，341行）被全局版（8月3日，696行）shadow 且方向反了（项目版反而是旧版）→ 已把项目版独有内容（2025.07 实战 5 铁律 + 子 agent 陷阱 4 条）合并进全局版 `~/.reasonix/skills/bilingual-translator/SKILL.md`，workspace 项目版已移除（备份在归档目录）
- 无引用的旧单文件保留：降AIGC-理工科-ACS.md、降AIGC-文科-ALH.md、开发方法论-Superpowers.md、元规则-Reasonix运营规则.md（无目录版冲突，正常工作）

## 3. 工具插件化（新技能，替代被动记忆）

- `tool-pocketwiki`：PocketWiki 知识库（127.0.0.1:8808，数据在 ~/.reasonix/global-workspace/pages/，启动 `python3 pocket-wiki.py`）
- `tool-lean4`：Lean 4.32.2（/home/tianque/.elan/bin/lean，lake build，示例项目 lcs-proof/）
- `tool-offline-wiki`：离线维基 ZIM（主力机 C:\wiki-data\zim\wikipedia_en_all_nopic_2026-06.zim，49.1GB，libzim 库）
- `control-main-machine` 技能已更新：首选 `ssh tqjq` 免密，paramiko 作回退

**Why:** 免密 SSH 让 Reasonix 远程主机功能可用；工具做成 skill 后每次会话自动可见可调，不再依赖翻记忆。
**How to apply:** 远程控制主力机直接 `ssh tqjq 'powershell -Command "..."'`；新增工具先考虑做成 tool-* skill 而非仅存记忆。
