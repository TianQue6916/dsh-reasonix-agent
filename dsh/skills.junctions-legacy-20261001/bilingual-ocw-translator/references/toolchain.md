> **按需加载章节**（主文档 `SKILL.md` 的 progressive disclosure 拆分件）。本技能全流程唯一模型：v4.1 flash = `deepseek-v4.1-flash`；契约与铁律见主文档「🎯 核心契约」与第 1 章。

---

# 第 5 章 工具与命令参考

> 技术细节从流程中剥离，避免干扰主线。**流程需要时再回查本章。**

## 5.1 PDF 提取工具链

### pdftotext 多模式（第一优先）

```bash
pdftotext 讲义.pdf out.txt          # 默认模式
pdftotext -layout 讲义.pdf out.txt  # 保留版面
pdftotext -raw 讲义.pdf out.txt     # 原始文本流
```
对比不同模式，合并互补内容（定理陈述不完整、节标题后跳内容 = 该换模式）。

### pdfplumber / pypdf（表格、拆分、元数据）

```bash
pip install pypdf pdfplumber reportlab
```

```python
# 文本与表格提取
import pdfplumber
with pdfplumber.open("讲义.pdf") as pdf:
    for page in pdf.pages:
        text = page.extract_text()          # 布局文本
        tables = page.extract_tables()      # 表格（含结构）

# 表格批量提取（翻译时保持表格完整性）
import pdfplumber, pandas as pd
with pdfplumber.open("讲义.pdf") as pdf:
    all_tables = []
    for page in pdf.pages:
        for table in page.extract_tables():
            if table:
                df = pd.DataFrame(table[1:], columns=table[0])
                all_tables.append(df)
# 按页码顺序合并，供翻译时逐表处理

# 按页拆分（大规模切分的程序化实现）
from pypdf import PdfReader, PdfWriter
reader = PdfReader("讲义.pdf")
for i, page in enumerate(reader.pages):
    writer = PdfWriter()
    writer.add_page(page)
    with open(f"page_{i+1}.pdf", "wb") as out:
        writer.write(out)

# 元数据（页数/标题 → 交叉引用页码换算）
meta = PdfReader("讲义.pdf").metadata
print(meta.title, meta.author)
```

### 命令行工具（qpdf / pdftk）

```bash
# 拆分页范围
qpdf 讲义.pdf --pages . 1-5 -- pages1-5.pdf
# 解密（密码保护讲义）
qpdf --password=xxx --decrypt encrypted.pdf decrypted.pdf
# 批量拆分（pdftk）
pdftk 讲义.pdf burst
```

### 扫描版 OCR（pytesseract）

```bash
pip install pytesseract pdf2image
```

```python
from pdf2image import convert_from_path
import pytesseract

for i, img in enumerate(convert_from_path('scanned.pdf')):
    print(f"Page {i+1}:", pytesseract.image_to_string(img))
```

### 🚨 Unicode 上下标教训

**绝不能用 Unicode 上下标字符**（₀₁₂₃₄₅₆₇₈₉、⁰¹²³⁴⁵⁶⁷⁸⁹）——内置字体不含这些 glyph，会渲染成实心黑块。必须用 LaTeX `$x_n$`/`$x^n$`（见铁律 6）。

## 5.2 TextIn 智能解析兜底

当 `pdftotext` 与 `pdfplumber` 都无法良好提取数学讲义（公式乱码严重）时：

```bash
# 需要环境变量 TEXTIN_API_KEY（每日 1000 页免费额度）
python scripts/xparse_skill.py parse_to_md <pdf路径>
```

- `parse_to_md`：PDF/图片 → Markdown，保留标题层级、列表、代码块
- `parse_table`：精确提取表格（含合并单元格）
- `parse_formula`：公式识别为 LaTeX（直接符合本技能数学规范）
- `parse_with_toc`：自动生成目录树（辅助结构分析）

使用顺序建议：`pdftotext` 默认 → `-layout`/`-raw` → `pdfplumber` 表格 → TextIn 兜底。多个来源结果对比合并。

## 5.3 表格翻译提示词

表格类内容翻译时，先识别表头术语（column headers），**表头保留英文原文 + 行内中文翻译，单元格数据不翻译**（数字、符号保持原样）。

## 5.4 字幕搜索完整连接代码（含 GBK 兜底 + SFTP）

```python
import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('192.168.1.16', 22, '27063', 'TQJQ6916', timeout=8, look_for_keys=False, allow_agent=False)

def run(cmd):
    stdin, stdout, stderr = client.exec_command(cmd)
    try:
        return stdout.read().decode('utf-8').strip()
    except:
        return stdout.read().decode('gbk', errors='replace').strip()

# 1. 列出字幕目录
result = run('powershell -Command "& { Get-ChildItem \'D:\\b站视频\\解析视频\\数学分析\\06-字幕文件\\终版字幕\\\' | ForEach-Object { $_.Name } }"')

# 2. 读取英文字幕
sub_en = run("powershell -Command \"& { Get-Content 'D:\\b站视频\\解析视频\\数学分析\\06-字幕文件\\终版字幕\\V01 - xxx.srt' -Encoding UTF8 }\"")

# 3. SFTP 下载字幕到本地（供译者注写作时反复引用）
sftp = client.open_sftp()
sftp.get('D:\\b站视频\\解析视频\\数学分析\\06-字幕文件\\终版字幕\\V01 - xxx.srt', '.reasonix/attachments/subtitles/V01.srt')
sftp.close()

client.close()
```

