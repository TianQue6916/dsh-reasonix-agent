---
id: mem-9f3c1a7be52d48c6a1d0f4e8b7c25a93
revision: 1
created_at: "2026-09-25T11:40:00Z"
updated_at: "2026-09-25T11:40:00Z"
name: 2026-09-25-linux-天阙机大同步-reasonix-139-dsh-015rc3-网关落地
title: Linux 天阙机大同步（2026-09-25）：reasonix 1.39.0 + dsh 0.1.5-rc.3 + goat-gateway 落地 + 课程/记忆合并
description: 长期离线的 Linux 天阙机一次性对齐 Windows 主力机：reasonix 升 1.39.0（含桌面）、dsh 升 0.1.5-rc.3 并打四处补丁、部署 goat-gateway（systemd user）、config/settings 指向网关、memory+skills 合并、课程文件增量、13 个课程仓库 clone；含 dsh 启动失败的根因（cordis 版本钉死 4.0.2）
keywords: Linux天阙机,同步,reasonix 1.39.0,dsh 0.1.5-rc.3,cordis 4.0.2,goat-gateway,systemd user,gh-proxy,node22,rsync -au
activation: relevant
metadata:
  type: user
  fact_type: project
  scope: global
---

# Linux 天阙机大同步（2026-09-25）

## 0. 背景与口径
Linux（Ubuntu 24.04.4，100.79.96.82 / LAN 192.168.0.103）长期离线（tailscale 显示 6h+）。上线后一次性对齐 Windows 主力机。
**同步口径（用户拍板）**：课程文件全量 + 配置/记忆/技能按「**哪边修改新就以哪边为主**」（= 同名取较新 mtime，双方独有内容都保留）。
实现方式：`rsync -au`（--update 只覆盖目标更旧的），**不做删除**。

## 1. 两机差异对账（同步前）
| 项 | Windows | Linux |
|---|---|---|
| OS / node | Win11 / v24.15.0 | Ubuntu 24.04.4 / 系统 v18.19.1 + 专用 **v22.23.2**（`~/.local/node22`） |
| reasonix CLI | 1.39.0（npm） | **v1.19.3**（`/usr/bin/reasonix`，root，8/3） |
| reasonix 桌面 | 1.38.10 active | **v1.38.3** |
| dsh | 0.1.5-rc.2（node24） | **0.1.1-rc.2**（node22） |
| goat-gateway | 有（8788） | 无 |
| provider | `http://127.0.0.1:8788/v1` | 直连 `api.commandcode.ai` |
| memory / skills | 318 / 200 文件 | 183 / 177 |
| 课程文件 | 1994 文件 / 492MB | 1969 / 481MB |
| 课程仓库 | `D:\gh-publish` 13 仓 1.7GB | 无（且**无 GitHub SSH key**） |

## 2. 完成项
1. **goat-gateway 部署**：`~/goat-gateway`（`D:\Toolbox\goat-gateway` 的 Linux 版）；systemd **user** 服务 `goat-gateway.service`（`enable --now`，Restart=always，日志 `logs/gateway.*.log`；Linger=yes）。`/v1/models` 200，2 key 均 available。
2. **配置指向网关**：`~/.reasonix/config.toml` 的 commandcode-goat provider `base_url/chat_url/request_url` → `http://127.0.0.1:8788/v1` + `no_proxy = true`；`~/.dsh/settings.yaml` baseURL 同改（并按「较新为准」用 Windows 版覆盖：补 `reasoningEffort: high`、`defaultMaxTokens: 65536`、`retryPolicy`）。`reasonix doctor` 已显示 `commandcode-goat ... 127.0.0.1:8788 key:present`。
3. **reasonix 升 1.39.0**：`desktop-v1.39.0`（2026-09-24 发布）；包 `Reasonix-linux-amd64.tar.gz`(170MB) → 解到 `~/.local/bin/versions/v1.39.0/`（`reasonix-cli`+`reasonix-desktop`+`app/`），并更新 `~/.local/bin/{reasonix,reasonix-launcher,reasonix-guard}` + `current.json`。旧 `v1.38.3` 保留可回滚。
4. **dsh 升 0.1.5-rc.3 + 四处补丁**：`npm i -g @deepseek-ai/dsh@0.1.5-rc.3`（**必须** `export PATH="$HOME/.local/node22/bin:$PATH"`，否则 npm 的 shebang 命中系统 node18 → prefix 解析成 `/usr/lib/node_modules` → EACCES）；补丁：① 3 个 mjs 加 `sessionEvents()` 兼容 ② `agent.cordis.yml` persona `text:`→`prefix:` ③ `cordis.patch.yml` 补挂 `@deepseek-ai/dsh-tool-str-replace-editor`（maxOutputChars 16000）④ 链接维护（dsh 启动自动重建）。验证：`dsh --profile headless "用 bash 执行 echo DSH_TOOL_OK"` → 返回 `DSH_TOOL_OK`。
5. **memory/skills 合并**：`rsync -au`（排除 `.revisions/`/`.archive/`），memory 130 文件、skills 156 文件；随后删除 262 个 `*.conflict.*.bak`（两机同步冲突垃圾）。备份在 `~/rx-sync-linux/backup-<时间戳>/`。
6. **课程文件增量**：`rsync -au` → 1969→**1999** 文件（+30：`data lerning/18.065_*双语详解` 12 个、`Strang part004/005`、11 张 assets 图）；Linux 独有的临时产物保留。
7. **13 个课程仓库 clone**：`~/课程资料`（1.8GB），经 **gh-proxy 镜像**（见 §4）。

