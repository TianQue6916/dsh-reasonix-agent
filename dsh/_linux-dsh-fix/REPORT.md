# dsh Linux 端 `dsh web` 启动失败 —— 定位 / 修复 / 验收报告

- 会话：`session-acb405a3-2d2f-4fa5-acae-d1eb18550244`
- 日期：2026-10-29
- 执行环境：Windows（天阙九泉）侧分析 + 脚本；**Linux（TianQue）侧执行由你本人完成**
- 交付物目录：`C:\Users\27063\.dsh\_linux-dsh-fix\`

---

## 0. TL;DR

> **2026-10-29 02:00 实测更新（已定案）：真实根因是端口冲突 —— `dsh-tunnel.service` 用
> `ssh -L 3080:127.0.0.1:3080` 占住了 Linux 本地 3080，`dsh web` 的 `webserver`（required 插件）
> bind 失败 ⇒ `startup failed: 2 required plugins did not activate` ⇒ 进程 exit 1 ⇒ systemd 三次重试后 failed。
> 已修（本地实例改用 3081，tunnel 保留 3080），实测 `active / NRestarts=0 / HTTP 401`。
> **不是插件版本问题**。完整证据链与修正见 §11。下面 §0~§7 保留，但第 2、5 条已被 §11 取代。**

1. **根因机制已确定**：dsh 启动时逐个 bundle 做 plugin 兼容性门禁，**不满足就整条跳过并各抛一条长警告**；豁免凭据是 profile 目录下的 `compatibility.json`，键为 `包名@版本`，值是**精确 dsh 版本列表**（不是 semver range）。
2. **Linux 端最可能的直接原因**：那份 `compatibility.json` 缺失，或里面没有你 Linux 上实际在跑的 dsh 精确版本号。因为它是精确匹配，**dsh 版本差一格（rc.2 → rc.4）所有豁免同时失效**，于是"一次报一堆"。
3. **已在 Windows 侧完成端到端复现与修复验证**：删掉 `compatibility.json` → `incompatible 告警=2 / skipping bundle=2 / 合成 entry 数 434→432`；跑修复脚本 → 回到 `告警=0 / skipping=0 / entry=434`。三次读数闭环。
4. **你需要在 Linux 上跑的只有两条命令**（§4）。DRY-RUN 先看，再 `--apply`。
5. **根治方向**：`dsh-headroom@0.3.0` 与 `@lanbaolu/dsh-wechat-bridge@0.9.1` 都只声明到 0.1.x，**从来没打算支持 0.2.x**（headroom 上游已 DEPRECATED、并入 `dsh-headroom-suite`）。豁免它们只是恢复可用性，不是解决办法，见 §6。

---

## 1. 机制：为什么"一堆错"，而且为什么版本差一格就全崩

### 1.1 判定只走一条路，两个互斥分支

源码：`@deepseek-ai/dsh-app-boot/lib/index.js` 中的 `unmetRequirements(fields, runtimeVersion)`：

```
若 manifest.engines.dsh 存在  →  只看它，peerDependencies 全部忽略
否则若 manifest.peerDependencies 不存在  →  直接判定"兼容"（return {}）
否则  →  逐个检查 peerDependencies 里所有 @deepseek-ai/dsh 与 @deepseek-ai/dsh-* 的 range
```

比较用的是 `semver.satisfies(runtimeVersion, range, { includePrerelease: true })`。

注意第二条分支：**没有 `peerDependencies` 字段的插件永远不会被拦** —— 所以你 profile 里那些 `@local/dsh-thinking-language`、`dsh-scroll-boost` 之类根本不在门禁视野内，能拦你的只有明确声明过的包。

### 1.2 失败时刻，不是警告而是逐条跳过

`loadProfileDirectory()` 里：

```js
for (const packageName of bundles) try {
    const issue = evaluatePluginCompatibility(bundleManifest, exemptions);
    if (issue !== void 0 && !issue.exempted) throw new Error(pluginCompatibilityWarning(issue));
    ...
} catch (error) { skippedBundles.push({ packageName, ... }) }
```

N 个不兼容 bundle ⇒ **N 条同构长句**，每条都带：

```
Plugin <name>@<version> is incompatible with dsh <runtime>: requirements {"...":"..."}.
Running it may cause crashes or data loss. Update the plugin or install a plugin version
compatible with this dsh runtime. ... Exact-version exemption: not active.
dsh: skipping profile bundle "<pkg>": Error: Plugin ...
```

这就是你说的"一堆错"的成因：**它不是一次错误，是 N 次同源错误**。

### 1.3 豁免为什么"版本差一格就全失效"

`compatibility.json` 的结构（你本机现在这份）：

```json
{
  "dsh-headroom@0.3.0": ["0.2.0-rc.2", "0.2.1-rc.2", "0.2.1-rc.4"],
  "@lanbaolu/dsh-wechat-bridge@0.9.1": ["0.2.0-rc.2", "0.2.1-rc.2", "0.2.1-rc.4"]
}
```

生效条件（`evaluatePluginCompatibility`）：

```js
exempted: (exemptions[key] ?? {})?.includes(runtimeVersion) === true
```

`key = ${name}@${version}`，`runtimeVersion` 是**精确字符串**。所以：

- 你 Linux 上若跑 `0.2.1-rc.3`，上面这份**一条都不生效**（列表里没有 rc.3）。
- 你 Linux 上若根本没有这个文件，等于"零豁免"。
- 这解释了为什么你 10-28 会在本机留一个 `compatibility.json.bak-20261028-045136-pre-add-rc4` —— 你当时正在手动往白名单里补 rc.4。

反过来说：**这是官方设计好的开关，不是 hack**。`--accept-risk` 的存在说明官方预期到"有些人就是要硬跑"，只要求你显式承认风险。

---

## 2. 本机复现实验（可复现，三段读数闭合）

工具：`dsh-linux-fix.sh`（§4），对象：Windows 侧真实的 `~/.dsh/profiles/web`，dsh `0.2.1-rc.2`。

| 阶段 | 操作 | FAIL | incompatible 告警 | skipping bundle | 合成 entry 数 |
|---|---|---|---|---|---|
| A 基线 | 原样 | 0 | 0 | 0 | 434 |
| B 破化 | 移走 `compatibility.json`（模拟 Linux 缺文件） | 2 | **2** | **2** | **432** |
| C 修复 | 脚本 `--apply` 重建豁免 | 0 | **0** | **0** | **434** |

三点结论：

1. **缺少豁免 ⇒ 正好少 2 个 bundle**，与 profile 里那两个声明落后的插件一一对应。这不是猜测，是能数出来的差值。
2 . `--dump-config` 在 B 阶段 **exit=0** —— 也就是"跳过并警告"不等于"进程必崩"。所以你 Linux 上如果表现为**进程直接退出**，那还有第二个因素（§5），单靠豁免修不好。
3. 脚本判定与官方 `evaluatePluginCompatibility` **交叉验证一致**（脚本里两者同时跑，不一致会显式报 `[!] 交叉验证不一致`）。

---

## 3. Linux 端候选根因与判定树

按概率排序，判定只需看 `dsh --profile web --dump-config 2>err` 的 stderr：

```
stderr 含 "skipping profile bundle" / "is incompatible with dsh"
    └─ 是 → 根因 = 豁免失配（§1.3）        → 用本报告脚本修
    └─ 否
        ├─ stderr 含 "duplicate loader entry id"  → 根因 = 重复 entry（§5.1），脚本不自动改
        ├─ stderr 含 "Cannot find module" / ERR_MODULE_NOT_FOUND
        │                                          → 根因 = 跨 OS 残留（§5.2）
        ├─ stderr 含 EADDRINUSE :3080             → 根因 = 端口占用（§5.3）
        └─ 都没有                                 → 贴输出给我，需要重新判定
