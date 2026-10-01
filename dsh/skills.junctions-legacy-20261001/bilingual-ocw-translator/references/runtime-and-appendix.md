# 第 7 章 运行时记忆与维护

## 7.1 错误记忆机制

每次大规模翻译完成后，把犯过的错误记入 `.reasonix/attachments/translation_error_memory.md`，格式：

```markdown
### 错误类型: [英中对照/甩名词/编号错误/翻译腔/公式格式]
具体表现: ___
上下文: （哪个文档哪一节）
改正方案: ___
复查结果: [已修复/待观察]
```

下次翻译前先读该文件，**避免重犯历史错误**（如 PS01 甩名词教训、prob7sol 英中对照教训）。完整历史错误清单与溯源见 `HISTORY.md` 8.2。

## 7.2 自我学习机制

当翻译任务遇到本技能未覆盖的场景（新文件格式、新输出需求、新内容类型）时：

1. **先查本地**：`/home/tianque/.reasonix/skills/` 与 `.reasonix/attachments/ext/`
2. **再查官方库**：anthropics/skills（https://github.com/anthropics/skills）——注意 raw.githubusercontent.com 可能超时，用 `https://api.github.com/repos/anthropics/skills/contents/...` API 路径兜底
3. **扩展库**：antigravity-awesome-skills 在线目录（https://sickn33.github.io/antigravity-awesome-skills/）writing/education 类别
4. **拉取规范**：只拉知名/官方仓库；检查内容无害性（无恶意命令、无数据外传）；归档到 `.reasonix/attachments/ext/`；提取时标注来源 URL 与日期
5. **追加规范**：提取的内容以新的章节追加到本技能，**不改动任何已有章节的内容**

---
# 附录 A

## A1. 沙箱与文件操作（重要）

由于 Reasonix 工作区沙箱限制，直接操作桌面目录文件时需注意：

1. **`edit_file` / `delete_range` 等工具**只能操作工作区内的文件（`~/.reasonix/global-workspace/` 及子目录）
2. **目标输出目录**（如 `/home/tianque/桌面/`）不是工作区，不能直接用编辑工具
3. **解决方案**：
   - 先将文件从桌面目录复制到工作区：`cp /桌面/路径/文件 .reasonix/attachments/文件`
   - 在工作区内用 `edit_file` / `delete_range` / `multi_edit` 修改
   - 修改后用 `cp` 命令（bash）复制回桌面目录
4. **`cp` 命令可以成功写入桌面目录**（bash 不受沙箱限制），所以文件传输可行

## A2. 输出路径约定（双轨）

| 内容类型 | 输出目录 |
|---------|---------|
| 讲义/教材翻译（.bilingual.md） | `/home/tianque/桌面/课程文件/`（文件名：`<源文件名>.bilingual.md`） |
| 讨论回复/完成报告/其他文件 | `/home/tianque/桌面/输出文件/` |

沙箱限制时：先写 `.reasonix/attachments/`，再提供 `cp` 命令：
```bash
cp /home/tianque/.reasonix/global-workspace/.reasonix/attachments/xxx.bilingual.md /home/tianque/桌面/课程文件/xxx.bilingual.md
```

## A3. 讨论回复模式

涉及数学/复杂排版内容的回复（完成报告、讨论回复）：写入 `/home/tianque/桌面/输出文件/` 的自由命名 `.md` 文件（格式遵循本技能规范：中文主体 + 行内双语、蓝色标签 `#2471a3`、配色方案、blockquote 虚化、LaTeX `$...$` / ```math fenced block），并用 `marktext <文件路径>` 打开（`/usr/bin/marktext`，后台运行）。简短文字回复可直接在对话中输出。

