---
name: ocw-lecture-translator
description: MIT OCW 讲义深度翻译流水线：搜索主力机字幕 → 行内双语翻译 → 跨课程译者注（CLRS/CSAPP/离散数学）→ 输出到桌面
---

# ocw-lecture-translator — MIT OCW 讲义深度翻译流水线

对 MIT OCW 课程讲义 PDF 进行完整翻译流水线：**搜索 Windows 主力机字幕 → 行内双语翻译（bilingual-translator 铁律）→ 添加跨课程连接译者注 → 输出到桌面课程目录**。

## 适用场景

收到 MIT OCW / MIT 6.006 / 18.100B / 6.042J 等课程的讲义 PDF，需要产出：
- 行内双语 Markdown（中文主体 + 英文术语嵌入，**禁止英中分段对照**）
- 跨课程连接译者注（CLRS、CSAPP、离散数学、线性代数等）
- 第一性原理洞察 + 证明策略模板
- Mermaid 图替代 ASCII 草绘

## 工作流程

### Step 0：约定

输出目录：`/home/tianque/桌面/课程文件/{course_code}/lec/`
默认输出文件名：`{course_code}_lec{num}-{slug}.bilingual.md`

### Step 1：连接 Windows 主力机搜索字幕（可选，失败则跳过）

```python
import paramiko, socket
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    client.connect('192.168.1.16', 22, '27063', 'TQJQ6916', timeout=5, look_for_keys=False, allow_agent=False)
    
    # 搜索策略：按课程代码和讲次搜索
    # 文件名模式举例: "lec15", "lecture15", "Lecture15", "L15", "6_006_lec15"
    cmd = f'cmd.exe /c "dir C:\\Users\\27063\\*{course_code}* /s /b 2>nul | findstr /i lec{num}"'
    
    # 如果找到 .srt/.vtt，用 type 命令读取内容
    # 编码尝试顺序: utf-8 → gbk → utf-16
    
    client.close()
except (socket.timeout, paramiko.AuthenticationException, OSError) as e:
    print(f"主力机不可达或SSH失败: {e}，跳过字幕搜索")
```

如果主力机无法连接或没有字幕，记录错误后继续执行，**不中断流水线**。

### Step 2：读取 PDF 文本

- 用 `pdftotext` 默认模式提取
- 若内容明显缺失，尝试 `pdftotext -layout` 或 `pdftotext -raw`
- 对比不同模式，合并互补内容

### Step 3：翻译 + 排版（遵循 bilingual-translator 铁律）

**🚨 铁律：**
1. **禁止英中分段对照** —— 输出中不得出现完整英文原句。英文只以术语片段 `English term（中文翻译）` 形式嵌入中文句子。
2. **行内公式用 `$...$`，块级公式用 ` ```math ` fenced block，禁止 `$$...$$`**
3. **标题标记在行首** —— `###` / `##` 前无 `<span>` 等 HTML tag
4. **功能模块前加蓝色标签** `<span style="color:#2471a3;">**[tag]**</span>`
5. **配色方案：** 蓝标签 `#2471a3`、深红标题 `#c0392b`、深青定义句 `#00838f`、深绿注释 `#1e8449`、灰脚注 `#7f8c8d`
6. **禁止使用 `<div>`**（MarkText 不兼容）
7. **答案用 `>` blockquote 包裹**（MarkText 自动虚化）
8. **代码块保持原样**，不受字体缩放影响

**标签对照表：**
| 标签 | 用途 |
|---|---|
| `[lecture]` | 讲次标题 |
| `[section]` | 节标题 |
| `[theorem]` | Theorem（定理） |
| `[proof]` | Proof（证明） |
| `[definition]` | Definition（定义） |
| `[corollary]` | Corollary（推论） |
| `[example]` | Example（例） |
| `[note]` | Note（译者注/补充） |

### Step 4：添加跨课程连接译者注

根据用户知识体系添加 `[note]` 标签注释，**每条注必须基于真实知识不能编造**：

**注的类型：**
1. **跨课程连接**：连接到 CLRS（算法导论）、CSAPP（深入理解计算机系统）、MIT 6.042J（离散数学）、Strang（线性代数）、Boyd（凸优化）等课程，指明课程名、章节、具体概念
2. **第一性原理洞察**：解释定理/方法背后的核心直觉，追溯最基础的假设
3. **证明策略模板**：把证明方法抽象为可复用模板（ε/2 技巧、峰点论证、分组放缩、归纳三步法等）
4. **设计思路分析**：解释为什么这个例子/算法被这样设计，教学意图是什么
5. **历史与人物**：数学家为什么这么想？当时要解决什么问题？

**质量标准：**
- 每条注 ≥ 3 句话，100-300 字
- 信息密度高，不凑数
- 分布均匀，关键定理/算法至少一条注
- 用 `<span style="color:#1e8449;">**[note]** ` 标注，`>` blockquote 包裹

### Step 5：输出

- 写入工作区临时文件 `.reasonix/attachments/{filename}.bilingual.md`
- 复制到目标目录 `/home/tianque/桌面/课程文件/{course_code}/lec/`
- 清理临时文件

### Step 6：最终审查清单

- [ ] **🚨 无完整英文原句** —— 无英中分段对照
- [ ] **行内公式 `$...$`**，无 `$$`
- [ ] 标题层级正确（`#` → `##` → `###` → `####`），标记在行首
- [ ] 每个功能模块有蓝色标签
- [ ] 关键术语首次出现有 `English（中文）` 格式
- [ ] Mermaid 图替代 ASCII 草绘
- [ ] 译者注有实质内容且准确
- [ ] 配色方案统一
- [ ] 未使用 `<div>`
- [ ] 输出到目标目录

## 输入参数

调用时需指明：
- `pdf_path`：PDF 文件路径
- `course_code`：课程代码（如 `006`、`18.100B`、`6.042J`）
- `lec_num`：讲次编号（如 `15`）
- `lec_title`：讲次标题英文（如 `Recursive Algorithms`）