注意事项：输出编码可能 GBK，用 `decode('gbk', errors='replace')`；中文路径用 `ForEach-Object { $_.Name }` 避免编码破坏。已记录的路径：18.100B 字幕在 `D:\b站视频\解析视频\数学分析\06-字幕文件\终版字幕\`（记忆 `100b-subtitle-paths`）；B 站下载视频字幕在 `D:\b站视频\解析视频\`（记忆 `bili-subtitles-path`）。

## 5.5 全资源搜索路径清单（🚨 铁律 13）

| 资源 | 位置/方式 |
|------|-----------|
| 本机 Linux 盘区 | `/home/tianque/` 全盘（课程文件、讲义、教材 PDF、下载文档） |
| 本机 Windows NTFS 盘区 | `/media/OS`（C 盘自动挂载）——**双盘区都要找** |
| 主力机（天阙九泉） | SSH：`ssh 27063@192.168.1.16` 或 Tailscale `100.84.67.49`（免密已配置）；`D:\` 下载文档、`D:\b站视频\解析视频\` 字幕、分类资料（10-学习 等）——**无知识库/ZIM** |
| 网络 | web_fetch / 搜索引擎查证术语、史实、教材版本 |
| 离线维基（只有小电脑有） | `/media/OS/wiki-data/zim/wikipedia_en_all_nopic_2026-06.zim`（51.9GB，2026-06 版），本机 libzim 直搜（`tool-offline-wiki` 技能有代码） |

## 5.6 Word 文档处理

- **DOCX 输入提取**：`python-docx` 逐段落/表格读取文本与结构（`pip install python-docx`）
- **翻译后 DOCX 输出**：先产出 `.bilingual.md`，再转 DOCX 时保留标题层级与表格
- **格式保留修订**：若需在既有 Word 文档中做精确替换（保留加粗/斜体/颜色），用 `detailed-docx` 的逐 Run 替换（`find_replace`），支持通配符与表格单元格

## 5.7 讲义资源获取与版本验证

翻译前若讲义 PDF 缺失，或需要核对讲义版本/页数（交叉引用书页编号一致性），检查本机 OCW 离线站点：
- 路径模式：`输出文件/<course-id>-<term>-<year>/`
- `data.json` 含课程元数据（course_title、instructors）与资源清单（`file` 字段 → `https://ocw.mit.edu + file` 直链）
- `static_resources/` 已有物理文件（PDF/字幕）；`external-resources/` 可能含教材 PDF 链接（如 TBB 在 classicalrealanalysis.info）
- 下载用 thunder:// 协议推送迅雷（见 mit-ocw-downloader 技能），Internet Archive 链接需借阅、不适合批量下载

## 5.8 dsh 任务执行通道（铁律 21/22/23，2026-09-08 全量改版）

> 一切需要"另派代理干活"的场景（翻译 / 写注 / 审计 / 交叉引用 / 扩写 / 审阅）**全部走主力机 dsh**，Reasonix 内建子代理一律不用（铁律 21）。
> 🚨 **通道与模型（铁律 12，2026-09-10）**：**全任务统一 `dsh-remote -m deepseek-v4.1-flash`**（超强审计加 `-e max`），pro 已弃用；`-pro` 语法保留但等价于 `-m deepseek-v4.1-flash -e max`。
> 🚨 **wiki 先行（铁律 23）**：派发任何 dsh 任务前，主代理先查本机 PocketWiki + 离线维基 ZIM，把检索结果注入 prompt；主力机无 wiki，必须由本机注入。
> 命令细节、并发调度、报告落盘、防误杀规范见 `dsh-gate` 技能与 HISTORY.md（DSH 钩子）。

**影响翻译质量的 dsh 关键约束（铁律 12/20 执行细则）：**
- **任何学术任务都是 v4.1 flash**：`dsh-remote -m deepseek-v4.1-flash -e high "任务"`；超强审计用 `-e max`，任务里写「发挥你最高能力 / max thinking / 详尽输出」；**难任务靠补资料 + 加厚 prompt + 多轮优化**
- **`-e` 选择**：off/low（机械小活）→ high（常规翻译/写注）→ max（超强审计、疑难数学、长文扩写）
- **超长任务拆块 ≤18KB**：flash+max 审
- 结果以 `%TEMP%\dsh-gate\` 产物文件为准（status 文件 phase 滞后是常态，产物文件出现 = 完成）；判定卡死需同时满足产物无新文件 + node CPU 长时间不增 + 超经验时长，禁止凭单一 status 信号 kill 在跑任务
- 派发后确认任务真的出去（有 status 文件 + node 进程）再继续
- 🚨 命令写法铁律：禁止 `cmd | python3 -c "..."` 管道形态（host 会 block）——用 heredoc（`python3 - <<'EOF'`）或解释器命令放最后一段

---
