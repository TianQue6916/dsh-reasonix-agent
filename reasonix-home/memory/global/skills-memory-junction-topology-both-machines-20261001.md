---
id: mem-db654e0e8c3fba0bdb007a91c8dcb515
revision: 1
created_at: "2026-10-01T06:21:08.947Z"
updated_at: "2026-10-01T06:21:08.947Z"
name: skills-memory-junction-topology-both-machines-20261001
description: "Windows/Linux 两侧的技能与记忆目录链接拓扑（junction/symlink 真身位置）与由此推翻的判断"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 三条链接，两端不同（2026-10-01 实测）

### Windows 侧
| 访问路径 | 类型 | 真身 |
|---|---|---|
| `~/.dsh/skills` | **Junction** | `%APPDATA%\reasonix\skills` |
| `~/.reasonix/skills` | 真实目录 | 自己的副本（与 APPDATA 逐文件+逐字节长度一致，275 files）|
| `~/.reasonix/memory` | **Junction** | `%APPDATA%\reasonix\memory`（471 files）|
| `~/.dsh/.agent-presets` | 真实目录 | — |

`%APPDATA%\reasonix` = Reasonix **Desktop** 的数据目录；`~/.reasonix` = 旧版 CLI 目录。
Desktop 读的是 APPDATA 那份，junction 只是给旧路径留的入口。

### Linux 侧（由另一个会话于 2026-10-01 14:11 建立）
`~/.dsh/skills` → **symlink** → `~/.reasonix/skills`（真实文件 202）
旁边保留 `skills.empty-bak-20261001/` 与 `skills.junctions-legacy-20261001/` 作为回滚。

## 由此推翻的旧判断
1. **「~/.dsh/skills 与 ~/.reasonix/skills 是两份拷贝」→ 在 Windows 上不成立**：
   `~/.dsh/skills` 是 junction，物理上只有 APPDATA + `~/.reasonix/skills` 两份。
2. **`find` / `du` / `os.walk` 都不跟随 reparse point**。
   所以 `find ~/.dsh/skills -name SKILL.md` 返回 **0** 是**测量假象**，不是数据丢失。
   要数真实文件必须用 PowerShell（`Get-ChildItem -Recurse`）或 `find -L`。
   **这个坑已经把一次假警报炒成"技能目录被清空"**，判断前必须先确认路径是不是 reparse point。
3. **`sync_dsh.py` 的 `os.walk` 因此从来没同步过 skills** —— 必须给 Windows 侧**真实路径**
   单列 `EXTRA_PAIRS`（已加：`%APPDATA%\reasonix\skills`、`%APPDATA%\reasonix\memory`）。

## 真实发生过的一次半删除（记下来别重犯）
用 `shutil.rmtree(~/.reasonix/skills)` 想做「删目录 + 建 junction」时：
- 它**抛** `OSError: Cannot call rmtree on a symbolic link`
- **但在抛之前已经把目录里的文件全删了** —— 剩 80 个空目录、`SKILL.md` 归零
- 靠 `shutil.copytree` 先做的备份（275 files / 77 SKILL.md）完整还原，`Compare-Object`
  逐文件+逐长度差异为 0

**教训：Windows 上不要用 `shutil.rmtree` 做「掏空后替换成 junction」的迁移。
要删目录树用 PowerShell `Remove-Item -Recurse -Force`；要收敛用逐文件镜像，不要删目录。**
