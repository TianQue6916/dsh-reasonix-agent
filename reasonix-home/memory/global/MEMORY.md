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
- [thinking-guard-bundle-accidentally-dropped-20261001](thinking-guard-bundle-accidentally-dropped-20261001.md) — 10-01 bundles 精简误删 @ethanwong-hk/dsh-thinking-guard，留下悬空 patch row 每次 web boot 报错；10-02 已修
- [goat-gateway-path-独家认领机制](goat-gateway-path-独家认领机制.md) — goat-gateway 的 path 独家认领机制（pathPrefixes）实现、踩坑与验证
- [dsh-context-pricing-overlay-patch-20261002](dsh-context-pricing-overlay-patch-20261002.md) — dsh-context 面板 96% 花费显示不出来的根因与本地价目覆盖补丁（含三处插入点、幂等/回滚验证、¥38.84→¥321.08）
- [goat-gateway-sse-tail-truncation-fix-20261002](goat-gateway-sse-tail-truncation-fix-20261002.md) — goat-gateway usage 覆盖率 16%→100% 的根因（SSE tail 前 64KiB 封顶）与已验证修复
### 补录（202610021055，memory-index-heal）

- [000000001](000000001.md) — 用户完整画像：构建主义认知操作系统、方舟计划学习体系、资源调度策略、终局目标（AGI→量子→核聚变）、当前阶段定位、人格特征
- [2026-09-25-linux-天阙机大同步-reasonix-139-dsh-015rc3-网关落地](2026-09-25-linux-天阙机大同步-reasonix-139-dsh-015rc3-网关落地.md) — 长期离线的 Linux 天阙机一次性对齐 Windows 主力机：reasonix 升 1.39.0（含桌面）、dsh 升 0.1.5-rc.3 并打四处补丁、部署 goat-gateway（systemd user）、
- [2026-09-30-replay-cost-tile-muse-不计费-根因与补丁](2026-09-30-replay-cost-tile-muse-不计费-根因与补丁.md) — replay 成本 tile 对 muse 等 model 整个不渲染的根因（estimateCost undefined 短路）与 patch-replay-pricing.mjs 修复
- [2026-09-家庭与学业外部压力-强度校准](2026-09-家庭与学业外部压力-强度校准.md) — 2026-09 月末家庭压力背景（母亲手术与工作保障、奖学金登录、请假冲突）+ 认知带宽校准建议
- [2026-大二上-课程与作业实况](2026-大二上-课程与作业实况.md) — 大二上课程实况：信号与系统、数字逻辑/Logisim、补码浮点、算法、实分析 18.100B 精译、线代正定、数学建模大赛
- [autostart-verification-method-20260928](autostart-verification-method-20260928.md) — 自启机制的验证方法与结论：先确认是否真重启，父链判断谁启动，两条路径实测
- [backup-pipeline-selfreference-and-scope-fix](backup-pipeline-selfreference-and-scope-fix.md) — backup-to-github 的两个根本问题：自指陷阱（修私钥泄漏的 fact 自己成源）+ 同步范围失控（291MB 会话进 public repo）
- [backup-pipeline-two-fixes-privkey-and-mnemon-db-20260928](backup-pipeline-two-fixes-privkey-and-mnemon-db-20260928.md) — 备份链路两处修复：（1）\
- [backup-to-github-copies-and-excludes](backup-to-github-copies-and-excludes.md) — backup-to-github.ps1 的副本真相与去漂移、tmp-probe 排除、PowerShell 零副作用语法校验法，以及 2026-09-28 新增的 ~/.dsh/remote/ 私钥排除与 roboco
- [bertsekas-probability-chinese-translation-bad](bertsekas-probability-chinese-translation-bad.md) — Bertsekas《概率导论》中译本翻译质量差，6.431 应直接读英文原版
- [codex-gap-4-5-filled-agent-jobs-and-thread-edges-20260927](codex-gap-4-5-filled-agent-jobs-and-thread-edges-20260927.md) — 补齐 Codex 缺口 #5：thread-edges.mjs 现在导出真正的父子树（session→workflow→agent），修掉三处静默丢数据的 bug（meta.description 提取、正则捕获组索引 
- [codex-gap-6-7-recon-and-mnemon-recall-quality-20260927](codex-gap-6-7-recon-and-mnemon-recall-quality-20260927.md) — 用 GitHub search 补齐 #4-#7 的社区调研：发现 dsh-market ★4695 插件市场（4200+ 插件、hot disable、启动失败 Recovery）、#5 现成方案 dsh-thread
- [computer-use-l2-isolation-verified](computer-use-l2-isolation-verified.md) — #7 computer-use 的 L2 隔离验证：NODE_OPTIONS 崩 pnpm、plugin add 不进 bundles、勿跑 selftest、22 个工具清单
- [correction-deepseek-v41-flash-has-native-vision-20260927](correction-deepseek-v41-flash-has-native-vision-20260927.md) — 纠错：DeepSeek V4.1 Flash 原生多模态（非 text-only），dsh 与 GOAT 网关均支持图片透传；modlens 非必需（仅对确认 text-only 的模型如 v4-pro 生效）
- [course-materials-repo-and-print-workflow-202608](course-materials-repo-and-print-workflow-202608.md) — 课程资料库结构（6.046J/CS144/EE364a/概率导论/信息论）与送打印规范
- [daily-kit-git-scratch-and-pushall-20260927](daily-kit-git-scratch-and-pushall-20260927.md) — daily-kit 双机落地（2026-09-27）：Windows D:/00-Inbox + Linux ~/00-Inbox 流水区每天清零 + pushall 批量推现有 repo；用 PREFIX=days/w
- [deepseek-v41-flash-effort-实测与三层档位域-20260930](deepseek-v41-flash-effort-实测与三层档位域-20260930.md) — v4.1-flash 的 reasoning_effort 三层域（模型/ harness 面/ relay 校验）+ 85 次实测：档间差被方差淹没、正确率无差异、max_tokens 才是真杠杆
- [deepseek-v41-pro-replacement-20260910](deepseek-v41-pro-replacement-20260910.md) — DeepSeek V4.1 替换 Pro / App 端取消快慢模式：用户的情报渠道与待核实项
- [deepseek-webarchive-wiki-pipeline](deepseek-webarchive-wiki-pipeline.md) — DeepSeek 抓取+归档链路 v2：Windows puppeteer/msedge 抓取流程、数据现状（2412 会话 / 252 页）、渲染与索引脚本用法、缺口
- [deja-0213-upgrade-dsh-integration-and-dual-reasonix-home-20260927](deja-0213-upgrade-dsh-integration-and-dual-reasonix-home-20260927.md) — deja 定位与升级到 0.21.3（reasonix 成一等 harness、索引 851→1294 sessions）、dsh 侧集成安装与启动验证；并记录本机双 reasonix home 导致的 memory 双
- [deja-vu-installed-and-reasonix-bridged-20260926](deja-vu-installed-and-reasonix-bridged-20260926.md) — deja-vu 0.21.2 落地 + 零开发桥接 reasonix（49 会话）；issue #4053 已提交；session-index.mjs 已退役；新配置经 3081 验证通过，3080 待用户择时重启
- [deja-vu-issue-4053-implemented-upstream-not-yet-released-20260927](deja-vu-issue-4053-implemented-upstream-not-yet-released-20260927.md) — deja-vu issue #4053 被维护者直接实现并合入（aa900c96 + f9af3803 引用 #4053/#4067 后关闭，0 评论）：新增 internal/sources/reasonix.go +
- [dev-sidecar-覆盖-gitconfig-与-npmrc-URL级配置绕过-20260927](dev-sidecar-覆盖-gitconfig-与-npmrc-URL级配置绕过-20260927.md) — dev-sidecar 每次启动都会重写 ~/.gitconfig 与 ~/.npmrc 的代理项（这就是
- [dev-tool-search-false-unlock-fix-and-preset-reload-boundary-20260927](dev-tool-search-false-unlock-fix-and-preset-reload-boundary-20260927.md) — dev_tool_search 谎报解锁的 bug（无条件回显入参、零校验）已修，10 个单元用例 + 真机 headless 端到端双验证（假名 NOT unlocked / 真名解锁且 memory_profile 
- [ds-harness-remote-installed-20260928](ds-harness-remote-installed-20260928.md) — #6 remote_control 收尾：ds-harness-remote 0.4.20 装进生产 web profile 并在 rc-lab 隔离验证（零公网 listener / 未登录零出站），读取的默认配置项、
- [dsh-agent-jobs-v2](dsh-agent-jobs-v2.md) — #4 agent_jobs 的真实交付：端到端证据 + 4 个修复 + 26 项 self-test 断言
- [dsh-agent-personalization-20260926](dsh-agent-personalization-20260926.md) — dsh agent 个性化：memory_profile 工具 + 画像加权 + persona 画像锚点，把「实质任务前先调画像」从记忆规则升级为机制
- [dsh-batch3-headroom-mimir-and-codex-gap-recheck-20260927](dsh-batch3-headroom-mimir-and-codex-gap-recheck-20260927.md) — 插件第三批：卸 modlens（手工改 4 处 + 删 .bin shim，并回收 commander/undici）、装 headroom 0.3.0（工具输出可逆压缩）与 Mimir 0.21.0（学术工作台）；用 
- [dsh-codex-gap-analysis-and-memory-write-20260926](dsh-codex-gap-analysis-and-memory-write-20260926.md) — dsh 对标 Codex 的缺口清单（sqlite schema 实证）+ 记忆写入能力上线：memory_remember 打通 dsh 到 reasonix 的写入
- [dsh-community-landscape-v2-and-powershell-egress-20260926](dsh-community-landscape-v2-and-powershell-egress-20260926.md) — PowerShell 能出网（bash 被禁）这一能力突破 + 社区实况实时数据（topic:dsh-plugin 16,218 个；更正 dsh-desktop 存在、记忆插件 star 量级）+ headroom/d
- [dsh-community-plugin-landscape-20260926](dsh-community-plugin-landscape-20260926.md) — dsh 社区插件清单（476 个仓库，含直接对应我缺口的 headroom/token/goal/recall/session-lab）+ 出网限制（web_search 402、bash 无网）+ 「应先调研社区再自写
- [dsh-config-editor-writeback-and-mnemon-settings](dsh-config-editor-writeback-and-mnemon-settings.md) — DSH config-editor 写回机制全解 + 2026-09-28 18:50 一次真实 UI 写入的现场证据：entries() 的两个硬过滤（parent 必须 include、id 必须唯一，重复即静默消失
- [dsh-desktop-adaptation-verified-20260930](dsh-desktop-adaptation-verified-20260930.md) — 桌面端全量适配验收通过：网关连通、preset 生效、agent 跑在桌面端；含\
- [dsh-desktop-profile-full-port-20260930](dsh-desktop-profile-full-port-20260930.md) — 官方桌面端全量 profile 移植：desktop profile 由 Electron 独占、不重写已有文件、移植清单与验收证据
- [dsh-desktop-renders-package-client-modules-20260930](dsh-desktop-renders-package-client-modules-20260930.md) — 实测确认 Electron 桌面端会渲染 package-declared client module（thinking-language 的 Settings 页已出现）
- [dsh-git-context-and-memory-anchors-20260928](dsh-git-context-and-memory-anchors-20260928.md) — 「记得自己 git」两半补完 + 自我验证的最短路径：headless 线没有 context-gate 所以第一轮就能验（7 秒），以及 agent.cordis.yml 不被扫描这个静默失效的坑；含全部验收证据与生效
- [dsh-goal-stop-mechanism](dsh-goal-stop-mechanism.md) — dsh goal 自动续跑的 6 条停止路径、pause 的误导性症状与只能由人做的恢复、以及\
- [dsh-home-local-git-versioning-20260928](dsh-home-local-git-versioning-20260928.md) — ~/.dsh 建成本地 git 版本控制：基线 commit 2e5b898 / 222 文件 / .gitignore 取舍 / dsh-autocommit.ps1 + DshConfigAutocommit 任务；
- [dsh-hooks-claude-code-setup-and-headless-finding-20260927](dsh-hooks-claude-code-setup-and-headless-finding-20260927.md) — dsh 挂 Claude Code hook 兼容层的完整做法（已配置成功）+ 实测 headless profile 不派发 hook 事件、web 待验；含 dsh-mimir 两个原有故障与「N entry did
- [dsh-isolated-instance-verify-recipe](dsh-isolated-instance-verify-recipe.md) — 隔离 dsh 实例验证配方：三件套环境变量、mem-verify profile 构建、patch insert 语义坑、三条判据
- [dsh-market-installed-20260928](dsh-market-installed-20260928.md) — 装 dsh-market（dshmarket 1.66.2）插件市场并隔离验证通过；附关键发现\
- [dsh-maxtokens-上限实测与校正-20260930](dsh-maxtokens-上限实测与校正-20260930.md) — 上游 max_tokens 硬顶 393216、各 model 实测上限表、三 profile 的 maxTokens 已按实测校正（46 提高/38 降低）、prompt+max≤context 约束与并发写入者风险
- [dsh-memory-layering-persona-bridge-20260930](dsh-memory-layering-persona-bridge-20260930.md) — dsh 记忆三层分工定论 + 画像桥修补：reasonix 语料只落 memory-spaces，USER.md 由 runtime Source 独立持有；本次把画像 compact 进 USER.md、让 memor
- [dsh-mimir-incompatible-with-017rc2-typert-codec-20260927](dsh-mimir-incompatible-with-017rc2-typert-codec-20260927.md) — dsh-mimir 0.21.0 与 dsh 0.1.7-rc.2 不兼容：typert-loader 的 requireStrictCodec 要求 invocation codec 带 create() 工厂，Mim
- [dsh-mnemon-realtime-sync](dsh-mnemon-realtime-sync.md) — 修复 memory→mnemon 同步的三处 bug，并新增 memory_remember 实时同步通路（含开关与回滚）
- [dsh-mnemon-subagent-empty-catalog-and-language](dsh-mnemon-subagent-empty-catalog-and-language.md) — dsh-mnemon subagent 拿到空 tool catalog 的真因与修法（tool-bootstrap 收窄 + persona 覆盖）
- [dsh-patchreload-live-new-session-and-mnemon-dsh-side-verified-20260928](dsh-patchreload-live-new-session-and-mnemon-dsh-side-verified-20260928.md) — 纠正\
- [dsh-plugin-batch2-modlens-vision-20260927](dsh-plugin-batch2-modlens-vision-20260927.md) — 装了 modlens（视觉插件，4043★）让纯文本 DeepSeek 能看图；含 14 项候选插件清单与判定；并记录解除了一个卡死 22 分钟的 pnpm 安装
- [dsh-plugin-catalog-4377-and-evaluation-20260928](dsh-plugin-catalog-4377-and-evaluation-20260928.md) — 拿到完整插件目录（awesome-dsh-plugin.com/plugins.json，4377 插件）并做横向评估：memory 类 top（OpenViking ★38736 / hindsight ★32440 
- [dsh-plugin-compat-verification-method](dsh-plugin-compat-verification-method.md) — 判断 dsh 插件在某个 dsh 版本下是否真适配的三层验证法（含 client module 清单判据与 303/cookie 陷阱）
- [dsh-profile-backup-inventory-and-rollback-tool-20260928](dsh-profile-backup-inventory-and-rollback-tool-20260928.md) — 补齐 goal (3) 的\
- [dsh-profile-v41-flash-effort-收窄-20260930](dsh-profile-v41-flash-effort-收窄-20260930.md) — v4.1-flash 三个 profile 的 reasoningEfforts 收窄为 off/low/high/max（含备份、验证方式、回滚教训、待办审计）
- [dsh-reasoning-row-autofold-20260930](dsh-reasoning-row-autofold-20260930.md) — reasoning row 思考中自动展开/结束后收合：改 dsh-client-ui-chat:5719，含可重放 patch 脚本与生效机制
- [dsh-replay-installed-for-gap5-20260928](dsh-replay-installed-for-gap5-20260928.md) — 用最强方案补齐 #5：装 @mingozhou/dsh-replay 0.4.1（会话回放 + fork lineage + audit + cost）并隔离验证通过；查明 dsh-conversation-map 存在
- [dsh-replay-thinking-patch](dsh-replay-thinking-patch.md) — 把 dsh-replay 的鲸小深加载动画换成 thinking 指示器：改动范围、脚本、3 个踩坑、验证手段
- [dsh-restart-20260928-post-remote-install](dsh-restart-20260928-post-remote-install.md) — 2026-09-28 18:12:30 dsh 重启后的事实与验证方法论：cordis.yml mtime = boot 时刻指纹、三个失败的「插件加载了吗」判据、stdout 才是可靠判据、长期实例必须由 launch
- [dsh-session-digest-ondemand-distill-20260926](dsh-session-digest-ondemand-distill-20260926.md) — dsh session_digest 上线（按需蒸馏会话：任务/轮次/工具调用/结论），并记录「为何不做无条件自动蒸馏」的设计判断
- [dsh-session-index-codex-threads-20260926](dsh-session-index-codex-threads-20260926.md) — dsh session_index 上线（Codex threads 表对应物）：跨 cwd 会话索引，827 个会话扫描 813ms、title 覆盖 99%；并确认 system32 的 640 个是批量任务独立会话
- [dsh-skill-usage-weighting-20260926](dsh-skill-usage-weighting-20260926.md) — skill_search 加权上线（调用次数 + 时间远近，公式 match + 0.6*(log1p(loads)+exp(-age/14))）；并记录关键事实：两侧历史都没有技能调用数据，账本从零积累
- [dsh-skills-and-memory-bridge-20260926](dsh-skills-and-memory-bridge-20260926.md) — dsh web 与 reasonix 共用技能与记忆已落地：80 个技能镜像生效（分片验证通过）+ 只读记忆插件 memory_search/memory_read 已挂载（待重启 web 生效）
- [dsh-thinking-language-switch-20260930](dsh-thinking-language-switch-20260930.md) — 思考链语言开关插件（自建，@local/dsh-thinking-language）：host 半侧 assemble 注入 + settings.section UI + /thinklang 兜底
- [dsh-thread-edges-v2](dsh-thread-edges-v2.md) — #5 thread_spawn_edges 的真实实现：parentSession 权威边 + 全量扫描 + 每日刷新任务
- [dsh-tools-dir-archived-20260928](dsh-tools-dir-archived-20260928.md) — 工具目录归档：24 个一次性脚本移入 _archive-20260928（含引用安全检查与回滚）
- [dsh-upgrade-to-0.2.0-rc.2-20260930](dsh-upgrade-to-0.2.0-rc.2-20260930.md) — dsh 0.1.7-rc.2 → 0.2.0-rc.2 升级完成：4 插件适配+豁免、dump-config 验证、可复用脚本与 PowerShell \\$pid 陷阱
- [dsh-web-search-multi-removed-and-fallback-repointed-20260927](dsh-web-search-multi-removed-and-fallback-repointed-20260927.md) — 删除 dsh-web-search-multi（deps+bundles+lockfile 三块+node_modules），并把 dsh-plugin-local-search 的 fallbackProviderId
- [dsh-版本线快照-20260925](dsh-版本线快照-20260925.md) — dsh 版本现状快照（2026-09-25 实查 npm+GitHub+官网）：无正式版/GA（官网自称开发者预览版），npm latest=0.1.5-rc.3 / next=0.1.7-rc.2，本机 0.1.5-r
- [dual-machine-memory-sync-conflict-copies-and-restores-20260927](dual-machine-memory-sync-conflict-copies-and-restores-20260927.md) — 双机 memory 同步「绝不覆盖」策略致 175 个 .conflict 副本、Linux 侧更新被降级到 .bak；已恢复 8 个 fact 并给出可靠判据
- [dual-machine-sync-convergence-pitfalls-20261001](dual-machine-sync-convergence-pitfalls-20261001.md) — 双机同步收敛的三个坑：冲突副本会累积故 head -1 会取到陈旧副本；收敛要跑两轮；胜出方要先备份
- [dual-reasonix-home-memory-fork-and-junction-unification-20260927](dual-reasonix-home-memory-fork-and-junction-unification-20260927.md) — 本机双 reasonix home 导致 memory 双份漂移（dsh 侧 ~/.reasonix/memory 338 项 vs 桌面版 %APPDATA%/reasonix/memory 321 项）；已合并零丢失
- [english-cet4-prep-mainline-202608](english-cet4-prep-mainline-202608.md) — 英语 CET-4 备考主线：高考 90 → 目标 500+，他要求双语对照 + 替换清单 + 严格字数
- [gap-6-7-decision-brief-20260928](gap-6-7-decision-brief-20260928.md) — #6/#7 的完整决策依据：从 catalog 提取各候选的 capabilities 与 capabilityRedLines，含\
- [gitbash-schtasks-arg-conversion](gitbash-schtasks-arg-conversion.md) — Git Bash 调 schtasks 必须 MSYS_NO_PATHCONV=1 + 单斜杠，否则 //query 被转成 C:/Git/query 输出错误
- [github-public-backup-credential-leak-round2-zstd-and-fixes-20260927](github-public-backup-credential-leak-round2-zstd-and-fixes-20260927.md) — public 仓库 TianQue6916/reasonix 第二轮凭据泄露：.zstd 压缩绕过脱敏致真 sk-/user_ key 进历史；已阻断（2002 文件移出 + XF/gitignore 扩展 + 新增 r
- [github-repo-hygiene-audit-20260927](github-repo-hygiene-audit-20260927.md) — 2026-09-27 全量审计 17 个本地 repo：learn 有 563MB VS .ipch 垃圾 history（从未 push 过）、IT-full 与 Information-Theory 是 1.3G×2
- [github-加速体系与镜像自动选优-20260927](github-加速体系与镜像自动选优-20260927.md) — GitHub 加速三路径体系（git 侧由 ~/.ghmirror-git 每日/边沿选优 / 下载走每日选优 / 浏览器走 dev-sidecar）+ 镜像生态三类分化实测（Range/clone 兼容性/36 倍波动
- [goat-gateway-403-taxonomy-and-dsh-reasoning-models](goat-gateway-403-taxonomy-and-dsh-reasoning-models.md) — goat-gateway 三类 403 的区分与冷却策略 + dsh 按实测重写 model 列表的关键结论
- [goat-gateway-gzip-fix-and-model-allowlist-20260930](goat-gateway-gzip-fix-and-model-allowlist-20260930.md) — 网关 gzip bug + /v1/models 白名单过滤 + 套餐模型真相（claude-sonnet-5-5 可用）+ 别用单样本推断整组的教训
- [goat-gateway-key-weight-and-model-id-forms](goat-gateway-key-weight-and-model-id-forms.md) — 网关 key weight 生效的实测证据（日志级）+ 上游要求 provider/model 形式、裸 id 部分有效
- [goat-model-menu-and-pro-latest-pointer-baseline-20260928](goat-model-menu-and-pro-latest-pointer-baseline-20260928.md) — GOAT 网关 82 模型菜单实测（无 v4.1-pro）、deepseek-v4-pro 是 latest 滚动指针（v4.1-pro 上线大概率不新增 id）、6 天日志 pro 零调用基线，以及判断 v4.1-pr
- [goat-额度-窗口标题方案与时间含义-2026-09-25](goat-额度-窗口标题方案与时间含义-2026-09-25.md) — 解释额度面板里的三个时间（数据时间 / 5h 与周的窗口重置，滚动窗口非固定时刻）；并记录 Reasonix 侧“窗口标题显示额度”的落地方案（goat-title.ps1 + GoatTitle 计划任务，实测不被 E
- [goat-额度面板事故复盘-hook-timeout-单位与-dsh-刷新验证](goat-额度面板事故复盘-hook-timeout-单位与-dsh-刷新验证.md) — 两个事故的根因与修法：Reasonix hook 的 timeout 单位是毫秒（15 会中断会话，已修为 15000 并移除 UserPromptSubmit）；dsh 面板不刷新的真因。【2026-09-27 更正】
- [headless-profile-degraded-3-tools-no-persona-20260927](headless-profile-degraded-3-tools-no-persona-20260927.md) — 【已修复并验证】headless 批处理线（798 session / 95% 流量）原先只有 3 个工具、无 read/write、system prompt 里 persona 那行是**静默 no-op**（正确字
- [headless-profile-mnemon-not-viable-rolled-back-20260928](headless-profile-mnemon-not-viable-rolled-back-20260928.md) — headless profile 装 mnemon 的实测结论：插件加载成功但工具面不暴露（headless 工具面刻意极简），且引入 connection patch 警告，已完整回滚；含\
- [hindsight-broke-headless-incident-20260928](hindsight-broke-headless-incident-20260928.md) — 事故复盘：hindsight 写全局 patch 后破坏 headless profile（format v4 message requires a producer-owned source kind），已移除该段并验
- [hindsight-project-memory-installed-20260928](hindsight-project-memory-installed-20260928.md) — 装 hindsight-coding-agents 0.7.0（项目级自动记忆，daemon 模式）并隔离验证通过；与 mnemon 互补（它 auto 注入项目上下文，mnemon 是 guided 通用记忆）；含 u
- [incident-credential-echo-leak](incident-credential-echo-leak.md) — 凭据打印事故（第 2 次）：同一表达式混用 ${VAR:+} 与 ${VAR:-} 会把值打印出来；含安全写法清单
- [incident-git-context-missing-id-corrupted-sessions-20260929](incident-git-context-missing-id-corrupted-sessions-20260929.md) — 事故复盘：我给会话注入的 git-context 消息缺 id，导致 8 个 session 被判 corrupt（113 条消息）；含 dsh-session 的权威校验规则原文、幂等修复法（uuid5 + zstd 
- [incident-includeSubagents-broke-mnemon-subagents-20260929](incident-includeSubagents-broke-mnemon-subagents-20260929.md) — 事故复盘：preset 的 tool-bootstrap.includeSubagents:true 让 subagent 第一轮只有 2 个工具，而 dsh-mnemon 六个 operation 都靠 subagen
- [linux-天阙机-goat-额度同步-reasonix-balance-url-dsh-面板-2026-09-26](linux-天阙机-goat-额度同步-reasonix-balance-url-dsh-面板-2026-09-26.md) — Linux 天阙机补齐 GOAT 额度：重写纯 node 版 quota-http.mjs（原版硬编码 Windows 路径+调 powershell）、建 systemd user service、Reasonix 加
- [memory-index-self-heal-20260928](memory-index-self-heal-20260928.md) — 「替代手工索引」端到端验收通过：模拟其他 agent 直接写 fact 文件（不走 memory_remember），计划任务 MemoryIndexHeal 自动把索引从 0 补到 1、条目 165→166 并留备份；
- [mnemon-acceptance-evidence-20260928](mnemon-acceptance-evidence-20260928.md) — mnemon 三层记忆的逐项验收实证，以及\
- [mnemon-db-rebuild-verified-20260928](mnemon-db-rebuild-verified-20260928.md) — 实证 mnemon 库可重建：删库后从 markdown 一条命令恢复（195→205 insights / 5498→5868 edges / embedding 自动 100%），验证了 round 21 \
- [mnemon-four-graph-store-verified-20260928](mnemon-four-graph-store-verified-20260928.md) — four-graph store 的实证：直查 mnemon.db 的 edges 表得出四种 edge_type（entity 81.8% / semantic 9.6% / temporal 7.1% / causa
- [mnemon-subagent-self-test-and-verification-result](mnemon-subagent-self-test-and-verification-result.md) — 如何自测触发真实 mnemon subagent（mnemon_document_manage archive）+ 两处修复的实机验证结果
- [mnemon-three-tier-memory-deployed-20260927](mnemon-three-tier-memory-deployed-20260927.md) — 补齐 mnemon 三层记忆的第一层（runtime hot memory）：此前 USER.md/MEMORY.md 全空；纠正\
- [network-egress-git-ghproxy-mirrors-20260927](network-egress-git-ghproxy-mirrors-20260927.md) — 【二次订正·已定位真因】curl 的 000 不是连不上、也不是代理死了，而是 dev-sidecar 做 MITM 导致证书信任失败（-v 可见 CONNECT 200 + Proxy-agent: dev-sidec
- [ollama-silent-install-hang-and-mnemon-embedding-20260927](ollama-silent-install-hang-and-mnemon-embedding-20260927.md) — Ollama 便携版绕过 UAC（0.34.4 / RTX 5070 / nomic-embed-text）、开机自启改走启动文件夹 vbs（AtLogOn 触发器报 Access denied）、mnemon embe
- [probability-independence-user-sticking-point-202609](probability-independence-user-sticking-point-202609.md) — 概率论 independence 的直觉卡点：他要先构造+维恩图再要公式；含维恩图表达力的边界与经典反例
- [real-analysis-user-sticking-points-202607](real-analysis-user-sticking-points-202607.md) — 实分析实际卡点：无穷和的定义动机、子序列 n_k≥k 方向、identity 双义、符号来源
- [reasonix-autocommit-and-github-backup-restored-20260927](reasonix-autocommit-and-github-backup-restored-20260927.md) — reasonix/dsh 自动 commit 与 GitHub 每日备份三件套（autocommit / merge-context / backup-to-github）因 Desktop/reasonix-ops 被
- [reasonix-memory-fully-integrated-into-mnemon-20260928](reasonix-memory-fully-integrated-into-mnemon-20260928.md) — reasonix→mnemon 整合收尾：198 个 fact 全覆盖缺口 0；修掉 memory-to-mnemon.py 只读 global 目录导致 project/ 与 hash scope 从未导入的缺口；并记
- [reasonix-状态栏余额-json-结构定案-显示开关定位-2026-09-25](reasonix-状态栏余额-json-结构定案-显示开关定位-2026-09-25.md) — Reasonix 的 balance_url 要求 DeepSeek 钱包余额 JSON 结构（is_available/total_balance/balance_infos[currency,topped_up_ba
- [reasonix-状态栏余额刷新时机与本地时区纠正-2026-09-25](reasonix-状态栏余额刷新时机与本地时区纠正-2026-09-25.md) — 实测 Reasonix 拉取 /balance 的中位间隔 51 秒（数据是新的），界面重渲染绑会话事件（配置改不了）；/balance 增为 7 条（+数据时间）；并纠正机器本地时区是 UTC+4 不是 +8、toLo
- [reasonix-状态栏余额打桩为-goat-六额度-2026-09-25](reasonix-状态栏余额打桩为-goat-六额度-2026-09-25.md) — Reasonix 桌面版底部状态栏的 balance（“余额”）项数据源 = provider 级 balance_url；已把它指向本地 http://127.0.0.1:8790/balance（返回 2 账号×5h
- [rule-long-running-process-needs-job](rule-long-running-process-needs-job.md) — 长命进程必须用 job 工具而非前台 bash；以及一条会挂住的命令为什么不报错、我犯过的报告失真错误
- [rule-no-premature-goal-block](rule-no-premature-goal-block.md) — 不得因\
- [rule-star-open-source-usage](rule-star-open-source-usage.md) — 元规则：用过/读过/借鉴过的开源项目必须 star（本次新增 9 个，累计 30）+ 纯 bash 的 star 执行路径（bash 侧取凭据 + REST API）
- [skill-search-weight-verified-and-false-bug-20260930](skill-search-weight-verified-and-false-bug-20260930.md) — skill_search 用量权重实测通过（30 断言）+ 一次「把 tie 当 bug」的伪修复与回退，及真实库 79 skill 的召回上限
- [skill-usage-weight-normalization-fix](skill-usage-weight-normalization-fix.md) — skill_search 用量权重的量纲缺陷与归一化修复（含改前改后量化对比、可复用抽函数验证法）
- [tool-bootstrap-subagent-catalog-real-mechanism](tool-bootstrap-subagent-catalog-real-mechanism.md) — tool-bootstrap 对 subagent 的真实机制（keepTools 的 missingAllowsFullCatalog）+ includeSubagents 是加重不是修复
- [tool-dsh-017rc2-upgrade-20260925](tool-dsh-017rc2-upgrade-20260925.md) — dsh 0.1.5-rc.2 → 0.1.7-rc.2 升级全过程档案（2026-09-25）：settings 导入机制/preset declaration 化/包改名三处迁移、headless+web 双路验证证据
- [verification-fixes-and-tests-20260927](verification-fixes-and-tests-20260927.md) — 近三天核验中 4 个可修缺陷的修复与测试闭环 + 可重复运行的验收脚本 verify-4-fixes.sh（19 条判据，实测 PASS=19 FAIL=0）：backup-to-github.ps1 副本一致（junc
- [wechat-bot-migration-to-dsh-step1-20260930](wechat-bot-migration-to-dsh-step1-20260930.md) — 微信 bot 迁 dsh 第 1 步完成：包+凭据+bundle+autoStart 覆盖+挂载已验证，只差停 reasonix 开 daemon
- [weixin-bot-current-architecture](weixin-bot-current-architecture.md) — 微信 bot 现状架构基线：官方 iLink 协议、改名副本与独立 home、leader 由 bot 内置、凭据位置与 bot 配置形态
- [windows-task-REDACTED](windows-task-REDACTED.md) — 两个验收陷阱：ScheduledTask 的 LastTaskResult 不是退出码；node 内置 zstd 静默截断多 frame 流
- [强制搜索优先级-local-wiki-github](强制搜索优先级-local-wiki-github.md) — 搜索必须优先 local-search（离线维基/PocketWiki + GitHub 全站），只有无结果才用 exa/parallel/nothumansearch

## 归档说明
- 原文全量备份：`~/.reasonix/memory-backup-20260816/`（59 份）与 `~/.reasonix/memory-backup-20260816-consolidate/`
- 合并/蒸馏原始件：`~/.reasonix/memory-archive-20260816/`
- 旧 project key 残留：`~/.reasonix/memory-archive-20260816/legacy-eecdfd/`
- 双机冲突留存：`*.conflict.linux.*.bak` / `*.conflict.win.*.bak`（同步策略为「冲突保留双份」，绝不覆盖）

- [dsh replay cost tile missing model rule](dsh-replay-cost-tile-missing-model-rule.md) — [global/reference] replay 成本 tile 对 muse 等 model 整个不渲染的根因（estimateCost undefined 短路）与 patch-replay-pricing.mjs 修复
