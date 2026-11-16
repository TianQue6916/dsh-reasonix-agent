---
name: mit-ocw-downloader
description: 分析MIT OCW离线站点，提取需下载资源，推送至迅雷批量下载
---
# MIT OCW 离线站点下载器

解析 MIT OCW Hugo 静态站点，提取所有外部资源链接，通过迅雷批量下载。

## 工作流程

### 1. 读取站点结构
离线站点路径通常是 `输出文件/<course-id>-<term>-<year>/`，包含：
- `data.json` — 课程元数据（course_title, instructors 等）
- `resources/` — 每个资源一个文件夹，内含 `data.json`
- `static_resources/` — 已下载的物理文件（PDF/字幕/图片）
- `external-resources/` — 外部资源（教材链接等）

### 2. 解析资源清单

对 `resources/` 下每个子文件夹的 `data.json`，提取：
- `file` 字段 → 服务器路径
- `file_type` → `video/mp4`, `application/pdf` 等
- `youtube_key` → YouTube ID（视频备用源）

```python
data.json 结构示例：
{
  "file": "/courses/18-100b-real-analysis-spring-2025/ocw_18100b-lec01-2025feb04_360p_16_9.mp4",
  "file_type": "video/mp4",
  "youtube_key": "BWvjy0a1Ffg"
}
```

### 3. 滤除已有文件
检查 `static_resources/` 目录中是否已有同名文件（去除路径前缀后的文件名）。
未找到的文件就是需要下载的。

### 4. 构建 MIT OCW 下载 URL
```
Base URL: https://ocw.mit.edu
Path: data.json 中的 "file" 字段值（以 /courses/ 开头）
完整 URL: https://ocw.mit.edu + file_path
```

### 5. 检查外部资源
`external-resources/` 下每个文件夹的 `index.html` 中可能包含教材 PDF 链接。
用正则 `href="(https?://[^"]+\.(pdf|zip))"` 提取可下载文件。

### 6. 推送至迅雷

**方法A：thunder:// 协议（推荐）**
```
function ConvertTo-ThunderUrl($url) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes('AA' + $url + 'ZZ')
    $b64 = [System.Convert]::ToBase64String($bytes)
    return 'thunder://' + $b64
}
Start-Process $thunderUrl
```

**方法B：检查迅雷是否已运行**
```powershell
Get-Process Thunder -ErrorAction SilentlyContinue
```

**方法C：检查迅雷安装路径**
```
D:\Thunder\Program\Thunder.exe (常用路径)
D:\Thunder\Program\ThunderStart.exe (启动器)
D:\Thunder\Program\ThunderCmd.exe (命令行)
```

**方法D：thunder:// 协议注册表位置**
```
HKEY_CLASSES_ROOT\thunder\Shell\Open\command
→ "D:\Thunder\Program\Thunder.exe" "%1" -StartType:thunder
```

### 7. 注意点
- 每个 `Start-Process` 需要间隔 500ms，避免过快
- Thunder 可能弹出确认对话框（需要用户交互）
- PDF 教材可能来自外部域名（如 classicalrealanalysis.info）
- Internet Archive 链接（archive.org）需要注册借阅，不适合迅雷
- 迅雷默认不捕获 MIT OCW 的直链，必须用 thunder:// 协议转换

## 输出
- `thunder_download_list.txt` — 全部下载链接文本文件（供手动导入）
- PowerShell 脚本文件 — 自动推送脚本
- 或直接调用推送（如上）
