import { remember } from './remember.mjs'
const body = `# 本机出网拓扑实测（bash / git / 代理）——2026-09-27【已订正】

> **订正说明**：本条先前记录「bash 无网、github.com 直连不通、必须走 gh-proxy」，
> **三条全错**。错因是每次测试都被 env 里那个**已经挂掉的代理**污染。
> 2026-09-27 用 \`--noproxy '*'\` 控制变量后重测，真实结论如下。

## 一、结论：本机**直连出网完全正常**，唯一的问题是 env 里指了一个**没开的代理**

| 目标 | 带 env 代理（死） | \`--noproxy '*'\` |
|---|---|---|
| \`https://api.github.com\` | **000** | **200** |
| \`https://github.com\` | **000** | **200** |
| \`https://gh-proxy.com/\` | 000 | **200** |
| \`https://registry.npmmirror.com\` | 000 | **200** |

→ **github.com 没有被墙，本机可以直连。** 之前的「GFW 阻断」判断是误判。

## 二、真正的根因

环境里有一组代理变量：

\`\`\`
HTTP_PROXY / http_proxy   = http://127.0.0.1:31180
HTTPS_PROXY / https_proxy = http://127.0.0.1:31181
NODE_USE_ENV_PROXY=1
\`\`\`

而 **31180 / 31181 当前没有进程在监听**：

\`\`\`
bash: connect: Connection refused        # /dev/tcp/127.0.0.1/31181
netstat: 只有一堆 SYN_SENT 的半开连接
\`\`\`

**这一组变量是「客户端 VPN / Clash 类软件」留下的；软件没开，变量还在**，
于是所有尊重 env 的工具（\`curl\`、\`node fetch\`、\`npm\`、\`pnpm\`）全部被导向一个死端口 → 000。

## 三、为什么 git 一直「没事」：\`~/.gitconfig\` 用**空值**覆盖了 env

git 优先级是 **配置文件 > 环境变量**，而 \`~/.gitconfig\` 里写着：

\`\`\`
http.proxy                             (空值)
https.proxy                            (空值)
http.https://gitee.com.proxy           (空值)
http.https://e.coding.net.proxy        (空值)
http.https://codeup.aliyun.com.proxy   (空值)
\`\`\`

显式空值 = 「这条 URL 不走代理」 → git **完全无视** env 的 31181，直接连。
所以 git 全程正常，只有 curl/node 挂 —— 这就是那个「同一个网络，git 能通、curl 不能」怪现象的答案。

## 四、\`gh-proxy.com\` 重写的真实定位：**可选加速，不是生命线**

\`~/.gitconfig\` 里有：

\`\`\`
url.https://gh-proxy.com/https://github.com/.insteadOf = https://github.com/
\`\`\`

先前记为「本机访问 GitHub 的唯一通道，必须保留」—— **错**。实测把代理变量清干净后：

\`\`\`
git ls-remote https://github.com/giter00/dsh-headroom HEAD   →  成功
\`\`\`

**直连 GitHub 就能 clone/fetch。** 这条重写的作用退化为「走国内镜像可能更快/更稳」。

实测可用镜像（均为直连可达）：\`gh-proxy.com\` / \`ghproxy.net\` / \`ghfast.top\` / \`ghproxy.cc\`；
不可用：\`gh.llkk.cc\` / \`github.moeyy.xyz\`。

**已知副作用**：gh-proxy.com 会**间歇性 403**（\`Web page content is not allowed...\`）。
发生在 \`pnpm install\` 拉 \`git+https://github.com/...\` 依赖时，**几分钟后重跑即成功**。
→ 判据：git 依赖装失败先重试。

## 五、可复用手法（这是本条最值钱的部分）

**1. 遇到「工具连不上网」，先怀疑代理，不要先怀疑墙。**

\`\`\`bash
curl -s -o /dev/null -w "%{http_code}\n" --noproxy '*' https://example.com   # 绕开 env 代理
env -u https_proxy -u HTTPS_PROXY -u http_proxy -u HTTP_PROXY <cmd>          # 给 node/npm 用
\`\`\`

**2. 测试网络时绝不能随手加 \`GIT_CONFIG_GLOBAL=/dev/null\`。**
它会连「空 proxy」覆盖一起删掉，让 git 掉回 env 死代理，
于是**四个可用镜像全部误报 FAIL**（这次就踩了，白写了一轮错误结论）。
要测「直连是否可行」，正确姿势是 **清 env 代理变量**，而不是清 git 全局配置。

**3. \`000\` 和 \`403\` 是两种完全不同的故障。**

| 现象 | 含义 |
|---|---|
| \`000\` | **连接建立失败** —— 代理死了 / DNS / 端口。与目标站点无关 |
| \`403\` + 有响应体 | 连接通了，**对端拒绝** —— 限流、策略、URL 形态 |

先前把二者混为一谈，才得出「墙 + 必须走镜像」的错误模型。

**4. \`dsh plugin\` 子命令就是 pnpm 的 passthrough**
（\`dsh plugin --profile web --help\` 打印的是 pnpm 帮助），pnpm 行为可直接套用。

**5. 装插件前先备份 \`package.json\` + \`pnpm-lock.yaml\`**，失败可秒回滚。

## 六、PowerShell 那条旧结论也要降级

先前记「bash 被禁网、只有 PowerShell 能出网」。现在看：
**PowerShell 能出网，是因为它读的是 Windows 系统代理设置，而不是 env 里那两个坏地址。**
bash 从来就有网，只是被 env 代理挡住了。

→ 结论修正：**bash 用 \`--noproxy '*'\` 是最顺手的出网方式，不必再绕 PowerShell。**
`
console.log(await remember({
  name: 'network-egress-git-ghproxy-mirrors-20260927',
  description: '【已订正】本机直连出网完全正常：env 代理 127.0.0.1:31181/31180 是死的（VPN 未启动）故 curl/node 全 000，--noproxy 即 200；git 因 ~/.gitconfig 里空 proxy 覆盖 env 而一直正常；github.com 未被墙、直连可 clone，gh-proxy 重写只是可选加速且有间歇 403；含 000 与 403 的区分判据与测试禁忌',
  factType: 'reference',
  body,
}))
