---
id: mem-3df93bd0b543a7f9adb56a60f7cf126a
revision: 1
created_at: "2026-11-19T11:24:25.665Z"
updated_at: "2026-11-19T11:24:25.665Z"
name: zoro-接-goat-api-2026-11-19
description: "Zoro（文献翻译 app）已切到 goat：走本机 goat-gateway 8788，含 babeldoc 断链与 no_proxy 毒的两个坑及修法"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 结论（2026-11-19 落地并实测）
Zoro（GitHub `ruihanglix/zoro`，Tauri 版 v0.1.0，二进制 `/usr/bin/zoro*`，配置 `~/.zoro/config.toml`）的 AI 已从 DeepSeek 官方 API 切到 Command Code GOAT，**走本机网关**而非直连。

### 配置落点
- `[ai]`：`provider = "Command Code GOAT"`、`base_url = "http://127.0.0.1:8788/v1"`、`api_key = "goat-gateway"`（网关不校验客户端 key，真实 key 在 `/home/tianque/goat-gateway/keys.json` 池里）、`model = "deepseek/deepseek-v4.1-flash"`
- `[[ai.providers]] id="__main__"`：同 base/key，models 列 `deepseek/deepseek-v4.1-flash` / `deepseek/deepseek-v4-pro` / `deepseek/deepseek-v4-flash-fast`
- `[ai.task_model_defaults]` 四项全 `deepseek/deepseek-v4.1-flash`
- `[ai] html_concurrency` 8→4、`[ai.pdf_translation] qps` 4→2（单 key 池，防 429 冷却 60s 拖死整批）
- `[ai.pdf_translation] babeldoc_command` → `/home/tianque/.local/bin/babeldoc-goat`
- 备份：`~/.zoro/config.toml.bak-20261119-191526-pre-goat`

### 源码依据（v0.1.0 tag）
- `crates/zoro-ai/src/client.rs:81` 拼 `format!("{}/chat/completions", base_url)` → **base_url 必须已含 `/v1`**
- `ChatRequest.max_tokens` 带 `#[serde(skip_serializing_if = "Option::is_none")]` → 翻译路径不会发 `max_tokens: null`（实测 goat 对 null 返回 400 `expected number, received null`）
- v0.1.0 的 `AiProvider` 只有 id/name/base_url/api_key/models，**没有 format/headers**（main 分支才加）；翻译与 PDF 只用 `[ai]` 三字段
- babeldoc 由 Zoro 以 `--openai-base-url <[ai].base_url> --openai-api-key --openai-model` 子进程调用（`apps/desktop/src-tauri/src/commands/translation.rs`）

### 模型选择实测（同一句学术英译中）
- `deepseek/deepseek-v4-flash`：reasoning 开，195/200 token 烧在思考，译文被截断
- `deepseek/deepseek-v4-flash-fast`：零 reasoning，13 token 出结果（省钱档）
- `deepseek/deepseek-v4.1-flash` / `v4-pro`：不返回 `reasoning_content` 但思考 token 计入（58/74）
- 用户拍板用普通 `v4.1-flash`，不要 fast

### 两个既有故障（与 goat 无关，已修）
1. **babeldoc 解释器断链**：系统 python 升到 3.14 后，`~/.local/share/uv/tools/babeldoc/bin/python -> /usr/bin/python3.12` 成了 broken link，PDF 翻译本来就跑不起来。修法：`uv python install 3.12`（装到 `~/.local/share/uv/python/cpython-3.12.16-linux-x86_64-gnu`），把 `bin/{python,python3,python3.12}` 指向它（同 3.12 小版本 ABI 兼容，无需重装依赖）。`babeldoc --version` → 0.6.4 恢复。
2. **no_proxy 毒（dev-sidecar 注入）**：桌面会话的 `no_proxy` 含未加方括号的 IPv6 字面量（如 `[2049:8c54:813:10c::140]`），httpx 把每段当 URLPattern 解析，抛 `httpx.InvalidURL: Invalid port: '8c54:813:10c::140]'`，babeldoc 建 client 即崩。修法：`~/.local/bin/babeldoc-goat` 垫片，`env -u no_proxy -u NO_PROXY -u http_proxy ... -u ALL_PROXY` 后 exec 真 babeldoc（顺带保证对 127.0.0.1:8788 直连，不被 6916 的 dev-sidecar 拦）。

### 验证证据
- 直连 `https://api.commandcode.ai/provider/v1/chat/completions`：`.env` 的 `COMMANDCODE_API_KEY` 与 `163-goat.txt` 的 key 均 **401 expired**；`keys.json` 里 `qq` 有效（200），`163` 已 disable（2026-11-19 状态）
- 网关 `/v1/chat/completions` 无 Authorization 也 200；`/v1/messages`（Anthropic 端点）对 deepseek 系模型 400 `not supported on this endpoint`
- 端到端 PDF：`babeldoc-goat` 翻 2 页英文 tex PDF → `t.no_watermark.zh.mono.pdf`，47.6s，4 段全成功，4251 tokens，pdftotext 抽出的中文正常（"该证明依赖于实数的完备性…秩-零化度定理"）
- Zoro 同形请求（无 max_tokens、temperature 0.3、inline-bilingual system prompt）→ 200，输出合规
- 测试产物留在 `~/.dsh/.learn/run/zoro-e2e/`

### 遗留
- 只有 1 个有效 GOAT key（qq），Zoro 与 dsh 共用同一账号配额（$20/5h、$50/7d、$100/月）
- gateway loopGuard 只在 `stream:true` 时生效，Zoro 翻译走非流式 → 不受 abort 影响；Zoro 的 chat 对话是流式，会被检测
- pdf2zh（pipx 装）同样因 python 3.12→3.14 断链，未修
- Windows 那台没有 `~/.zoro`，无需改
