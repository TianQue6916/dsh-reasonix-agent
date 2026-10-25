# 11 · 实现语言策略：为什么"绝大多数用 C 写"是错的，以及 native 的真实门槛

> 用户原诉求（2026-10-26）：「能否要求 agent 写的绝大多数处理的东西由 C 写而不是 Python？想要稳定和效率，注意社区经验。」
> 结论：不能。正确形态是**分层**（方案 A）—— Python 做 control plane，C/Rust 只在越过定量门槛后进 data plane。
> 本文的价值不在结论，而在**那个门槛是怎么算出来的**。

---

## D 定论

**D1 · 分层，不是替代。**
Python = control plane（编排、胶水、短命工具、一次性分析）；C/Rust = data plane（越过门槛的内层循环、需要确定性延迟的路径）。用户在三选项里拍板 A（不选 B「全 PyO3 核心库」、不选 C「全 C + 独立 exe」）。

**D2 · 交叉点 `N* ≈ 8×10^5`（本机实测）。**
内层循环迭代数 `< 10^6`，或者**只跑一次**，用 C 重写永远亏。这个数量级比直觉大得多 —— 直觉会把门槛估成 10^3。

**D3 · "更稳"的方向是反的。**
C 的失败模式是 UB：越界 / use-after-free / 未初始化 → 静默损坏、几小时后崩在别处、无 traceback。Python 是 traceback + 行号。
⇒ **agent 高速生成的 C 比 agent 生成的 Python 危险一个量级**。因为 agent 的迭代速度取决于失败信号的信息量（可诊断性），不取决于语言快慢。

**D4 · 提效优先级固定（前两步成本 ≈ 0，先做这两步）。**
① 合并 / 减少工具调用 → ② 消灭 O(N) 解释器循环（NumPy / Polars / 系统工具 vectorize）→ ③ 长驻 worker 复用进程（消灭 `T_startup`）→ ④ 才考虑 native。

**D5 · 要 native 就选 Rust + PyO3（abi3）或 C 独立 exe；不手写 CPython C API。**
C 扩展的引用计数 / GIL 细节是 agent 写不安全的领域。

**D6 · native 的三道门槛（必须同时成立）。**
`N > 10^7` **且** 高频（常驻或反复调用）**且** 有 < 10 ms 的确定性延迟需求 —— 三者缺一，Python 侧优化（③ 长驻 worker）就够了。

**D7 · 稳定靠进程边界，不靠语言。**
独立 exe + stdin/stdout JSON 契约：崩溃 = 子进程非零 exit，主控可重试 / 降级。这是比"C 更快"高一个数量级的可靠性来源。

---

## M 机制

**M1 · 成本模型与交叉点。**

单次调用成本：

```
T(N) = T_startup + c · N
```

Python 与 C 两条线相交于：

```
N* = (T_startup_py − T_startup_c) / (c_py − c_c)
```

本机实测（2026-10-26）：

| 量 | 实测值 |
|---|---|
| `T_startup` python | **21.4 ms** |
| `T_startup` gcc `-O2 -static` exe | **7.8 ms** |
| `T_startup` `pwsh -NoProfile` | **200.8 ms** |
| 内层成本 `c_py`（CPython 3.13，PEP 659 自适应） | **19.8 ns / iter** |
| 内层成本 `c_numpy` | **0.3 ns / elem** |

⇒ `N* = (21.4 − 7.8) ms / (19.8 − 0.3) ns ≈ 15.5e-3 / 19.5e-9 ≈ **8×10^5**`，与事前按 6×10^5 的估算同量级。
⇒ **启动差只有 13.6 ms，吃掉它需要 80 万次迭代。**

**M2 · 为什么"快 60 倍的内层"可能端到端更慢：参照 102 MB 文件数关键字。**

| 实现 | 端到端耗时 | 说明 |
|---|---|---|
| `bytes.count`（CPython，C 内建） | **12 ms** | 解释器只跨一次 barrier |
| 手写 C（memchr）+ 独立 exe | **53 ms** | 启动 5.9 ms + `fread` 35 ms 吃掉全部收益 |
| `for line in f:` 逐行 Python | 325 ms | 典型 O(N) 解释器循环，该被 ② 消灭 |
| `pwsh Select-String` | **2754 ms** | **大文件禁用**，比 Python 慢 230 倍 |

两个结论：
1. **真正的浪费是 O(N) 解释器循环**（325 ms ↔ 12 ms，27 倍），不是"没写 C"；
2. **C 的收益会被启动与 IO 吃掉**（53 ms 比 12 ms 慢），只有在"一次启动 + 长时间计算"的形状里才成立。

**M3 · 数量级的参照系：一次 tool round-trip 是 5–20 s。**
`pwsh` 启动 200.8 ms = python 的 9.4 倍 = gcc exe 的 26 倍。用户抱怨的"命令太慢"，实测根因是**调用次数 / cold-spawn pwsh**，不是字节码。
⇒ 一次"少 spawn 一次 pwsh"的收益 ≈ 把内层循环用 C 重写 80 万次迭代的收益。

**M4 · 为什么可诊断性决定 agent 的收敛速度。**
agent 的循环是「生成 → 运行 → 读信号 → 修」。每一步的收敛速度 = 信号的信噪比。
- Python：异常类型 + 行号 + 局部栈 ⇒ 通常一轮定位。
- C：段错误 / 静默错误值 / 几小时后在别处崩 ⇒ 需要 gdb / ASan / valgrind 才有信号，而这些**不是 agent 的默认工具链**。
C 稳是因为人写 + code review + ASan + 长测试周期；不是语言本身稳。