```

---

## 4. 交付物与用法

目录 `C:\Users\27063\.dsh\_linux-dsh-fix\`：

| 文件 | 作用 |
|---|---|
| `dsh-linux-fix.sh` | 主脚本：诊断 + 可逆修复 + 验收（283 行，纯 bash + 内嵌 node，无第三方依赖） |
| `REPORT.md` | 本文件 |

**拷到 Linux**（双系统，Windows 的 NTFS 分区在 Linux 侧可挂载；或直接 `cat` 出来粘贴）：

```bash
# 在 Linux 上
chmod +x dsh-linux-fix.sh

# 第一步：只诊断，绝不写文件
bash dsh-linux-fix.sh

# 第二步：看你诊断结果里 [R1]/[R2] 的描述没问题，再真修
bash dsh-linux-fix.sh --apply

# 第三步：冒烟
pkill -f "dsh web"; sleep 1; timeout 90 dsh web 2>&1 | head -40
```

脚本做的事，逐条：

- **Phase 0**：取 dsh 版本（`dsh --version` 失败则回落到全局 npm 包的 `package.json`）、node 版本、profile 完整性。
- **Phase 1**：`--apply` 时把 `package.json / compatibility.json / cordis.patch.yml / cordis.yml / pnpm-lock.yaml` 备份到 `$DSH_HOME/_repair-backup-<ts>/`。
- **Phase 2**：对**每个 bundle** 复刻官方判定，输出 `OK / EXEMPTED / FAIL / MISSING / WINONLY` 五态表；与官方 `evaluatePluginCompatibility` 交叉验证。
- **R1**：把当前 dsh 精确版本**合并**进 `compatibility.json`（读-改-原子写：`写 .tmp` 后 `rename`，权限 `0600`）。
- **R2**：从 `dsh.profile.bundles` 里剔除 Linux 上不可能加载的项（`os` 明确排除 linux 的包、`link:D:\...` 盘符路径），**只改 bundles 不改 dependencies**，随时可加回。
- **Phase 3**：`dsh --profile web --dump-config` 零副作用验收，统计 `incompatible / skipping / duplicate / entry 数 / 3080 占用`。

`bundle` 定位逻辑按 dsh 真实语义走三处：`<profile>/node_modules` → `<profiles>/node_modules`（installAnchor）→ 全局 dsh 包内。**第一版脚本漏了第二处，把 `@deepseek-ai/dsh-base` 误报 MISSING，已修**（见 §9）。

---

## 5. 脚本故意**不**自动修的四种情况

### 5.1 `duplicate loader entry id`

一个顶层 `insert` 引用解析不到，或聚合包与子包被同时列出，会**拖垮整棵树**；而且"修掉第一个还会继续报下一个"。脚本只统计不修改，因为自动改 patch 的正确做法取决于你那条 aggregation 的意图。

### 5.2 跨 OS 残留（只在 profile 被搬过时出现）

你 `web/package.json` 里有：

```
"@local/dsh-plugin-goat-panel": "link:D:/Toolbox/goat-gateway/dsh-plugin-goat-panel"
"@local/dsh-thinking-language": "file:D:/Toolbox/dsh-thinking-language"
```

以及 win32-only 的包：`@roamhq/wrtc-win32-x64`、`@vshulcz/deja-vu-windows-amd64`、`dsh-computer-use-win`。

这些在 Linux 上必然 `ERR_MODULE_NOT_FOUND`。处理方式不是豁免，而是：要么在 Linux 侧用 `<profile>` 目录跑 `pnpm install` 重新解析，要么从 `dependencies` 里去掉它们。

### 5.3 端口占用

`listen EADDRINUSE 0.0.0.0:3080` 会伪装成"起不来"。脚本会把 `3080 已监听=?` 打出来提醒。

### 5.4 真正的"内核对不上"

比如插件 `import` 了当前 dsh 版本里不存在的导出（社区里有 `dsh-better-sidebar` 导入 `SessionLogOffset` 崩掉的实例）。这类豁免过去也是崩，只能换插件版本。

---

## 6. 根治路径（B 方案：换版本，不硬豁免）

社区共识明确反对硬豁免 —— [dshmarketplace 的 install-failed 专页](https://dshmarketplace.dev/install-failed) 原话是"插件本身多半没坏，DSH 0.2 会拒装为别的版本写的插件，而**大多数插件都有能装上的旧版本**"。

两个具体事实：

- `dsh-headroom@0.3.0` 声明 `engines.dsh = ">=0.0.1-rc.5 <0.1.0 || >=0.1.0-rc.1 <0.2.0-0"`（本地 `dsh.plugin.json` 与 README 一致），**从未适配 0.2.x**；上游已标记 DEPRECATED 并合并进 `dsh-headroom-suite`。它还依赖宿主 Python 3.10 + 进程守护，硬跑的风险不是"少个面板"而是数据面异常。
- `@lanbaolu/dsh-wechat-bridge@0.9.1` 的 peer 全线写死 `^0.1.0-rc.6`。

建议序列（在 A 已恢复可用之后）：

```bash
# 1) 看有没有已经支持 0.2.1 的新版
dsh plugin --profile web list
# 2) 升级到支持线（若有）
dsh plugin --profile web add dsh-headroom-suite@latest
# 3) 升不动就移除，并把豁免用 revoke 撤掉（若你那边 CLI 有此子命令）
dsh plugin --profile web remove dsh-headroom @lanbaolu/dsh-wechat-bridge
dsh plugin --profile web version-exemptions        # 确认还剩哪些豁免
```

> 注：`dsh plugin` 本质上把参数转发给 profile 目录里的 pnpm；`version-exemptions / allow-version / revoke-version` 是更新版本的 plugin-manager CLI 才有的子命令（[官方 README](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/boot/plugin-manager/README.zh.md)）。**你 Linux 上先跑 `dsh plugin --help` 自证有没有**，没有就让脚本直接改 JSON（等价）。

---

## 7. 回滚

`--apply` 后脚本会打印备份目录。回滚：

```bash
cp -p ~/.dsh/_repair-backup-<ts>/package.json        ~/.dsh/profiles/web/
cp -p ~/.dsh/_repair-backup-<ts>/compatibility.json  ~/.dsh/profiles/web/
echo rolled-back
```

`compatibility.json` 是纯增量合并（只在原记录上追加一个版本号），不会删你已有的条目。

---

## 8. 社区证据（检索于 2026-10-29）

| 结论 | 出处 |
|---|---|
| 官方 CLI 有 `version-exemptions / allow-version <pkg@ver> --dsh-version <rt> --accept-risk / revoke-version` | [plugin-manager README.zh](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/boot/plugin-manager/README.zh.md) |
| 预检只读 `peerDependencies`；无该字段则直接放行 | [dsh-compat-vet](https://github.com/liujianqiao701/dsh-compat-vet) |
| 主流处置是换/升到兼容版本，而不是硬豁免 | [dshmarketplace install-failed](https://dshmarketplace.dev/install-failed) |
| 0.1.6 前任何插件失败 → 整树拒绝、进程退出；0.1.6+ 仅 required 条目致命 | [@hyzyn/dsh-safe](https://github.com/hyzyn/dsh-safe)、[@lanbaolu/dsh-fail-soft](https://www.npmjs.com/package/@lanbaolu/dsh-fail-soft) |
| 0.2.0-rc.1+ 不兼容行静默 `disabled`，表现为设置页整项消失 | [dsh-personal-workbench v1.15.8 notes](https://raw.githubusercontent.com/Dely0/dsh-personal-workbench/0632f15c512d58d0c990e073e6e41850feded7b6/docs/releases/v1.15.8.md) |
| 上界必须写 `<0.3.0-0`；裸 range 会静默排除 alpha | [dsh-skill-mcp-panel](https://cdn.jsdelivr.net/npm/dsh-skill-mcp-panel@2.1.5/README.md)、[dsh-hardssh CHANGELOG](https://raw.githubusercontent.com/tiphareth0/dsh-hardssh/master/CHANGELOG.md) |
| `duplicate loader entry id` 会连环报、修一个出下一个 | [KNOWN-ISSUE-bundle-duplicate](https://raw.githubusercontent.com/Lstalu/dsh-bundle-dedup-guard/ff4ddc79a57b4c60d1af2fa5d8ed08150edff2f9/docs/KNOWN-ISSUE-bundle-duplicate.md) |
| `EADDRINUSE :3080` → `dsh: startup failed: 2` | [dsh-web-service troubleshooting](https://raw.githubusercontent.com/zheyuanlinye7/dsh-web-service/7c66ab29c4bfa679e11446a3b7286efa1b2308dd/docs/troubleshooting.md) |
| dsh-headroom 声明只到 `<0.2.0-0`，且已 DEPRECATED | [findharness](https://findharness.com/zh/plugins/giter00-dsh-headroom)、[dshbase](https://dsh.deepseek404.com/detail.php?id=wjxn13%2Fdsh-headroom) |

---

## 9. 我在这个会话里说错/说漏的地方（留档，别当没发生）

1. **上一轮我说"CLI 没有 `allow-version` 这个子命令"** —— 对**本机 0.2.1-rc.2** 成立（`dsh plugin --help` 只显示转发 pnpm），但**对新版本不成立**：官方 plugin-manager README 明确列了这三个子命令。应当说"你那个版本上看不到，需要自证"，而不是断言不存在。
2. **上一轮我推荐 A（豁免）优先于 B（换版本）** —— 查到 headroom 的真实声明后**反了**：它从未适配 0.2.x 且上游已废弃，硬豁免收益低、风险高。正确顺序是 B > A > C。本报告已按修正后的顺序写。
3. **脚本第一版漏了 installAnchor** —— 只在 `<profile>/node_modules` 找 bundle manifest，导致 `@deepseek-ai/dsh-base` / `dsh-web-app` 误报 `MISSING`（它们实际在 `profiles/node_modules`）。本机实测发现并已修，现在三处依次回退查找。
4. **"一堆错"我一开始默认等于"起不来"** —— 复现显示 `--dump-config` 在缺豁免时 **exit=0**，只是 entry 少了 2 个。所以你 Linux 上到底是"跳过并警告"还是"进程退出"，决定了是不是还有第二个因素（§5）。这一点必须由你那边的一条命令来定。

---

## 10. 变更记录

| 时间 | 动作 |
|---|---|
| 2026-10-29 | 读通 `dsh-app-boot` 门禁与豁免链路；本机 semver 实测各插件声明 |
| 2026-10-29 | 检索社区经验，修正 A/B 优先级、修正 CLI 子命令结论 |
| 2026-10-29 | 写 `dsh-linux-fix.sh`；本机三段实验（434 → 432 → 434）验证修复链路；修复 installAnchor 漏查 bug |
| 2026-10-29 | 本机 `profiles/web` 已还原为原状（含 rc.4 历史条目），测试备份目录已清理 |

---

## 11. 2026-10-29 实测定案：根因是**端口冲突**，不是插件版本（推翻前面主假设）

### 11.1 通道

`~/.ssh/config` 里有 `tianque`（Tailscale `100.79.96.82`）与 `tianque-lan`（`192.168.1.13`）。
实测 `tianque` 直连可用：`Linux TianQue 7.0.0-38-generic #38-Ubuntu SMP x86_64`。
**所以之前的"碰不到那台机器"作废，以下全部是实测数据。**

