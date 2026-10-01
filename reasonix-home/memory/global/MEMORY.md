# 记忆索引 MEMORY.md（2026-09-24 双机统一版）

> **2026-09-24 双机合并**：Linux 分类精简版 + Windows 增量列表版合并为唯一权威索引，覆盖 `memory/global` 全部记忆。此后两端共用本文件，不再各自维护列表。
> **历史**：2026-08-16 记忆优化 59 → 26（-56%），原文全部在 `~/.reasonix/memory-archive-20260816/`（信息零丢失）；`memory-backup-20260816*/` 为全量备份；旧索引条目保留于 `.archive` / `.revisions`。

## 一、元规则与核心身份（6）
- [元规则-01-Reasonix核心身份](元规则-01-Reasonix核心身份.md) — 核心身份/只改名不改内容/标准化命名体系/会话分类 + 任务前画像校验逻辑
- [元规则-02-自动记忆规则](元规则-02-自动记忆规则.md) — 重要操作后自动 remember 的触发场景与格式
- [元规则-03-技能路由](元规则-03-技能路由.md) — 22 技能强制路由映射（2026-08-16 v2，技能精简后重写）
- [元规则-Reasonix核心身份](元规则-Reasonix核心身份.md) — 同上（旧命名版，保留溯源）
- [元规则-自动记忆规则](元规则-自动记忆规则.md) — 同上（旧命名版，保留溯源）
- [元规则-技能路由16条](元规则-技能路由16条.md) — 16 场景 Skill 自动触发映射（旧命名版）

## 二、用户画像与输出规范（8）
- [user-persona-cognitive-system-architect](user-persona-cognitive-system-architect.md) — 用户完整画像 v3.0：2304 会话全量量化（认知指纹/学习轨迹/行为/风险）
- [academic-level-and-teaching-style](academic-level-and-teaching-style.md) — 各学科当前水平、教材、阶段与最佳教学方式（大二上前窗口期）
- [use-user-persona-before-tasks](use-user-persona-before-tasks.md) — 铁律：翻译/教学/方案/代码等实质任务前先调画像校验输出
- [v4pro-for-complex-reasoning](v4pro-for-complex-reasoning.md) — 复杂推理场景可用更强模型（历史授权，现执行 2026-09-10 模型铁律）
- [输出规范](输出规范.md) — 默认输出目录 + MarkText 讨论模式
- [default-output-directory](default-output-directory.md) — 默认输出路径 `/home/tianque/桌面/输出文件/`
- [discussion-reply-in-marktext-md](discussion-reply-in-marktext-md.md) — 数学符号类讨论：写自由命名 md + marktext 打开，格式循双语规范
- [share-file-with-user-via-wps](share-file-with-user-via-wps.md) — 文件就绪直接用 WPS 打开（自动云同步到手机）；微信通道不支持发文件

