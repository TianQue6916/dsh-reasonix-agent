---
id: mem-2559e721925ac89159641e95964973a1
revision: 1
created_at: "2026-09-27T17:29:41.720Z"
updated_at: "2026-09-27T17:29:41.720Z"
name: backup-pipeline-two-fixes-privkey-and-mnemon-db-20260928
description: "备份链路两处修复：（1）\"元 bug\"复发——我写的警示性 fact 自己含 PRIVATE KEY 字面量致 5 文件被中止；（2）架构错误——mnemon 的 SQLite 库是派生数据且含密钥、二进制无法脱敏，已从备份 target 与 repo 中移除。含\"只备份 source of truth、不备份派生数据\"的边界原则与摘 print 配置时的打码纪律"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 一、🔴 元 bug 复发：警示性文档自己写了字面量

`backup-to-github.ps1 -DryRun` 报 **5 个文件含 `-----BEGIN PRIVATE KEY-----` 字面量 → 中止提交**：

```
SUSPECT: dsh/storages/dsh-headroom-ccr.json
SUSPECT: dsh/storages/mnemon-draft.json
SUSPECT: reasonix-home/memory-merge-backup-20260927-2212/global/github-public-backup-credential-leak-round2-zstd-and-fixes-20260927.md
SUSPECT: reasonix-home/memory/global/github-public-backup-credential-leak-round2-zstd-and-fixes-20260927.md
SUSPECT: reasonix/memory/global/github-public-backup-credential-leak-round2-zstd-and-fixes-20260927.md
```

**根因**：我在 round 3 写的 fact `github-public-backup-credential-leak-round2-zstd-and-fixes-20260927`
**为了讲"脱敏规则漏了什么"而引用了 `-----BEGIN PRIVATE KEY-----` 字面量** → **被自己的检测规则命中**。
另外三个是**派生**：`mnemon-draft.json`（从 markdown 生成）+ `headroom-ccr.json`（缓存）+ 备份副本。

**这和第 7 轮修过的那个是同一个坑**（当时修的是 `github-public-备份泄露-goat-key-…` + headroom 缓存）。
**教训：(1) 写"警示性文档"时永远不要包含完整字面量，直接用 `-----BEGIN … PRIVATE KEY-----`（省略号打断 `[A-Z ]*`）；(2) 这条规则对派生文件同样适用 —— 改了源，派生也要重生成/回改。**

**修复**：4 个文件各改 1 处（`grep -rl` 复查为空），重跑 DryRun → `字节级全扫通过`。

## 二、🔴 架构错误：二进制派生数据不该进备份

修完上面后，DryRun 又报：

```
!! 字节级全扫发现 2 个文件含密钥（白名单外类型）→ 中止，不推送
    SUSPECT-BIN: mnemon/data/default/mnemon.db
    SUSPECT-BIN: mnemon/data/default/mnemon.db.bak-20260928-0013
```

**根因**：**mnemon 的 SQLite 库含密钥** —— 因为它是从语料导入的（195 insights 里含 key 相关内容），
**而 SQLite 是二进制，脱敏只处理文本文件**（脚本把它标为 `SUSPECT-BIN`）。

**这是我在 round 4 加 `mnemon` target 时的判断错误**：
- **mnemon 库是派生数据**（markdown 是 source of truth，库可随时重建）→ **不该进备份**
- **它含密钥且无法脱敏** → 进了备份就是**不可控的泄露源**

**修复两步**：
1. **从 `backup-to-github.ps1` 的 `$Targets` 移除 `mnemon` 项**（现 8 个 target：
   `reasonix / goat-gateway / dsh / zcode-appdata / zcode-home / trae-cn / trae-solo / reasonix-home`）
2. **从 repo 删掉已同步的旧副本**：`git rm -r --cached mnemon && rm -rf mnemon`（9.9 MB）
   —— 只移除 target 不够，**repo 里的历史副本还在**，字节级全扫照样命中

**验证**：`字节级全扫通过` / `兜底校验通过：无残留密钥` / `将提交 2824 个文件` / `-DryRun：未提交、未推送`

## 三、可复用判据

**备份的边界原则**：
- **只备份 source of truth（文本、可脱敏、可 grep、可 diff）**
- **不备份派生数据**（SQLite / 索引 / 缓存 / 二进制），哪怕它看起来"重要" ——
  因为它**能重建**，而且**二进制绕过了脱敏**，是失控面

**验证备份健康的完整信号链**（缺一不可）：
```
同步 N 个 target（rc<8 即成功）
→ 脱敏：扫描 N 个文本文件，改写 M 个
→ 字节级全扫通过            ← 二进制也扫
→ 兜底校验通过：无残留密钥
→ 将提交 N 个文件
```

## 四、⚠️ 我这轮的一个操作失误

查 profile 配置时我用了 `grep -vE '^\s*#|^\s*$'` 打印生效项，**把 `HINDSIGHT_API_LLM_API_KEY` 的明文值打进了会话记录**。
好在**备份脚本的 `user_[A-Za-z0-9]{20,}` 规则会把它脱敏成 `user_REDACTED`**（该规则在 round 3 就加了）。
**教训：打印配置文件时，过滤条件要同时排除含 `KEY`/`TOKEN`/`SECRET`/`PASSWORD` 的行**：
```bash
grep -vE '^\s*#|^\s*$|KEY|TOKEN|SECRET|PASSWORD' file
```

## 五、hindsight 的 daemon 起不来（本轮结论）

hindsight-coding-agents 0.7.0 的**插件层已装好**（全局 patch 有 `- id: hindsight`，skill 75 KB），
但 **daemon 在本机静默失败**：
- `uv` 已装并进用户 PATH（原警告消失）
- 新警告：`daemon mode needs an LLM for fact extraction`
- 已按 profile 模板配好：`HINDSIGHT_API_LLM_PROVIDER=openai` / `HINDSIGHT_API_LLM_API_KEY` / `HINDSIGHT_API_LLM_MODEL=deepseek/deepseek-v4.1-flash` / **`HINDSIGHT_API_LLM_BASE_URL`**（注意：**不是** `OPENAI_BASE_URL`，那是错的变量名）/ `HINDSIGHT_API_PORT=9077`
- 但 `daemon start` **exit=0、无输出、日志全空**，`daemon status` 报 `Daemon is not running`，9077 无监听
→ **疑似 Windows 兼容问题**，暂无诊断入口。**mnemon 仍完整可用**，hindsight 的降级影响可接受。
