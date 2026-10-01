---
id: mem-725f3138121e5da9701a256d75263c9a
revision: 5
created_at: "2026-09-27T02:17:58.600Z"
updated_at: "2026-09-27T02:35:22.638Z"
name: network-egress-git-ghproxy-mirrors-20260927
description: "【二次订正·已定位真因】curl 的 000 不是连不上、也不是代理死了，而是 dev-sidecar 做 MITM 导致证书信任失败（-v 可见 CONNECT 200 + Proxy-agent: dev-sidecar；curl -k 即 200，git 因 .gitconfig 里 sslVerify=false 而通）；我先前两次误判都源于采样到边车重启窗口；含 URL 级配置绕行正解、000/403/TLS 三分法与「不要重复写别人已写的记忆」纪律"
metadata:
  type: user
  fact_type: reference
  scope: global
---


# 本机出网拓扑实测 —— 2026-09-27【二次订正·已定位真因】

> **本条改过两次，两次都错，最终真因见第二节。**
> 第一版：「bash 无网、github 被墙、必须走 gh-proxy」← 错
> 第二版：「env 代理 127.0.0.1:31181 是死的」← **也错**
> **两次都源于同一个方法论错误：拿一次采样当稳态，没确认后台进程是否正在重启。**

## 一、真因：dev-sidecar 是 MITM 代理，000 是**证书信任**失败，不是连不上

现场（`curl -v`）：

```
> CONNECT api.github.com:443 HTTP/1.1
< HTTP/1.1 200 Connection Established
< Proxy-agent: dev-sidecar
* CONNECT tunnel established, response 200
* schannel: disabled automatic use of client certificate
```

**隧道建得好好的**（200 Connection Established）。dev-sidecar 在 31180/31181 上做 MITM，
用**它自己的根证书**签发。而：

| 工具 | 证书验证 | 结果 |
|---|---|---|
| `curl`（默认，Windows 上是 **schannel**） | 开 → 不认边车的 CA | **000** |
| `curl -k` | 关 | **200** |
| `curl --noproxy '*'` | 绕过代理直连 | **200** |
| `git` | **关**（因为 `~/.gitconfig` 里有 `sslVerify = false`，**边车自己写的**） | **200** |

**所以 `000` 的含义要重新定义**：它不一定是「连不上」，
也可能是「连上了但 TLS 验证没过」。**`curl` 与 `git` 在同一个网络下的差异，
根因是两者的证书验证策略不同，不是网络不同。**

## 二、我为什么会误判「代理是死的」

- 我执行 `exec 3<>/dev/tcp/127.0.0.1/31181` 得到 **Connection refused**
- 同时 `~/.gitconfig` 里的 `[http]/[https] proxy` 那一瞬**是空的**

两次采样都落在 **dev-sidecar 的重启窗口**里：它的 `.gitconfig` mtime 是
**10:13:52.947**，而我的测试就在 10:12~10:14 —— 边车重启时会先清空/重写配置，端口短暂不监听。
**现在（同一台机，几分钟后）**：

```
dev-sidecar.exe  x5 个进程在跑
31180: OPEN   31181: OPEN
```

## 三、最重要的操作纪律：**不要手改 `[http] proxy`**

**dev-sidecar 每次启动都会重写 `~/.gitconfig` 与 `~/.npmrc` 的代理项**
（`proxy=http://127.0.0.1:31180`、`sslVerify=false`、npm 侧 `proxy/https-proxy/strict-ssl`）。
手改必被覆盖。

**正解是 URL 级配置**（优先级高于全局 `http.proxy`，且边车不碰）：

```bash
git config --global 'url.https://gh-proxy.com/https://github.com/.insteadOf' 'https://github.com/'
git config --global 'http.https://gh-proxy.com/.proxy' ''          # 空 = 该 URL 直连
git config --global 'http.https://gh-proxy.com/.sslVerify' 'true'  # 镜像路径恢复证书验证
```

> 姊妹条（reasonix 侧同一天写的，更细）：
> `dev-sidecar-覆盖-gitconfig-与-npmrc-URL级配置绕过-20260927`
> —— 含边车写配置的铁证、ghurl/ghdl 函数、以及**release 大文件走镜像快 20~90 倍**
> （`objects.githubusercontent.com`：边车 45→9.8 KB/s 超时；直连 258→47 KB/s 不稳；**镜像 882~942 KB/s 稳**）。
> **不要重复造这条；以那条为准。**

## 四、仍然成立的实证（与上两版一致的部分）

| 结论 | 证据 |
|---|---|
| **github.com 直连可达，没有被墙** | `curl --noproxy '*' https://github.com` → 200；`git ls-remote` 直连成功 |
| **`--noproxy '*'` 是最省事的绕行** | 上述所有目标都变 200 |
| **gh-proxy 镜像可用，且有多个 fallback** | `gh-proxy.com` / `ghproxy.net` / `ghfast.top` / `ghproxy.cc` 实测可达；`gh.llkk.cc` / `github.moeyy.xyz` 不可达 |
| **npm 走 npmmirror，与上面这条线无关** | `npm view dsh-mimir version` → 0.21.0 秒回 |
| **gh-proxy.com 会间歇 403** | `pnpm install` 拉 git 依赖时见过；**重跑即成功** |

## 五、`000` / `403` / TLS 三种故障必须分开

| 现象 | 含义 | 判据 |
|---|---|---|
| **000** | 连接**或** TLS 没走完 | 加 `-v` 看是 `Connection refused`（真连不上）还是 `CONNECT 200` 之后断（**证书**问题） |
| **403** + 有响应体 | 连上了，对端拒绝 | 限流 / 策略 / URL 形态 |
| TLS 验证失败 | 连上了，证书不认 | 试 `-k`；过了就是证书问题 |

**混为一谈就会得出「墙」或「代理死了」这类错误模型** —— 我两条都犯过。

## 六、元层面教训（比结论本身重要）

1. **一次采样不是稳态。** 机器上跑着 5 个 `dev-sidecar.exe`、会重写配置、
   有它自己的重启窗口。**下机制结论前先问「这个观测会不会是瞬态」**，
   并且**隔几分钟复测一次**（我这次就是复测才发现前后不一致）。
2. **同机两个工具行为不同时，先怀疑「策略差异」而不是「网络差异」。**
   `curl` 挂 / `git` 通，第一嫌疑是证书与代理配置，不是链路。
3. **看到 `nginx`/`dev-sidecar` 之类的 `Proxy-agent` 响应头，就该想到 MITM。**
4. **别人已经写过的东西不要再写一遍。** reasonix 今天已经写了边车那条，
   我差点又写一份——**先看索引，再决定是「新增」还是「引用」。**

