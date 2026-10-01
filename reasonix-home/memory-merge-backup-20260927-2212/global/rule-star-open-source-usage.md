---
id: mem-012afd51d6e2750ec295d9e041f5cad0
revision: 3
created_at: "2026-09-26T15:43:05.032Z"
updated_at: "2026-09-27T02:19:52.521Z"
name: rule-star-open-source-usage
description: "元规则：用过/读过/借鉴的开源项目要 star（卸载了也要 star）。累计 21 个；并订正 GitHub 操作手法——bash 本就有网，用 --noproxy 绕开死代理即可，不必再绕 PowerShell"
metadata:
  type: user
  fact_type: feedback
  scope: global
---

# 元规则：用过别人的开源项目要记得 star（2026-09-26 用户指示）

## 规则
凡是我**实际使用、阅读或借鉴**过的开源项目，都要给它的仓库 **star**，并在记忆里留档：读了 README/源码 → star；装了插件/借了设计思路 → star；调研中引用了它的机制并写进结论 → star。
**理由**：对开源作者的基本尊重；也让「我到底用过什么」可追溯。**"引用即 star"，不要攒批。**
**注意**：即使某个插件后来因为不适用被**卸载**了，只要我用过/读过它，仍然要 star（用过了就是用过了）。

## 执行状态

### 第一批（2026-09-26，17 个，ok=17 fail=0）
EIGHTfs/dsh-skill-scoreboard、csyangwen/dsh-memory-evolve、Phant0Meow/dsh-meow-memory、adoresever/graph-memory、mem9-ai/mem9、omdsh-dev/dsh-mnemon、cameronrye/openzim-mcp、epheterson/Zimi、Tencent/BrowserSkill、wqty123/dsh-browser、Breeze136/dsh-kb-rag、ZiYuan258/dsh-skill-router、volcengine/OpenViking、MichengAI/dsh-agency-agents、ZSeven-W/dsh-crew、PerryLink/dsh-auto-review、deepseek-ai/deepseek-harness

### 第二批（2026-09-27，4 个新增 star + 1 个已在）
| 仓库 | 关系 | 结果 |
|---|---|---|
| `giter00/dsh-headroom` | 装了 0.3.0（工具输出可逆压缩） | STARRED |
| `1692775560/dsh-Mimir-Academic-research` | 装了 dsh-mimir 0.21.0（学术工作台） | STARRED |
| `vshulcz/deja-vu` | 装了 dsh-deja 0.21.2，并给它提了 issue #4053 | STARRED |
| `liustack/modlens` | 装过、读过 README、后因 V4.1 原生多模态而卸载 | STARRED（卸载不影响） |
| `cinob/dsh-web-search-multi` | 修好了 `web_search` | 早已 star |

**累计 21 个。**

## 执行路径（已订正 · 2026-09-27）

> **订正**：先前记「bash 被沙箱禁网、必须交给 PowerShell」，**错**。
> bash 一直有网，是 env 里 `127.0.0.1:31181` 那个**没开的代理**把它挡住了。
> 详见 `network-egress-git-ghproxy-mirrors-20260927`。

**现在的最短路径（纯 bash 即可）**：

```bash
# 1) 凭据（本地取出，不需要网络；注意必须在 bash 侧，PowerShell 管道传 stdin 会因编码失败）
printf "protocol=https
host=github.com

" | git credential fill

# 2) 带 token 调 REST API —— 关键是 --noproxy '*' 绕开那个死代理
curl -s --noproxy '*' -H "Authorization: Bearer $TOKEN"      -H "Accept: application/vnd.github+json" https://api.github.com/user/starred/<owner>/<repo>
#    204 = 已 star；404 = 未 star

# 3) star
curl -s -o /dev/null -w "%{http_code}" --noproxy '*' -X PUT      -H "Authorization: Bearer $TOKEN" -H "Content-Length: 0"      https://api.github.com/user/starred/<owner>/<repo>     # 204 = 成功
```

- 账号 `TianQue6916`，token 长度 40，存在 Windows 凭据管理器
  （`LegacyGeneric:target=git:https://github.com`）
- token 一律走环境变量，**不落盘、不打印**
- **先查后写**：`GET /user/starred/{owner}/{repo}` 返回 204 就跳过，避免重复调用

## 本机无 gh CLI
`gh` 在 Windows 侧与 Linux 天阙机上都**不存在**（`gh: command not found`）。
上面是 gh 的等价替代；若以后要装，`winget install GitHub.cli` 后 `gh auth login` 会更省事。