**M5 · 进程边界为什么比语言选择更重要。**
同一台机器上，可靠性排序由"故障是否可隔离"决定：
- 独立 exe + JSON 契约：崩溃 = 非零 exit + stderr，主控可重试 / 换实现 / 降级；
- in-process 扩展：崩溃 = 整个 harness 挂掉，且可能带走未落盘的状态。
**所以"用 native"的正确姿势是"用独立进程"，不是"用另一种语言"。**

---

## J 判据

**要不要写 native：按顺序问，任一"否"就停。**

1. **N 是多少？** 先估数量级（`wc -c` / `wc -l` / `du`）。`N < 10^6` → 停。
2. **跑几次？** 只跑一次 → 停（启动成本吃光收益）。
3. **现在是 O(N) 解释器循环吗？** 是 → 先做 ②（vectorize / 系统批处理），大概率直接好。
4. **有 < 10 ms 的确定性延迟需求吗？** 没有 → 先做 ③（长驻 worker 复用进程）。
5. 三条都成立 → 写 Rust + PyO3（abi3）或独立 C exe，**并且先写 Python 版做对照基准**（否则无法证明快了）。

**语言选择速查（本机实测口径）：**

| 形状 | 选择 |
|---|---|
| 编排 / 胶水 / 一次性分析 | Python |
| 常规脚本、"为了稳定" | **Python**（改写成 C 是负收益） |
| 大文件关键字 / 字节处理 | `bytes.count` / `memoryview` / `numpy`，别写循环 |
| 结构化数据 | Polars / `csv` 的 C 实现 / sqlite |
| 需要常驻、反复调用 | 长驻 Python worker（消除 `T_startup`） |
| N > 10^7 且高频且常驻 | Rust + PyO3(abi3) 或独立 exe |
| 会被 agent 反复改的代码 | **一律 Python** |

---

## X 反例

**X1 · 「绝大多数处理逻辑用 C 写」。** 被否证：`N* ≈ 8×10^5` 意味着短命工具的绝大多数调用形状都在 Python 的优势区；真正的瓶颈是 spawn 次数。

**X2 · 手写 C（memchr）做数关键字。** 端到端 53 ms，比 `bytes.count` 的 12 ms 慢 —— 启动 5.9 ms + `fread` 35 ms。教训：**先测端到端，再谈内层**。

**X3 · 用 pwsh 做大文件扫描。** `Select-String` 2754 ms。Windows 侧的大文件处理一律交给 Python / 专用工具。

**X4 · 「C 更稳」。** 反了。agent 生成的 C 缺陷是静默内存破坏，比 Python traceback 危险一个量级。（对应 D3）

**X5 · 手写 CPython C API 扩展。** 引用计数 / GIL / `PyObject` 生命周期不是 agent 能可靠处理的面。要 native 就走 PyO3 或独立 exe。

**X6 · 先写 C 再写 Python 对照。** 顺序必须反过来：先 Python 拿基准，再决定是否值得 native。没有基准的"优化"无法验证。

**X7 · 把 `T_startup` 算成 0。** 所有"某语言快 N 倍"的说法在短命进程里都要重算 —— 这是本机把 pwsh 从"性能问题"误判成"语言问题"的根源。

---

## R 复现

**启动成本测量（三次取中位数）：**

```bash
timeout 60 python -c "
import subprocess,time,statistics
def t(cmd,n=5):
    xs=[]
    for _ in range(n):
        s=time.perf_counter(); subprocess.run(cmd,shell=True,capture_output=True); xs.append(time.perf_counter()-s)
    return statistics.median(xs)*1000
print('py   %.1f ms'%t('python -c pass'))
print('pwsh %.1f ms'%t('pwsh -NoProfile -Command 1'))
"
```

**内层成本测量（`c_py` vs `c_numpy`）：**

```bash
timeout 60 python -c "
import time,numpy as np
n=10**7
s=time.perf_counter()
acc=0
for i in range(n): acc+=1
print('py    %.1f ns/iter'%((time.perf_counter()-s)/n*1e9))
a=np.ones(n,dtype=np.int64)
s=time.perf_counter(); a.sum(); print('numpy %.2f ns/elem'%((time.perf_counter()-s)/n*1e9))
"
```

**交叉点代入：**

```
N* = (T_startup_py − T_startup_c) / (c_py − c_c)
   = (21.4 − 7.8) ms / (19.8 − 0.3) ns
   ≈ 8×10^5
```

**大文件处理的正确写法（102 MB）：**

```bash
timeout 60 python -c "
import time
b=open(r'<bigfile>','rb').read()
s=time.perf_counter(); c=b.count(b'keyword'); print(c,'%.0f ms'%((time.perf_counter()-s)*1e3))
"
```

---

## S 溯源

- `~/.dsh/PLAN.md` → 「★ 已落地：实现语言策略定论 = 方案 A 分层混合（2026-10-26）」整节（含 `N*` 推导与四组实测数据）
- 同节「提效优先级」「稳定靠进程边界」两条
- 三选项对比（A 分层 / B 全 PyO3 / C 全 C + 独立 exe）的拍板记录
- 相关现场：`dsh-pwsh-常驻化-p1.md`（长驻 worker 的动机）、`gitbash-wc-m-is-bytes.md`（字节 vs 字符的测量陷阱）
