---
id: "bad9c4a5-21ee-4a4c-94bf-1312f166299d"
title: "goat-gateway 首字节超时阈值与 TTFT 长尾实测基线（附 keys.json 手改事故复盘）"
description: "2026-10-07 排查记录：本机 TTFT/总时长实测分布基线（p50 25.4s / p90 72.2s / max 176.7s）、firstChunkTimeoutMs 45000 误伤与回滚 180000 的教训、手动 splice 改 keys.json 致 JSON 非法使插件面板报错的 80 秒事故与热重载修复流程、三 key 可用性现状。设计背景见 goat-gateway 其他文档。"
status: "active"
created_at: "2026-10-07T06:13:54.453Z"
updated_at: "2026-10-07T06:13:54.453Z"
content_hash: "0c4862eb1e4fedb4a70b1d0e046512f61fd187c961edbd51bce2855d79f1839c"
source_paths:
  []
session_ids:
  - "bd87afc5-1c58-4daf-bb48-f345960c812a"
memory_body_ids:
  []
---

# goat-gateway：首字节超时阈值与 TTFT 长尾基线

**性质**：带运行时证据的性能基线 + 参数调优事故复盘（2026-10-07）。
**相关文档**：`dbffeb3a-718b-436e-b8f1-e4b9850f4b53`（多 upstream 双机上线）、`2932c579-9670-4cb7-b244-7edf4a23e9bb`（priority 分层 + quota 动态 weight）、`fb4a6e22-1db0-406a-bd62-9d693e968f7a`（额度耗尽不进冷却：上游 400 与 session 亲和）。

## 一、TTFT / 总时长实测基线（本机，2026-10-07 当日 306 个成功请求）

```
总时长(n=301) min=3.268s  p25=17.201s  median=25.406s  p75=41.544s  p90=72.166s  max=176.733s
>45s: 69 次 (22.5%)   >90s: 20 次 (6.5%)   >180s: 0 次
```

- 用户观察到的一次「62.3 秒」拆解：**首 token 53.1s + 生成 9.16s**（133 tok/s ≈ 1200 token）。**生成阶段很快，慢的只有 TTFT**。该值落在 p75–p90 之间，不是异常值。
- 同批会话内相邻请求耗时抖动极大（同一 `sess=h:d7a77b`：21.8s / 33.6s / 25.4s / 22.3s / 35.4s / 29.0s / 33.8s；另一 `sess=h:9d276d`：59.9s / 62.0s / 57.9s / 41.1s）⇒ 更符合上游排队，而非本地或单会话问题。
- 当日最慢的成功请求 176.7s（id=91/95/215 约 173.6s），仍成功返回 ⇒ 长尾不等于卡死。

## 二、归因：排队在服务商侧，本地无额外开销

- gateway 日志 ECHO-FILTER 拿到请求体真实大小：**1.33–1.51 MB/请求**（`bytes=1338496…1512299`），对应 **prompt 4.4–8.2 万 token**（loop-guard：`prompt_tokens 76295 / 43976 / 81648`），其中 **`cached_tokens 71680`（94% 命中）**。
- gateway 转发耗时 ≈ 用户侧总耗时 ⇒ 本地链路没有可优化的开销；94% 前缀缓存下 prefill 只需几秒，剩余约 45s 是排队 + 链路等待。
- **可动的只有「把 prompt 降下来」**：开新会话让 prompt 回到几千 token 级别是唯一立竿见影的手段；链路 `dsh → goat-gateway → commandcode.ai → DeepSeek` 多一跳且共享 GOAT 账号池排队，直连官方可少一跳（但官方 key 余额为负，见第四节）。
- **不要动前缀缓存**：社区踩坑是在 system prompt / 消息序列**开头**插入动态内容（时间戳、随机 id、每轮变化的工具定义顺序）会让缓存自改动点起全部失效，94% → 接近 0，TTFT 立刻翻几倍。
- 社区经验：TTFT 长尾是这类 API 常态，通行做法是「设 timeout + 有限重试 + 接受长尾」，没有能稳定压低 TTFT 的配置开关。

## 三、firstChunkTimeoutMs 调参事故与回滚（核心教训）

