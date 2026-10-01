---
name: thunder-download-method
description: 迅雷调用方法：thunder://协议Base64转换+Powershell推送
type: reference
scope: global
created: 2026-06-16
---
# 迅雷（Thunder）自动化下载方法

## 安装路径
```
D:\Thunder\Program\Thunder.exe       # 主程序
D:\Thunder\Program\ThunderStart.exe  # 启动器
D:\Thunder\Program\ThunderCmd.exe    # 命令行
```

## thunder:// 协议（推荐方案）
迅雷注册了 `thunder://` 协议：`HKEY_CLASSES_ROOT\thunder\Shell\Open\command` → `"D:\Thunder\Program\Thunder.exe" "%1" -StartType:thunder`

### URL 转换规则
```
原始URL → "AA" + URL + "ZZ" → Base64编码 → 添加 "thunder://" 前缀
```

### PowerShell 推送代码
```powershell
# 单个
$bytes = [System.Text.Encoding]::UTF8.GetBytes('AA' + $url + 'ZZ')
$b64 = [System.Convert]::ToBase64String($bytes)
Start-Process ('thunder://' + $b64)

# 批量（需间隔500ms）
foreach ($u in $urls) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes('AA' + $u + 'ZZ')
    $b64 = [System.Convert]::ToBase64String($bytes)
    Start-Process ('thunder://' + $b64)
    Start-Sleep -Milliseconds 500
}
```

### 检查迅雷运行状态
```powershell
Get-Process Thunder -ErrorAction SilentlyContinue
```

## MIT OCW 下载 URL 构造
- Base URL: `https://ocw.mit.edu`
- 资源路径: data.json 中 `"file"` 字段值（如 `/courses/18-100b-real-analysis-spring-2025/file.mp4`）
- 完整 URL: `https://ocw.mit.edu/courses/...`

## 备用方案（手动）
生成 `thunder_download_list.txt` 文件，让用户手动导入迅雷（新建批量任务）。

## 适用场景
- MIT OCW 视频大文件下载
- 任何需要迅雷加速的 HTTP/HTTPS 下载