### 11.2 环境（与 Windows 侧不同，这本身是个坑）

| 项 | Linux（TianQue） | Windows（天阙九泉） |
|---|---|---|
| dsh | `0.2.1-rc.4` | `0.2.1-rc.2` |
| node | `v24.21.0` | `v24.15.0` |
| web profile bundles | 12 个，含 `dsh-better-sidebar@0.28.0`、`dsh-context`、`billion-context`、`dsh-quick-toc`、`dsh-plugin-message-edit`(file: tgz) | 12 个，另一套 |
| compatibility.json | 有，headroom 已含 rc.4 | 有，含 rc.2/rc.4 |

**两台机器的 profile 是两份独立演化的配置**，不是拷贝。所以拿 Windows 的结论直接套 Linux 是错的——
这也是为什么 §1 的机制虽然正确，却在这次事故里"不是根因"。

### 11.3 证据链（四步，逐步收窄）

**① 3080 端口被谁占**

```
LISTEN 127.0.0.1:3080  users:(("ssh",pid=2715,fd=5))
LISTEN [::1]:3080      users:(("ssh",pid=2715,fd=4))
```

pid 2715 = `dsh-tunnel.service`：

```ini
ExecStart=/usr/bin/ssh -N ... -L 3080:127.0.0.1:3080 27063@192.168.243.1
Description=dsh web tunnel: Linux(local 3080) -> Windows main machine (192.168.243.1:3080)
```

