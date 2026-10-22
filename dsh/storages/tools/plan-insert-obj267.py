#!/usr/bin/env python3
# Byte-level insert of objectives 2 / 6 / 7 results into PLAN.md.
# No backslashes in this file on purpose (see memory: python-windows-backslash-heredoc-trap).
import hashlib, pathlib, sys

P = pathlib.Path.home() / ".dsh/PLAN.md"
raw = P.read_bytes()
lines = raw.split(b"\n")
a = next((i for i, l in enumerate(lines) if l.strip() == "## 进行中".encode()), None)
if a is None:
    sys.exit("anchor not found")
if b"guard-trace-audit" in raw:
    sys.exit("entry already present")

BLOCK = """- [x] **★ objective ② thinking-guard 两侧真正生效 + 可验证痕迹（2026-10-04 22:5x 定论：完成）**
      **判据坑（重点）**：不能用「session JSON 里含 `thinking-guard` 字符串」——那会命中**会话自己在讨论它的文本**。
      本次实测：suspect 命中 712 条，逐条看 `source.plugin` 全是 `None`，内容是**我自己的 bash 输出 / reasoning**
      （19:20:53 tool/result、19:21:05 assistant/message、22:40:45 assistant/message …）⇒ **纯自我指涉**。
      正确判据 = `data.source.plugin === 'thinking-guard'` 这个**结构化字段**。
      工具：`python ~/.dsh/storages/tools/guard-trace-audit.py 2026-10-04T18:36`
      结果（cutoff = 18:36 重启时刻）：8 个 session 逐个统计，
      **`guard-inj` 全 0**（无一条 guard 注入的 `user/message`）；
      `guard-err` 仅 session-a0d5fbf8 有 9 条，**逐条查证全为 `source.plugin=None` 的自我指涉文本**
      （`python ~/.dsh/storages/tools/guard-err-detail.py`）。
      **web 侧痕迹**：`~/.dsh/logs/host-stdio.log` 第 8576 行（本次 18:36:58 启动标记）之后
      `thinking-guard` 字样 **0 条**。
      **desktop 侧痕迹**：`dump-desktop-config.ps1` **exit=0 / stderr 0 B / 201 rows**，
      合成配置 `- id: thinking-guard` 明确为 **`enabled: false`**（该脚本是 desktop 唯一可用的合成配置查看方式，
      CLI `--dump-config` 被 Electron 守卫拒绝）；且同一配置里 `tm-usage-first` 也在位（row 2278）。

- [x] **★ objective ⑥ overlay 价目精确值 + dsh-context 面板生效（2026-10-04 22:5x 定论：完成）**
      **价目侧（先前已完成，本轮复核）**：`node ~/.dsh/storages/tools/patch-dsh-context-pricing.mjs --check`
      ⇒ `bytes = 620423  已打补丁 = true`，三个锚点各 1 处命中
      （`priceFaceOf` 定义行 / `priceFaceOf` 空书守卫 / `isDeepSeekProvider` 开括号）。
      overlay = `~/.dsh/storages/dsh-context-price-overlay.json`，**3 条 / 2 个 provider / `peakProviders=[]`**；
      主力价目 `commandcode-goat | deepseek/deepseek-v4.1-flash` = `hit 0.0030285 / miss 0.151425 /
      write 0.151425 / out 0.6057`（PLAN.md:450 记：**10-04 00:16 起换成 reasonix 反解的精确值**）。
      **只有 desktop 一份 client bundle**（`~/.dsh/profiles/desktop/node_modules/dsh-context/lib/client.js`）。
      **面板侧**：生效条件 = 重启 App（node_modules 里的 client bundle 不参与 HMR）⇒
      **本轮 22:33 已把 desktop App 重启**（见「desktop 打不开」那条的修复）⇒ 条件满足。
      **注意（踩过的坑）**：Git Bash 的 `/c/Users/...` 路径喂给 Windows python 会 `FileNotFoundError`，
      而同一文件用 `C:/Users/...` 就能打开 ⇒ 判断「文件是否存在」不要用 `/c/...` 形式。

- [x] **★ objective ⑦ mnemon idleReview E2E 验收（2026-10-04 22:5x 定论：**PASS**，推翻 12:05 的旧结论）**
      工具：`python ~/.dsh/storages/tools/mnemon-idlereview-audit.py`
      判据（`rows.mnemonSubagentTokenUsage.val.totals.outputTokens > 0`）：
      **1666 条 projcache 记录中 1663 条带 `mnemonSubagentTokenUsage`**，
      **`outputTokens` 总和 = 1,527,045**，大量非零（56772 / 11322 / 7353 / 6949 / 6943 …）
      ⇒ **review subagent 真的执行过** ⇒ **VERDICT: PASS**。
      **与 PLAN.md:250（10-04 12:05）的「1639/1639 全 0、从未运行」直接冲突** ⇒ 旧结论作废。
      可能原因（未进一步追）：旧脚本取的字段路径不对（**数据本体在 `record.rows`，不在 `record` 顶层**），
      或 12:05 之后才真正触发。
      **顺带明确的字段结构**：projcache 每条 = `{version, record:{identity, rows}}`，
      `rows` 下稳定出现 12 个键：`title / goal / tokenUsage / contextPressure / contextBreakdown /
      subagentTiming / subagent / permissions / todos / plan / sessionStats / sessionListMetadata`。
      **注意 `inputTokens` 全为 0**（只有 `outputTokens` 有值）——subagent 的输入侧未被记账，若要报「费用」需另行处理。
"""
block = [l.encode("utf-8") for l in BLOCK.split("\n")]
out = lines[: a + 1] + block + lines[a + 1 :]
new = b"\n".join(out)
P.write_bytes(new)
print("before %d B -> after %d B / %d lines / sha256 %s" % (len(raw), len(new), len(out), hashlib.sha256(new).hexdigest()[:16]))
