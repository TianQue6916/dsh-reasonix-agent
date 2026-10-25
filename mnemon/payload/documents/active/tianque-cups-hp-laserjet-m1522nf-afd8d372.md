---
id: "afd8d372-c414-483e-a91b-c5ecb66219c9"
title: "小机 tianque 的 CUPS 打印链路（HP LaserJet M1522nf）：可复用流程 + 「驱动声明双面、硬件实为手动双面」的坑"
description: "2026-10-07 一次完整打印任务的沉淀：本机 → tar|ssh → tianque → Pillow 规整 A4 → CUPS lp 的全链路可复用流程；含 M1522nf 队列名/USB URI、图片放大倍数的取值理由，以及 ipptool sides-supported 声称自动双面但硬件为 manual duplex 的关键判据。"
status: "active"
created_at: "2026-10-07T04:49:06.229Z"
updated_at: "2026-10-07T04:49:06.229Z"
content_hash: "055f189883db7bcddeb503e34d0ceebd55ead466d49d5e0723b16934d021f396"
source_paths:
  []
session_ids:
  - "93495843-0db0-4525-9ea1-0746c861867f"
memory_body_ids:
  []
---

# 小机 tianque 的 CUPS 打印链路（HP LaserJet M1522nf）

来源：2026-10-07 一次真实打印任务（15 页医院/病理材料，全部单面）。用户原话（checkpoint 事件 8）：「控制小电脑把这些文件打印一下,这个除了病理证明都是单面打印,那些医院材料无需单面,双面打印」；随后经确认改口为**全部单面**。

## 环境事实（可复用）

- 小机主机名 `TianQue`（ssh 别名为 `tianque`），Ubuntu + CUPS 2.4.7。ping 不通是常态（Tailscale 屏蔽 ICMP），**直接试 ssh 即可**，不要以 ping 失败判断不可达。
- 打印机 USB 直连小机：`hp:/usb/HP_LaserJet_M1522nf_MFP?serial=00CNG89640MN`（另有 `hpfax:` 传真队列）。USB 上可见 `ID 03f0:4c17 HP, Inc EWS UPD`。
- CUPS 队列名：`HP-LaserJet-M1522nf-MFP`（系统默认目标）；Fax 队列 `HP-LaserJet-M1522nf-MFP-Fax-2`。
- 小机用户 `tianque` 在 `lpadmin` 组，家目录可写；但 `/etc/cups/ppd/*.ppd` 非 root 读不了（`sudo -n` 需密码），PPD 内容改从 `curl localhost:631` 或 `lpoptions -l` 取。
- 小机可用工具：`lp/lpstat/lpadmin`、`pdftoppm`、`pdfinfo`、`gs`、`convert`、`Pillow 12.3.0`；**缺** `qpdf`、`pdftk`、`magick`、python `pypdf`。

## 关键坑：驱动说能自动双面，硬件其实只能手动翻面

三层证据相互矛盾，结论以硬件为准：

1. `lpoptions -l` 显示 `Duplex/Double-Sided Printing: DuplexNoTumble DuplexTumble *None`；`curl localhost:631` 的 PPD 里是 `*OpenUI *Duplex/Double-Sided Printing: PickOne` + `*DefaultDuplex: None`。
2. `ipptool` 查得 `sides-supported (1setOf keyword) = one-sided,two-sided-long-edge,two-sided-short-edge`，`sides-default = one-sided`，且 `sides` 在 `job-settable-attributes-supported` 中。
3. 但 HPLIP `models.dat` 中 `[hp_laserjet_m1522nf_mfp]` section（行 23417 起）**完全没有 duplex 字段**，无 `Duplex=` 能力标记；`hpcups` filter 里虽有 `@PJL SET DUPLEX=ON` / `Duplex=DuplexNoTumble` 的处理分支，只是通用代码。

**结论：M1522nf 是 2008 年机型，官方规格就是 Manual duplex（无自动 duplexer）。** 真要双面只能「先打奇数页 → 手动翻纸 → 再打偶数页」，且翻面方向必须先用废纸实测一次。**别信 ipptool 的 `sides-supported`** —— 那是 CUPS/PPD 层的声明，不是硬件能力探测。本次因用户改选全单面，正好绕开这个坑。

## 可复用打印流程

1. 源目录示例：`D:\Desktop\工具箱\需要打印的文件\`（微信导出的图片文件名是 140 字符级 MsgID 数字，无语义）。
2. **传输用只读管道，本机零写入**：`tar | ssh` 打到 `tianque:/home/tianque/print-spool-<日期>/`，重命名在小机侧做。理由：本机 D 盘 sandbox 是 **Low integrity**，工具链写不进去（详见 `1c1ebdaf-ffa8-4f2f-8a76-b7808f81690a` 与 PLAN.md 的沙箱根因）。
3. **图片规整成 A4 单页 PDF**（Python + Pillow，目标高度 3508 px ≈ A4@300dpi）：等比缩放 + 居中贴到白底。放大倍数刻意取高：手机图 170%–194%（插值后字更大更好读），两张高分扫描件（出院记录 2980×4433、诊断证明书 3110×3992）则 79%–80% 缩小。手机长截图（1316×2832）fit 到 A4 后等效约 159dpi、占页宽 66%，字偏小，看不清应改成分页切开重打。
4. **先打第 1 页验证链路**，再批量：确认 `lpstat -o` 有 job、`lpstat -p` 显示「正在打印」、`cfFilterChain: pdftopdf exited with no errors`、最后队列清空且打印机回到「空闲」，才算真打完。
5. 出纸顺序 = 提交顺序。按材料包逻辑排序（表单 → 证件 → 病理 → 检验 → 影像 → 出院/证明），不要用微信发送顺序。

## 本次踩到的两个具体失误（下次避免）

- `*.pdf` glob 会把源目录里所有 PDF 一起带走 —— 该目录有 2 个 PDF，除了 `宁夏大学学生休学申请审批表.pdf` 还有课程讲义 `TBB-AllChapters-Portrait.pdf`，被误传到小机，需显式指定文件名或落地后清理。
- 微信图片的「文件名 → 内容」映射要靠**图片尺寸对齐**来钉：12 张预览尺寸=原尺寸精确匹配，2 张按固定比例 1.721/1.775 缩放匹配，一一对应无歧义。重复内容（同一份病理报告 B2026-31576 的 3 张截图）当时按「宁多勿少」照打，政务件漏一张比多一张麻烦。

## 结果与遗留

15 个 A4 单页 PDF，job `HP-LaserJet-M1522nf-MFP-12` ~ `-26` 全部 completed，12:40:54 → 12:44:01。**敏感件（身份证、户口本、病历）仍留在 `tianque:/home/tianque/print-spool-20261007/`，用户未要求清理，留作重打** —— 办完事应删除。