即：**它在 Linux 本地监听 3080，把流量转发到 Windows 主机的 3080**。

**② 本地实例的死因**

```
systemctl --user status dsh-web.service
  Active: inactive (dead) since 2026-10-28 19:17:18; 5h 30min ago
  Process: 7861 ... /home/tianque/.local/bin/dsh web --port 3080 (code=exited, status=1/FAILURE)
  ... restart counter is at 3.  Start request repeated too quickly.
```

**③ 日志原文（决定性）**

```
dsh: startup failed: 2 required plugins did not activate
Failed plugins (1):
  webserver (required)
    Package: @deepseek-ai/dsh-host-webserver
    Error: listen EADDRINUSE: address already in use 127.0.0.1:3080
Plugins waiting for services (7):
  web-runtime (required)  webServer
  open-in-app             webServer
  directory-picker        webServer
  harness-dev-context     webApp
  client-hmr              webServer
  better-sidebar          webServer
  message-tree            webServer
```

**这就是你看到的"一堆错"**：不是 12 条兼容性警告，而是 **1 条 EADDRINUSE + 7 个在等 `webServer` 的插件级联**。
`webserver` 是 required，它一死，`web-runtime`（也 required）跟着死 ⇒ `2 required plugins`。

**④ 判定性实验（排除插件兼容性）**

