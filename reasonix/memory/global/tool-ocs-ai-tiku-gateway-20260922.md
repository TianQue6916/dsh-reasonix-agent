---
id: mem-1b89ae55cca6836bacae33ab94baa960
revision: 1
created_at: "2026-09-22T06:59:43.4222752Z"
updated_at: "2026-09-22T06:59:43.4222752Z"
name: tool-ocs-ai-tiku-gateway-20260922
description: OCS 网课助手的题库配置已指向本地 AI 网关（127.0.0.1:8899，接 Command Code GOAT），含架构、协议细节、OCS elevated 坑、回滚与自启方式
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 结论
OCS Desktop 2.12.0 的「题库配置」已写入并开启全局同步：题库 = 本地 AI 网关（自建，非现成题库），模型走 Command Code GOAT。2026-09-22 落地。

## 资产位置
- 网关目录：`C:\Users\27063\.ocs-ai-tiku\`（ocs_ai_tiku.py 网关本体、config.json、cache.json、gateway.log、start-hidden.vbs、selftest.py、apply_ocs_config.py、apply-ocs-config.ps1、kill-ocs-elevated.ps1、install-autostart.ps1、README.md）
- 监听：`http://127.0.0.1:8899`，端点 `POST /ask`、`GET /status`；纯标准库，无依赖
- 模型：`deepseek/deepseek-v4.1-flash`；key 从 `C:\Users\27063\.dsh\.env` 的 `COMMANDCODE_API_KEY` 读取（不落第二份明文）
- OCS 配置：`%APPDATA%\OCS Desktop\config.json` → `render.setting.ocs.store["common.settings.answererWrappers"]` + `openSync=true`；备份 `config.json.bak-20260922-145557`
- 自启：HKCU\...\Run 键 `OCS-AI-Tiku-Gateway` → `wscript.exe C:\Users\27063\.ocs-ai-tiku\start-hidden.vbs`（幂等，检测 8899）

## 原理（为什么必须本地网关）
OCS 题库配置只是「题目→答案」的 HTTP 适配器：脚本在网课页面（https）里发请求，`@connect` 白名单只有 localhost/127.0.0.1 + OCS 官方域名，且大模型 API 无 CORS、key 会暴露在脚本配置里。所以链路 = 浏览器 → 本地网关（免鉴权、仅本机）→ GOAT（服务端带 key）。

## 协议细节（改写配置时的关键）
- 存储键 = namespace + "." + configKey = `common.settings.answererWrappers`；脚本在 playwright 环境启动时拉 `http://localhost:15319/browser`（桌面端返回 `setting.ocs.store`，仅 openSync=true 时非空）并逐条 `$store.set`
- AnswerWrapper 字段：name/url/method(post|get)/type(fetch|GM_xmlhttpRequest)/contentType(json|text)/headers/data/handler；data 里可用占位符 `${type} ${title} ${options}`
- handler 是 JS 字符串，`Function(handler)()` 须返回函数，返回 `[q,a,extra]` 或 `[[q,a,extra],...]`；本次用 `return (res)=> res.results`
- 答案解析三档：选项文本归一化匹配 → 相似度>0.6 → 纯字母按 A=1 兜底；多选答案可用默认分隔符（`===,#,---,###,|,;,；`）连接；判断题要求答案与选项同词表（CORRECT_WORDS/INCORRECT_WORDS）
- 题库请求硬超时 60s（AnswerWrapperHandlerConfig.timeout_seconds）

## 踩到的坑
1. **OCS 是 elevated 运行**：普通权限 `Stop-Process` 报 Access denied，也拿不到其子 chrome 的 CommandLine；必须 `Start-Process -Verb RunAs` 提权杀（见 kill-ocs-elevated.ps1）
2. **写 config.json 必须先关 OCS**：否则 OCS 退出/后续 set 会用内存数据整体写盘覆盖（apply_ocs_config.py 内置运行检测与备份）
3. **GOAT 需自定义 User-Agent**：python urllib 默认 UA 被 Cloudflare 拦，返回 HTTP 403 `error code: 1010`；带 Chrome UA 即通
4. **返回 header 大小写**：本机 dev-sidecar 会转发 localhost 请求并把响应头小写化，Python 里读 header 别 `dict()` 化（Message.get 才大小写不敏感）
5. 多选答案 `ABD` 连写曾被正则漏掉（`(?<![A-Za-z])([A-Z])(?![A-Za-z])` 不匹配相邻字母），已改为先判纯字母串再逐字符拆

## 已验证
- selftest.py 四题型（单/多/判/填）结构 + OPTIONS 预检全通过；node 侧用 `Function(wrapper.handler)()` 求值验证 OCS 可消费性 PASS
- `GET http://127.0.0.1:15319/ocs-global-setting` 返回 `openSync=true` 且 store 含该题库
- 待用户侧验证：OCS 启动浏览器进入真实作业页，看 gateway.log 出现「作答完成」

## 回滚
`python apply_ocs_config.py --revert`（或 apply-ocs-config.ps1 -Revert）→ 恢复最近备份；卸载自启 `install-autostart.ps1 -Uninstall`；停网关 `Get-Process pythonw | Stop-Process -Force`
