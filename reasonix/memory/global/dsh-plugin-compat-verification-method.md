---
id: mem-e49ef9c5ebbec580abadf5060a575f19
revision: 1
created_at: "2026-09-30T05:31:05.913Z"
updated_at: "2026-09-30T05:31:05.913Z"
name: dsh-plugin-compat-verification-method
description: "判断 dsh 插件在某个 dsh 版本下是否真适配的三层验证法（含 client module 清单判据与 303/cookie 陷阱）"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# 判断 dsh 插件在某个 dsh 版本下是否真的适配：三层验证法（2026-09-30 实测）

**问题**：`dsh --profile X --dump-config` 只验证**配置合成**，**不执行插件代码**。
只看它会把"配置能合成"误当"插件能用"。

## 第 0 层（前置）：兼容性闸门会**静默跳过**
换 dsh 大版本时，peerDeps 不满足的插件会被**跳过而不报错**（`exit=0`），只在 stderr 留
`dsh: skipping profile bundle "<名字>"`。判据：
```bash
node <dsh>/lib/bin.js --profile web --dump-config >/dev/null 2>err.txt
grep -c 'skipping profile bundle' err.txt   # 必须是 0
```
跳过还会连锁触发 patch 层报错：`patch: entry "mnemon" not found`。

## 第 1 层：运行时日志
`~/.dsh/logs/dsh-web-<port>.out.log` 里不应有插件相关报错。
另可起**隔离实例**（换端口，如 3099）跑 20 秒收集日志，不干扰主线 3080：
```bash
node <dsh>/lib/bin.js --profile web --port 3099 --no-open > log 2>&1
```

## 第 2 层（最有价值）：**client module 清单**
dsh web 会把所有 **client bundle** 列进首页 HTML 的 preload 清单。抓下来即可逐项核对
哪个插件真的被交付给浏览器：
```bash
curl -s -L -c cj -b cj --noproxy '*' "http://127.0.0.1:3080/?token=<token>" -o p.html
grep -o '/client[^"'"'"']*' p.html | head -20
```
清单形如 `plugins/??<pkg>/client.js,@mingozhou/dsh-replay/client.js,…&rev=<hash>`。

**关键判据**：`<pkg>/client.js` 出现 ⇒ 该插件有 client 部分且已被挂载。
**但"没出现"要分情况**——先看它的 `package.json`：
```bash
python -c "import json;j=json.load(open('<pkg>/package.json'));print(list((j.get('dsh') or {}).keys()))"
```
- `dsh` 字段含 `client` ⇒ 应该有 client bundle，**清单里没有才是问题**
- `dsh` 字段**只有 `bundle`**（无 `client`）⇒ **纯 server 侧插件，不在清单里是正常的**

2026-09-30 实测 0.2.0-rc.2 + web profile 的 9 个插件：7 个有 client 且全在清单；
`dsh-headroom` / `dsh-deja` 是 server-only（印证清单准确）；
`dsh-plugin-local-search` 也是 server-only。

## 第 3 层：功能级探针（逐插件）
| 插件 | 探针 |
|---|---|
| `dsh-mnemon` | 会话里 mnemon 工具可用 + `~/.mnemon/{documents,runtime}` 的 mtime 更新 |
| `@lanbaolu/dsh-wechat-bridge` | `~/.dsh/wechat-bridge/plugin.log` 出现 `web panel routes registered {"count":N}`，**且时间戳与新实例启动时刻吻合**；`logs/bridge-YYYY-MM-DD.log` 里是否有真实 iLink 调用 |
| `ds-harness-remote` | 日志 `host identity ready` / `client remote-mode identity ready` |
| pipeline 类（headroom） | 触发大 tool 输出后看它的数据文件 mtime（**注意**：未触发 ≠ 失效，可能与阈值/session 分片有关） |

## 陷阱
- **`token` 只在首次请求有效**：`http://127.0.0.1:3080/?token=<t>` 返回 **303**，
  必须 `-L -c/-b` 带 cookie 跟随，否则拿到 0 字节。
- Windows 版 python **不认 Git Bash 的 `/tmp`**，读写临时文件要用
  `C:/Users/27063/AppData/Local/Temp/...`。
- 给插件数据目录做探针前，先确认**不是**网络类报错被误算成适配问题。
  例：`[local-search] wiki aggregator failed: fetch failed` 的真因是
  `zh/en.wikipedia.org` 直连 `http=000` 不可达（`index.js:104` 只是 console.warn）。