## 3. dsh 升级失败的关键根因（重要教训）
首次装 `0.1.5-rc.2` 后启动报 `plugin tree failed to load: @deepseek-ai/dsh-sandbox-local`。
- 排查：包存在、链接已重建、单独 `import()` **成功** → 不是包缺失。
- **真根因**：npm 在 2026-09-25 用 `0.1.5-rc.2` 的依赖范围解析出**全家桶 0.1.5-rc.3 + cordis 4.0.4**；而 rc.3 版 `dsh-sandbox-local` 的 `peerDependencies` 把 cordis **硬钉为精确 `4.0.2`**（rc.2 版是 `^4.0.2`）→ peer 不满足，Cordis 拒绝加载。
- **修法**：装 `@deepseek-ai/dsh@0.1.5-rc.3`（当前 dist-tags latest，`0.1.7-rc.2` 是 next）→ 依赖自洽，cordis 回到 4.0.2，启动正常。
- **通用教训**：`0.1.5-rc.x` 系各包 peerDeps 互相钉精确版本；升级 dsh 时**别停在中间小版本**，直接跟 dist-tags `latest`，否则会落到"半套 rc.3"的坏组合。

## 4. Linux 侧操作铁律（本次踩坑）
- **ssh + PowerShell 内联命令不可用**：PowerShell 会吞掉内层双引号、展开 `$VAR`/`$(...)`（连 `$src` 这类本地变量都会污染远程命令）。**一律写 .sh 文件 → scp → `sed -i 's/\r$//'` → `bash` 执行**。
- **`$env:TEMP` 被 Reasonix 重定向**到 `reasonix-session-tmp-*`，与真实 temp 不同；中转文件请放 `~`（本次用 `~/rx-sync-linux`）。
- **GitHub 直连不通**：Linux 连 `api.github.com` 可以，但 release 文件（`objects.githubusercontent.com`）**http=000 完全不通**；Windows 直连同样不通（dev-sidecar 代理 31181 也没救）。可用镜像：**`https://gh-proxy.com/https://github.com/...`（实测 2–4 MB/s）**，`ghfast.top` ≈0.26MB/s、`ghproxy.net` ≈0.18MB/s、`github.moeyy.xyz` 不通。
- **Linux 的 dsh 必须用 node22**：`~/.local/node22/bin/{node,npm,dsh}`；非交互 ssh 的 PATH 不含它，需显式 `export PATH="$HOME/.local/node22/bin:$PATH"`。
- reasonix 桌面启动器：`~/.local/share/applications/reasonix.desktop` 的 Exec 指向 `~/.local/bin/reasonix-peak-warn`（峰值告警包装）。

## 5. 遗留 / 待观察
- `/usr/bin/reasonix` 仍是 root 所有 v1.19.3（未动，作为兜底）；终端里 `which reasonix` 在非 login shell 会命中它（桌面与 `~/.profile` 的 login shell 则用 `~/.local/bin/reasonix` v1.39.0）。
- Linux 上运行中的 `reasonix bot start --channels weixin`（pid 9143）是升级**前**启动的旧二进制进程，如需新版行为需重启该 bot。
- 两机 `~/rx-sync-linux/` 保留为「Linux 同步工具包」（含 rx-probe/audit/sync-home/sync-courses/clone-courses-mirror/install-reasonix/install-dsh/apply-dsh-patch/patch-config-linux/move-to-os 等脚本）；密钥副本（keys.json、reasonix.env）与 600MB 中转包已删。

## 6. 磁盘收尾（用户诉求：腾空间，只做可逆转移）

**诊断**：Linux `/` 147G 用 89G（剩 51G）。真凶是 **`/swap.img` 20G（占 24%）**——它不是目录，所以 `du` 首次扫描漏掉，只有 `find -size +200M` 才现形；其余：`/usr` 19G、`/var` 9.7G（snapd 7.6G）、`/opt` 5.8G、`/home` 29G。
> 结论：磁盘紧张是长期积累（系统+snap+swap），**不是本次同步造成**（本轮净增 ~2.5G，中转包已清）。

