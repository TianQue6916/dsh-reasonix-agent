# `transport.describe` 进程级缓存补丁

**日期**：2026-11-23
**対象**：`ds-harness-remote@0.6.5` 的 `dist/remote-typert-gateway.js`
**脚本**：`apply-remote-describe-cache.mjs`（幂等，可 `--revert`）

## 症状

Linux 端 dsh web GUI：**UI 和动画完全正常，只有会话记录不更新**。切走再切回能补出一部分。

## 根因

`remote-typert-gateway.js` 的 `open()` 里，每开一条 stream，若 `this.frameTransfers` 未定就 `await` 一次 `harness.transport.describe`：

```js
if (this.frameTransfers === undefined) {
    const description = await this.client.rpc('harness.transport.describe', {}, signal);
    this.frameTransfers = isRecord(description) && Array.isArray(description.capabilities)
        && description.capabilities.includes('harness.remote.stream.transfer.v1');
}
```

`this.frameTransfers` 挂在 gateway 实例上，**每个新实例都要重新问一遍**。而 `host.log` 实测这个 RPC：

```
87.1s 总   35 次   p50=2667ms   max=4685ms   harness.transport.describe
```

每 3 秒发起一次、每次卡 2.7 秒，前一次没回来下一次又发出去。

**为什么症状是「记录不更新」而不是「整体卡死」**：2.7 秒的等待不烧 CPU，只是把 Node 事件循环堵住。动画/滚动走合成层（GPU）不经过这条路 → 看着正常；新消息要经 JS 事件循环才能进 React → 被堵 → 记录不动。

这也解释了 `top` 里 CPU 只有 30%：**它不是在算，是在等。**

## 修法

把「每个实例问一次」改成「整个进程问一次」——结果存 `globalThis.__DSH_FT_CACHE__`。

## 用法

```bash
# 打补丁（扫 ~/.dsh/profiles 下所有 ds-harness-remote）
node apply-remote-describe-cache.mjs

# 指定目录
node apply-remote-describe-cache.mjs /path/to/profiles

# 撤销
node apply-remote-describe-cache.mjs --revert
```

脚本行为：找不到原始代码块 → 报 `[fail]` 不改；改完 `node --check` 不通过 → 自动回滚；已打过 → 报 `[ok]` 跳过。备份后缀 `.bak-describe-cache`。

## 双端状态（2026-11-23 19:53）

| 机器 | 路径 | 状态 |
|---|---|---|
| Windows | `.dsh/profiles/desktop/node_modules/ds-harness-remote/dist/remote-typert-gateway.js` | 已打 |
| Windows | `.dsh/profiles/web/node_modules/ds-harness-remote/dist/remote-typert-gateway.js` | 已打 |
| Linux | `.dsh/profiles/web/node_modules/ds-harness-remote/dist/remote-typert-gateway.js` | 已打 |

## 为什么不用 git 提交

`~/.dsh/.gitignore` 第 30 行 `**/node_modules/` 把 node_modules 整个挡在版本控制外，**这个改动 git 看不见**。所以持久化只能靠本脚本：**重装 / 升级 `ds-harness-remote` 之后必须重跑一次**。

## 生效条件

改完要**重启 dsh**（桌面端或 `dsh web`）。

## 验证

改完重启，看 `~/.dsh/logs/ds-harness-remote/host.log` 里 `transport.describe` 的次数：

```bash
python3 -c "
import re,collections
c=collections.Counter()
for l in open('host.log',encoding='utf-8',errors='ignore'):
    m=re.search(r'host rpc ok \{\"method\":\"([^\"]+)\"',l)
    if m: c[m.group(1)]+=1
print(c['harness.transport.describe'])
"
```

预期：从「每 3 分钟 35 次」降到**进程生命周期内 1 次**。

## 上游

这是 `ds-harness-remote` 的缺陷（探测结果没做进程级缓存），值得报给插件作者。补丁位置和行号都很稳定（`remote-typert-gateway.js` 第 177 行起的 5 行）。