## 三、API / 模型 / dsh 路由（15）
- [api-调用默认-command-code-goat](api-调用默认-command-code-goat-套餐-key-而非-deepseek-官方.md) — API 默认 Command Code GOAT；2026-09-09 官方 web_search 隔离 + dsh 强制显式铁律
- [commandcode-goat-额度查询端点与看板工具](commandcode-goat-额度查询端点与看板工具.md) — GOAT 额度（5小时/周/月）官方端点 + 本地看板 goat-usage.ps1（2026-09-23 打通）
- [github-public-备份泄露-goat-key-事件与根因修复](github-public-备份泄露-goat-key-事件与根因修复-2026-09-23.md) — user_ 前缀 key 明文躺 public 仓库约 3 个月：两个根因、已完成修复与历史清理、待轮换 key
- [deepseek-v4-flash-ga-0731](deepseek-v4-flash-ga-0731.md) — V4 Flash 正式版 0731 同名原地升级，模型 id 不变，Reasonix 零改动生效
- [dsh-gate-双机路由铁律](dsh-gate-双机路由铁律.md) — Pro 强制走 dsh + 双机分工铁律（模型铁律已更新：pro 弃用、统一 v4.1 flash）
- [dsh-gate-双机配置档案](dsh-gate-双机配置档案.md) — DSH 双机安装/演进/锚定/创造模式/并发禁令档案
- [dsh-gate-dual-machine-setup](dsh-gate-dual-machine-setup.md) — DeepSeek Harness 双机配置 + dsh-gate 决策钩子完整档案
- [dsh-调用-通知丢失-频繁失败-根因与修复](dsh-调用-通知丢失-频繁失败-根因与修复-2026-09-11-实测锁定.md) — 2026-09-11 实测锁定根因与修复
- [工具-dsh并发调度与命令铁律-20260904](工具-dsh并发调度与命令铁律-20260904.md) — dsh 并发调度与命令铁律（2026-09-04）
- [tool-dsh-015-upgrade-20260920](tool-dsh-015-upgrade-20260920.md) — dsh 0.1.1-rc.2 → 0.1.5-rc.2 升级：四处必改、插件面核查、双路径端到端验证、回滚法、双机待办
- [tool-dsh-maxtokens-config-20260920](tool-dsh-maxtokens-config-20260920.md) — maxTokens 配置：defaultMaxTokens 65536 + 4 模型 262144、GOAT 实测接受度表、验证命令
- [tool-dsh-stream-interrupt-retry-20260920](tool-dsh-stream-interrupt-retry-20260920.md) — 流式中断（TRANSPORT）两档重试策略、-AlwaysRetry 落地、上游 issue 与 headless 无 resume 硬限制
- [tool-dsh-infinite-gen4-web-install](tool-dsh-infinite-gen4-web-install.md) — dsh「无限四代」插件 web profile 装卸档案：2026-09-23 已完整卸载，含 junction 坑与三重验证法
- [skill-安装-无限四代载荷存档](skill-安装-无限四代载荷存档.md) — 无限四代事件全档案（已全部卸载）：诉求演变、拒绝边界、`✗ 购买授权` 真实含义
- [meta-secret-redaction-select-string-pitfall](meta-secret-redaction-select-string-pitfall.md) — 教训：Select-String 校验含密钥配置会打印整行，key 明文进会话记录；含正确脱敏写法

## 四、双机与远程控制（4）
- [windows-main-machine-full](windows-main-machine-full.md) — 主力机「天阙九泉」完整远控信息（SSH + RustDesk + IPv6），唯一凭据源
- [tailscale-tianque-jiuquan-mesh](tailscale-tianque-jiuquan-mesh.md) — Tailscale 组网：Linux 100.79.96.82 / Windows 100.84.67.49，开机自启与安装坑
- [ssh-passwordless-and-tool-skills-20260804](ssh-passwordless-and-tool-skills-20260804.md) — 免密 SSH（tqjq/天阙九泉）+ skill shadow 修复 + 3 个工具 skill
- [工具-网络与远程](工具-网络与远程.md) — Tailscale/SSH/dev-sidecar 网络与远程配置汇总