```bash
dsh web --port 3099 --no-open
# → dsh web: http://127.0.0.1:3099/?token=...
# 无 startup failed、无 incompatible、无 waiting services
```

**换端口立刻起得来 ⇒ portfolio 健康 ⇒ 插件版本问题被排除。**
顺带证实：Linux 侧 `compatibility.json` 已经正确补过 rc.4（headroom 那条），你之前的折腾没白费，那条路本来就是通的。

### 11.4 修复（已执行并验证）

```ini
# ~/.config/systemd/user/dsh-web.service
- ExecStart=... dsh web --port 3080
+ ExecStart=... dsh web --port 3081
```

```bash
cp -p dsh-web.service dsh-web.service.bak-20261029-portfix
sed -i 's|dsh web --port 3080|dsh web --port 3081|' dsh-web.service
systemctl --user daemon-reload && systemctl --user reset-failed dsh-web.service
systemctl --user start dsh-web.service
```

验收（实测输出）：

| 检查 | 结果 |
|---|---|
| `is-active` | `active` |
| `NRestarts` | `0` |
| `MainPID` | `1694758` |
| 端口 | `127.0.0.1:3081` = dsh web；`127.0.0.1:3080` = ssh 隧道 |
| `curl 127.0.0.1:3081` | `401`（要 token，正常响应） |
| 日志 | `dsh web: http://127.0.0.1:3081/?token=...`，无 `startup failed` |

