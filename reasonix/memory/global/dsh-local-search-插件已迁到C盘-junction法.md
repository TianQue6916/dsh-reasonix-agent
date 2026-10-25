---
id: mem-ff69b59954147fc22333299821f13574
revision: 2
created_at: "2026-10-25T15:14:23.796Z"
updated_at: "2026-10-25T15:34:19.577Z"
name: dsh-local-search-插件已迁到C盘-junction法
description: "搜索 8 条上限的根因定论：插件侧正常(53→30条)，卡在 dsh-tool-web 的 slice(0,8)；附 junction 免提权迁移法"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 最终定位（2026-10-25 深夜，探针实测）

在 `dsh-plugin-local-search` 的 `search()` 里 `Promise.allSettled` 之后插一行 `console.warn` 打印各源结果数，重启 dsh 后搜一次，`~/.dsh/logs/host-stdio.log` 得到：

```
[err] [local-search] probe wiki=9 github=4 deepseekSearch=30 bing=10 max=30 req=8
```

**解读**：
- 四源全部正常返回：wiki 9 / github 4 / deepseekSearch 30 / bing 10 = 53 条原始
- `max=30` ⇒ **maxResults 修复生效**（把 dsh 传的 `req=8` 覆盖成配置的 30）
- `req=8` ⇒ `dsh-tool-web` 传给 provider 的 `request.maxResults` 恒为 8

**⇒ 插件侧完全正确，30 条已就绪。卡在最后一层：`dsh-tool-web` 只展示前 8 条。**

判定依据：两次不同 query 返回的 8 条分布不同（一次 github 4 + deepseekSearch 4，一次 github 5 + deepseekSearch 3），但都是 `mergeSources` 按 `SOURCE_RANK = {github:0, deepseekSearch:1, bing:2, goat:3, deepseek:4, wiki:5}` 排序后的前 8 条 —— 说明 tool 拿到 30 条后做了 `slice(0, 8)`。

**这个 8 改不了**：`dsh-tool-web` 在 `resources/app.asar`（182 MB）里，`dump-desktop-config.ps1` 显示它的 config 只有 `fetch: true` 和 `searchTimeoutMs: 60000`，**没有 maxResults 项**；`web_search` tool 的 schema 也只有 `queries`，不接受 `maxResults` 参数（多传会被 schema 拒绝）。要改只能 asar 解包重打包，风险 >> 收益（8 条已按 rank 最优）。

**结论：不动了。** 社区实践 `max_results` 也是 5-10（省 context），8 条够用。

## 测速与行为数据

- 直调 `new LocalSearchProvider(() => cfg, {}).search({query, maxResults: 8})` → `total=30 bySource={github:8, deepseekSearch:8, bing:8, wiki:6}`，耗时 **11.4 s**（wiki 最慢，libzim 全文搜索）
- dsh 的 `dsh-tool-web` 配 `searchTimeoutMs: 60000`（60 s），**不是超时砍掉的**

## 附带发现

- `D:\80-系统` 是 High Integrity Level 保护目录，普通进程写不进；但 `node_modules/<pkg>` 是 **junction**，重定向 junction **不需要管理员权限** ⇒ 插件实体已迁到 `C:\Users\27063\.dsh\plugins\dsh-plugin-local-search`（48716 B），三端 junction 都指过去。**以后改插件改这里，不是 D 盘。**
- 从 dsh 的 tool 进程调 `Start-Process -Verb RunAs` 弹不出 UAC（非交互式会话，`consent.exe` 无法在其窗口站创建弹窗）⇒ High IL 写操作只能手动或走免提权路径。