**处置（用户口径：「有影响的就算了」，因此只转移、不清理）**：

| 转移项 | 大小 | 去向（均留符号链接，路径不变） |
|---|---|---|
| `~/课程资料` | 1.9 G | `/media/OS/linux-home/课程资料` |
| 下载内 deb/rpm 安装包 + 2 个 reasonix 旧备份 tar.gz | 3.7 G | `/media/OS/linux-home/大文件归档` |
| `~/桌面/{课程文件,输出文件,待处理文件夹}` | 543 M | `/media/OS/linux-home/桌面-*` |

合计释放 ≈ **6 G**：`/` 89G → 83G（可用 57G）。`/media/OS` = Linux 上挂载的 Windows C 盘（ntfs3，803G，剩 426G）。

**关键坑：NTFS 文件名不允许 `?`**
`~/桌面/课程文件/其他/.reasonix/attachments/tbb010*/pages*/page_00[2,32]_book?.txt` 共 4 个文件让首次 `mv` **整体失败**（GNU mv 遇错停止；**源目录未被删，安全**）。处理：把这 4 个的 `?` 改成 `_`（与 Windows 侧同步时的改名一致）后重移成功。
转移后计数 1995 vs 原 1999 **并非丢文件**——这 4 个与 rsync 时已存在的同名 `_` 文件是同一份 OCR 产物，改名后自然合并；各子目录抽样读取均正常。

**未做（需 sudo 或属破坏性，用户选择放弃）**：缩 `/swap.img` 20G→8G（可释放 12G）、清回收站 3.9G、清 `~/.cache` 3.9G、清 snap 旧版本 2–3G。若日后需要，交换文件当前用量 0 且另有 zram 7.6G，缩容风险低。

## 7. Linux 微信 bot 对齐（用户要求「重启、更新、做所有兼容性工作」）

**运行方式（先查清，别猜）**：不是裸进程，而是 systemd 用户服务 `reasonix-bot.service`（enabled、`Restart=always`、`REASONIX_HOME=/home/tianque/.reasonix-bot`、`ExecStart=/home/tianque/.local/bin/reasonix bot start --channels weixin --dir ~/.reasonix/global-workspace`）。升级 reasonix 后 systemd 在 19:45 自动重启，**进程已是 v1.39.0**；重启命令就是 `systemctl --user restart reasonix-bot`。
> 同理还有 `goat-gateway.service`、`reasonix-auto-rename.service`、`wps-watchdog.service` + 三个 timer（`reasonix-bot-rotate` / `reasonix-peak-price` / `wps-watchdog`）与 `~/.local/bin/reasonix-peak-warn-heal` 的 crontab。

**发现的真问题**：bot home 的配置仍是**官方 DeepSeek**——`default_model="deepseek/deepseek-v4-flash"`、`provider_access=["deepseek"]`、三个 provider 全指 `api.deepseek.com`、`.env` 只有 `DEEPSEEK_API_KEY`。这与主力机修过的「bot HTTP 402」同源（官方余额已耗光）。

**已做的对齐**（改前均备份 `config.toml.bak-gateway-*` / `.bak-approval-*` / `.env.bak-gateway-*`）：
1. `default_model` → `commandcode-goat/deepseek/deepseek-v4.1-flash`
2. `provider_access` → `["commandcode-goat"]`
3. 追加 `commandcode-goat` provider 段：`base_url`/`chat_url`/`request_url` = `http://127.0.0.1:8788/v1...`、`api_key_env = COMMANDCODE_API_KEY`、`no_proxy = true`
4. bot `.env` 补 `COMMANDCODE_API_KEY`（值从主 home 复制，不落记忆）
5. `default_tool_approval_mode` → `danger-full-access`（与主力机一致；防 workspace-write 下 bash 被锁）
6. `check_updates` → `false`
7. 用 `python3 tomllib` 做 TOML 语法校验，再 `systemctl --user restart reasonix-bot`

**验证**：`reasonix doctor`（带 `REASONIX_HOME=~/.reasonix-bot`）→ model = goat、`commandcode-goat → 127.0.0.1:8788  key:present`；用 bot 自己的 key 经网关实调 → **HTTP 200 / 3.6 s / content=「正常」**，网关 stats `forwarded=6 retries=0 switched=0`，两 key 均 available。

**一处自我更正**：bot home 的 `skills`/`memory`/`projects`/`sessions` **原本就是指向主 home 的符号链接**（2026-08-10 建立），只是 `find` 默认不跟随符号链接才显示 0 文件——不需要也不应复制成副本。**教训：统计带符号链接的目录必须用 `find -L`。**

**留给用户实测**：发一条微信消息给 bot，确认收发链路（可自动验证到 LLM 侧，微信侧必须真实消息）。
