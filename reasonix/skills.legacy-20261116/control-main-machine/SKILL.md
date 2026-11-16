---
name: control-main-machine
description: 远程控制 Windows 主力机「天阙九泉」——通过 SSH 内网连接并执行命令
---

# control-main-machine — 远程控制 Windows 主力机

远程控制 Windows 主力机「天阙九泉」，通过本机 Linux 内网 SSH 跳板。

## 连接信息（凭据单一来源：全局记忆 `windows-main-machine-full`）

| 项目 | 值 |
|------|-----|
| **局域网 IP** | 192.168.1.16（详见全局记忆 windows-main-machine-full） |
| **用户名** | 27063（见记忆） |
| **密码** | ⚠️ 见全局记忆 `windows-main-machine-full`（2026-08-16 起不在技能里保留第二份明文） |
| **主机名** | 天阙九泉 |
| **RustDesk ID** | 514476659（见记忆） |
| **RustDesk 密码** | ⚠️ 见全局记忆 `windows-main-machine-full` |

## 使用方法

### 1. SSH 免密连接 + 执行命令（推荐，已配置密钥）

```bash
# 免密直连（密钥已配置，无需密码）
ssh tqjq 'powershell -Command "<命令>"'

# 别名也可用: ssh 天阙九泉 / ssh tianque-jiuquan
```

- SSH 配置在 `~/.ssh/config`（Host `tqjq` / `天阙九泉`），Reasonix「远程 SSH 主机」可直接导入
- 免密基于 `~/.ssh/id_ed25519`，公钥已推送到主力机 `C:\ProgramData\ssh\administrators_authorized_keys`（27063 是管理员组成员，必须用此文件而非用户目录 authorized_keys）

Python 方式（paramiko，回退方案）：

```python
import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('192.168.1.16', 22, '27063', password=<凭据见全局记忆 windows-main-machine-full>, timeout=8, look_for_keys=False, allow_agent=False)

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
rustdesk --connect 514476659 --password <凭据见全局记忆 windows-main-machine-full>
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


## DSH 钩子（DeepSeek Harness 集成 — 2026-09-04 更新）

**本机不跑 dsh（性能不足），一律走主力机 dsh**——用 `dsh-remote`（本机已装 `~/.local/bin/dsh-remote`）：

- 同步调用：`dsh-remote -m deepseek-v4.1-flash -e high "任务"`（模型必须显式，裸调用报错 exit 2）；强制最高能力：`dsh-remote -m deepseek-v4.1-flash -e max "任务"`（v4.1 flash + max；pro 已于 2026-09-10 弃用）
- 后台化：`dsh-remote --async "任务"` → 返回 id；查进度：`dsh-remote --status`
- 学术/翻译任务铁律：一律 `dsh-remote -m deepseek-v4.1-flash -e max`，任务描述显式写「发挥你最高能力 / max thinking / 详尽输出」
- 完整档案：`~/.reasonix/memory/global/工具-dsh并发调度与命令铁律-20260904.md`
- 绝不用本机 dsh（`~/.dsh` 只在主力机生效）
