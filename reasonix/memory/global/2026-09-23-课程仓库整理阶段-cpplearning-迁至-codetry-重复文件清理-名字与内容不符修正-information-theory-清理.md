---
id: mem-2fcf2ba1514d2fb9c252a2b7c7105023
revision: 1
created_at: "2026-09-23T09:07:57.1172308Z"
updated_at: "2026-09-23T09:07:57.1172308Z"
name: 2026-09-23-课程仓库整理阶段-cpplearning-迁至-codetry-重复文件清理-名字与内容不符修正-information-theory-清理
description: 2026-09-23 课程仓库整理阶段：CppLearning 迁至 codetry、重复文件清理、名字与内容不符修正、Information-Theory 清理
metadata:
  type: user
  fact_type: project
  scope: global
---

# 2026-09-23 课程资料仓库「整理」阶段（接在推送之后）

## 用户追加要求
1. 名字和内容不一样的也要整（无法从文件名判断内容）
2. 文件太散可以合并（尤其 PDF）
3. `CppLearning` 若为自己写的 → 扔到 `Introduction-to-Algorithms-codetry`

## 本轮整理动作（均已 push）
| 仓库 | 动作 |
|---|---|
| `Computer-Systems-A-Programmer-s-Perspective` | 100 个散页 → 3 册带书签整册；dHash 去重（第2章 35→27、第8章 58→38） |
| `Mathematics-for-Computer-Science` | 扫描件去重合并（53→33）；`附录_Bibliography_参考文献.pdf` 实为**教材英文原书 920 页** → 移到 `教材/` 并改名；`AI   文件夹.docx` → `AI-文件夹.docx` |
| `Introduction-to-Linear-Algebra` | 倒序扫描重排为正序 2 册（无重复页） |
| `Introduction-to-Algorithms` | 9 个哈希名前缀去除；`CppLearning`(583 文件) 迁出到 codetry；讲义副本去重（LNotes/ 已成套）；官方原卷归位 03-problem-sets；去掉 `_` 前缀 |
| `Introduction-to-Algorithms-codetry` | 接收 CppLearning（487 tracked）；新增 `.gitignore` 排除编译产物；乱名修正：`## 对角化…ini`(实为 md)、无扩展名 `数学`(实为 md)、`拓展  计算素数.cpp`；删除内容重复的 `数学.md` |
| `Convex-Optimization-EE364a` | 目录编号重复修正（04-补充习题→05）；删 12 个重复文件（review*_single 打印副本、重复习题册、无扩展名 `打印稿`(实为 PDF)）；README 事实错误：“MIT 6.431” → 仅 Stanford EE364a（6.431 是概率论） |
| `Design-and-Analysis-of-Algorithms-6.046J` | 删除与 `06-代码/` 完全重复的 `05-代码打印.zip`；打印说明并入主 README |
| `Information-Theory` | `_source-README.md` → `来源与课程说明.md`；删 `03-textbook/_work/`（OCR 中间产物） |

## 关键经验
1. **仓库间搬家的正确做法**：先 `git mv` 到 `_archive-XXX`（可逆），确认内容无误后再 `git rm` 并从目标仓库推；`Introduction-to-Algorithms-codetry` 原本是只有 README 的空仓库（描述“学习实践文件”），是 C++ 练习的天然归宿。
2. **`git rm --cached` + `--no-checkout` partial clone 在 Windows 上不可靠**：`read-tree` 后 `git rm -r --cached`/commit 会卡死（>2 分钟）。改用**完整 `--depth 1` clone** 才稳定；640MB 仓库 clone 到本地后 push 只推新对象，很轻。
3. **多仓库批量重复扫描**：`D:\gh-publish\_scripts\dup_scan.py`（MD5 分组，分块读），能一次抓出“我组装时造成的重复”。注意区分“我造成的重复”（该删）与“原始资料自带的重复”（如 6.046J 的 fig 图、用户自己的练习文件，**不要动**）。
4. **“名字与内容不符”的真实案例**：`数学`(无扩展名) 实为 Markdown；`.ini` 里装 Markdown 正文；`打印稿`(无扩展名) 实为 PDF；`Exams 9/10.pdf` 实为 Review2/Quiz2 解答。判断方法：读文件头（`%PDF-` / `#` 标题）或按 MD5 比对同名副本。
5. **中文教材页码 OCR 不可用于排序**（见另一条记忆）。
6. 新增统一命名惯例：顶层目录 `NN-中文名`（01-讲义 / 02-习题课 / …）；官方原卷与其双语译本同目录共存（`prob8sol.pdf` + `prob8sol.bilingual.md`）。
