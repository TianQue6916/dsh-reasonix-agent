---
id: mem-44eefcfebd852586f777a2d5552dcf1f
revision: 1
created_at: "2026-09-27T03:21:03.415Z"
updated_at: "2026-09-27T03:21:03.415Z"
name: dsh-mimir-incompatible-with-017rc2-typert-codec-20260927
description: "dsh-mimir 0.21.0 与 dsh 0.1.7-rc.2 不兼容：typert-loader 的 requireStrictCodec 要求 invocation codec 带 create() 工厂，Mimir 的 research/addEvidenceEdge 没有 → boot 时 1 entry did not activate，用户侧表现为「插件都没有、全是故障」；因 3080 启动早于 Mimir 安装所以只有新起实例才暴露；已按 4 处卸载并验证（boot 日志干净 + index 页插件 client bundle 198 条含第三方、mimir 残留 0）；含「数组最后一项无尾逗号导致正则失配 + assert 在写入前 → 破损态」的坑与「判据要用 index 页 plugins 清单」的升级"
metadata:
  type: user
  fact_type: reference
  scope: global
---


# dsh-mimir 与 dsh 0.1.7-rc.2 不兼容（已卸载）—— 2026-09-27

## 现象
新建的 3081 实例启动即报，且**用户开页面看到"插件都没有、全是故障"**：

```
dsh: warning: 1 entry did not activate
typert-loader (@deepseek-ai/dsh-typert-loader): AggregateError: typert-loader: 1 typert contributor(s) failed to register:
  - typert-loader: dsh-mimir invocation "dsh-mimir#research/addEvidenceEdge" parameter codec has no create() factory
Error: typert-loader: dsh-mimir invocation "dsh-mimir#research/addEvidenceEdge" parameter codec has no create() factory
    at requireStrictCodec (…/dsh-typert-loader/lib/index.js:211:48)
    at validateTypertManifest (…/dsh-typert-loader/lib/index.js:116:89)
```

## 为什么 3080 看起来没事、3081 出事 —— 时间差，不是配置差
| 事件 | 时刻 |
|---|---|
| 3080 启动 | **2026-09-26 20:44:26** |
| dsh-mimir 装进 profile | **2026-09-27 10:16:37** |

**3080 启动时 Mimir 还不存在**，所以它进程里从没加载过 Mimir；
3081 每次全新启动都会加载 → 每次都撞这个错。

> **教训（第三次同类）**：装完插件**必须新起一个进程验证**。
> 我装了 Mimir 之后只在旧进程里看，还把它当成"运行中"。
> 而且我**早就看到过这个报错**（第一次起 3081 时日志里就有），
> 却把它当成"警告、不影响" —— **我把一条 boot-time Error 降级成了 notice。**

## 判据：typert codec
- Mimir 0.21.0 声明的 peer 是 `dsh-typert-protocol >=0.1.2-rc.1`，本机 0.1.7-rc.2 **名义上满足**
- 但 0.1.7 的 `typert-loader` 收紧了 codec 校验（`requireStrictCodec`）：invocation 的参数 codec 必须带 `create()` 工厂
- Mimir 的 `research/addEvidenceEdge` 没提供 → 校验失败
- **所以"peer 版本号满足"不等于"真的兼容"** —— preview 期上游会收紧校验

## 处理：卸载（4 处，与卸 modlens 同一套流程）
1. `package.json` → `dependencies` 删 `dsh-mimir`
2. `package.json` → `dsh.profile.bundles` 删 `dsh-mimir`
3. `node_modules/dsh-mimir` 删
4. `pnpm-lock.yaml` 删三处（importer / packages / snapshots-with-peer）

**踩的坑**：bundle 里 `dsh-mimir` 是**数组最后一项、没有尾逗号**，
所以正则 `"dsh-mimir",
` 匹配不到；而我的 `assert` 又在
写文件之前，于是**脚本中止、package.json 没写成，但 node_modules 已经删了** ——
中间出现了一段「配置引用但模块不存在」的破损态。
→ **顺序错了：应该先改完配置再删目录**，或者**每步都幂等**。
→ 删「数组最后一项」时要顺带去掉**上一行的尾逗号**。

## 验证（这次是真验证）
重起 3081，boot 日志**只剩两行正常输出**，无 `did not activate`、无 Error：
```
dsh web: http://127.0.0.1:3081/?token=…
dsh web: opening the default browser; pass --no-open to disable
```

再用带 token 的 URL 抓 index 页，**服务端登记的插件 client bundle 有 198 条**，
其中第三方的是 `@local/dsh-plugin-goat-panel/client.js` 与 `dsh-web-search-multi/client.js`，
`mimir` 残留 0。
（`dsh-deja` / `dsh-headroom` 是纯服务端工具，本来就没有 client.js，不属于缺席。）

> **判据升级**：以后判断"插件到底挂上没有"，
> 不要看进程活没活，而是**抓 index 页的 `plugins/??…&rev=…` 清单**——
> 那是服务端真实注册结果的投影，比任何日志都直接。

## 顺带确认的一个设计（排除了误判方向）
曾怀疑「两个端口共用 cookie 会互相踢掉」。实测 3081 设的 cookie 是：
```
#HttpOnly_127.0.0.1  FALSE  /  FALSE  …  dsh-auth-w3iJaA6qw3qDSBs2Itl-h4S-Y-ZeYCC-N_iZO-eI_qw  v1.eyJ2ZXJzaW9uIjoxLCJhdXRob3JpdHkiOiIxMjcuMC4wLjE6MzA4MSIs…}
```
**名字里带实例哈希，值里编码了 `authority:127.0.0.1:3081`** → 两个实例的 cookie 互不覆盖，
各自按名字认领。**此方向排除。**

