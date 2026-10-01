---
id: mem-5ee14039d3db4b922fa056f4209b2c82
revision: 1
created_at: "2026-09-30T14:01:12.904Z"
updated_at: "2026-09-30T14:01:12.904Z"
name: dsh-requires-node20-not-platform-gated-20260930
description: "dsh 未上 Linux 的真因是 Node 版本（需 ≥20.12，机器上是 v18.19.1），不是平台门控；已装 v24.21.0 修复"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 结论
dsh **不是**不支持 Linux。阻塞点是 Node 版本，一行代码级别。

## 证据链（2026-09-30 实测）
1. **无平台门控**：npm 上 `@deepseek-ai/dsh` 29 个版本，`os` / `cpu` / `engines` 全部 `None`；
   依赖树里 `node-pty` 自带 `prebuilds/linux-x64/pty.node` 与 `linux-arm64/pty.node`。
   Windows 上看到的 `@img/sharp-win32-x64`、`@koromix/koffi-win32-x64`、
   `node-addon-require-builtin-win32-x64-msvc`、`sherpa-onnx-win-x64`
   只是 npm 按各 optionalDep 的 os/cpu 字段解析出来的结果，不是 harness 自己的限制。
2. **真实硬要求**：`@deepseek-ai/dsh-app-boot/lib/index.js` 第 4 行
   `import { inspect, parseEnv } from "node:util"`。
   `node:util.parseEnv` 是 **Node 20.12+** 才有的导出。
   Linux 机（Ubuntu 24.04，apt 的 nodejs = **v18.19.1**）上直接：
   `SyntaxError: The requested module 'node:util' does not provide an export named 'parseEnv'`
3. **为什么现象像「dsh 不支持 Linux」**：49 个依赖声明 `engines: node >=20` / `>= 20.19.0`
   （含 `readdirp@5.1.1` 要求 `>= 20.19.0`），但 npm 只 **WARN EBADENGINE** 不拦，
   于是 `npm install` 报 `added 535 packages in 2m`、**EXIT=0**、380 MB，
   装得像成功了，实际一跑就炸在第一个 import。
4. **另一条非技术原因**：Linux 侧 `~/.local/bin/dsh-remote` 头注释记录了
   2026-09-04 用户拍板「本机性能不够不跑 dsh，统一派发到主力机」——
   所以即使技术上能跑，也一直没在上面跑。

## 修复（已落地）
Linux 上装了官方 Node **v24.21.0**：
```
~/.local/node/node-v24.21.0-linux-x64   +   ~/.local/node/current 软链
~/.local/bin/{node,npm,npx,corepack}    →  指向 current/bin/*
```
之后 `node ~/dsh-test/node_modules/@deepseek-ai/dsh/lib/bin.js --version` → `0.2.0-rc.2`，
`--help` 正常，`--profile web --dump-config` → exit=0。

## 注意
- 系统 apt 的 node 仍是 v18.19.1；**必须让 `~/.local/bin` 在 PATH 里排在 `/usr/bin` 之前**。
- 本机 Linux 上没有 pnpm（dsh profile 装插件需要），corepack enable 后仍需确认 `pnpm -v`。