**新的端口分工**：

- `http://127.0.0.1:3081` → Linux 本地 dsh web
- `http://127.0.0.1:3080` → 经 ssh 隧道到 Windows 主机（192.168.243.1）的 dsh web

回滚：

```bash
cp -p ~/.config/systemd/user/dsh-web.service.bak-20261029-portfix ~/.config/systemd/user/dsh-web.service
systemctl --user daemon-reload && systemctl --user start dsh-web.service
```

### 11.5 如果想反过来（本地留 3080、隧道让路）

一句命令即可，逻辑对称：

```bash
# 隧道挪到 3082，本地回到 3080
sed -i 's|-L 3080:127.0.0.1:3080|-L 3082:127.0.0.1:3080|' ~/.config/systemd/user/dsh-tunnel.service
sed -i 's|dsh web --port 3081|dsh web --port 3080|'  ~/.config/systemd/user/dsh-web.service
systemctl --user daemon-reload
systemctl --user restart dsh-tunnel.service dsh-web.service
```

### 11.6 方法论教训（这次真正的收获）

1. **`startup failed` ≠ `incompatible`**。dsh 的失败至少有三类，症状都是"报一堆东西"：
   插件兼容性门禁（`skipping profile bundle`）／required 插件激活失败（`Failed plugins`）／
   patch 树合成失败（`duplicate loader entry id`）。**先看 required 插件那条 `Error:`，再看清单**。
2. **`Required` 是放大器**。`webserver` 一条 EADDRINUSE，通过依赖图放大成 1 failed + 7 waiting + exit 1 + systemd 重试失败。看起来像"全线崩溃"，实际是单点。
3. **先问"那台机器上到底有什么服务"**。我前三轮全在插件目录里找答案，而答案在 `systemctl --user list-units` 里——
   一个 `ssh -L 3080` 的隧道服务和本地 web 抢同一个端口。
4. **两台机器 ≠ 一份配置**。Windows 的 profile 结论不能直接搬到 Linux，反之亦然。

### 11.7 顺带修掉的一个脚本 bug（真环境暴露）

第一次在 Linux 真实 profile 上跑 dry-run 时，脚本报了一个**假 FAIL**：

```
FAIL  @deepseek-ai/dsh-web-app  0.1.5-rc.3  不满足 {"@deepseek-ai/dsh-system-prompt":"^0.1.5-rc.3",...}
```

但同一时刻 `dsh --dump-config` 是 `incompatible 告警=0 / skipping=0`。矛盾 ⇒ 我的解析有问题。

查官方 `resolveBundleDir`：

```js
function resolveBundleDir(binName, packageName, installAnchor, profileDir) {
    for (const anchor of [installAnchor, join(profileDir, "package.json")]) { ... }
}
```

注释写明：**in-box bundle 永远从与运行中 dsh 同一个安装解析，绝不来自 profile 本地副本**。
即 `installAnchor`（= dsh 安装包目录）**优先**。我原来的顺序是 profile 优先，于是在
`profiles/node_modules` 里捡到一个陈旧的 `@deepseek-ai/dsh-web-app@0.1.5-rc.3`，拿它去比 rc.4 的 runtime，才误判 FAIL。

修法：定位 `dsh` 真实安装目录（`readlink -f $(command -v dsh)` → `*/@deepseek-ai/dsh/lib/bin.js` → 上溯两级），
按 `installAnchor → profiles/node_modules → profile/node_modules` 顺序查找。

修完在 Linux 真环境复跑（同一 profile、12 个 bundle）：