## 五、Reasonix 本体：工作区 / 并发 / 系统（17）
- [reasonix-32-parallel-limit-and-translation-division](reasonix-32-parallel-limit-and-translation-division.md) — 单批 ≤32 并行；模型铁律（2026-09-10）：全任务统一 v4.1 flash；全资源搜索
- [reasonix-多并发-长任务后台化规范](reasonix-多并发-长任务后台化规范.md) — 长任务后台化+写工作区外+会话长度控制；两个阻塞错误的根因与解法
- [reasonix-launcher-layout-migrate-fix](reasonix-launcher-layout-migrate-fix.md) — Linux 侧边栏启动失败：launcher 迁移缺 reasonix-cli 的根因与两步修复
- [reasonix-launcher-blocked-by-session0-name-collision](reasonix-launcher-blocked-by-session0-name-collision.md) — 点图标无反应：Session 0 bot 与 launcher 撞镜像名，改名隔离治本
- [reasonix-project-toml-sandbox-path-pitfall](reasonix-project-toml-sandbox-path-pitfall.md) — read_file 总失败：项目级 reasonix.toml 用 ${HOME} 跨平台路径致沙箱 canonicalize 失败
- [reasonix-workspace-write-lease-mechanism](reasonix-workspace-write-lease-mechanism.md) — 写锁真实粒度是「工作区」非文件；冲突根因 = 机制设计 + Windows 侧工作区未瘦身
- [reasonix-workspace-lease-official-solutions](reasonix-workspace-lease-official-solutions.md) — 工作区占用官方机制原文 + 三类型区分 + 解法清单，勘误 8/16 记忆两处
- [reasonix-global-workspace-index-cleanup-20260921](reasonix-global-workspace-index-cleanup-20260921.md) — 两轮清理使 Merge-Back 两条阻断项归零；第三条 = 活动会话；30 个 tasks 日志清理
- [reasonix-workspace-doctor-toolkit](reasonix-workspace-doctor-toolkit.md) — reasonix-ops 工具包（脚本+README+自动触发技能）：可逆修复「工作区被占用」四条阻断项
- [reasonix-workspace-autocommit-verification-20260923](reasonix-workspace-autocommit-verification-20260923.md) — 真正修复体 = reasonix-autocommit.ps1 + 每 2 分钟计划任务（排他证据），并纠正方向性错误
- [workspace-write-lag-fix](workspace-write-lag-fix.md) — 工作区写入卡顿修复（含双机同步 cron 09/14/21 点全量 walk）
- [tool-github-daily-backup-reasonix-dsh-zcode-trae](tool-github-daily-backup-reasonix-dsh-zcode-trae.md) — GitHub 每日备份机制：reasonix + tool-box 仓库 + 23:30 计划任务 + 强制脱敏 + 3 个脚本 bug 修法
- [系统-Linux配置档案](系统-Linux配置档案.md) — Linux 本机系统配置与踩坑档案（NTFS 挂载/desktop 坑/launcher 修复/同步 cron）
- [linux-ntfs-automount-media-os](linux-ntfs-automount-media-os.md) — NTFS C 盘开机自动挂载到 /media/OS（fstab + systemd 验证通过），含 sudo -S 管道陷阱
- [desktop-exec-gio-parsing-pitfall](desktop-exec-gio-parsing-pitfall.md) — .desktop 三坑：Exec 禁 \" 转义、gio trusted 标记、检查脚本用 echo;read 停窗
- [dev-sidecar-ca-installed](dev-sidecar-ca-installed.md) — dev-sidecar 证书两步安装法，含 pkill 自伤与 sudo 无终端教训
- [meta-20260816-optimization](meta-20260816-optimization.md) — 2026-08-16 全系统优化总览（技能精简/记忆优化/dsh 锚定与创造模式/思维链实验）

