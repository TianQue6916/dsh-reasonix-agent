---
name: thread-model-tutorial
description: CSAPP线程模型对比教程——主仆vs对等vs预线程化——已生成MD+HTML+PDF三件套
type: project
scope: project
created: 2026-06-23
---
# CSAPP 线程模型对比教程

已生成三份文件在项目目录下：

| 文件 | 用途 |
|:---|:---|
| `线程模型对比——主仆与对等.md` | 源 Markdown（含完整代码、表格、参考文献） |
| `线程模型对比——主仆与对等.html` | 浏览器打印到 PDF（带打印样式表） |
| `线程模型对比——主仆与对等.pdf` | 直接可用的 PDF（fpdf2 生成，~400KB） |

## 内容结构
- §0 问题定义：并发服务器的本质需求
- §1 主仆模型（代码 + 堆分配原理 + 时序图）
- §2 对等模型（代码 + 时序图）
- §3 内核视角：惊群问题 / LIFO不公平 / SO_REUSEPORT
- §4 合题：预线程化模型（CSAPP §12.5.4）
- §5 四维对比总表
- §6 选择决策树
- §7 从第一性原理再看一眼（主从/SMP/管道）
- §8 参考文献（含 kernel commit、LWN.net、Cloudflare Blog）

## 关键发现
- 对等模型"架构上"无单点瓶颈，但"实现上"共享listenfd导致LIFO不公平（Google实测3:1）
- SO_REUSEPORT (Linux 3.9) 解决了竞争问题
- 预线程化模型 = 主仆的职责清晰 + 对等的预创建线程 + 生产者-消费者缓冲区的背压控制
