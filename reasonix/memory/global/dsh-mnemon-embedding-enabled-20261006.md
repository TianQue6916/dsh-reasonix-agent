---
id: mem-544e671e062855f4ee5ada4cd13fe2c5
revision: 1
created_at: "2026-10-06T15:17:03.922Z"
updated_at: "2026-10-06T15:17:03.922Z"
name: dsh-mnemon-embedding-enabled-20261006
description: "dsh mnemon embedding 已开（desktop+web 两处 enabled: true）：开关位置、语义、两层状态、验证命令与 intent 限制"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 开关位置

- `~/.dsh/profiles/desktop/cordis.patch.yml:1326-1329`
- `~/.dsh/profiles/web/cordis.patch.yml:1365-1368`

两处内容一致，2026-10-06 由 `enabled: false` 改为 **`enabled: true`**：

```yaml
    embedding:
      enabled: true
      endpoint: http://localhost:11434
      model: nomic-embed-text
```

备份：同目录 `cordis.patch.yml.bak-20261006-pre-embedding-on`。

## 这个开关的确切语义（来自 dsh-mnemon/lib/client.js 的 i18n）

- `"config.embeddingDescription"`：「让 DSH Host 为每次 Mnemon CLI 调用注入嵌入 Endpoint 与模型；Endpoint 以 /v1 结尾时 Mnemon 自动使用 OpenAI 兼容协议（/v1/embeddings + Bearer 认证），否则使用 Ollama 协议」
- `"config.embeddingManagedHint"`：「开启后以这里保存的值覆盖 Mnemon 子进程环境；关闭后继续沿用 Host 环境与 Mnemon 默认值」
- ⇒ 它是 **DSH Host → mnemon 子进程的环境注入**，与 mnemon CLI 自身的 store 配置是两层。`http://localhost:11434` 不以 `/v1` 结尾 ⇒ 走 **Ollama 协议**。

## 两层状态（别混淆）

| 层 | 状态 |
|---|---|
| mnemon CLI / store | `mnemon embed --status` → `coverage: 100%` / `embedded: 383` / `total_insights: 384` / `embedding_available: true` / `ollama_available: true` / `protocol: ollama` |
| dsh plugin `dsh-mnemon` | 2026-10-06 之前 `false`，现已 `true`（desktop + web 两端） |

## 验证方式

- web：`dsh --profile web --dump-config` → 搜 `nomic-embed-text`，确认 `enabled: true`
- desktop：`~/.dsh/storages/tools/dump-desktop-config.ps1`（`dsh --profile desktop --dump-config` 被 `lib/bin.js:36` 硬拦）
- 端点：`curl --noproxy '*' -X POST http://127.0.0.1:11434/api/embed -H "Content-Type: application/json" -d '{"model":"nomic-embed-text","input":"hello world"}'` → 实测 `http=200 time=2.84s size=9577`

## 已知限制（别高估）

mnemon 的 automatic intent 只认**有限问句线索词**，中文**陈述式短语**查询落 `GENERAL`，语义路径基本不参与排序。**实用建议：用问句形式提问**。
