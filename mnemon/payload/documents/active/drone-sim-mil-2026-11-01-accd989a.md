---
id: "accd989a-8bb5-4e6e-8798-10ab52568373"
title: "四旋翼控制算法仿真路线选型与 drone_sim 自建调参台（MIL 层，2026-11-01）"
description: "MIL/SIL/PIL/HIL 四级坐标系与 Renode/QEMU/Simulink/PX4 社区结论；结论是「学控制算法直觉不需要固件级仿真」；落地为 C:\\Users\\27063\\drone_sim 的 numpy 6-DOF + 级联 PID + DearPyGui 调参台，含实测判据、ZOH 相位滞后推导与三个 DearPyGui 无效判据陷阱。"
status: "active"
created_at: "2026-11-01T08:17:36.190Z"
updated_at: "2026-11-01T08:17:36.190Z"
content_hash: "ae642463662369d7572b514bfb392c2489a48d928a0ff4f77e7527d1e1039452"
source_paths:
  - "drone_sim/quad_core.py"
  - "drone_sim/drone_tuner.py"
session_ids:
  - "ef2baec8-8be9-42d6-ace7-8921cfad4605"
memory_body_ids:
  []
---

# 四旋翼控制算法仿真路线选型与 drone_sim 调参台

会话 `ef2baec8`（2026-11-01）。起点是「有没有什么编译器能让无人机程序在软件里飞」，结论是**问题本身错位**：编译不是瓶颈，缺的是 simulator / emulator / virtual platform 这一层。本篇记录选型坐标系、社区实证、以及最终落地物。

## 1. 结论先行

用户目标（原话大意）：只是感兴趣，以后接触这些控制算法想更轻松，**不买板子和硬件，直接从软件看结果**。

这一句把答案从「固件工程」换成「控制算法直觉」。推论：

- **PIL 级以上的仿真（Renode / QEMU / 真机 HIL）对该目标零价值**——它们能保真外设行为，但不解释闭环为什么振荡。
- 选 **Python 自建模型（MIL 层）**，而不是社区票数更高的 Simulink。唯一理由：Simulink 会把「带宽分离为什么是 5~10 倍」封进模块背后，与该用户的「不给公式只给直觉 / 拒绝黑箱」取向冲突。代价明确——失去与教材框图对齐的便利，换来每行可自行复算。
- MuJoCo / Gazebo 在本机不是「不好用」，是**装不动**（pip 镜像实测 ~10 kB/s，50 MB 约 1.5 小时）。Renode 反而轻（Windows 安装包 / `antmicro/renode` Docker），但目标不匹配，故不选。

## 2. 选型坐标系（唯一有效的分类轴）

| 级别 | 在跑什么 | 代表 | 判据 |
|---|---|---|---|
| MIL model-in-loop | 纯算法模型 | Simulink、Python | 只验逻辑 |
| SIL software-in-loop | 固件**源码**编成 PC 程序 | PX4 SITL、ArduPilot SITL | 代码不改，但没过交叉编译器 |
| PIL processor-in-loop | 固件编成目标 CPU 机器码，在虚拟 MCU 上跑 | Renode、QEMU、Simulink PIL | 连编译器优化与时序一起验 |
| HIL hardware-in-loop | 真板 + 实时仿真机 | dSPACE、Speedgoat | 要钱要硬件 |

「零硬件开发」的分界线在 PIL：同一份 `.elf` 不重编即可跑虚拟芯片，GPIO/I²C/UART 行为对得上。**但这与「理解 PID 为什么振荡」没有因果关系。**

## 3. 社区实证（本次调研可复用的硬结论）

- **QEMU 不适合 MCU 外设**：多数 MCU 只建模到 CPU 级别，peripheral / interrupt-timing / clock-tree 几乎没有。它属于跑 Linux 的圈子（Beningo 2026 技术图谱）。
- **Renode 是固件 CI 的正确选择，但不 cycle-accurate**：官方仍存在 `system_clock` 类问题（1 ms 定时器中断在仿真里跑得极慢，issue #793）；STM32 模型会卡在 `SystemClock_Config()` 的 `Flash:ACR` 寄存器。社区里最正确的用法是接 CI（Memfault 的 Renode + GitHub Actions），不是拿它学控制。它可与 **Gazebo 做 co-simulation**（虚拟 MCU 跑固件 + Gazebo 算物理），学术上已有整块 Crazyflie 2.1 搬进 Renode 的案例（Lund 论文）。
- **Renode vs QEMU 仍无定论**：有人从 Renode 转回 QEMU，理由是 setup 更轻，说明 Renode 的安装维护成本并不低。
- **AirSim 已死**：微软 2022 宣布停更、2023-12-15 停止开发，社区文档直接写 "Do not build on it"。后继 Project AirSim 交 IAMAI 后才重新开源。**网上教装 AirSim 的教程全部过期。**
- **Gazebo Classic 已 EOL**：Open Robotics 2025-02 公告，ROS Jazzy 起不再支持。Classic / Ignition / gz-sim 三代互不兼容，初学者最大的时间成本是「把 Classic 的答案抄进 gz-sim 工程」。
- **两派的实际分歧**：学术/教学派 → Simulink（Scope / Bode / linmod / step 是共同语言，MIL→SIL→PIL 不换工具，但贵、离开校园就没了）；研究与 RL 派 → Python（`gym-pybullet-drones` 2.2k star、MuJoCo、Gymnasium，免费可进 git 可进 CI，但 Windows 是二等公民，常需 WSL2 Ubuntu 20.04 而非 22.04）。
- **PX4 SIH**：整个仿真跑在 PX4 进程内、headless、零外部依赖，物理参数即 `SIH_*` 一组 parameter，比 Gazebo 轻一个数量级。PX4 SITL 在本机需要 WSL（本机未装）。ArduPilot SITL 内置动力学、不依赖 Gazebo，是最轻的 SIL。

