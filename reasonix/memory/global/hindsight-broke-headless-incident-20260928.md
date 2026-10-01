---
id: mem-e2ad260653ec2ac75babe74faf7e2cb3
revision: 1
created_at: "2026-09-27T17:35:30.859Z"
updated_at: "2026-09-27T17:35:30.859Z"
name: hindsight-broke-headless-incident-20260928
description: "事故复盘：hindsight 写全局 patch 后破坏 headless profile（format v4 message requires a producer-owned source kind），已移除该段并验证两 profile 恢复；核心教训是\"写全局 patch 的插件必须在所有 profile 上验证，且 headless 的判据必须是真跑一个任务而非进程起没起来\""
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 一、🔴 事故：hindsight 破坏了 headless profile

**症状**（2026-09-28 round 25 发现）：
```bash
$ dsh --profile headless "只回复 OK"
dsh: format v4 message requires a producer-owned source kind
# 任何任务都报这个，web profile 一切正常
```

**根因**：hindsight 的安装把插件行写进了 **`~/.dsh/cordis.patch.yml`（全局）**，而**所有 profile 都会 compose 它**（README 原话："applies to every dsh profile"）→
**hindsight 的 dsh 插件与 headless profile 不兼容**，headless 的会话消息组装直接失败。

**我的验证缺口**：round 20 装 hindsight 时，我**只验证了 web profile 的启动**，**没验证 headless** ——
而 headless 是**用户的自动化线**（572 个 session 的批量学习资料流水线）。

## 二、修复

```bash
# 1) 备份现场
cp ~/.dsh/cordis.patch.yml ~/.dsh/cordis.patch.yml.bak-<ts>-broken-hindsight

# 2) 只删 hindsight 段（保留 deja 的 3 条 —— 那是好的）
#    删除 "# HINDSIGHT_CODING_AGENTS_DSH_START" 与 "..._END" 之间共 173 字符 + 前后空行
```

**验证**：
```
headless: OK        ← 恢复
web: HTTP 401       ← 未受影响
3080: PID 52540     ← 全程未受影响
```

**当前状态：hindsight 处于禁用状态**（插件行已从全局 patch 移除；`~/.hindsight/` 与 skill 仍在磁盘上，插件不再加载）。

## 三、**最重要的教训：验证 profile 的覆盖面**

**写进全局 `~/.dsh/cordis.patch.yml` 的插件，必须在所有 profile 上验证。**
本次我只验 web，漏了 headless → 造成 headless 完全不可用（而我 round 20 还在报告里说"隔离验证通过"）。

**正确的验证矩阵**（改全局 patch 时）：
```
web      启动 ✓ / 会话能跑 ✓ / dump-config ✓
headless 启动 ✓ / 会话能跑 ✓ / dump-config ✓      ← 本次漏的就是这行
```
**而且"能启动"不等于"能用"** —— headless 本次是**启动时无错、跑任务时才报错**（错误发生在会话消息组装阶段）。
所以 headless 的判据必须是**真跑一个任务拿到回复**，不是看进程起没起来。

## 四、附带发现：`dsh --profile web` 的启动日志

`~/.dsh/logs/startup-<ts>-<uuid>.log` 会记录启动期诊断，本次含：
```
hmr: 'config reload at %C failed'  (profiles/web/package.json)
hmr: Error: HMR is disposed
```
这是 HMR 在配置变更后尝试 reload 失败的警告，**非致命**（web 仍正常服务）。
**排查启动问题的正确入口**：这个 startup 日志（`Full diagnostics:` 那行给出的路径）。

## 五、关于 hindsight 的结论

| 层 | 状态 |
|---|---|
| 插件层 | ❌ **已禁用**（从全局 patch 移除，因破坏 headless） |
| `uv` | ✅ 0.12.19（已进用户 PATH，无害，保留） |
| profile 配置 | ⏸️ 留着（`~/.hindsight/profiles/dsh-goat.env`，若将来支持 per-profile 挂载可复用） |
| daemon | ❌ 本机静默失败（`start` exit=0 无输出无日志，疑 Windows 兼容问题） |

**净收益为零，代价是发现了一个真事故** —— 但也有价值：它暴露了「全局 patch 的验证覆盖面」这个盲区。
**mnemon 仍是唯一在用的记忆系统**，且它完整可用（205 insights / 5868 边 / 三层 / decay / 自动同步 / 灾备实证）。

## 六、如果要重新启用 hindsight（供将来参考）

**不要**用它的 `install dsh`（会写全局 patch）。可行路径：
1. 把 `.hindsight/coding-agents/dist/dsh.js` 那一行**只加到某个 profile 的 patch**
   （`~/.dsh/profiles/web/cordis.patch.yml`）而不是全局
2. **先在隔离实例验证 web，再单独验证 headless**
3. 先解决 daemon 在本机起不来的问题（否则插件加载了也是惰性）
