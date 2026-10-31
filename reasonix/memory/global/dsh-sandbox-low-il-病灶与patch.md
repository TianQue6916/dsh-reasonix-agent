---
id: mem-939dda516e7514d0ddaf6ca254959b12
revision: 2
created_at: "2026-10-28T18:02:38.248Z"
updated_at: "2026-10-28T19:59:56.541Z"
name: dsh-sandbox-low-il-病灶与patch
description: "dsh Windows ACL sandbox 把 C:\\Users\\27063 打成 Low IL 的根因、四个后果（含 .lnk 图标全白与 label 跨盘传播）、复发条件与根治 patch"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 症状三连（同时出现就是它）

1. bash 里 `whoami /groups` 首行 = `Mandatory Label\Low Mandatory Level   Label   S-1-16-4096`
2. 写 D 盘全拒：`DENY /d`、`/d/Toolbox`、`/d/CrystalDiskInfo`、`/c/Windows/Temp`；但 `OK /d/Temp`（早前用 `fix-d-temp-integrity.ps1` 显式打过 Low label）
3. `schtasks /Query /TN <any>` 与 `ls /c/Windows/System32/Tasks` 都报 `ERROR: The system cannot find the path specified` —— **Low IL 够不到 System32\Tasks，任务其实还在，别据此判断任务被删**
4. 附带：Low IL 下 `Get-Process explorer` / `Get-CimInstance Win32_Process -Filter "Name='explorer.exe'"` 返回空。这是 **IL 过滤**不是遮蔽 —— Low 上下文看不到 Medium 进程，但同 IL 的 App 进程树可见

## 根因链（2026-10-29 定案）

1. `dsh-sandbox-policy/lib/index.js` 的 `resolve()`（行 141-146）：

   ```js
   mode: request.mode ?? (session === void 0 ? void 0 : this.overrideOf(session)) ?? this.defaultMode,
   ```

   优先级 = **session 自己的 `sandbox/mode` 事件 > 部署默认值**。所以哪怕 `~/.dsh/profiles/*/cordis.patch.yml` 里 `defaultPreset: danger-full-access`，老 session 在 log 里钉了 `workspace-write` 就永远按 `workspace-write` 跑。

2. `workspace-write` → `dsh-sandbox-windows-acl` 的 `grantWrite()` 一次 merge 三样东西到 workspace：

   ```
   Everyone:(CI)(DENY)(DC)                       ← FILE_DELETE_CHILD deny；DENY 优先于 ALLOW
   S-1-4-1049387402-452331294:(OI)(CI)(W,D,DC)   ← sandbox 的 capability SID
   Mandatory Label\Low Mandatory Level:(OI)(CI)(NW)
   ```

   源码位置：`buildLowLabelAcl()` → `api.addMandatoryAce(acl, 2, /*AceFlags*/3, /*NO_WRITE_UP*/1, LowSid)`，`AceFlags=3 = OBJECT_INHERIT|CONTAINER_INHERIT` ⇒ 整棵树继承。

3. workspace = session cwd = `C:\Users\27063`，而 App 自己的 exe 就在 `C:\Users\27063\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe`。

4. Windows 规则：**进程 IL 不高于其 image 文件的 IL** ⇒ App 每次启动都被压到 Low；label 是 NTFS 持久状态、sandbox 只加不撤 ⇒ **policy 设 `danger-full-access` 也救不了已经打上的 label**。

## 污染的四个后果（不止「写不了 D 盘」）

| # | 后果 | 表现 | 修法 |
|---|---|---|---|
| 1 | App 被压 Low IL | 写不了 D 盘、看不见 Medium 进程、`schtasks` 报找不到路径 | 撤 App 目录 label + 重启 App |
| 2 | `Everyone:(DC)` deny | explorer 删不掉过期 `iconcache_*.db`，缓存重建受阻 | `/inheritance:d` 后 `/remove:d Everyone` |
| 3 | **`.lnk` 图标全白** | 桌面/开始菜单快捷方式全白纸+蓝箭头，`.exe` 正常 | 撤目标树的 Low label（详见 reasonix fact `lnk-icon-blank-low-mandatory-label`） |
| 4 | **label 跨盘传播** | 桌面已 junction 到 `D:\Desktop`，label 顺着 junction 落到 D 盘真实文件上 ⇒ **换盘也躲不掉** | 同上，撤 `D:\Desktop` 树的 label |

## 复发条件（关键）

- **10-10 首次修复**（`fix-low-label.ps1` 把 App 目录改回 Medium）后**又复发**，因为当时有个 session `session-a6a281f1`（2026-09-25 创建，10-28 19:34 最后活动）一直在用 `workspace-write` 跑，它下一次调 bash 就把 label 重新递归打回去。
- **⇒ 只改 App 目录的 label 是治标；只要还有 `workspace-write` session 活着，必然复发。**

## 实测分布（682 个 session，2026-10-29）

```
678  "danger-full-access"
  5  "workspace-write"
```