## 4. 落地物 `C:\Users\27063\drone_sim\`

```
quad_core.py      6-DOF 刚体 + 级联 PID（无 GUI，纯 numpy，四元数姿态）
drone_tuner.py    调参台：DearPyGui 2.3.1，正交投影 3D 视图 + 双曲线 + 8 滑条 + 5 预设
```

运行：`cd C:\Users\27063\drone_sim && python drone_tuner.py`（本机 Python 3.13，`C:\Users\27063\AppData\Local\Programs\Python\Python313`）。

- 姿态用**四元数**而非欧拉角：3 个参数描述 3 维姿态流形必然有奇异点，这是拓扑约束而非实现 bug。
- 3D 视图用**手写正交投影**，不用 3D 库——只为让每一条线可由用户自己复算。
- 定位明确：**可丢弃的直觉练习（MIL 玩具），不是工具链的一环**。它的价值是五分钟建立「拖滑条 → 物理真的变」的手感，永远替代不了 Renode 或 Simulink 那一层。

## 5. 验证判据（实测值，非「应该能跑」）

| 项 | 实测 | 判据 |
|---|---|---|
| 投影落点 | 7/7 在画布内 | 机身点全部可见 |
| 曲线数据流 | 90 帧 90 点 | 实时在喂 |
| 滑条热改 25 Hz | \|roll\| = 27.9° | >20° 即发散 ✔ |
| 滑条热改 250 Hz | \|roll\| = 0.1° | <5° 即稳住 ✔ |

最后两行是关键：证明「拖滑条 → 物理真的变」这条链路通，即用户要的「细微调参」确实成立。UI 另经 3 轮截图人工核对修整（机身放大 2.5×、参数区从被裁到全可见、曲线 Y 轴从自动缩放改固定量程）。

## 6. 三个「不验证就会骗过你」的陷阱（DearPyGui）

1. `dpg.table` 缺 `table_row` → container stack 错乱，报 `Exception: [1009] No container to pop`。
2. `dpg.get_viewport_width()` 在 `create_viewport()` 之前调用返回 **0**（静默，不报错），据此算布局会得到全零宽度。
3. **`dpg.get_item_children()` 对 drawlist 永远返回空**——拿 item 数量当「3D 画出来了吗」的判据本身无效：0 条却一切正常。改成「投影落点统计 + PIL 截屏人工核对」才有效。

通用的教训：**当一个 instrument 的可信度未经证明时，先证 instrument，再证被测物。**

## 7. 核心推导：25 Hz 为什么发散（可直接复用）

零阶保持（ZOH）等效于引入半个采样周期的纯延迟 $T_d \approx T_s/2$。控制器在频率 $f$ 处的相位滞后：

$$\Delta\varphi \approx 2\pi f \cdot \frac{T_s}{2} = \pi f T_s$$

角速度环带宽约 10~20 Hz，取 $f = 15$ Hz、$T_s = 1/25$ s → $\Delta\varphi \approx 108°$，相位裕度（要求 >45°）被吃光，闭环失稳。

**这是「采样频率不是实现细节，而是稳定性参数」的定量版本**；CSAPP 的「中断延迟」与控制理论的「相位裕度」在这里是同一件事的两种说法。

## 8. 四个可直接照做的实验

| # | 操作 | 应看到 | 对应概念 |
|---|---|---|---|
| 1 | 控制器频率 250 → 25 Hz | 约 3 s 内发散（实测 27.9°） | 采样相位滞后吃相位裕度 |
| 2 | 点「侧风脉冲」，Ki 设 0 / 0.5 | Ki=0 留永久偏差；0.5 归零 | 积分作用与 windup |
| 3 | Kd 0.002 → 0.012，陀螺噪声拖到 0.08 | 高频抖动显著变大 | D 项放大噪声（微分即高通） |
| 4 | 力矩饱和拖到 0.05 | 想快却快不了，超调反而变大 | 饱和使线性分析失效 |

## 9. 未完成 / 下一步判据

- **用户尚未回报实验 1 的实测跳变点**（一格一格降频，看从「稳」→「抖」→「翻」的分界），用来对照 $\pi f T_s$ 估算差多少。
- 若日后目标变为「生成嵌入式 C」→ Simulink + Embedded Coder（需先确认宁夏大学是否有正版 MATLAB 校园授权）；若变为「真实固件跑虚拟芯片」→ 那时才轮到 Renode。
- 依赖记账：`hoffstadt/DearPyGui` v2.3.1（MIT），长期使用需跑 `python ~/.dsh/contrib/star-audit.py --star`。
