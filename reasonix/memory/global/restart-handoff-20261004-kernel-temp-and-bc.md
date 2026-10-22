---
id: mem-68f418b81baad4e0499ecc584321c61c
revision: 1
created_at: "2026-10-04T10:27:58.752Z"
updated_at: "2026-10-04T10:27:58.752Z"
name: restart-handoff-20261004-kernel-temp-and-bc
description: "重启交接：已批准三件事待执行、重启后第一件事与接管清单、本轮踩坑"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 状态：用户 m08031 要重启电脑，此文档供重启后接管
**用户逐字**：「可以,不过你先把这些目标存入,我要重启电脑,据另外一个会话诊断,d盘无法普通写入,内核故障」
⇒ ① 批准了我提的三件事；② **另一个 session 诊断 D 盘不可写 = 内核故障**（**推翻**我先前基于 ACL 的推断）；
③ 他马上就要重启，重启后是**新 session**。

## 已批准、待执行的三件事
1. **`--no-sandbox` 上生产**（Edge 154 跑 CDP 的唯一条件；逐 flag 矩阵已验）
2. **把用户级 `TEMP`/`TMP` 从 `D:\Temp` 改到 `C:\Users\27063\AppData\Local\Temp`**
3. **computer-use 推生产**

## 重启后第一件事：重测 `D:\Temp`
```
node -e "console.log(require('os').tmpdir())"
node -e "require('fs').mkdtempSync(require('path').join(require('os').tmpdir(),'p-'))"
```
可写 ⇒ 内核故障是临时状态，无需改环境变量；仍 `EPERM` ⇒ 执行第 2 件事（或排查 `D:` 卷）。

## 重启后的接管清单（按顺序）
1. 重测 `D:\Temp`（上面两条命令）。
2. **两侧（web + desktop）各一次重启**，使这些落盘的改动真正生效：
   - `tm-usage-first` plugin（在两侧 `cordis.patch.yml` 末尾有 `- insert:` row）
   - thinking-guard 关闭（`enabled: false` + `autoContinue: false`；web row 原 `:1271`、desktop row 原 `:1323`）
   - session-title `maxOutputTokens: 512`
   - 验收：`python ~/.dsh/storages/tools/compaction-audit.py --since <重启时刻> --assert-usage-first`
     ⇒ 期望 ratio ≈ **1.0**、触发点 ≈ **75–80%** 窗口（**现在实测是 ratio 9.26 / 15.1% ⇒ patch 未生效**）
3. **B4**：横向对比 `@wxg-prc-cpg/browser-skill-dsh-plugin`（★7385）与 `dsh-builtin-browser`（dl 12583），
   再出 go/no-go 结论 + 推生产方案（含回滚）。
4. 按 1/2/3 推生产（第 1 件是安全降级，推前再确认一次爆炸半径）。

## 重启前已确认完成的事（不要再重做）
- **B（computer-use）端到端跑通** —— 独立判据 `b3-out.txt` = `B3-PROBE-OK`（详见 memory `dsh-pilot-browser-lab-e2e-20261004`）
- **C（browser-use）端到端跑通** —— 独立判据 `c-server.log` 含 `GET /api/clicked?name=HELLO-PILOT`
- **本机总根因 `D:\Temp` 不可写**（详见 memory `windows-temp-d-temp-unwritable-root-cause-20261004`）
- PLAN.md 已从 46994 → **52415 B / 456 行**（sha256 `ac036598ea6b7090`），新条目在 head 30 行内，
  重启后 `plan-anchor.mjs` 会自动重注入 ⇒ **新 session 第一步就能看到这份交接**

## 仍未结案（长期 open）
- ①【主线】思考链恒中文（m00003 / m02206 / m02438 / m02462）
- ③ Linux gateway 补齐 reasoning-filter / finish-log 补丁（`ssh tianque` 超时、Tailscale `offline`，阻塞）
- ④ 双机四 agent 用量总视图（m01207 读法 A = {Windows, Linux} × {dsh, reasonix}；Windows 侧已完成）
- ⑤ overlay 价目 + dsh-context 面板待 App 重启
- ⑥ mnemon idleReview E2E（判据 `rows.mnemonSubagentTokenUsage.val.totals.outputTokens > 0`；实测 1639/1639 全 0 ⇒ 从未跑过）
- ⑦ 面板与磁盘 session 数差额（projcache 1644 / 真磁盘 1075 / 569 孤儿）
- ⑨ **待用户决策：是否按社区原味关掉原生 auto-compaction**（双重压缩；billion-context README `:196` + dsh issue #1772）
- ⑪ 清理 `/c/Users/27063/.dsh/profiles$VA/` 与 `profiles/desktop/_bak-pre-fullport-20260930-133243`
- ⑫ 清理 `~/.dsh/profiles/node_modules/@deepseek-ai/_tm-prepatch/`
- ⑯ asar 等长 patch 已备好但 `app.asar` 被 App 锁住（现由 `tm-usage-first` plugin 侧替代）

## 本轮踩过的坑（给未来的自己）
- **bash heredoc 里 python 字符串含 `C:\Users\...` 必炸** —— `\U` 被当 unicode 转义：`SyntaxError: (unicode error) 'unicodeescape' codec can't decode bytes … truncated \UXXXXXXXX escape`。连炸三次。修法：写独立 `.py` 文件，或**根本不在 python 字符串里写 Windows 路径**。
- **PLAN.md 是混合换行**（`\r\n` + 裸 `\n`）⇒ `str_replace_editor` 的 `old_str` 用 `\n` 拼会「did not appear verbatim」。
  可靠办法 = **按 1-based 行号 + `raw.split(b'\n')` 字节级插入**，并断言 `lines[10]` 以 `## ` 开头、`lines[11]` 是空行。
- 脚本 `~/.dsh/storages/tools/plan-insert-bc.py` 即用此法（可复用改内容）。备份 `PLAN.md.bak-20261004-pre-bc-entry` / `-pre-bc-entry2`。
