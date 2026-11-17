# Linux 端 computer use / browser use

给 TianQue Linux 装上**与 Windows 侧等价**的两条通道。Windows 侧的 `dsh-computer-use-win`
是 `os: ["win32"]` 的，Linux 上装都装不上，所以是换实现而不是搬包。

## 一、换什么

| 能力 | Windows（现在这套） | Linux（要装的） |
|---|---|---|
| 桌面看+操作 | `dsh-computer-use-win`<br>`mcp__wincu__*`，25 个工具 | [`@BruceZhang1993/dsh-computer-use-linux`](https://github.com/BruceZhang1993/dsh-computer-use-linux)<br>`mcp__cul__*`，18 个工具 |
| 网页看+操作 | 同上的 browser lane（CDP） | [`@ricardochen1996/dsh-browser-use`](https://github.com/ricardochen1996/dsh-browser-use)<br>DSH browser provider，`browser_*` 工具 |

两个插件在 Linux 上的底层对应关系：

| 环节 | Windows 的实现 | Linux 的实现 | 是否等价 |
|---|---|---|---|
| 控件树 | UI Automation（`IUIAutomation`） | **AT-SPI2**（D-Bus 无障碍总线） | 概念等价，都是"按语义读控件而不是猜像素" |
| 截图 | `PrintWindow` / `BitBlt` | `grim`（Wayland）/ `import`、`scrot`（X11） | 等价 |
| OCR | WinRT OCR（系统自带） | `tesseract` | 等价，都要装 |
| 键鼠注入 | `SendInput` / `WM_CHAR` | `xdotool`（X11）/ `ydotool`、`wtype`（Wayland） | 等价 |
| 窗口管理 | `SetWindowPos` / `WM_CLOSE` | `wmctrl` / `xprop` / 合成器协议 | 近似 |
| 网页通道 | CDP | CDP | **同一个协议** |

## 二、为什么是这两个

- 桌面：Linux 侧目前**唯一**"AT-SPI 树 + 窗口定位 + Wayland/X11 输入 + 截图"齐活并且桥进 DSH 的插件。其它候选要么只做浏览器（`hanzhangzzz/dsh-computer-use`），要么只在 X11 下靠坐标瞎点（`asdasdsdsdasdasdasd/dsh-computer-use`，明确写了 "no accessibility framework"），要么是 Cua Driver 内核的跨平台包（`dsh-plugin-computer-use` v2.5.2，也要 Rust 原生库，且 browser 那半仍是空的）。
- 浏览器：`dsh-browser-use` 是 DSH 的 **browser provider**（不是 MCP 工具集），走真实 Chrome + CDP，**Linux 上 attach 模式比 Windows/macOS 都顺** —— 它靠 Chrome 写在 profile 里的 `DevToolsActivePort` 自动找到你正在用的浏览器，登录态直接用；macOS 那个文件受隐私保护需要"完全磁盘访问权限"，Linux 没有这个限制。

## 三、跑

```bash
cd ~/.dsh/linux-edition
bash install-linux-gui.sh deps      # ① 只查依赖，不写任何东西
bash install-linux-gui.sh desktop   # ② 装桌面通道
bash install-linux-gui.sh browser   # ③ 装浏览器通道
bash install-linux-gui.sh verify    # ④ 看配置层是否挂上
```

第一次请**逐阶段跑**，别 `bash install-linux-gui.sh` 一把梭 —— 每阶段失败就停，报错原文比全量日志好定位。

回滚：`bash install-linux-gui.sh rollback`（按最近一次 `~/.dsh/_repair-backup-linux-gui-*` 还原 profile 文件；插件本体不卸）。

`~/.dsh` 如果不是同一份 git 仓库，把整个 `linux-edition/` 目录 scp 过去即可，脚本不依赖仓库路径。

## 四、装完要重启 DSH 并验一件事

重启后开一个**全新会话**，工具列表里应直接出现 `mcp__cul__*` 那一批，**不需要先 `dev_tool_search`**。

这一条是 2026-11-17 修的那个坑的延续：`anchored-standard` 的 `tool-bootstrap.mjs` 会把不属于
resident 集合的第三方 MCP 工具**全部裁掉**，Windows 侧就是因此"装了却看不见"。现在
`GUI_RESIDENT_RULES` 里同时有 Windows 的 5 个精确名字和 Linux 的 `mcp__cul__*` 通配，
两边都默认可见；看不到就是这条没生效，先查 profile 引用的 `tool-bootstrap.mjs` 是不是同一份。

## 五、已知差距（不假装完全一样）

1. **没有等价于 Windows 的"浮窗 + Esc 急停 + 鼠标旁光斑"那套 UI**（`computer-use-linux` 未提供，未检验）。急停变成 Ctrl-C / 杀进程。
2. **没有"审批弹窗"**：Windows 那套对敏感操作（带参数启动程序、上传本机文件、连接你自己的浏览器）会先问你；Linux 这套按上游实现走，未见同等机制。
3. **工具名和参数不同**：模型要按 `mcp__cul__*` 自己的语义来调，不能照搬 `windows_computer_use_*` 的入参。插件随包带 skill，先读再动。
4. **Wayland 的输入注入要额外权限**：`ydotool` 需要 `/dev/uinput`（`sudo usermod -aG input $USER`，重登录生效）。没权限时表现为"点了没反应"。
5. **写这个脚本时在 Windows 上，Linux 侧一次没跑过。** 每条命令都按上游文档写，但没实测；每阶段都是"探测 + 一条可回滚的写"，所以第一次请逐段跑。

## 六、它跟你 Linux 上已有的东西的关系

- `~/.dsh/_linux-dsh-fix/dsh-linux-fix.sh` 仍然先跑：它会把 `dsh-computer-use-win` 这类
  `os` 排除 linux 的包判成 `WINONLY` 并从 `bundles` 里剔掉。**先修完兼容性，再装新的**，
  否则一堆 `Plugin ... is incompatible` 会盖住真正的报错。
- 桌面通道依赖 `@deepseek-ai/dsh-mcp-client`，官方 profile 都自带，不用另装。
