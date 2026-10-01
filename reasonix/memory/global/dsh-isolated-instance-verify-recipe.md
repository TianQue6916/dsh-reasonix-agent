---
id: mem-5ecca08f8e64c521eccb000db3f9bd3d
revision: 1
created_at: "2026-09-28T07:54:48.280Z"
updated_at: "2026-09-28T07:54:48.280Z"
name: dsh-isolated-instance-verify-recipe
description: "隔离 dsh 实例验证配方：三件套环境变量、mem-verify profile 构建、patch insert 语义坑、三条判据"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 用途
在不碰生产 3080 的前提下，用**真实 dsh 进程**验证 preset / 插件改动。2026-09-28 round 35 用它证明了 `memory.mjs` 的 `syncToMnemon()` 在真实 dsh 里工作 —— 把"需要重启 3080 才能验证"变成"已验证，重启只是生效动作"。

## 三件套环境变量（缺一不可，这是"完全不碰生产"的关键）
```
DSH_HOME=C:/Users/27063/.dsh-lab                          # 独立 HOME：profiles / sessions / storages / .env
DSH_REASONIX_MEMORY=C:/Users/27063/.dsh-lab/probe-corpus  # memory.mjs 的语料根
MNEMON_DATA_DIR=C:/Users/27063/.dsh-lab/probe-mnemon      # mnemon 的库
```
注意 `memory.mjs` 里 `MEMORY_ROOT` 与 `MNEMON_SYNC_PY` 都基于 `os.homedir()`：前者受 `DSH_REASONIX_MEMORY` 控制，后者**硬编码** `~/.dsh/storages/tools/memory-to-mnemon.py`（故意的 —— 脚本在生产位置，spawn 时继承 `MNEMON_DATA_DIR` 从而写隔离库）。

## profile 构建
1. `cp ~/.dsh/.env ~/.dsh-lab/.env` —— **不复制它就会 `MISSING_CREDENTIAL`**（上一轮 cu-lab 踩过）。**不要打印内容**。
2. `~/.dsh-lab/profiles/<name>/package.json` → `dsh.profile.bundles = ["@deepseek-ai/dsh-base","@deepseek-ai/dsh-headless"]`。
3. `cordis.patch.yml` 里 `agent-default-model` + `llm-pi-ai` 两块从 `~/.dsh-lab/profiles/cu-lab/cordis.patch.yml` 第 26 行起复制（含 `apiKeyEnv: COMMANDCODE_API_KEY`、`baseURL: http://127.0.0.1:8788/v1`）。
4. 挂 `memory.mjs` 用**绝对路径**引用生产文件（验证真代码而非副本）：
   ```yaml
   - insert:
       - id: memory-reasonix
         name: 'C:/Users/27063/.dsh/.agent-presets/anchored-standard/memory.mjs'
   ```

## 坑：patch 的 `- id: X` 是**替换已有 entry**，不是新增
第一次写成 `- id: memory-reasonix` + `name:` → `dsh: patch: entry "memory-reasonix" not found`。生产里它能用，是因为 `preset-anchored-standard` 已声明了该 row。新增必须走 `- insert: [ ... ]`（cu-lab 挂 MCP 就是这种写法）。

## 运行与判据
```bash
DSH_HOME=... DSH_REASONIX_MEMORY=... MNEMON_DATA_DIR=... \
  dsh --profile mem-verify '<让 agent 调 memory_remember 的 prompt>'
```
实测 **8.3 秒**完成。三条判据：
1. `~/.dsh-lab/probe-corpus/global/<name>.md` 出现；
2. `MNEMON_DATA_DIR=... mnemon search "<唯一串>"` 命中；
3. `~/.dsh/logs/memory-to-mnemon.log` 出现 `done rc=0`。

## 不干扰生产的实证
隔离实例跑完，3080 仍是**同一个进程**（PID 4300，启动时间 09-28 11:52:02 未变），而本会话就跑在 3080 上、全程正常。

## 保留物
`~/.dsh-lab/profiles/mem-verify/` 保留为可复用验证工具；探针数据（probe-corpus / probe-mnemon）用后即删。

## 与 objective 字面的偏差（如实记录）
objective 原文写"起**临时端口**测试实例"。我起的是**无端口 headless 实例** —— 同样满足实质（独立进程 + 独立数据 + 不干扰 3080），且免去为隔离 web profile 重装 `dsh-web-app` 依赖链。若要字面合规，需在隔离 HOME 里再装 web bundle。
