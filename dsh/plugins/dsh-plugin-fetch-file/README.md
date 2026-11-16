# dsh-plugin-fetch-file

给 dsh 一个 `fetch_file` tool：自适应多连接的 HTTP(S) 下载器。

## 为什么需要它

dsh 没有下载管理器层（2026-11-12 实测 + 源码确认）：

| 下载场景 | 实际走的 | 并发模型 |
|---|---|---|
| `dsh plugin add` | 转发 pnpm（`@deepseek-ai/dsh/lib/plugin-BiveYA7h.js:92`） | 多请求并发，单文件单流 |
| agent 下文件 | bash 的 curl / pwsh / Node fetch | 单流 |
| 模型（ollama） | `server/download.go`，`numDownloadParts=16`，但 part size clamp 到 `[100MB,1000MB]` | 274MB 模型只开 3 路 |
| HF 权重（transformers.js） | 单流 | 单流 |

本机实测（2026-11-12）：

- 总带宽天花板 **~3.4 MB/s（27 Mbps）**：npmmirror 单流 3.05、4 路分段 3.79（+24%）、4 个不同包并发合计 3.44。
- 跨境源是 BDP 限速，不是总带宽：registry.ollama.ai（RTT 330 ms）1/4/8/16 路 = 0.10 / 0.70 / 0.86 / **1.89** MB/s（19×）；hf-mirror 1/4/8/16 = ~1.4 / 2.01 / 2.38 / 3.16。
- huggingface.co 直连 `code=000`（不通，不是慢）；hf-mirror.com 通。ollama blob 支持 `Range`（偏移 5MB 处返回不同字节）。

所以并发数必须是**运行时决策**：`ariafetch.py` 先用一条流探测 2 s，只有探测速率低于 `--fast-mbps`（默认 2）才 fan out。

## 组成

- `lib/index.js` — Cordis host 插件，注册 `fetch_file`（零 `@deepseek-ai/*` 依赖，纯 JSON Schema 声明）。
- `cordis.patch.yml` — bundle patch，`insert` 一行 `tool-fetch-file`。
- `../../../Users/27063/.dsh/storages/tools/ariafetch.py` — Python sidecar：分段并发 + 断点续传（`<out>.partN`）+ 长度 / sha256 校验。
- `sync.py` — 把插件复制进各 profile 的 `node_modules/@local/`。

## 部署（本机已完成）

1. `~/.dsh/profiles/<name>/package.json`：`dependencies` 加 `"@local/dsh-plugin-fetch-file": "file:D:/Toolbox/dsh-plugin-fetch-file"`，**并把包名加进 `dsh.profile.bundles`** —— bundle 列表是显式的，只加 dependencies 不会被加载（2026-11-12 踩过）。
2. `node_modules/@local/dsh-plugin-fetch-file/` 放一份副本（`python sync.py`）。
3. 开 **新会话** 生效（`cordis.patch.yml` / profile package.json 都 live，但工具 row 在会话创建时装配）。

## 坑（都实测过）

- dsh shell 在 Low IL：`mklink /J` 与 `os.symlink` 都报 WinError 5 / 1314，**建不了** reparse point → 只能复制，改完源码跑 `sync.py`。
- `pnpm add file:` 在 **desktop profile 被拒**（Electron 独占该 profile，exit 1 无输出）；web 可以。
- bootstrap 阶段工具面只有 `bootstrapTools` 那 4 个：`fetch_file` 要先 `dev_tool_search({ toolNames: ["fetch_file"] })` 解锁（desktop persona 规则 13 已写明）。

## 用法

```bash
python ~/.dsh/storages/tools/ariafetch.py URL -o OUT [--parts 16] [--probe-secs 2] [--fast-mbps 2]
                                               [--sha256 HEX] [--parallel | --single] [-q]
# stdout 一行 JSON；stderr 是进度条
```

tool 侧：`fetch_file({ url, out, sha256?, parts?, parallel?, single?, probeSecs?, fastMbps? })`

## 环境坑：D:\Toolbox 是 JUNCTION

`D:\Toolbox` 是指向 `D:\80-系统\Toolbox` 的 junction（2026-07-31）。在这个路径下：

- `bash` 的重定向 / `echo >>` / `mv` **可以**写文件；
- Python（3.13.9）的 `open(path, 'w')` / `open(path, 'r+')` 抛 `PermissionError: [Errno 13]`，即使 `attrib` 只有 `A`、`os.access(W_OK)` 返回 True、`icacls` 无异常。
- 对 Dedicated `sync.py` 写目标是 `~/.dsh/...`（非 junction），**不受影响**。

在这棵树下改源码的正确写法：

```bash
python - <<'PY' > file.new   # bash 负责打开/写入
...print(new_content, end='')
PY
mv -f file.new file
```
