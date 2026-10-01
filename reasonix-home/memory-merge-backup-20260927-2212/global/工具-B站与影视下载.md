---
id: merged-工具B站与影视下载.md
revision: 1
created_at: "2026-08-16T14:30:00.000000000Z"
updated_at: "2026-08-16T14:30:00.000000000Z"
name: 工具-B站与影视下载.md
description: B 站/影视下载方法、源侦察、迅雷清理
metadata:
  type: user
  fact_type: reference
  scope: global
---

# 工具-B站与影视下载.md

> 2026-08-16 合并生成。来源原始件在 ~/.reasonix/memory-archive-20260816/（信息零丢失）。


## 来源：b站视频下载方法-downkyi-ytdlp.md

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

## 来源：电影下载-B站源侦察与登录刷新-20260815.md

# 18 部动画电影 B 站源侦察（2026-08-15）

## 状态：用户选择暂停，明天找其他渠道

## 账号登录态（重要）
- B 站账号「天阙九泉」（uid 1247484152），**非大会员**
- 旧 SESSDATA 已失效；通过官方二维码 API 重新登录成功
- **新 SESSDATA 已同步到主力机**：
  - `D:\b站视频\bili_cookies.txt`（Netscape 格式，yt-dlp 用）
  - `D:\b站视频\Config\Login`（DownKyi 格式）
  - 有效期至 2027-02-10；本机备份 `/tmp` 已清，需要时从主力机取
- 二维码登录流程（可复用）：`passport.bilibili.com/x/passport-login/web/qrcode/generate` → 显示二维码 → poll `qrcode/poll?qrcode_key=xxx`（**判断 data.code==0**，外层 code 恒为 0 是陷阱）→ 成功后 poll 响应 Set-Cookie 里有 SESSDATA/bili_jct/DedeUserID（需 -D 保存 headers）；URL 编码的 SESSDATA 需 unquote 后写入 cookies.txt

## B 站可用源（确认可下，画质排序）
| 电影 | BV | 画质/体积 | 备注 |
|------|-----|----------|------|
| 罗小黑战记2 | BV1c2RWBrECE | **1080P 1.35GB**（30080 avc）| 蓝光高码率未删节，质量最好 |
| 吉尔莫·德尔·托罗的匹诺曹 | BV1rzT8zXEpq | 720P 853MB（805kbps）| 148 分钟（原片 117，可能含花絮）|
| 心灵奇旅 | BV12rFszhEyy | 720P 271MB（375kbps）| 1080P 需大会员 |
| 冰雪奇缘 | BV1GP26YxEEv | 720P 91MB（127kbps）| 低码率画质差 |
| 疯狂动物城 | BV1TV4y1P7hV | 480P 353MB（475kbps）| 唯一源 |

## 排除的坑（勿再用）
- 机器人总动员 BV1djyqBGEGG：**假源**，1080P 仅 20MB（28kbps 幻灯片）
- 魔法满屋 BV1SG4y1k7Kq：是有声书（滚动字幕）非电影；BV1kiKY6EEaL 231 分钟合集
- 蜘蛛侠平行宇宙 BV1bCur64EzQ：65 分P 合集号（含车模等无关内容）
- 疯狂动物城2 BV15ZDMBVEZB：原盘 Extras 18P **无正片**（全是 featurette/删减片段）
- 头脑特工队 BV1CJagzwE4Q：9P 拆段+英语学习字幕；飞屋 BV1q2Tj6hEw9 36P 拆段；千与千寻 BV1tbug6iE76 8P 拆段

## B 站无完整搬运（12 部，需其他渠道）
浪浪山小妖怪、K-POP猎魔女团、猫猫的奇幻漂流（8-15 重映）、你想活出怎样的人生、玩具总动员4、寻梦环游记、飞屋环游记、头脑特工队、千与千寻、疯狂动物城2、蜘蛛侠平行宇宙、机器人总动员

## 下载环境
- 主力机 yt-dlp.exe：`D:\b站视频\videoget\yt-dlp.exe`（2026-05-11 版）
- 电影目录已建：`D:\40-媒体\电影\`（主力机 D 盘可用 68.9GB，本机 / 可用 85GB）
- 下载模板：`-f "bv*+ba/b" -S "res:1080" --merge-output-format mp4 --cookies bili_cookies.txt`，1080P 高码率格式需大会员
- 本机网络只能访问国内站（BT 站 dmhy/nyaa/acg.rip 全被墙）；本机无 yt_dlp python 模块，装了 yt-dlp CLI（pip --break-system-packages）

**Why:** 用户 2026-08-15 要求下载 18 部动画电影，侦察后暂停等用户找其他渠道；登录态刷新和源清单是核心资产，明天可直接复用。
**How to apply:** 用户明天给新渠道时，先用此清单比对已可用源；若开通大会员则全部走正版 1080P。

## 来源：迅雷下载目录清理-20260805.md

# 迅雷下载目录大清理（2026-08-05）

## 发生了什么
8/5 凌晨 3:50 迅雷自动启动（14 进程），把任务列表里积压的历史任务全部激活，往 `D:\迅雷下载` 批量重写了约 59GB 的 `.xltd` 文件——其中含一个 **49GB 的 `wikipedia_en_all_nopic_2026-06.zim.xltd`**（与 C 盘 `C:\wiki-data\zim\` 完整版完全重复）。

## 本次清理结果（删除约 81GB）
- ZIM `.xltd` 49GB（C 盘已有 sha256 验证版）✅
- mackay `.xltd` ×16（镜像 `D:\b站视频\解析视频\信息论\视频\` 已有 B 站版）✅
- 6.046 300k 低清 ×5 + 已完成 300k ×6 + 6.046j zip（镜像 `算法进阶\视频` 已有高清版）✅
- EE364A-lecture01~19.mp4 ×19 = 21.66GB（镜像 `凸优化\视频\SEE高清版\` 已有同款，SHA256 逐一匹配）✅
- Real Analysis OCW 离线站（3.9MB 页面源）→ 归档到 `D:\b站视频\解析视频\数学分析\08-OCW离线站源\`

## 最终状态
- `D:\迅雷下载` 仅剩：工具安装包（DownKyi、SwitchHosts、VOSviewer、winlibs、SubtitleEdit、Reasonix 安装器、code deb、douyin、StayAwake）+ aria2_test + Bigemap Pro
- D 盘可用 133.5GB

## 教训
1. **thunder:// 推送「未自动入列」≠ 任务没进列表**——链接可能已进迅雷任务列表，之后迅雷自启会静默恢复下载。用 aria2 下载成功后，应同时清掉迅雷里对应任务，否则会重复下载。
2. **判断镜像是否已有文件，必须展开子目录**——`凸优化\视频\` 下有 `B站中英字幕版` + `SEE高清版` 两套，只看第一层目录会误判为「空」。

**Why:** 用户发现「知识库移走后迅雷下载还有文件」源于此；避免未来重复清理/误删。
**How to apply:** 整理课程镜像时先递归列出目标目录；用 aria2 替代迅雷后同步清理迅雷任务列表。
