#!/usr/bin/env python3
"""Byte-level 1-based-line insert into PLAN.md (mixed CRLF/LF => str_replace_editor
cannot match verbatim). Inserts the compaction-probe finding right after '## 进行中'."""
import pathlib, sys, hashlib

P = pathlib.Path.home() / ".dsh/PLAN.md"
raw = P.read_bytes()
lines = raw.split(b"\n")
print(f"before: {len(raw)} B / {len(lines)} lines / sha256 {hashlib.sha256(raw).hexdigest()[:16]}")

# locate the anchor line: the '## 进行中' heading
anchor = next((i for i, l in enumerate(lines) if l.strip() == b"## \xe8\xbf\x9b\xe8\xa1\x8c\xe4\xb8\xad"), None)
if anchor is None:
    sys.exit("anchor '## 进行中' not found")
print(f"anchor at line {anchor+1}: {lines[anchor]!r}")
print(f"next line {anchor+2}: {lines[anchor+1]!r}")
print(f"next line {anchor+3}: {lines[anchor+2][:60]!r}")
if b"compaction" in raw and b"compaction-audit2" in raw:
    sys.exit("entry already present - aborting to avoid duplicate")

BLOCK = '''- [~] **\u2605 2026-10-04 19:2x compaction\u300c\u8fc7\u65e9\u89e6\u53d1\u300d\u6df1\u6316 \u2014 \u7ed3\u8bba\uff1a\u9608\u503c\u5224\u636e\u5df2\u786e\u8bc1\uff1b\u8d26\u672c\u503c\u4e0d\u53ef\u4ece disk \u53d6\u5f97\uff0c\u63a2\u9488\u5f85\u4e0b\u6b21\u91cd\u542f**
      \u590d\u73b0\uff1a`python ~/.dsh/storages/tools/compaction-audit2.py --session a0d5fbf8`
      \u2460 \u9608\u503c = `floor(min(W\u00d7thresholdRatio, (W\u2212reserved)\u2212headroom))`\uff1bdsh \u9ed8\u8ba4 `thresholdRatio 0.8` /
         `headroomTokens 65536` / `reserved`\u224865536 \u21d2 **W=1e6 \u65f6 800,000**
         \uff08`@deepseek-ai/dsh-compaction-basic/lib/index.js:15,124\u2013142,940\u2013941`\uff09\u3002
      \u2461 \u8be5\u5468\u671f\u5185**\u4e3b prompt \u5cf0\u503c\u4ec5 167,765**\uff08=16.8% window\uff0cseq 28144\uff09
         \u21d2 \u82e5\u9608\u503c 800K \u6210\u7acb\uff0c\u538b\u7f29\u53d1\u751f\u5728 ~21% \u5c31\u53d1\u751f\uff0c**\u786e\u5b9e\u8fc7\u65e9**\u3002
      \u2462 **\u88ab\u538b\u6389\u6bb5\u7684\u771f\u5b9e\u5927\u5c0f = 951,425**\uff08`compaction/summary.data.usage`\uff1ainput 951,297 +
         cacheRead 128 + output 5,505\uff1bcacheRead\u22480 \u21d2 summarizer \u6bcf\u6b21\u6784\u9020**\u5168\u65b0 prompt**\uff0c\u5403\u7684\u662f\u88ab\u538b\u6bb5\u539f\u6587\uff09\u3002
         \u5b83\u4e0e \u2461 \u76f8\u5dee 5.7\u00d7 \u2014\u2014 **\u8fd9\u5c31\u662f\u672c bug \u7684\u6838\u5fc3\u77db\u76fe**\u3002
      \u2463 `shadowedTokenCount`(695,718) \u662f**\u88ab\u538b\u8282\u70b9\u7684 char/4 \u4f30\u7b97**\uff0c**\u4e0d\u662f\u89e6\u53d1\u8d26\u672c**\uff1b
         \u5b83\u5bf9 CJK \u4f4e\u4f30 27%\uff08ratio 0.73\uff09\u21d2 \u4f30\u4ef7\u51fd\u6570\u672c\u8eab\u6b63\u5e38\u3002
      \u2464 **`measure().totalTokens`\uff08\u771f\u6b63\u89e6\u53d1\u503c\uff09\u4ece\u4e0d\u5199\u8fdb event log** \u21d2 \u53ea\u80fd\u9760\u8fd0\u884c\u671f\u63a2\u9488\u53d6\u5f97
         \u21d2 **\u672c\u6b21\u6df1\u6316\u5230\u6b64\u4e3a\u6b62\uff0c\u5f85\u63a2\u9488**\u3002
      **\u5df2\u7ea0\u6b63\u7684\u4e24\u5904\u81ea\u8eab\u8bef\u5224\uff08\u52ff\u91cd\u8e0f\uff09**\uff1a
      - v1 `compaction-audit.py` \u7684 `realBefore` \u62d3\u7684\u662f\u300c\u65e5\u5fd7\u91cc\u66f4\u65e9\u7684\u67d0\u6761 assistant/message\u300d\uff08\u672c\u6b21 seq 28431\uff09\uff0c
        **\u4e0d\u662f\u89e6\u53d1\u524d\u7684 prompt**\uff08`compaction/start` \u524d\u53ea\u6709 `assistant/attempt`\uff0c\u65e0 `assistant/message`\uff09
        \u21d2 \u5176 `%window` \u5217**\u4e0d\u53ef\u7528**\u3002\u5df2\u51fa v2\uff1a`~/.dsh/storages/tools/compaction-audit2.py`\u3002
      - `~/.dsh/profiles/node_modules/@deepseek-ai/dsh-token-meter` \u662f**\u6307\u5411\u5168\u5c40 npm \u5305\u7684 Junction**
        \uff08\u76ee\u6807\u5728 `%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\...`\uff09\u21d2 web/headless/desktop \u4e09\u7aef**\u5171\u7528\u4e00\u4efd**\uff0c
        `[patch:usage-first-baseline]` \u8865\u4e01**\u4f4d\u7f6e\u6b63\u786e\u4e14\u5728\u751f\u6548**\uff08\u6b64\u524d\u300c\u6253\u9519\u4f4d\u7f6e\u300d\u7684\u6000\u7591\u5df2\u88ab\u63a8\u7ffb\uff09\u3002
      **\u4ecd\u5f85\u67e5**\uff1a`tm-usage-first` plugin **\u672a apply**\uff08\u5176 `log('installed \u2026')` \u5728 `host-stdio.log` \u96f6\u547d\u4e2d\uff1b
      config entry \u5b58\u5728\uff0c`--dump-config` \u89c1 `- id: tm-usage-first / name: file:///\u2026/plugins/tm-usage-first.mjs`\uff09
      \u21d2 \u7591 `inject:['tokenMeter']` \u672a\u6ee1\u8db3\uff1b\u4e0b\u6b21\u91cd\u542f\u65f6\u4e00\u5e76\u5b9a\u6848\u3002
'''

block_lines = [l.encode("utf-8") for l in BLOCK.split("\n")]
if block_lines and block_lines[-1] == b"":
    block_lines = block_lines[:-1]

out = lines[: anchor + 1] + block_lines + lines[anchor + 1 :]
new = b"\n".join(out)
P.write_bytes(new)
print(f"after:  {len(new)} B / {len(out)} lines / sha256 {hashlib.sha256(new).hexdigest()[:16]}")
print(f"inserted {len(block_lines)} lines after line {anchor+1}")