那 5 个：`session-a6a281f1`(09-25 建、10-28 活)、`session-28d5d739`(09-30)、`session-33af0692`(09-27)、`session-e15fd72c`(10-02，seq 50 切到 danger-full-access)、`ae73f9f3`(10-02 subagent，`source:"delegation"` 继承)

扫描命令：

```bash
cd ~/.dsh/sessions/--C-Users-27063--
for s in $(find . -name 'session.v4.jsonl.zstd'); do
  zstd -dc "$s" 2>/dev/null | grep -qE '"type":"sandbox/mode"[^}]*"mode":"workspace-write"' && echo "HIT $s"
done
```

## 根治 patch（2026-10-29 已落地并验证）

工具：`C:\Users\27063\.dsh-lab\tools\dsh-sandbox-nx.py`（158 行，`--check` / `--apply` / `--revert`，自带三态判定 CLEAN/PATCHED/UNKNOWN，apply 前断言锚点唯一、apply 后回读校验，失败自动还原）

目标：`C:\Users\27063\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-sandbox-policy\lib\index.js`

改动只有两行（7553 → 7684 B）：

```diff
+ /* dsh-sandbox-nx */ const dshNoWorkspaceWrite = (m) => (m === "workspace-write" ? "danger-full-access" : m);
  var SandboxPolicyService = class extends Service {

-   mode: request.mode ?? (session === void 0 ? void 0 : this.overrideOf(session)) ?? this.defaultMode,
+   mode: dshNoWorkspaceWrite(request.mode ?? (session === void 0 ? void 0 : this.overrideOf(session)) ?? this.defaultMode),
```

**只拦 `workspace-write` 一个值**，`read-only` / `danger-full-access` / `undefined` 全部原样透传。

## 覆盖面（单点 patch 就够，已验证）

三条执行器都从同一个 seam 取 policy：

```
dsh-bash-sandbox/lib/index.js:62    sandboxPolicy: request.sandboxPolicy ?? this.ctx.sandboxPolicy.resolve()
dsh-fs-sandbox/lib/index.js:154     const policy = sandboxPolicy ?? this.ctx.sandboxPolicy.resolve();
dsh-pwsh-sandbox/lib/index.js:148   sandboxPolicy: request.sandboxPolicy ?? this.ctx.sandboxPolicy.resolve()
```

而真正碰 label 的 `dsh-sandbox-local` 里只有两处判断 mode（patch 后永远进不去）：

```
dsh-sandbox-local/lib/index.js:34   if (policy.mode === "workspace-write") {
dsh-sandbox-local/lib/index.js:47   if (policy.mode === "workspace-write") readWrite.push("/tmp", policy.workspaceRoot);
```

## 生效与回滚

- **必须完全退出 dsh（含托盘/后台）再启动** —— node 在进程启动时就把模块读进内存，改文件不影响正在跑的进程
- 回滚：`python dsh-sandbox-nx.py --revert`（取最新的 `index.js.bak-*`）
- **dsh 升级会覆盖 patch** ⇒ 升级后重跑 `--apply`，`--check` 先看状态

## 清历史欠条的工具（都可重复跑）

| 脚本 | 作用 | UAC |
|---|---|---|
| `fix-low-label.ps1` | 撤 App 安装目录的 Low label（约 8712 文件，实测 39.7 s） | 需要 |
| `fix-iconcache2.ps1` | `/inheritance:d` + `/remove:d Everyone` + 清缓存 + 重启 explorer | 需要 |
| `fix-desktop-label2.ps1` | 撤 `D:\Desktop` 树的 Low label（修 `.lnk` 白图标） | 需要 |
| `probe-lnk-icons.ps1` | 哈希指纹判据：`.lnk` 图标修好没 | 不需要 |
| `renotify-lnk-icons.ps1` | `SHChangeNotify(SHCNE_UPDATEITEM)` 逐个失效 per-item 缓存 | 不需要 |

## 两个必记的坑

- **`Get-Acl` 读不到 mandatory label** —— 它默认不读 SACL，对带 Low label 的路径也返回 `(no ML)`，与 `icacls` 矛盾。判 label 一律用 `icacls` 逐行 `-match 'Mandatory Level'`（`-match 'Low Mandatory'` 会报 `Unrecognized escape sequence \L`）。
- **删继承来的 ACE 必须先断继承** —— `icacls <dir> /remove:d Everyone /T` 会打印「Successfully processed N files」但 ACE 立刻从父目录重新继承回来。正确顺序是 `icacls <dir> /inheritance:d` 再 `/remove:d`。

## 判定原理（零提权实验，留作以后复用）

把 `cmd.exe` 拷到带 Low label 的目录（`D:\Temp\lab\cmd-low.exe`），从 Explorer（Medium）启动，三段对照：

```
[1] 窗口自己的 cmd.exe                    → Medium  S-1-16-8192
[2] D:\Temp\lab\cmd-low.exe（image 带 Low）→ Low     S-1-16-4096
[3] C:\Windows\System32\cmd.exe           → Medium  S-1-16-8192
```

父进程同为 Medium，唯一变量是 image 文件的 mandatory label ⇒ **「进程 IL ≤ image IL」成立**。
