---
id: mem-1a08d66c399a42bdd77cbb714bc68c48
revision: 1
created_at: "2026-11-17T09:47:03.978Z"
updated_at: "2026-11-17T09:47:03.978Z"
name: GUI-操作约定-优先副屏与浏览器通道
description: "Windows GUI 自动化的操作约定：browserTab 优先、物理输入先挪副屏、不抢主屏前台（2026-11-17 用户拍板 B 方案）"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 屏幕几何（本机实测，2026-11-17）
- Progman 虚拟桌面 4480 × 1600
- 主屏：x ∈ [0, 2560)，高 1600
- 副屏：x ∈ [2560, 4480)，高 ~1200（Shell_SecondaryTrayWnd 只报 1200，分辨率未精确验证）

## 操作优先级（由高到低，默认按此走）
1. `browserTab`（CDP）—— 零屏幕、零指针、零焦点。前提：浏览器开了远程调试端口（Firefox 默认没有；`list_windows` 返回 `browsers: []` / `attachUser.available: false` 即不可用）。
2. `snapshot` / `screenshot`（PrintWindow）/ `accessibility_tree` / `ocr` / `find` + `background:Invoke` —— 不依赖窗口位置，被遮挡/后台也能读；不抢前台。
3. 副屏 `sendinput` 物理输入 —— 必须先 `move_window` 把目标窗口挪到 x ≥ 2560，再 `activate_window`，再用副屏全局坐标点击。
4. 主屏 `sendinput` —— **不用**。

## 硬约束
- 物理输入（sendinput 的 click / type_text / keypress）只作用于**当前前台窗口**，且指针是全系统共用的。副屏解决「不遮挡主屏视觉」，解决不了「抢焦点」—— 这是 Win32 约束。
- `background:Invoke` 不抢前台，是首选替代；但很多网页控件没有 Invokable 模式，此时不要强行 sendinput，改为要 token / 要授权 / 让用户手工点两下。

## 判断纪律（本次教训，2026-11-17）
- 先取证再动手：邮件头、用户已提供的截图、API 往往已经含答案，不需要再点开菜单。
- 涉及邮件、账号、文件的操作默认**只读**；写操作先问。
- 任务能用 API 闭环（例如 GitHub 用 `~/.dsh/.credentials.yaml` → `dsh-mnemon/github` 的 accessToken）就不要碰 GUI。
