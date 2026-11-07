# 会话交接 · 2026-11-07

<!-- RELAY:BEGIN —— 由 Linux 侧自动维护（`relay plansync`），手改会被覆盖 -->
## relay 待办 · `C:\relay`（每 turn 必查）

- 未读 **1** 条，在 `C:\relay\lin2win\0-inbox\`
  - `20261031T153859Z-0001-lin-verify-four-items`
- 流程：读 → `1-wip\` → 完成 `2-done\`（放弃 `3-dead\` + 理由）
- 协议 `C:\relay\README.md`｜状态板 `C:\relay\STATE.md`（只改 `## WIN` 段）
- 回话：写 `C:\relay\win2lin\0-inbox\<UTC时间>-0001-<slug>.md`，UTF-8 **无 BOM**、LF（R1：`lin2win\` 只有 Linux 写）
<!-- RELAY:END -->

> 上一份交接（2026-11-01 backup repo）已归档：`PLAN.d/machine-env/backup-repo-20261101.md`
> 双机同步规则单独成篇：`PLAN.d/machine-env/two-machine-sync.md`

---

## 0. 环境事实（先读这段，能省掉一半排查）

| 项 | 值 |
|---|---|
| 硬件 | 机械革命 KUANGSHI（旷世），BIOS `N.1.21MRO16`，序列号 `425052C32550470283` |
| 系统 | Windows（天阙九泉）/ TianQue Linux 双系统，**同一台机器** |
| `~/.dsh` | 两机**各自独立 git，都无 remote**，commit 历史完全不同 |
| Windows dsh | `0.2.1-rc.2`，装在 `C:\Users\27063\AppData\Roaming\npm` |
| Linux dsh | **`0.2.1-rc.4`**，装在 `~/.local/lib/node_modules/@deepseek-ai/dsh` |
| Linux node | PATH 里是 `/usr/bin/node` = **v22.22.1**；dsh 实际跑在 `~/.local/node/current/bin/node` = **v24.21.0** |
| Linux 服务 | `dsh-web.service`(3081) / `dsh-tunnel.service`(3082) / `goat-gateway.service` / `goat-quota-http.service`(8790)，**四个都 active** |
| 3080 | 手工 `dsh web`，不归 systemd 管；当前**未运行** |
| 备份 repo | `D:/Desktop/工具箱/reasonix-ops/repo` → GitHub `TianQue6916/dsh-reasonix-agent`，`.git` 46 MB |

**Linux 上 dsh 有两棵安装树，别搞混**：
- `~/.local/lib/node_modules/@deepseek-ai/dsh` = **0.2.1-rc.4**（活的，`~/.local/bin/dsh` 指向它）
- `~/.local/node/current/lib/node_modules/@deepseek-ai/dsh` = 0.2.1-rc.2（旧的，别升这个）

---

## 1. 本次会话已完成（2026-10-31 → 11-07）

### 1.1 备份 repo 瘦身（B1，已完成）
- `.git` 546 MB → **46 MB**（size-pack 535.82 → 44.89 MiB）
- 只重写 `master`，`origin/mnemon-sync` 完全不动（它是 dsh-mnemon 插件的双机同步通道）
- `HEAD^{tree}` 改前改后逐字节相同 ⇒ 1728 个文件一个没变
- 安全网：`reasonix-ops/backup/pre-cleanup-20261101-1721Z.bundle`（561,633,316 B）
- 详见 `PLAN.d/machine-env/backup-repo-20261101.md`

### 1.2 计划任务静默化（已完成）
4 个 daily-kit 任务从 `bash.exe -lc "..."` 改成 `wscript.exe run-hidden.vbs "..."`，输出重定向到 `/d/daily-kit/daily.log`。
原任务 XML 备份：`~/.dsh/storages/tools/tasks-backup-20261101/`。
后续 11-03 又统一改成 `run-quiet.vbs`（commit `8cfc29b`）。

### 1.3 Windows → Linux 全量同步（已完成，有两次事故）
同步了：`skills/github`(5 文件) / `PLAN.d`(10→18) / `contrib` / `storages/tools` 208 脚本 / `.agent-presets/anchored-standard` / goat-gateway 的 4 个 `_patch-*.py` + `quota-http.mjs` + `dsh-plugin-goat-panel`。
12 个抽样文件 md5 全一致。Linux 侧提交 `a5f0100`。

**两次事故（必须记住）**：
1. `profiles/*/package.json` 里有 `link:D:/Toolbox/...`，搬到 Linux 会让 pnpm 解析失败 → 已 `git checkout 649b216 -- profiles/` 回滚（`e7750e6`）
2. 把 Windows 版 `quota-http.mjs` 覆盖到 Linux → `{"ok":false,"error":"spawn powershell ENOENT"}` → 从 `~/backups/pre-sync-goat-20261102-1615.tgz` 恢复 5958 B 原版

判据：同步前先 `grep -nE 'D:/|C:/|powershell|\.ps1|\.vbs' <file>`，命中就不搬。

### 1.4 额度面板同步的真相
- `client.js` 两端现在**完全一致**（557 行，含 `/cache` `/connectivity` hook）
- 但后端不同：Windows `quota-http.mjs` 29,819 B（有 `/cache` `/connectivity`），Linux 5,958 B（只有 `/quota` `/balance` `/health`）
- `client.js` 是 null-safe 的（`.catch(() => setState(null))` + 渲染侧守卫），所以 Linux 面板**干净地少两行**，不报错
- 用户 11-02 拍板：**不做后端移植**

### 1.5 go-panel 同步的隐藏坑
`node_modules/@local/dsh-plugin-goat-panel` 是 **pnpm `file:` 的硬拷贝，不是软链**。改 `~/goat-gateway/dsh-plugin-goat-panel/lib/client.js` 源文件**不生效**，必须 `cp` 到 `node_modules/@local/` 再重启。

### 1.6 Windows 网卡 WOL（已改，收益存疑）
`S5WakeOnLan` / `*WakeOnMagicPacket` / `*WakeOnPattern` 从「开启」改「关闭」，`WolShutdownLinkSpeed` 保持 0。
但 ACPI 取证显示**网卡根本不在唤醒路径**（`powercfg wake_programmable` 无网卡、`MSPower_DeviceWakeEnable` 几乎为空、`MSPower_DeviceEnable` 只有 Intel 芯片组）⇒ 这几个键大概率是 Realtek 驱动的通用摆设。

---

## 2. 未完成 / 卡点

### 2.1 【进行中，已中止】dsh 升级到 0.2.2-rc.1
**做了**：查清版本、备份、停进程、启动 npm install。
**中止原因**：用户要求停下交接。
**当前状态**：npm install 已 kill，`0.2.1-rc.4` **完好无损**，无半装残留（`@deepseek-ai/` 下只有 `dsh` 和 `dsh.bak-20261026-...`），`dsh-web.service` 已恢复 active、3081 返回 401（需 token，正常）。

**下次要继续的话（关键参数已探明）**：
```
最新版：0.2.2-rc.1（2026-11-04 发布，dist-tag latest / next）
当前：Linux 0.2.1-rc.4（10-26）、Windows 0.2.1-rc.2（更旧）
新增依赖 4 个：dsh-experimental-forge-bundle / dsh-experimental-liveshare
               dsh-official-bundles / dsh-personalized-recommendations
cordis 4.0.5 → 4.1.0（minor，第三方 plugin 兼容性未知，这是最大风险）
engines: node >= 24.9.0  ← Linux 必须用 ~/.local/node/current/bin/node（24.21.0）
registry: npmjs 直连才有新版本；npmmirror 上 npm view 返回空
命令：
  export PATH=~/.local/node/current/bin:$PATH
  npm install -g --prefix ~/.local --registry=https://registry.npmjs.org \
      --no-audit --no-fund @deepseek-ai/dsh@0.2.2-rc.1
```
⚠️ 装完还要 `pnpm install` 重装 `~/.dsh/profiles/web/node_modules`（cordis 版本变了）。
⚠️ 856 MB 的包，几分钟，别用前台跑（会超时被 kill 成半装）。

### 2.2 Windows 关机后自动开机（未解决，等用户做实验）
- 现象：`id=109 Shutdown Off` 88 次中 42 次在 10 分钟内又 boot（**48%**），间隔 13–34 秒
- 已排除：Fast Startup / 睡眠唤醒（计数 0）/ WOL（网卡不在 wake_programmable）/ 唤醒定时器（`RTCWAKE=0`）/ 电源切换（`id=105` 30 天仅 1 条）/ 飞智 BS3（一直走蓝牙，S5 断电）
- `wake_armed` 已归零（`powercfg /devicedisablewake "HID-compliant mouse (001)"`，**必须带 `(001)` 后缀，不带会静默不生效**）
- **用户关键观察：三根线全拔就不复现**，但**从未做单变量实验**，不知道是哪根
- 嫌疑排序（按 ACPI 证据）：鼠标接收器 `VID_367B&PID_1919` > RNDIS 移动 WiFi 数据线 > 网线
- **待做**：① 只拔两根 USB 保留网线，关机 ×3；② 反过来再做一轮。3 次全不自启 ⇒ 96% 置信
- 最终解法只有两条：BIOS 的 `ErP`/`EuP` = `Enabled (S4+S5)`（新界面 BIOS 可能已砍），或者物理断电（智能插座 + 来电自启）
- 监控脚本：`storages/tools/boot-watch.ps1`，输出 `~/.dsh/logs/boot-selfstart.jsonl`

### 2.3 其他零散
- Linux `profiles/desktop/package.json` 里**本来就有** `D:/Toolbox/...` 路径（历史遗留，web profile 不受影响）
- `~/goat-gateway/dsh-thinking-language` 两端 7 个文件 md5 全等，无需动
- `~/.dsh` 有 226 个未提交改动（autocommit 插件在管，不用手动清）

---

## 3. 下一步优先级建议

1. **要不要升 dsh 0.2.2-rc.1** —— 先想清楚 cordis 4.1 会不会打挂第三方 plugin（goat-panel / thinking-language / mnemon / billion-context / headroom）。稳妥做法：先在 Linux 用 `--prefix /tmp/dsh-test` 装一份隔离测试。
2. Windows 关机自启的二轮实验（只需关机 6 次）
3. 其余都是低优先级

---

## 4. 踩过的坑（按时间倒序，都是有代价的）

1. **`node_modules/@local/*` 是硬拷贝** —— 改源文件不生效，必须 cp 到 node_modules 再重启
2. **skill 列表在 dsh 进程启动时扫描一次** —— `dsh` 没有 reload 命令，改 skill 必须重启进程（只有 `cordis.patch.yml` 是 live HMR）
3. **跨机同步平台相关脚本会炸** —— `quota-http.mjs` / `profiles/package.json` 都栽过
4. **Python 写不了 D 盘，但 bash 能** —— 同一个 shell、同一进程树，`python -c "open('D:/x','w')"` 报 `PermissionError`，`echo > D:/x` 成功。绕法：写文件用 bash 重定向，Python 只做计算
5. **`plan-anchor` 的截断段不能凭猜** —— 写到一半的 plan 文件要先 read 全文再改
6. **`pkill -f "npm install ..."` 会杀掉自己所在的 ssh 命令行** —— 因为 `-f` 匹配整个 cmdline，而 ssh 的 bash -c 里就含这个字符串
7. **git pre-commit 会拦混域提交** —— 暂存区混了 preset/session/misc/scratch/toolkit 五个域会被拒，先 `git reset` 再单独 `git add <path>`

---

## 5. 关键命令速查

```bash
# Linux dsh 状态
ssh tianque 'systemctl --user is-active dsh-web.service dsh-tunnel.service goat-gateway.service goat-quota-http.service'
ssh tianque 'ss -tlnp | grep -E ":308[0-9]|:8790"'

# 重启 Linux dsh web（3081）
ssh tianque 'systemctl --user restart dsh-web.service'

# 看 dsh 报错
ssh tianque 'journalctl --user -u dsh-web.service -n 40 --no-pager'

# 配额端点
curl -s http://127.0.0.1:8790/quota          # Windows
ssh tianque 'curl -s http://127.0.0.1:8790/quota'   # Linux

# 双机同步（tar+scp，Windows 没 rsync）
tar czf /tmp/sync.tgz -T <filelist>

# 关机自启监控
powershell -NoProfile -File ~/.dsh/storages/tools/boot-watch.ps1 -Days 8
```

---

## 6. 会话标识

- 会话 id：`session-f6dab754-0ac4-44eb-b5ad-50b2869ac34b`
- 会话 plan：`~/.dsh/plans/session-f6dab754-0ac4-44eb-b5ad-50b2869ac34b.md`（内含逐条时间线）
- 本文件：`~/.dsh/PLAN.md`