## 六、翻译与文档处理流水线（16）
- [bilingual-ocw-translator-refactored-v2](bilingual-ocw-translator-refactored-v2.md) — 技能重构为 11 章单文件 v2.0：铁律前置/双审计/全资源搜索；双机同步以 Linux 版为准
- [bilingual-ocw-translator-v21-backup-iron-rule](bilingual-ocw-translator-v21-backup-iron-rule.md) — v2.1 新增铁律 19：每一步备份（5 个必做备份点，快照 ≥3 份）
- [bilingual-ocw-translator-版本与铁律索引](bilingual-ocw-translator-版本与铁律索引.md) — 技能版本/铁律/教训索引（技能本体为准，此处留溯源与路径）
- [bilingual-translator-no-en-zh-blocks](bilingual-translator-no-en-zh-blocks.md) — 核心禁令：禁止英中分段对照，必须中文主体 + 英文术语行内嵌入
- [bilingual-translator-实战铁律5条](bilingual-translator-实战铁律5条.md) — 英文不开句、无箭头对照、术语仅首次加括号、不合并句子、LaTeX 内不翻译
- [bilingual-translator-output-path](bilingual-translator-output-path.md) — 双语翻译默认输出路径 `/home/tianque/桌面/课程文件/`
- [strang-translation-lessons](strang-translation-lessons.md) — Strang 翻译教训：子 agent 四类陷阱 + 亲自逐句翻译优于子 agent
- [strang-part002-translation-complete](strang-part002-translation-complete.md) — Strang LaLFD part002（p51-100）双语翻译：范围、流程资产、OCR 工具链、成本经验
- [subtitleedit-skill-created](subtitleedit-skill-created.md) — SubtitleEdit 批量翻译流程验证（zh-CN 文档 + 另存为 Enter）与恢复步骤
- [tool-subtitleedit-goat-api-20260920](tool-subtitleedit-goat-api-20260920.md) — SubtitleEdit 引擎改指 GOAT：Settings.json 三字段、实测数据、两个验证坑、回退法
- [csapp-summary-methodology](csapp-summary-methodology.md) — CSAPP 方舟复述方法论：设计问题驱动 + 跨课程连接 + 事实核查 + 零空洞赞美
- [扫描件整理方法论-按章合并成册-带书签-dhash-去重-ocr-页码不可用于排序-名字与内容不符需抽查](扫描件整理方法论-按章合并成册-带书签-dhash-去重-ocr-页码不可用于排序-名字与内容不符需抽查.md) — 扫描件整理方法论：按章合并成册（带书签）+ dHash 去重；OCR 页码不可排序
- [空壳-word-占位文档识别与清理-判定标准-6-042j-547-5-文件-md5-不同-内容不同的教训](空壳-word-占位文档识别与清理-判定标准-6-042j-547-5-文件-md5-不同-内容不同的教训.md) — 空壳 Word 识别与清理判定标准；6.042J 547→5 文件；MD5 不同 ≠ 内容不同
- [wps-知识库-kdocs-wiki-完整抓取与下载方法-2026-09-23-课程资料推-github-进度](wps-知识库-kdocs-wiki-完整抓取与下载方法-2026-09-23-课程资料推-github-进度.md) — WPS 知识库（kdocs wiki）完整抓取下载方法 + 课程资料推 GitHub 进度
- [2026-09-23-课程仓库整理阶段-cpplearning-迁至-codetry-重复文件清理-名字与内容不符修正-information-theory-清理](2026-09-23-课程仓库整理阶段-cpplearning-迁至-codetry-重复文件清理-名字与内容不符修正-information-theory-清理.md) — CppLearning 迁至 codetry、重复文件清理、名字与内容不符修正
- [2026-09-23-第三阶段-视觉核对扫描件-按真实页码重排-空-docx-骨架合并为章节索引-wps-脚本交付-kdocs-pull-ps1](2026-09-23-第三阶段-视觉核对扫描件-按真实页码重排-空-docx-骨架合并为章节索引-wps-脚本交付-kdocs-pull-ps1.md) — 视觉核对扫描件、按真实页码重排、空 docx 骨架合并、kdocs-pull.ps1 交付

## 七、技能安装与归档（6）
- [技能-安装与归档历史](技能-安装与归档历史.md) — 技能安装历史（溯源用）
- [技能安装-第二批4个技能](技能安装-第二批4个技能.md) — 计划管理 + 开发方法论 + 幻灯片 + 浏览器自动化
- [技能安装-第三批AnthropicVercel](技能安装-第三批AnthropicVercel.md) — Anthropic 官方 + Vercel 官方 + 三个合集索引
- [技能安装-演示文稿技能](技能安装-演示文稿技能.md) — 三个由外部仓库转换安装的演示文稿技能
- [技能安装-MattPocock自动触发](技能安装-MattPocock自动触发.md) — Matt Pocock 技能集自动触发规则 + 已安装索引
- [academic-research-skills](academic-research-skills.md) — ARS 技能包（Claude Code）安装与核心功能备忘

## 八、降 AIGC（4）
- [降AIGC-核心结论](降AIGC-核心结论.md) — 降 AIGC 核心结论与数据（技能 aigc-master 配套）
- [降AIGC-确定性规则替换铁律](降AIGC-确定性规则替换铁律.md) — AI 改写 AI = 叠加指纹；唯一有效的是非 LLM 硬编码替换
- [降AIGC-ACS理工科-ALH文科](降AIGC-ACS理工科-ALH文科.md) — ACS(理工科)+ALH(文科) 技能，基于 25 篇知网论文真实数据
- [降AIGC-10轮实战日志](降AIGC-10轮实战日志.md) — 10 轮降率实战：策略对比与关键教训

