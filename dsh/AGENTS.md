# 本机约定（~/.dsh/AGENTS.md）

## subagent 的 preset 选择（2026-11-15）

`tool-subagent` 现在暴露 `agent_preset` 参数，枚举两个值。**按任务性质选，不要一律用默认。**

| 任务性质 | `agent_preset` | 理由 |
|---|---|---|
| 工程 / 工具链 / 代码改动 / 排查 | 省略（默认 `anchored-standard`） | 首轮 2 工具锚定，晋升后渐进解锁；适合执行型任务 |
| 学习 / 数学推导 / 讲解概念 / 审阅证明 | `learn` | 「先攻后守」人设（先闭卷自推再给原证）、禁甩未学概念、工具齐全可直接跑代码验证反例 |

不传时默认 `anchored-standard`。传 `learn` 的 subagent 也会继承同样的 provider / model / reasoningEffort。

## 生效边界

改 `profiles/desktop/cordis.patch.yml` 的 row **需要重启 dsh** 才生效（不是"开新会话"，是重启进程）。
改 `.agent-presets/**/*.mjs` 需要新会话。两者不同，别混。

## 验证 subagent 是否被收窄

```bash
python - <<'PY'
import zstandard as zstd, io, json, glob, os
f=max(glob.glob(os.path.expanduser('~/.dsh/sessions/*/*/session.v4.jsonl.zstd')), key=os.path.getmtime)
with zstd.ZstdDecompressor().stream_reader(io.BytesIO(open(f,'rb').read())) as r: raw=r.read()
for l in raw.decode('utf-8','replace').splitlines():
    o=json.loads(l)
    if o.get('type')=='request/header': print('tools =', len(o['data']['header']['tools']))
PY
```

首轮应看到 `tools = 2`（主会话）或 `tools = 2`（anchored subagent）。看到 101 就是没生效。

## 下载 / 拉取通道（2026-11-15 实测，先查这张表再动手）

**别先试直连。** 本机出口 = 随身 WiFi（不能换），国内 1.3~1.6 MB/s 正常，国际链路**分钟级剧烈波动**。

| 场景 | 走什么 |
|---|---|
| **GitHub 文件 / clone** | `https://ghfast.top/https://github.com/<path>`（`git config --global url.…insteadOf` 已配；**私有仓库 clone 前先 unset**） |
| PyPI | `https://mirrors.aliyun.com/pypi/web/simple/` |
| HuggingFace | `HF_ENDPOINT=https://hf-mirror.com` |
| npm（Linux 侧） | `npm config set registry https://registry.npmmirror.com` |
| GitHub 单文件 | `https://cdn.jsdelivr.net/gh/<user>/<repo>@<branch>/<path>`（官方 CDN） |

### ⚠️ 测速陷阱（踩过，浪费一小时）

`curl -w %{speed_download}` 对 **302 重定向的文件**（如 aliyun 的 `ubuntu-*.iso`）和 **小文件**
（HTML 首页 / `SHA256SUMS` 几百字节）会**假报 ~1 KB/s**，看着像"运营商限速"。
**必须**用确定有实体的大文件，下 12~15 秒后算 `size_download / time_total`：

```bash
curl -s -L -o /dev/null --max-time 15 -w "%{http_code} %{size_download} %{speed_download}\n" \
  "https://mirrors.aliyun.com/pypi/web/simple/"    # 21 MB / 15s ≈ 1.34 MB/s 才是真值
```

### ⚠️ hosts 优选别抱期待

ghprobe（Windows）/ ghauto（Linux）确实能挑出手工枚举不到的活 IP（如 `20.175.192.147`），
但**有效期是分钟级**。A/B 实测：有 hosts 2/3 成功、删掉 hosts 2/5 成功 →
**收益（±5 KB/s）远小于链路波动（0 ↔ 30 KB/s）**。GitHub 网页晚上不稳是物理事实，不要反复调 IP。

### 已证无效的方案（别再试）

ClientHello 分片（GoodbyeDPI/zapret 原理）、Cloudflare WARP 端点、workers.dev、
Cloudflare 66 个 IP 抽样（0/66 能握手）—— 在本线路全部失败。

> 详细版（含 dev-sidecar 2.3.5 ECH 能力边界、各通道实测数字）见 reasonix fact
> `国内下载通道与本机代理配置-2026-11`。

## skill 停用必须移出目录，改名无效（2026-11-15 实测）

给 skill 目录改名（如 `study-coach` → `_study-coach.retired-v45`）**不能停用它**：
skill-search 按 SKILL.md frontmatter 的 `name:` 字段索引，**不看目录名**。
旧目录仍留在 `~/.dsh/skills/` 下，就仍会被 `skill_load` 命中，它的铁律会被注入上下文，
而且**优先级高于 preset 的 persona**（persona 说「不要出题」，skill 说「先攻后守，先不给答案」，模型跟 skill 走）。

证据（headless reasoning 原文）：
> 有 skill `study-coach` … 这符合，应该 load skill。
> 按 study-coach 铁律 1：先攻后守。这是概念问题，我先不给完整答案，要他自己想。

正确停用法：把整个目录移出 `~/.dsh/skills/`，例如 `mv ~/.dsh/skills/X ~/.dsh/.retired/`。
校验：`grep -rl '<旧铁律关键词>' ~/.dsh/skills/ | head` 必须为空。
