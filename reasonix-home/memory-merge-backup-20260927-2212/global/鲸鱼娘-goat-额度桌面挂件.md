---
id: mem-fdf52df66279e34a4126623765fdc491
revision: 3
created_at: "2026-09-24T01:42:16.2134397Z"
updated_at: "2026-09-24T03:06:55.752454Z"
name: 鲸鱼娘-goat-额度桌面挂件
description: 鲸鱼娘三人组挂件 v3：改分层窗口实现真透明、尺寸缩到 400x228、三人统一为 openpet-ai-girls 画风（含 6 个 DPI/截屏/编译踩坑）
metadata:
  type: user
  fact_type: reference
  scope: global
---

## v3（2026-09-24）：真透明 + 缩小 + 统一画风
用户三步反馈：①「太违和」（女仆装鯮鱼娘与 openpet 三视图风不搭）②「还有一个背景」③「太大」→ 本轮全改：

| 项 | v2 | **v3（当前）** |
|---|---|---|
| 尺寸 | 620x352 | **400x228** |
| 背景 | 深蓝圆角卡片 | **无（逐像素透明，角色浮在桌面）** |
| DeepSeek 形象 | DSniang1 女仆装（画风不一致） | **openpet-ai-girls 同系列蓝发少女** |
| 素材 | 原始尺寸 | Pillow 预缩放到帧高 118 + alpha 硬化 → `assets\pets\{deepseek,chatgpt,gemini}-small.png`（帧宽 82/60/69） |

## 透明实现：分层窗口（唯一可行路径）
- C# 新增 `LayeredForm : Form`：`CreateParams` 加 `WS_EX_LAYERED (0x80000)` + `UpdateLayeredWindow` + `BLENDFUNCTION(AC_SRC_OVER, AC_SRC_ALPHA)`
- 缓冲区**必须是 `PixelFormat.Format32bppPArgb`（预乘 alpha）**；`WhalegirlWidget` 拆出 `public void RenderTo(Graphics)` 供分层窗体重用，控件自身不再加入窗体（`Host`/`Renderer` 双向引用）
- PS 侧：`New-Object LayeredForm`、`$widget.Host = $form` / `$form.Renderer = $widget`、不放 Controls、鼠标事件改绑 `$form`、拖动时调 `$form.Redraw()` 保证跟手

## 本轮踩的坑（都很值得记）
1. **TransparencyKey 方案整体失败**：`BackColor=Magenta + TransparencyKey=Magenta` 下整窗不可见（即使移除与它冲突的 `Opacity<1` 也一样）；控件渲染正常（DrawToBitmap 有图）但屏幕上看不到 → 放弃
2. **Add-Type 编译错误会让挂件静默不启动**：我把 `Log()` 方法插到了错误的类里 → C# 编译失败 → `Add-Type` 报错 → 脚本退出 → 现象是“挂件消失”。**改 C# 后必须先用单独进程跑一遍 Add-Type 验证编译**，否则会误判为“窗口看不见”并白查好几轮
3. **BitBlt / CopyFromScreen 抓不到 WS_EX_LAYERED 窗口内容**（加 CAPTUREBLT 也不行）；沙箱 `EnumWindows` 也看不见用户桌面的窗口 → **分层窗口只能靠 `UpdateLayeredWindow` 返回 True + 日志自证**，最终效果必须让用户看一眼确认
4. **`Screen.WorkingArea` 与 `Bounds` 在 DPI 缩放下不一致**（本机 1707x1067 vs 1600x960）→ 默认位置与合法性校验统一改用 `Bounds`（与窗口定位同一坐标系），否则窗口会被推到屏幕右下角之外
5. **位置校验阈值太宽**：只要 60x60 在屏内就接受（窗口曾存在 (1287,831) 大部分在屏外）→ 改为要求 **≥70% 面积**在某个屏幕内
6. **改位置文件的顺序**：必须先杀挂件进程再删 `%LOCALAPPDATA%\goat-tray-pos.json`，否则 `FormClosing` 会把旧位置回写

## 诊断落点（保留了）
- `D:\Toolbox\goat-gateway\logs\tray.log`：启动位置/尺寸/Visible/绑定状态
- `D:\Toolbox\goat-gateway\logs\layered.log`：每次 Redraw + `UpdateLayeredWindow ok/err/size/pos`（本轮实测 ok=True、err=0）

## 当前状态
- 动画：三帧循环 + 浮动 + 数字滚动 + 点击弹跳（Redraw 日志 40+ 次/分钟，证明活着）
- 交互：双击刷新 / 单击弹跳 / 右键（刷新·置顶·大小·退出）/ 拖动跟手 / 托盘双击显隐
- Windows 侧无法由沙箱截屏验证，**透明效果待用户在桌面确认**
