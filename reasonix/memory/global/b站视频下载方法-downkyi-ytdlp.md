---
id: mem-2926ce1c034d2b5ddaab84538a0d15e8
revision: 1
created_at: "2026-08-02T06:16:42.3779401Z"
updated_at: "2026-08-02T06:16:42.3779401Z"
name: b站视频下载方法-downkyi-ytdlp
description: B 站视频下载方法：DownKyi 登录 cookie + yt-dlp 模板（突破 412，720P 合并）
metadata:
  type: user
  fact_type: reference
  scope: global
---

# B 站视频下载方法（DownKyi 登录态 + yt-dlp）

**适用**：archive.org / YouTube 被墙时，从 B 站搬运下载 MIT OCW 课程视频（2026-08-02 实战验证，6.046J 补齐 11 个视频成功）。

## 核心事实
- `D:\b站视频` 是 junction → `D:\40-媒体\b站视频`（同一目录）
- **DownKyi 已登录 B 站**：`D:\40-媒体\b站视频\Config\Login` 含 SESSDATA（有效期至 2026-11-06）+ bili_jct + DedeUserID
- **cookies 文件**：`D:\40-媒体\b站视频\bili_cookies.txt`（Netscape 格式，含 buvid3 + SESSDATA + DedeUserID 等），yt-dlp 用 `--cookies` 加载
- yt-dlp 位置：`D:\40-媒体\b站视频\videoget\yt-dlp.exe`（2026.03.17）
- 仅用 SESSDATA 会 412 风控，必须 buvid3 + 完整 cookies.txt + 正确 UA + Referer

## 下载命令模板
```powershell
$yt='D:\40-媒体\b站视频\videoget\yt-dlp.exe'
$cookies='D:\40-媒体\b站视频\bili_cookies.txt'
$ua='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
& $yt --no-warnings --playlist-items <分P号> --cookies $cookies --user-agent $ua --referer "https://www.bilibili.com" -f "30064+30280" --merge-output-format mp4 -o "<输出路径>\<文件名>.%(ext)s" "https://www.bilibili.com/video/<BV号>/"
```

## 关键参数
- `-f "30064+30280"`：30064=720P 视频流，30280=音频流，yt-dlp 自动 ffmpeg 合并（注意：480P 是 30032，720P 是 30064）
- 格式 ID 规则：30016=360P、30032=480P、30064=720P；音频 30216=67k、30232/30280=130k
- B 站 API 验证分P：`https://api.bilibili.com/x/web-interface/view?bvid=BV号`（无需登录可拿 title/pages/owner）

## 已知 B 站课程搬运
- **MIT 6.046J 算法设计**（2015，Demaine/Devadas/Lynch）：BV1A7411E737，34分P=24讲+Rec 01/02/04-11，UP鬼谷良师
- **MIT 6.041 概率导论**（2010，Tsitsiklis）：BV1zd4y1N7BL（25分P全480P）或 BV1jm4y197TT（26分P，前2段720P其余480P）

## 坑
- 大文件下载中途可能中断只留 .part，需重试（Rec 01/02 曾中断）
- 合并后残留 `.f30064.mp4`/`.f30280.m4a` 需手动清理
- B 站搬运画质上限通常 720P（登录后），archive.org 原版是 300k 低码率，B 站反而更清晰

**Why:** archive.org 被墙（DNS污染+IP封锁）时唯一可行的国内下载通道。
**How to apply:** 下载 MIT OCW 视频优先查 B 站搬运，用此模板；cookies 过期（2026-11-06 后）需重新从 DownKyi Config/Login 导出。
