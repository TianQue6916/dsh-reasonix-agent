---
id: mem-9830dab0d3acaeb7bc05b1dfc36bb13d
revision: 1
created_at: "2026-11-11T17:46:42.723Z"
updated_at: "2026-11-11T17:46:42.723Z"
name: 天阙九泉-GPU混合精度与torch.compile实测
description: "RTX 5070 Laptop (sm_120) 上 TF32/autocast/torch.compile 的实测数据与 Windows 前置条件（截至 2026-11-12）"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 环境（2026-11-12 实测）
- torch 2.7.1+cu128（**必须 cu128，cu118 走 compute_37 PTX JIT，性能只有 35%**）
- `arch_list` 含 `sm_120`，无 warning
- triton-windows **3.3.1.post21**（`pip install triton-windows`，阿里镜像 41.5MB/6s）
- MSVC：`C:/Program Files/Microsoft Visual Studio/18/Community/VC/Tools/MSVC/14.51.36231/bin/Hostx64/x64`（VS 2026，版本号 18）
- 跑 Triton/torch.compile 前需 `export PATH=<上面那条>:$PATH`

## 纯 matmul 4096³
| 模式 | TFLOPS |
|---|---|
| FP32 strict | 11.33 |
| TF32 | 22.42（2×，免费） |
| FP16 native | 45.47 |
| BF16 native | 46.05 |
| autocast fp16 | 38.82 |
| autocast bf16 | 39.04 |

## 真实模型 `nn.TransformerEncoderLayer(d=512,nhead=8,ffn=2048)` batch=32 seq=128
| 模式 | 推理 ms | 训练 ms/step |
|---|---|---|
| fp32 eager | 7.23 | 12.32 |
| tf32 eager | 1.54 (4.7×) | 6.92 (1.78×) |
| bf16 autocast eager | 1.13–1.25 (6.4×) | 3.75 (3.3×) |
| **compiled bf16** | **1.05 (6.9×)** | — |
| compiled fp32 | 7.18 (1.01×，**无效**) | — |

## 结论
- `torch.backends.cuda.matmul.allow_tf32` 默认 **False**，一行开关换 2×（推理甚至 4.7×）
- `torch.compile` 首次编译仅 3.2s，但 **FP32 无收益**（matmul 已走 cuBLAS），bf16 下 +19%（融合 elementwise）
- 警告 `Not enough SMs to use max_autotune_gemm mode` —— 36 SM 太少，inductor 不开 autotune
- **推荐组合 `autocast(bf16) + torch.compile` = 相比 fp32 eager 6.9×**

## 其他环境事实
- `MSAcpi_ThermalZoneTemperature` 返回无效值，`\Power Meter(_Total)\Power` 恒 0 ⇒ **CPU 功耗/温度脚本读不到**，只能靠 `\Processor Information(_Total)\% Processor Performance` 反推频率（×2.2GHz）
- onnxruntime 1.31.1 只有 `CPUExecutionProvider`，未装 onnxruntime-gpu
