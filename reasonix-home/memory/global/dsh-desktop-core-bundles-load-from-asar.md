---
id: mem-4cae5d05bb1c1994ce49287d1bf331b1
revision: 1
created_at: "2026-10-07T11:46:57.889Z"
updated_at: "2026-10-07T11:46:57.889Z"
name: dsh-desktop-core-bundles-load-from-asar
description: "desktop App 的 renderer 从 app.asar 内加载 core client bundle（不是 node_modules）；修复要用 asar-core-guard.mjs 重建 asar"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 结论（2026-10-07 实测，纠正旧判断）
**桌面版 DeepSeek Harness（Electron 44 / 0.2.0-rc.2）的 renderer 加载的是 `app.asar` 内的 core client bundle，不是 `%APPDATA%\npm\...` 里那份。**
⇒ 打 `~/.dsh/profiles/node_modules/@deepseek-ai/*/lib/client.js`（→ symlink → 全局 npm 树）上的 patch **对 desktop App 完全无效**，只对 `dsh web` 的 3080/19387 实例可能有效。

## 判据（活体，可复现）
1. 取 host token（**别用 `sort -u`，字典序拿不到最新**）：
   `awk '/\[tee\] installed/{n=NR}{a[NR]=$0}END{for(i=n;i<=NR;i++)print a[i]}' ~/.dsh/logs/host-stdio.log | grep -a -o -E 'token=[A-Za-z0-9_-]{16,}' | tail -1`
2. 换 cookie：`curl -c jar -b jar "http://127.0.0.1:19387/?token=$TOK"` → 303 + `dsh-auth-*` cookie
3. 取首页 grep 出各包的 `rev`：`<script src="plugins/??@deepseek-ai/dsh-client-ui-chat/client.js&rev=572d90f59a46">`
4. 取 bundle（**`--path-as-is` + `--globoff` 必需**，rev 不对就 404）：
   `curl --path-as-is --globoff -b jar "http://127.0.0.1:19387/plugins/??@deepseek-ai/dsh-client-ui-chat/client.js&rev=572d90f59a46"`
   → **200 / 565106 B / `source.kind`=7 guarded=1** == asar 内那份（565053 B）；磁盘那份是 565462 B / raw=0 / guarded=8。

## rev 算法
`dsh-client-modules/lib/index.js`：`artifactRevision(baseline) = framedHash("plugin-artifact", [String(mtimeMs), String(ctimeMs), String(size)])`，baseline 由 `statSync(clientPath)` 得来。`comboSearch(ids, rev) = "??" + ids.map(id=>id+"/client.js").join(",") + "&rev=" + rev`。

## 工具（~/.dsh/storages/tools/）
- `asar-core-guard.mjs` — `--check [<asar>]` / `--build <out.asar> [<src.asar>]` / `--install [<asar>]`。把 4 个 core bundle 的 `source.kind` → `source?.kind`，**append 式重建**（新内容追加到 data 区末尾、只改各自 offset/size；offset 相对 data 区 ⇒ 其他 12963 个节点不动）。默认目标 `C:/Users/27063/AppData/Local/Programs/DeepSeek Harness/resources/app.asar`（121348951 B → 123195923 B）。
- `install-asar-guard.ps1` — 等 App 退出 → rename 成 `app.asar.bak-<stamp>` → copy 新 asar → sha256 + `--check` 探针 → 用 Start Menu 快捷方式重开 App（**必须带 `--no-sandbox`**）；任一步失败回滚并照样重开。`-SkipWait -NoRelaunch` 可干跑。
- 辅助：`~/.dsh-lab/tmp/{extract-entry.mjs, rd.mjs, whoowns.mjs, probe-asar.cjs, verify-repack.mjs}`。**`~/.dsh/storages/tools/asar-read-entry.mjs` 不可靠**（不传 needle 时只输出 3 行 header，别拿它算 sha256）。

## 回滚
`Stop-Process -Name 'DeepSeek Harness' -Force` 后 `Move-Item -Force "<install>\resources\app.asar.bak-<stamp>" "<install>\resources\app.asar"`。

## 相关事实
- 触发症状：会话页「对话」tab 全黑 = `slot entry crashed in 'conversation.view': TypeError: Cannot read properties of null (reading 'kind')`（crash log 在 `%APPDATA%/@deepseek-ai/dsh-desktop/logs/crash-*-renderer.log`）。
- asar 布局：`[u32=4][u32=headerSize=3392056][u32=jsonLen+4][u32=jsonLen][JSON+pad4][data]`，`dataStart = 8 + headerSize`。
- `app.asar.unpacked/` 只解包原生依赖，**没有 client 包** ⇒ unpacked 优先机制救不了这类 patch。
- `app.asar` 被 App 进程锁住（`Open ReadWrite None` → "being used by another process"）⇒ 必须 App 关闭时替换。
