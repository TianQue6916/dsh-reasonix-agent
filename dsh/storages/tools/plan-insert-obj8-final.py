#!/usr/bin/env python3
# Byte-level insert of the objective-8 completion record into PLAN.md.
# No backslashes in this file on purpose (see memory: python-windows-backslash-heredoc-trap).
import hashlib, pathlib, sys

P = pathlib.Path.home() / ".dsh/PLAN.md"
raw = P.read_bytes()
lines = raw.split(b"\n")
a = next((i for i, l in enumerate(lines) if l.strip() == "## 进行中".encode()), None)
if a is None:
    sys.exit("anchor not found")
if b"sync-efforts-from-probe" in raw:
    sys.exit("entry already present")

BLOCK = """- [x] **★ objective ⑧ 完成（2026-10-04 23:0x；先前的「半完成」已解除）：死 model + reasoningEfforts 两侧都收掉**
      **① 死 model（复核 PASS）**：`python ~/.dsh/storages/tools/desktop-model-audit.py`
      ⇒ `web 61 / desktop 61 / not-in-allowlist 0 / duplicates 0 / 两侧集合相等`（与 web 完全一致）。
      **② reasoningEfforts（本轮真正收掉）**：原先 61 个共有 model 里 **47 个两侧不同**（只 14 个相同）。
      **根因：web 的档位建立在有缺陷的 probe 上** —— `probe-all-models.py` 只看
      `choices[0].message.reasoning_content`，而 `gpt-6-luna` / `gpt-5.6-*` / `google/gemini-*` /
      `xiaomi/mimo-*` / `deepseek/deepseek-v4-pro` 等**改用 `reasoning_details` 报思考** ⇒ 被系统性误判成
      「无 reasoning」⇒ **web 大面积错标 `false`**。两侧都不对，**实测是唯一依据**。
      **做法**：跑 `probe-reasoning-all.py`（两种字段都认；每 model 1 次请求；62 个约 3 分钟；
      结果落 `~/.dsh/tmp-probe/efforts-probe-20261004.json`），再用新工具
      `~/.dsh/storages/tools/sync-efforts-from-probe.py --probe <json> --apply` 重建**两侧**。
      **验收（全部可复现）**：
      `dsh --profile web --dump-config` ⇒ **exit=0 / stderr 0 B / rows=198**；
      `dump-desktop-config.ps1` ⇒ **exit=0 / stderr 0 B / 86821 B**；
      `efforts-diff.py` ⇒ **identical 58 / DIFFERENT 3**（从 47 降下来）；
      `desktop-model-audit.py` ⇒ **PASS**；
      **主力 `deepseek/deepseek-v4.1-flash` 从 4 档补到 6 档**（两侧合成配置均已确认）。
      **剩余 3 个差异是设计使然**：`meta/muse-spark-1.2` / `poolside/laguna-s-2.1-free` / `tencent/hy4-preview`
      在 probe 里返回 **503 `other`**（上游限速）⇒ 归入「未知」而**保持原样不猜**。
      **⚠️ 本轮我把两侧 patch 改坏两次，都靠备份回滚**（症状一律是 `dump-config` exit=1 / rows=0）：
      **坑一**：找 `        models:` 时命中了 **`commandcode-goat-anthropic` 的那个**（只有 6 行）而非
      `commandcode-goat` 的 61 个 —— 文件里有**两个同缩进的 `models:`**，必须先锚 6 空格的 provider key。
      **坑二**：block 结束边界若用「下一个 0 缩进的 `- id: `」会**多吞 421 行**
      （`- id: permission` 在 1128 行，而正确边界 `      commandcode-goat:` 在 707 行）；
      正确写法 = 「第一个非空且缩进 < 10 空格的行」。
      **坑三（判据）**：**不能用 pyyaml 当 gate** —— patch 合法使用 `!!js` 标签，stock loader 报
      `could not determine a constructor for the tag 'tag:yaml.org,2002:js'`，**那是误报**；
      唯一权威判据是 **`dsh --profile web --dump-config` 的 exit code**。
      **坑四**：某 block 若原本**没有 `reasoningEfforts` 行**，往 block 末尾 append 会破坏缩进
      （有的 block 以更深缩进的 `input:` 子项结尾）⇒ 必须**只做原地替换**，`(absent)` 一律跳过。
      四条已写进 memory `dsh-profile-models-block-parsing-traps-and-probe-choice-20261004`。
      **生效条件**：web 侧是 profile patch ⇒ live reload，**开新会话即生效**；
      desktop 侧需**重启 App**（当前实例是 22:33 启动的，需再重启一次才见新档位）。
"""
block = [l.encode("utf-8") for l in BLOCK.split("\n")]
out = lines[: a + 1] + block + lines[a + 1 :]
new = b"\n".join(out)
P.write_bytes(new)
print("before %d B -> after %d B / %d lines / sha256 %s" % (len(raw), len(new), len(out), hashlib.sha256(new).hexdigest()[:16]))