## 九、工具与系统（23）
- [工具-离线维基百科](工具-离线维基百科.md) — 离线维基 ZIM 权威路径与搜索代码
- [工具-离线维基51GB-ZIM](工具-离线维基51GB-ZIM.md) — 英文 51.9GB ZIM 自动搜索流程与代码
- [offline-wiki-autosearch](offline-wiki-autosearch.md) — 本机路径 /media/OS/wiki-data/zim/，libzim 直搜；只有小电脑有知识库
- [离线维基zim迁移c盘-20260802](离线维基zim迁移c盘-20260802.md) — ZIM 完成 C 盘迁移 + 2026-06 新版升级，含 aria2 断点续传经验
- [工具-Windows工具箱与Codex](工具-Windows工具箱与Codex.md) — D:\Toolbox、Codex、OCR、PPT 工具信息
- [工具-Codex桌面版安装](工具-Codex桌面版安装.md) — Codex Desktop App v26.609.4994.0 安装与配置记录
- [工具-PDF翻译Codex工具箱](工具-PDF翻译Codex工具箱.md) — 工具箱含 PDFMathTranslate + Codex Desktop App 安装包
- [工具-PPT-Word自动生成](工具-PPT-Word自动生成.md) — 全自动 PPT/Word 文档生成工作流
- [工具-工具箱文件夹路径](工具-工具箱文件夹路径.md) — D:\Toolbox\ 快捷方式（内有工具箱.lnk）
- [工具-桌面工具箱快捷方式](工具-桌面工具箱快捷方式.md) — 桌面有工具箱.lnk → D:\Toolbox
- [工具-推荐OCR工具](工具-推荐OCR工具.md) — 推荐 OCR 工具记录
- [工具-B站与影视下载](工具-B站与影视下载.md) — B 站/影视下载方法、源侦察、迅雷清理
- [b站视频下载方法-downkyi-ytdlp](b站视频下载方法-downkyi-ytdlp.md) — DownKyi 登录 cookie + yt-dlp 模板（突破 412，720P 合并）
- [电影下载-B站源侦察与登录刷新-20260815](电影下载-B站源侦察与登录刷新-20260815.md) — 18 部动画电影源侦察 + 登录态刷新 + 可用源清单
- [工具-迅雷Base64下载](工具-迅雷Base64下载.md) — thunder:// 协议 Base64 转换 + PowerShell 推送
- [迅雷下载目录清理-20260805](迅雷下载目录清理-20260805.md) — D:\迅雷下载 清理约 81GB 重复文件（.xltd 自启恢复），含教训
- [chongchong-piano-downloader-linux](chongchong-piano-downloader-linux.md) — 虫虫钢琴下载器：位置、用法、原理、镜像坑、SSH 远控状态
- [tianque-vscode-semester-setup](tianque-vscode-semester-setup.md) — VS Code 33 扩展 + Python 数学库 + shellcheck 学期化配置
- [鲸鱼娘-goat-额度桌面挂件](鲸鱼娘-goat-额度桌面挂件.md) — 鲸鱼娘三人组挂件 v3：分层窗口真透明、400x228、含 6 个 DPI/截屏/编译踩坑
- [tool-ocs-ai-tiku-gateway-20260922](tool-ocs-ai-tiku-gateway-20260922.md) — OCS 题库指向本地 AI 网关（127.0.0.1:8899 → GOAT），含架构、协议、elevated 坑、回滚
- [tool-ocs-ai-tiku-gateway-keepalive-20260922](tool-ocs-ai-tiku-gateway-keepalive-20260922.md) — 网关「用一会儿连接失败」根因排查 + 计划任务与 1 分钟看门狗保活
- [weixin-bot-goat-provider-402-fix](weixin-bot-goat-provider-402-fix.md) — 微信 bot 402：bot home 配置落后于桌面版，已切 GOAT（两处配置面需同步）
- [weixin-bot-turn-hang-and-constrained-bash](weixin-bot-turn-hang-and-constrained-bash.md) — 微信 bot turn 卡死 + bash 被锁 ConstrainedLanguage：改 danger-full-access 并重启

