---
name: control-main-machine
description: 远程控制 Windows 主力机「天阙九泉」——通过 SSH 内网连接并执行命令
---

# control-main-machine — 远程控制 Windows 主力机

远程控制 Windows 主力机「天阙九泉」，通过本机 Linux 内网 SSH 跳板。

## 连接信息（来自全局记忆）

| 项目 | 值 |
|------|-----|
| **局域网 IP** | 192.168.1.16 |
| **用户名** | 27063 |
| **密码** | TQJQ6916 |
| **主机名** | 天阙九泉 |
| **RustDesk ID** | 514476659 |
| **RustDesk 密码** | @zyxTQJQ6916 |

## 使用方法

### 1. SSH 连接 + 执行命令（推荐）

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

# 执行任意 PowerShell 命令
result = run('powershell -Command "<命令>"')

client.close()
```

### 2. RustDesk GUI 远程桌面

```bash
rustdesk --connect 514476659 --password '@zyxTQJQ6916'
```

### 3. 获取系统信息

```python
run('powershell -Command "Get-CimInstance Win32_OperatingSystem | Select-Object Caption,LastBootUpTime"')
run('powershell -Command "Get-Process | Sort-Object CPU -Descending | Select -First 10 Name,CPU,@{n=\'Mem(MB)\';e={$_.WorkingSet/1MB}}"')
```

### 4. 在桌面启动 GUI 程序

```python
# 通过计划任务在用户桌面启动程序
run(f'schtasks /create /sc once /tn "temp_gui" /tr "<程序路径>" /ru "27063" /it /f')
run('schtasks /run /tn "temp_gui"')
run('schtasks /delete /tn "temp_gui" /f 2>nul')
```

### 5. 文件传输

```python
# 上传文件到 Windows
sftp = client.open_sftp()
sftp.put('/本地/路径', 'C:\\Users\\27063\\Desktop\\文件名')

# 从 Windows 下载文件
sftp.get('C:\\Users\\27063\\Desktop\\文件名', '/本地/路径')
sftp.close()
```

## 注意事项

- 主力机需开机且联网
- 本机 Linux 需开机（SSH 跳板）
- 输出编码可能是 GBK，用 `decode('gbk', errors='replace')`
- PowerShell 命令较长时用 `-Command` 参数包裹
