# 凭据拓扑（值不入库，只记位置与取法）

> **红线**：`~/.dsh/skills/**` 全被 `~/.dsh` 这个 git 仓跟踪，而该仓内容会以 `dsh-reasonix-agent` 推送到 GitHub。
> 因此这份文件里**只有路径和取法，没有 secret 值**。真值只在下面第 1/2 条标出的地方。

## 1. HTTPS PAT —— Windows Credential Manager（GCM 托管，主来源）

| 项 | 值 |
|---|---|
| helper | `git config credential.helper` → `manager`（Git Credential Manager） |
| Target 1 | `LegacyGeneric:target=git:https://github.com` · User `TianQue6916` |
| Target 2 | `LegacyGeneric:target=GitHub - https://api.github.com/TianQue6916` · User `TianQue6916` |
| 类型 | **OAuth App token**（40 字符，`gho_` 前缀；**不是** classic `ghp_` PAT） |
| Scopes | `gist`, `repo`, `workflow`（2026-11-02 用 `X-OAuth-Scopes` 响应头实测） |
| 创建/轮换 | `gho_` 无法在 Personal access tokens 页 regenerate → GitHub → Settings → Applications → **Authorized OAuth Apps** 撤销后重新授权 |

取法（非交互、不落盘）：
```bash
cred=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill 2>/dev/null)
tok=$(printf '%s\n' "$cred" | sed -n 's/^password=//p')
```
`git credential fill` 会调 GCM，**在无 GUI 的 shell 里可能挂住** → 加 `timeout 10`，失败则走第 2 条。
写入/更新：`printf 'protocol=https\nhost=github.com\n\npassword=<NEW_TOKEN>\n' | git credential approve`

## 2. 备用 PAT —— dsh 自己的 credential store

| 项 | 值 |
|---|---|
| 文件 | `C:\Users\27063\.dsh\.credentials.yaml`（**已被 `.gitignore` 排除**） |
| 键 | `records:` → `dsh-mnemon/github` → `payload.accessToken`（40 字符），`payload.login = TianQue6916`，`payload.scopes = [repo]` |
| 与 GCM 的关系 | **两把不同的 token**：GCM 那把 scopes 更宽（gist/repo/workflow），这把只有 repo（实测 `X-OAuth-Scopes: repo`） |
| 来源 | dsh mnemon 的 GitHub OAuth 流程，`savedAt` 记录落盘时间 |
| 同文件内其它键 | `client-connection/browser-session.secret`(43)、`deepseek-account-platform/default.token`(64)、`deepseek-account-platform/device.id`(36) —— **与 GitHub 无关，别混用** |

解析（用 python，避免引 yaml 依赖）：
```python
python - <<'PY'
import re,pathlib
t=pathlib.Path(r'C:\Users\27063\.dsh\.credentials.yaml').read_text(encoding='utf-8')
m=re.search(r'dsh-mnemon/github:.*?accessToken:\s*(\S+)',t,re.S)
print(m.group(1) if m else '')
PY
```

## 3. SSH key（推送主通道，推荐）

| 项 | 值 |
|---|---|
| 私钥 | `C:\Users\27063\.ssh\id_ed25519`（无 `.pub` 外的额外文件；2026-04-16 生成） |
| 公钥 | `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKNtnGezfXMHtcAbMxFJ7BR6TUqeiRCEx1MDFu59fYkA 2706352190@qq.com` |
| 用途 | GitHub（`Host github.com` → `ssh.github.com:443`）**与** 天阙 Linux 机（`tianque` / `tianque-lan`）复用同一把 |
| 指纹验证 | `ssh-keygen -lf ~/.ssh/id_ed25519.pub` |
| 连通验证 | `ssh -T git@github.com` → `Hi TianQue6916!`（2026-11-02 实测通过） |

`~/.ssh/config` 关键段：
```
Host github.com
  HostName ssh.github.com
  Port 443
  IdentityFile C:\Users\27063\.ssh\id_ed25519
```
> 一把 key 同时服务 GitHub 与个人 Linux 机 = 单点失效。若某天要最小权限，建议给 GitHub 单独生成一把（`ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_github`）并在 config 里给 `github.com` 单独指认。

## 4. 其它相关但非 GitHub 凭据（记录，防误用）

- `~/.dsh/local-search-token`（git-ignored）：本地搜索服务 token，与 GitHub 无关。
- `~/.ssh/github_key.tmp`：**0 字节残留文件**（2026-06-03），可删。
- 全局代理凭据：无（`127.0.0.1:31180/31181` 是本地代理客户端，无认证）。

## 5. 泄漏处置（发现 token 已进 git 历史时）

1. **先吊销**：GitHub → Settings → Developer settings → Tokens → Delete/Regenerate（历史清洗永远慢于吊销）。
2. 换新 token → `git credential approve` 更新 GCM。
3. 再清洗历史：`git filter-repo --path <file> --invert-paths` 或 `--replace-text`，然后 `force push`。
4. 若是 SSH 私钥泄漏：从 GitHub / 天阙机 `~/.ssh/authorized_keys` 移除旧公钥，重新 `ssh-keygen`。