| 指标 | 修前 | 修后 |
|---|---|---|
| `@deepseek-ai/dsh-base` 版本读到 | `0.1.5-rc.3`（错层） | `0.2.1-rc.4`（正确） |
| `@deepseek-ai/dsh-web-app` | FAIL（假） | OK |
| 摘要 | `FAIL=1` | `FAIL=0 MISSING=0 WINONLY=0` |
| 与 `--dump-config` 的 `incompatible 告警=0` | 矛盾 | **一致** |

**这条修完，脚本的判定才真正和 dsh 自身同构**。这也是"先在真环境跑一遍"的价值：
Windows 侧那段实验（§2）跑不出这个 bug，因为 Windows 的 `profiles/node_modules` 里恰好是同一版本。

---

## 12. 2026-10-29 第二轮：还有第二个根因 —— PATH 里两套 dsh 安装

修完端口后你说"还是这样"。再查，发现我漏了一个更隐蔽的东西。

### 12.1 现象

你终端里 `dsh web` 的栈全是 `.local/node22/...` 的路径，而**我 SSH 里跑的 `dsh` 是 `.local/lib/...`**。
即：同一台机器上有两份 dsh，我的会话和你的终端各命中一份。

| 安装位置 | 版本 | 含 `@deepseek-ai/dsh-agent-preset` |
|---|---|---|
| `~/.local/lib/node_modules/@deepseek-ai/dsh` | **0.2.1-rc.4** | 有 |
| `~/.local/node22/lib/node_modules/@deepseek-ai/dsh` | 0.1.5-rc.3 | 结构不同，缺这个包 |
| `~/.local/node/node-v24.21.0-linux-x64/lib/node_modules/...` | 0.2.1-rc.2 | — |

### 12.2 为什么两份会话命中不同版本

- 你的**图形终端**：非 login 交互 shell，只读 `~/.bashrc`。
  `.bashrc:125` 原本是 `export PATH="$HOME/.local/node22/bin:$PATH"`（前置），
  而 `~/.local/bin` 只在 `~/.profile` 里被加入 PATH —— **`.bashrc` 不读 `.profile`**，
  所以你的终端 PATH 里压根没有 `~/.local/bin`，`dsh` 只能落到 node22 的 0.1.5-rc.3。
- 我的 `ssh ... bash -lc`：login shell，读 `~/.profile` → 有 `~/.local/bin` → 命中 0.2.1-rc.4。

**这解释了为什么"我这边测通了、你那边还是炸"** —— 不是修没修好的问题，是我们压根在跑两个不同的 dsh。

### 12.3 第二处报错的由来

```
Error: failed to import loader entry preset-anchored-standard (@deepseek-ai/dsh-agent-preset):
       Cannot find package '@deepseek-ai/dsh-agent-preset' imported from /home/tianque/.dsh/profiles/web/
```

0.1.5-rc.3 的 dsh 加载 0.2.1-rc.4 的 profile，profile 的 `cordis.patch.yml` 里 `preset-anchored-standard`
声明行要求 `@deepseek-ai/dsh-agent-preset`，而这个包是 0.2.x 才进 in-box 的 ⇒ `ERR_MODULE_NOT_FOUND`。
**它不是独立的 bug，是"版本错配"的必然结果。**

### 12.4 修复

```bash
# ~/.bashrc 第 125 行
- export PATH="$HOME/.local/node22/bin:$PATH"
+ export PATH="$HOME/.local/bin:$PATH:$HOME/.local/node22/bin"
```

`.local/bin` 是完整的一套 node24 环境（`node v24.21.0` + dsh 0.2.1-rc.4，配对正确），
`node22/bin` 保留在末尾兜底。

### 12.5 验收（交互式 shell，与你的终端同条件）

```
which dsh  = /home/tianque/.local/bin/dsh
dsh --version = 0.2.1-rc.4
node -v    = v24.21.0
$ dsh web --no-open
dsh web: http://127.0.0.1:3080/?token=...          ← 裸命令，零报错
```

### 12.6 现在的端口分工

| 端口 | 归属 |
|---|---|
| 3080 | 你手动 `dsh web`（裸命令，默认端口） |
| 3081 | `dsh-web.service`（systemd 常驻，enabled） |
| 3082 | `dsh-tunnel.service` → Windows 主机 192.168.243.1:3080 |

**注意**：3080（手动）与 3081（systemd）是两个 dsh 实例，共享同一个 `profiles/web`。
目前实测可共存，但 session 库/日志是并发的。若不想并存，二选一：

```bash
systemctl --user disable --now dsh-web.service      # 只用手动
# 或者反过来：用 systemd，手动就用 --port 3083
```

### 12.7 教训（第三层）

