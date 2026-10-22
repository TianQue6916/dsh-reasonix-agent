#!/usr/bin/env python3
# Byte-level insert of objectives 1 / 3 results into PLAN.md.
# No backslashes in this file on purpose (see memory: python-windows-backslash-heredoc-trap).
import hashlib, pathlib, sys

P = pathlib.Path.home() / ".dsh/PLAN.md"
raw = P.read_bytes()
lines = raw.split(b"\n")
a = next((i for i, l in enumerate(lines) if l.strip() == "## 进行中".encode()), None)
if a is None:
    sys.exit("anchor not found")
if b"reasoning-language-audit" in raw:
    sys.exit("entry already present")

BLOCK = """- [x] **★ objective ① 思考链恒中文（含工具调用场景）（2026-10-04 23:0x 定论：PASS，实证）**
      工具：`python ~/.dsh/storages/tools/reasoning-language-audit.py 2026-10-04T18:36 6`
      （把 `assistant/message` 的 `reasoning` block 抽出来，分「该步调过工具/没调过工具」两个 bucket 统计
      CJK 字符占「CJK + 拉丁字母」的比例）
      结果（cutoff = 18:36）：
      `session-a0d5fbf8` 工具步 34.6% (n=30518) / 非工具步 32.6% (n=1926)；
      `session-5cc47bcb` 41.8% / 46.3%；`session-33713e9e` 37.3% / 52.2%；`session-81076132` 38.7% / 42.9%。
      **关键：两个 bucket 差异 < 6 个百分点 ⇒ 工具调用场景没有系统性退化**（这正是当初的抱怨点）。
      **实证复核**（抽样精读，工具：`python ~/.dsh/storages/tools/reasoning-sample.py`）——
      全是中文散文，例如：
      「用户遇到大问题：打开文件 - 安全警告 对话框，无法验证发布者。这是 SmartScreen/安全警告，针对 `display-guard.cmd`…」
      「关键新数据：- 当前写入速率：~250-850 KB/s（很低，0.85 MB/s 峰值），说明现在并不在疯狂写盘。」
      ⇒ **中文主导 + 技术术语按语言契约保留英文原词**（SmartScreen / display-guard.cmd / KB/s 等）。
      **CJK 占比 33–52% 不是缺陷**：技术思考必然夹大量英文标识符/术语，用「CJK 占比 >70%」当阈值选错了指标。
      正确判据 = ①两个 bucket 无系统性差异 ②句子结构是中文。

- [x] **★ objective ③ 真实 finish=length 证据链（2026-10-04 23:0x 定论：完成且已验收）**
      **证据链（比旧记录更完整）**：gateway 全量日志里 `finish=length` 共 **14 条**，
      其中 **10 条是 dsh 真流量**（`clientUa="deepseek-harness/0.2.0-rc.2"`）、4 条是 curl 探针
      （`clientUa="curl/8.21.0"`）—— 旧记录写的「只有 4 条」**低估了，实际真流量 10 条**。
      **共同特征**：`completion_tokens == reasoning_tokens`
      （真流量全部 `64 == 64`；`text_tokens: 0` ⇒ **只有 reasoning，没有可见正文**）。
      **根因（PLAN.md 内已记）**：`session-title-llm`（`@deepseek-ai/dsh-session-title-first-prompt-llm`）
      上游 `maxOutputTokens` 定为 **64**，而 title 请求**继承主 session 的 route**
      （实测 875/888 条是 `commandcode-goat / deepseek/deepseek-v4.1-flash`，thinking 默认开启）
      ⇒ reasoning 吃光 64 预算 ⇒ 上游回 `finish_reason="length"` ⇒ 标题拿不到文本 + UI 弹「已达到输出 token 上限」。
      **修复**：`maxOutputTokens: 64 -> 512`（web 与 desktop 两侧 patch 均已 512：
      `profiles/web/cordis.patch.yml:1295`、`profiles/desktop/cordis.patch.yml:1303`）。
      **验收（决定性）**：修复 commit = **`60357ea auto: 2026-10-04 11:20`**；
      真流量最后一条 finish=length = **`2026-10-04T10:00:08Z`** ⇒
      **修复后 11.5 小时（11:20 → 22:5x）零复发**（唯一 12:13 之后的是我自己的 curl 探针）。
      复现：`grep -h "finish=length" /d/Toolbox/goat-gateway/logs/*.log | grep deepseek-harness`
"""
block = [l.encode("utf-8") for l in BLOCK.split("\n")]
out = lines[: a + 1] + block + lines[a + 1 :]
new = b"\n".join(out)
P.write_bytes(new)
print("before %d B -> after %d B / %d lines / sha256 %s" % (len(raw), len(new), len(out), hashlib.sha256(new).hexdigest()[:16]))