## 十、学习与计划（9）
- [学习-离散数学](学习-离散数学.md) — 蒸馏：Chernoff Bound 全推导/图论/猜信封/概率流动/公平赌徒（原文 1349 行在 archive）
- [学习-高等数学问答](学习-高等数学问答.md) — 蒸馏：格林/高斯/斯托克斯统一架构、散度旋度通量环量、方向判定（原文 951 行在 archive）
- [学习-CSAPP](学习-CSAPP.md) — 蒸馏：缓存优化（转置/邻接矩阵/对角块）+ 全书目录设计问题映射（原文 788 行在 archive）
- [学习-CSAPP缓存优化](学习-CSAPP缓存优化.md) — CSAPP 深入学习：缓存矩阵、对角块优化等
- [学习-CSAPP目录结构](学习-CSAPP目录结构.md) — CSAPP 全书目录结构解析
- [学习-MIT-6042J回顾](学习-MIT-6042J回顾.md) — MIT 6.042J 离散数学课程前瞻性总结回顾
- [计划-方舟计划](计划-方舟计划.md) — 方舟计划蒸馏版（体系/清单/书目/周循环/财务/健康/档案）
- [计划-方舟计划总结](计划-方舟计划总结.md) — 方舟计划完整总结 + API 配置 + 学习体系规划
- [plan-20260816-second-tianque](plan-20260816-second-tianque.md) — 第二个天阙：大二上六个月学习战略（dsh pro 极简模式端到端测试产出）

## 十一、dsh 侧新增（自动维护）
- [dual-machine-sync-channels-and-conflict-semantics](dual-machine-sync-channels-and-conflict-semantics.md) — 双机同步通道 + skills 结构治本（含两个并发 actor 的事故与教训：rmtree 会穿透 junction 删除目标内容）
- [dsh-requires-node20-not-platform-gated-20260930](dsh-requires-node20-not-platform-gated-20260930.md) — dsh 未上 Linux 的真因是 Node 版本（需 ≥20.12，机器上是 v18.19.1），不是平台门控；已装 v24.21.0 修复
- [dsh-dual-machine-sync-migration-20260930](dsh-dual-machine-sync-migration-20260930.md) — 双机同步从 reasonix 迁到 dsh：sync_dsh.py + cron，机器本地清单与已知局限
- [goat 额度 mcp 植入 reasonix 与 dsh](goat-额度-mcp-植入-reasonix-与-dsh.md) — [global/reference] 把 GOAT 额度以 MCP 方式植入 Reasonix 与 dsh（一个零依赖 stdio server 两边共用）：配置命令、工具名规则、preset 收窄与并发缓存两个大坑
- [goat 额度内置面板 dsh web ui 插件与 reasonix hook](goat-额度内置面板-dsh-web-ui-插件与-reasonix-hook.md) — [global/reference] 把 GOAT 额度做成 dsh web 内置面板（UI 插件 + 局部 HTTP 端点），并给 Reasonix 配 hook + MCP；含 dsh 插件安装三坑与无头验证法

