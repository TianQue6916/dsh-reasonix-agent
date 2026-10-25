---
id: "673cddda-ff72-4efd-a405-c4b5aa42fd4a"
title: "Sunshine 扩展屏社区证据与 WebUI Display 选屏入口：同款 MatePad 11 成功路径（2026-10-25 凌晨）"
description: "承接 70b6a9ef（DXGI duplication 代码级定论）与 12e010fd（parsec-vdd 0.45 config IOCTL）的社区侧突破：找到同款设备（Huawei MatePad 11 2560x1600 + Sunshine/Moonlight/Parsec-VDD）成功案例，指出正确入口是 Sunshine WebUI 的 Display 下拉选择器逐个试 ID，而非手写 output_name；附扩展模式失灵的恢复技巧、WGC 两路实测错误码、dsh 进程树清理导致常驻进程无法由 tool 拉起的环境约束，以及备选方案排序。"
status: "active"
created_at: "2026-10-24T17:55:29.221Z"
updated_at: "2026-10-24T17:55:29.221Z"
content_hash: "7901e301abaa3212624977ecf26a2533c8cb1e5fe8d5bb598dcf72a7f9f0e448"
source_paths:
  - "_moonlight/start-sunshine.bat"
session_ids:
  - "52e494ae-0e70-49d5-9a68-5ae2bb2aaf84"
memory_body_ids:
  []
---

# Sunshine 扩展屏：社区证据与 WebUI 选屏入口

日期：2026-10-25 凌晨。项目：平板当第二屏（Sunshine + Moonlight + ParsecVDD）。
关系：本文承接 `70b6a9ef-b017-4d02-8c0c-dd7d98a0e9a0`（抓屏代码级定论）与 `12e010fd-adbd-494b-ad86-23cd9bb69f89`（parsec-vdd 0.45 config IOCTL / 常驻持有）。前者解释「为什么 output_name 匹配成功仍回退主屏」，本文记录**社区侧的正确操作入口**与实测边界。

## 决定性社区证据

来源：[Dancncn/DansBlog — How I Turned My Tablet into a Second Monitor with Sunshine](https://github.com/Dancncn/DansBlog/blob/1cd6b349db70d22fbba82f2c1d43804845ed3ccd/src/content/blog/how-i-turned-my-tablet-into-a-second-monitor-with-sunshine-en.md)
同款硬件：Huawei MatePad 11，2560x1600 面板；同样的 Sunshine + Moonlight + Parsec-VDD 拓扑，实测 90Hz 下约 6ms 延迟，结论是「真的扩展屏，不是镜像」。

其拓扑与角色划分（与本地一致）：

```
PC -> Sunshine (encode) -> LAN -> Moonlight -> Tablet
            |
        Parsec-VDD (virtual display)
```

## 关键更正：选屏入口在 WebUI，不是 sunshine.conf 手写 output_name

博客原文关键句：

> In Sunshine WebUI, go to `Settings/Configuration -> Video/Display/Capture`. Find the target selector (`Display` / `Monitor` / `Output`) and pick one display ID. ... If it is the wrong screen, switch to the next display ID in Sunshine, save again, reconnect, and verify again.

- **不要**手写 `output_name = \\.\DISPLAY29` —— 本地实测这种写法不被认，且 Windows 逻辑编号（1/2/3）与 Sunshine 自身枚举顺序（`Display 0/1/2`）不保证一一对应。
- 正确做法：WebUI 下拉里逐个试 ID → Save → Moonlight 重连 → 看画面归属；一分钟定型，之后稳定。
- 让目标显示易于识别的前置技巧（博客给出）：给虚拟屏设一个独特分辨率（如 1280x720）、改成纵向、或在显示排列里拖到最左，便于对照。

## 扩展模式失灵的恢复技巧

Windows 显示设置里：切到 **「仅在 2 上显示」→ 应用 → 再切回「扩展这些显示器」**。常能刷新显示栈状态，把虚拟输出拉回可用。
配套检查：VDD 安装后是否重启过、虚拟屏是否被禁用、高级显示设置里是否有有效刷新率模式、手动禁用/再启用一次虚拟屏。

## 本地实测边界（本次新增）

| 尝试 | 结果 |
|---|---|
| DXGI + `output_name` 命中 ParsecVDD | 名字匹配成功，但 `test_dxgi_duplication()` 对 IDD 输出失败 → 跳过 → 回退主屏 |
| `capture = wgc`，service 模式（session 0） | `0x80070424`，session 0 拿不到图形捕获服务 |
| `capture = wgc`，lite 用户进程（session 1） | `0x80070005` E_ACCESSDENIED（Win11 24H2 捕获授权）；`Capture size` 始终为主屏尺寸 |
| lite 启动后探测 WebUI | 47990 未监听，`localhost:47990` 连接被拒（进程启动但 API 未就绪/已退出） |

源码证据（[LizardByte/Sunshine `display_base.cpp`](https://github.com/LizardByte/Sunshine)）：`test_dxgi_duplication()` 行 379–442 —— `D3D11CreateDevice` 失败即返回 false；`output1->DuplicateOutput()` 失败后重试一次，若 `enumeration_only && status == E_ACCESSDENIED` 直接 break；最终 `BOOST_LOG(error) << "DuplicateOutput() test failed"` 并 `return false`，上层据此跳过该 output。设备用的是 output 自己的 adapter，故非 adapter 对齐问题。

## 运行方式约束（环境事实）

dsh 的 tool 进程每次命令结束即退出，**Windows 回收其整棵子进程树**，因此用 `Start-Process` / `cmd start` 拉起的 `sunshine.exe` 活不过几秒（实测 pid 短暂存在后消失，端口为空）。可行路径：

1. 用户手动双击 `_moonlight/start-sunshine.bat`，**保持控制台窗口不关**（`sunshine.exe` 是前台控制台程序，关窗等于杀进程）；
2. 后续收尾：做成「登录时运行」计划任务，窗口最小化、独立于任何终端。

## 备选方案（成功率排序，若 WebUI 选屏仍失败）

1. **Parsec 官方客户端** —— ParsecVDD 本是其驱动，「虚拟屏 + 选屏」是原生能力；个人免费，注册即可。
2. **OBS 中转** —— OBS 显示器采集若能抓到 ParsecVDA 那块屏，可绕开 Sunshine 自身选屏缺陷。
3. **接受 ExtensoDesk** —— 可用，代价是会员费与广告。

## 待办 handoff

1. 从 WebUI Display 下拉取出选项清单（文字/截图），确定对应 ParsecVDD 的 ID，Save 后重连验证是否为真实扩展屏。
2. 定型后把结果固化进 `sunshine.conf`，再处理开机自启（`SunshineService` 当前 Disabled，确认不再需要后可卸载）。
3. 分辨率/刷新率仍受 `12e010fd` 记录的 config IOCTL 失效限制，定型时按实际生效值记录，不要假设设定值即生效值。