我前两轮都没问一个最基本的问题：**"你终端里的 `dsh` 到底是哪个文件？"**
`which -a` / `type -a` 在**非 login shell** 里跑才算数 —— 我用 `bash -lc` 测，环境和你终端不是同一个，
于是连续两轮得出"已修好"。**验证必须和你出问题的那个 shell 同条件。**

| 教训 | 具体 |
|---|---|
| 验证环境必须与故障环境同构 | `bash -lc` ≠ 图形终端；要 `bash -ic` 或直接在终端里跑 |
| 多 node 环境宿主机是重灾区 | `.local/bin`(node24) / `.local/node22/bin`(node22) / `/usr/local/bin`(node22.22.1) 三套并存 |
| "还是这样"要看**路径**，不只看报错内容 | 栈里 `.local/node22/...` 就是线索，我第一轮忽略了它 |

---

## 13. 端口分工定稿（2026-10-29，按你的要求：3080 只留给手动 `dsh web`）

### 13.1 最终分工

| 端口 | 谁用 | 怎么起 | 实测 |
|---|---|---|---|
| **3080** | **你手动拉起的 `dsh web`** | 终端里 `dsh web`（默认端口） | `curl` → **401**（服务活着，要 token） |
| 3081 | `dsh-web.service`（systemd 常驻，enabled） | 开机自启 / `systemctl --user start dsh-web` | `curl` → **401** |
| 3082 | `dsh-tunnel.service` → Windows `192.168.243.1:3080` | 开机自启 | `curl` → **000**（见 §13.3） |

两个 unit 的 `Description` 也一并改准了（原来写的还是 3080，会误导以后的排查）：

```ini
# dsh-web.service
Description=dsh web (Linux local instance, port 3081; 3080 is reserved for manual `dsh web`)
# dsh-tunnel.service
Description=dsh web tunnel: Linux(local 3082) -> Windows main machine (192.168.243.1:3080, ...)
```

### 13.2 验收：3080 与 3081 并存不打架

同时起两个实例后实测：

```
3080(manual)  = 401      ← 手动实例
3081(service) = 401      ← systemd 实例
```

两者共享同一个 `profiles/web`，实测可共存、互不影响响应。
如果你只想用手动、不想有常驻副本：`systemctl --user disable --now dsh-web.service`。

### 13.3 3082（隧道）为什么是 000 —— **不是改端口改坏的**

诊断三步：

**① ssh 隧道本身是通的**（systemd 日志）：

```
01:05:18 Started dsh-tunnel.service
01:05:19 ssh[1783236]: ** WARNING: connection is not using a post-quantum key exchange ...
```

进程活着、`3082` 在 LISTEN、到 `192.168.243.1` 的 ssh 握手成功。

**② 但后端是空的**（curl 原文）：

```
> GET / HTTP/1.1
> Host: 127.0.0.1:3082
* Request completely sent off
* Empty reply from server        ← 端口转发接上了，目标端口没人应答
```

**③ 源头核查（Windows 侧）**：

```
netstat -an | grep LISTENING | grep :30xx   → 空
tasklist / Get-CimInstance node.exe         → 只有
   node .../mcp-goat-quota.mjs
   node .../billion-context/dist/index.js start --host 127.0.0.1 --port 18787
```

**Windows 上此刻根本没有 dsh web 在监听 3080**，所以隧道转发到 `127.0.0.1:3080` 只能拿到空响应。

> 结论：隧道配置**不需要再改**。等你 Windows 那边起了 `dsh web`（默认 3080），
> Linux 上 `http://127.0.0.1:3082` 立刻就能用。
> 如果你 Windows 侧的 dsh web 实际跑在别的端口，只需要改这一处 target：
> ```bash
> sed -i 's|-L 3082:127.0.0.1:3080|-L 3082:127.0.0.1:<真实端口>|' ~/.config/systemd/user/dsh-tunnel.service
> systemctl --user daemon-reload && systemctl --user restart dsh-tunnel.service
> ```

### 13.4 又一个坑记一笔：`pkill -f` 会杀掉自己

清理手动实例时执行：

```bash
ssh tianque 'pkill -f "dsh web --no-open"'
```

结果 **ssh 会话自己 exit 255** —— 因为 `pkill -f` 匹配的是整条命令行，
而远端 `bash -c 'pkill -f "dsh web --no-open"'` 这条命令行里**就含有**那个字符串，于是把自己也杀了。

正确写法（正则自避让）：

```bash
pkill -f "[d]sh web --no-open"
# 或按 PID：pgrep -f "^node .*dsh web" | xargs -r kill
```