- [dsh-web-search-三源聚合最终形态](dsh-web-search-三源聚合最终形态.md) — dsh web_search = GitHub + DeepSeek 官方 + 本地 wiki 三源并发聚合（rank github>deepseek>wiki）；含 provider id、凭证/熔断、maxUses=3、生效边界与验证工具
- [dsh-bash-windows-禁find全盘与session事件流zstd](dsh-bash-windows-禁find全盘与session事件流zstd.md) — Windows/Git Bash 上 find / 会全盘扫导致卡死（含 -xdev 解法）；dsh session 事件流是 zstd 压缩，grep 前必须先解压
- [skills-memory-junction-topology-both-machines-20261001](skills-memory-junction-topology-both-machines-20261001.md) — Windows/Linux 两侧的技能与记忆目录链接拓扑（junction/symlink 真身位置）与由此推翻的判断
- [memory-merge-deploy-two-pitfalls-20261001](memory-merge-deploy-two-pitfalls-20261001.md) — 记忆归一部署时踩的两个坑：字符/字节单位不一致导致守卫误判；用 staging 快照覆盖线上会吞掉之后的新增
- [gitbash-wc-m-is-bytes](gitbash-wc-m-is-bytes.md) — Windows Git Bash 下 wc -m 不按字符计数、返回 byte 数，校验字符数要用 python len()
- [skills-canonical-source-独立真源](skills-canonical-source-独立真源.md) — 技能真源独立为 ~/ai-skills（用户拍板不复用 harness 目录），各入口 junction/symlink 指过去，Roaming 由 mirror 单向跟随；维护工具 skills-canonical.py
- [goat-gateway-多上游-官方key与goat平级入池](goat-gateway-多上游-官方key与goat平级入池.md) — goat-gateway 从单 upstream 升级为 per-key upstream（官方 key 与 GOAT key 平级入池）；含 selectKey 新 key 独占预热期陷阱、双机 node 版本差异、模型 id 映射与验证方式
- [dsh-web-search-四源聚合最终形态](dsh-web-search-四源聚合最终形态.md) — dsh web_search 自定义 provider 的最终形态：默认三源（github > deepseek > wiki），goat 第四源因 Claude 计费默认关闭
- [thinking-anchor-habituation-and-dedupe-fix-20261001](thinking-anchor-habituation-and-dedupe-fix-20261001.md) — 思考链仍是英文的真正根因是 anchor 累积导致的 habituation，已用 dedupe 修复（thinking-anchor + git-context 两个模块）
- [goat-gateway-额度400修复与官方余额通道](goat-gateway-额度400修复与官方余额通道.md) — goat-gateway 认 400+insufficient credits 为额度耗尽并换 key；额度面板新增 deepseek-official 真实余额行（kind=official）；restart-all.ps1 延迟重启三件套
- [goat-gateway-优先级分层与quota动态权重](goat-gateway-优先级分层与quota动态权重.md) — gateway.mjs 的 priority 分层（官方 key priority:0 降为兜底）+ quota 驱动的动态 weight（mode=resetSoon/weekly），含已知的「163 独占」副作用与运维命令
- [dsh-agents-skills-second-root-and-catalog-cache-20261001](dsh-agents-skills-second-root-and-catalog-cache-20261001.md) — ~/.agents/skills 是第二个 skill 根（之前 triage 漏掉）+ skill catalog 是进程级缓存，改 disable 必须重启
- [dsh-pre-step-prepend-vs-mnemon-20261001](dsh-pre-step-prepend-vs-mnemon-20261001.md) — agent/pre-step 用 {prepend:true} 抢最外层：thinking-anchor 被 dsh-mnemon 顶离采样点的机制与修法
- [plan-anchor-plugin-20261001](plan-anchor-plugin-20261001.md) — 自建 plan-anchor.mjs：把 PLAN.md 的 head 每步重注入采样点，治 context rot；72 断言全过，待重启
- [dsh-skill-catalog-not-filtered-by-invocation-20261001](dsh-skill-catalog-not-filtered-by-invocation-20261001.md) — dsh 的 ctx.skills.list() 不过滤 disable-model-invocation，自建 skill_search/skill_load 必须自己过滤；已修并验证
## 归档说明
- 原文全量备份：`~/.reasonix/memory-backup-20260816/`（59 份）与 `~/.reasonix/memory-backup-20260816-consolidate/`
- 合并/蒸馏原始件：`~/.reasonix/memory-archive-20260816/`
- 旧 project key 残留：`~/.reasonix/memory-archive-20260816/legacy-eecdfd/`
- 双机冲突留存：`*.conflict.linux.*.bak` / `*.conflict.win.*.bak`（同步策略为「冲突保留双份」，绝不覆盖）