**改错**：为修「又停了」，把 `D:\80-系统\Toolbox\goat-gateway\config.json` 的 `firstChunkTimeoutMs` 由 **180000 → 45000**，理由是「45×2=90s 走完同 key 重试，再换 key 90s，约 180s < dsh stall-guard 240s」。**该估算把「首字节时间」当成「总时长的一半」，与实测 p90 总时长 72.2s、max 176.7s 矛盾。**

**证据（误伤已发生）**：

```
2026-10-07T06:10:28.251Z NETWORK id=323 key=qq  upstream first-chunk timeout after 45000ms
```

对比：原阈值 180000ms 当日触发 15 次（`15 first-chunk timeout after 180000ms`），都是真卡死。

**处置**：UAC 提权脚本改回 **45000 → 180000**，备份 `config.json.bak-20261007-141145`，verify `firstChunkTimeoutMs=180000`，并 `POST /_gateway/reload` 热加载（gateway 日志 `06:12:13.140Z RELOAD config=…`）。

**教训**：**改任何首字节/超时阈值前，必须先拿本机实测耗时分布验证，不能按总时长的经验比例反推。**禁用 163 号的改动保留（正确），45000 阈值撤销（错误）。

## 四、三 key 可用性现状（当日）

- `qq`：唯一真正可用。5h 1.597/14、周 8.628/35、月 8.476/69.85，2288 requests。**没有 failover 对象 ⇒ 卡一次就全局卡。**
- `163`：额度耗尽（`COOLDOWN key=163 reason=quota status=400`，上游 `insufficient credits`），已 `enabled: false`（禁后不出现在 `goat-usage.ps1` 输出中，属预期）。
- `deepseek-official`：余额 `available: -0.22`（负数，并非早前记录的 ¥1.02）。
- 注：`keys.json` 内为明文 API key，**本文档与任何记录都不得复制 key 字符串**，只记 name。

## 五、keys.json 手改桥接事故（80 秒窗口）与修复流程

**事故**：手动 splice 修改 `D:\80-系统\Toolbox\goat-gateway\keys.json` 以禁用 163 号时，长度算错一字符（`"enabled": true` 实为 15 字符却写了 `Substring($j + 16)`），多切掉后面的**逗号**，文件变为：

```json
"enabled": false
"note": "account 163.com (from reasonix/.env)",
```

**后果**：JSON 非法 ⇒ `goat-usage.ps1:116` 的 `ConvertFrom-Json` 抛 `Invalid object passed in, ':' or '}' expected. (187)` ⇒ 插件面板显示「读取失败」。窗口 14:06:34 → 14:07:54（约 80 秒），面板时间戳 14:07:04 正落在窗口内。

**gateway 侧未中断**：`loadKeys()` 解析失败走 `KEYS-WARN 读取/解析失败，保留上一版 keys：Expected ',' or '}' after property value in JSON at position 186 (line 7 column 7)`（06:07:02–06:07:26 共 5 条），转发始终沿用上一版 keys。

**修复（已验证）**：从 `keys.json.bak-20261007-140634` 按正确长度重建（日志 `elev-fixkeys.log`：`rewrote keys.json from backup (len-correct splice)` + `JSON PARSE OK` + 三 key 状态），随后独立复核解析 + 直接跑插件原命令 `goat-usage.ps1 -Json -Force` 均正常。

**操作要点**：
- 改 gateway 配置走 `POST /_gateway/reload` **热重载即可，无需重启进程**；UAC 提权脚本在本机可用（`/c/Windows/system32/sudo` 存在，无 gsudo）。
- 本机 gateway 的验收命令：`goat-usage.ps1 -Json -CacheSeconds 10 -Force`（面板带 10s 缓存，改后刷新面板即可）。
- 面板读不到数据时先查 `keys.json` 是否合法，而不必怀疑插件；改配置前先备份（`.bak-<timestamp>`），改完必须重新解析验证。
- 写入 D: 盘 gateway 目录需要提权（临时探针 `elev-write-probe.log`：`CREATE+DELETE in dir : OK`、`OPEN keys.json RW : OK` 均为 elevated=True 下取得）。
