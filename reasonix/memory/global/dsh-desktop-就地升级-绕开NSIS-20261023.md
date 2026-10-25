---
id: mem-34c422830dca4e0b281ea72a5d65c4c8
revision: 1
created_at: "2026-10-23T04:00:28.188Z"
updated_at: "2026-10-23T04:00:28.188Z"
name: dsh-desktop-就地升级-绕开NSIS-20261023
description: "dsh 桌面端就地升级成功（Electron 44.0.0→44.7.0，dsh 0.2.0-rc.2→0.2.1-rc.2）：官方 NSIS 安装器在这台机器上永远 rc=2（各种参数/关应用/换目录全试过），改用「exe 偏移 863248 找 7z 签名 → py7zr 解包 → 整目录 rename 替换」，路径不变所以快捷方式与任务栏 pinned 全保留；附本机 shell 三个坑（python 调 schtasks 必败、powershell detached 不执行、schtasks+bat 才可靠）"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 结论
桌面端从 Electron **44.0.0 / dsh 0.2.0-rc.2** 升到 **44.7.0 / dsh 0.2.1-rc.2**，**没有用官方安装器**（它在这台机器上永远 rc=2）。用的是「解包 + 整目录 rename」。

## 官方安装器为什么用不了（穷举实测，别再重复）
下载好的包：`%LOCALAPPDATA%\@deepseek-aidsh-desktop-updater\pending\deepseek-harness-0.2.1-rc.2-win-x64.exe`（289,385,456 B，sha512 与 nightly.yml 一致，签名 Valid，无 Zone.Identifier）。

| 尝试 | 结果 |
|---|---|
| `/S` | rc=2，0.6 s |
| `/S --updated` | rc=2，0.7 s |
| `/S /NCRC` | rc=2，3.7 s |
| `/S /D=<临时目录>`（不动现有安装） | rc=2，51 s，0 个文件 |
| 应用全部 taskkill 后 `/S` | rc=2，0.7 s（**排除"应用占用"**） |
| UI 里点「安装并重启」 | 卡十几分钟不重启 |

⇒ 排除参数、排除占用、排除签名/SmartScreen。这个 NSIS 在这台机器上就是不工作（未查明根因，可能是杀软/策略）。**不要再浪费时间调参数。**

## 可复现的替代路径（已成功）
```python
# 1) 在安装器里找 7z 签名（electron-builder 把 app 打成 app-64.7z 内嵌）
sig = bytes([0x37,0x7A,0xBC,0xAF,0x27,0x1C])
# 实测偏移 = 863248（别的版本要重新找，不能写死）

# 2) 从该偏移切到文件尾 → 得到一个完整 7z
# 3) py7zr 解压（pip install py7zr）
with py7zr.SevenZipFile(cut, 'r') as z: z.extractall(path=dst)
#    8708 条目 → 7811 文件 / 1094 MB，顶层结构与安装目录一一对应

# 4) 关应用 → 两个 rename（同盘瞬间完成）→ 启动
move  安装目录 → 安装目录.old-<日期>
move  解压目录 → 安装目录
start 安装目录\DeepSeek Harness.exe
```

## 关键判断：不能只换 app.asar
| | 旧 | 新 |
|---|---|---|
| Electron `version` 文件 | 44.0.0 | **44.7.0** |
| DeepSeek Harness.exe | 244,481,512 | 246,343,144 |
| resources/app.asar | 121,348,951 | **182,794,869** |

Electron 主版本变了 ⇒ 必须整目录换；只换 asar 会崩。**整目录 rename 的好处：路径一个字没动，桌面/任务栏 pinned 全保留。**

## 本机 shell 层的三个坑（都实测过）
1. **python `subprocess` 调 `schtasks` 一律报 "The system cannot find the path specified"**，即使传 `cwd=C:\...`、用完整路径。改用 **bash 里 `cmd //c "C:\Windows\System32\schtasks.exe ..."`** 就能成功。
2. **python `Popen(['powershell', '-File', script], DETACHED_PROCESS)` 启动的脚本一行都不执行、零输出**。别用 powershell 做后台脚本。
3. **`schtasks /create /tr <bat>` + `/run` 是唯一可靠的「脱离应用存活」执行方式**；bat 里用 `ping -n N 127.0.0.1 >nul` 做延时（任务调度器里没有终端，`timeout /t` 会报错）。

## 升级后的回归（全部通过）
- asar 内 dsh 版本串 = `0.2.1-rc.2`
- bili `/__bili/sessions` 四个会话 `contextWindow` 全是 **868928**
- `dsh-headroom-ccr.json` 1.73 MB 仍在增长（豁免生效）
- wechat daemon 端口 10425 connect OK
- `host-stdio.log` / `stall-guard.log` **零 skip**（`profiles/desktop/compatibility.json` 里预置的 `0.2.1-rc.2` 豁免起作用了）
- 旧版完整保留在 `%LOCALAPPDATA%\Programs\DeepSeek Harness.old-20261023`（1.06 GB），随时可回滚
