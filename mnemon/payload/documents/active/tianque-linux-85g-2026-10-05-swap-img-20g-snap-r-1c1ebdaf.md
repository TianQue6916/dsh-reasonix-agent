---
id: "1c1ebdaf-ffa8-4f2f-8a76-b7808f81690a"
title: "小机 TianQue Linux 根分区 85G 占用账本（2026-10-05）：/swap.img 20G 纯白占的三条证据、snap 旧 revision 2.8G、分级回收方案"
description: "2026-10-05 小机（Ubuntu，192.168.243.2）root nvme0n1p5 150G/已用 85G 的逐层占用调查：一级与二级明细、\"啥都没下却 85G\"的十一类主题归并、/swap.img 20G 但 used 0B / PRIO -1 的零风险回收判据、snap disabled revision 2.8G、回收方案表与必须人工确认的 Trash 清单、故意不做的项与可复用扫描命令。"
status: "active"
created_at: "2026-10-05T12:22:45.872Z"
updated_at: "2026-10-05T12:22:45.872Z"
content_hash: "6ff9762981ca574407c221b64f5da272552957c6826f9e5fc4a359aac9afd2dd"
source_paths:
  []
session_ids:
  - "c64a75b5-e5bc-471b-9ca4-3362799b7494"
memory_body_ids:
  []
---

# 小机 TianQue Linux 根分区 85G 占用账本（2026-10-05）

调查起点：用户问「小电脑的 linux 盘看看都是啥玩意占硬盘，啥都没下怎么这么多」。

## 结论一句话

没有巨型文件，85G 全是**长尾开发栈**堆出来的；其中最刺眼的是 `/swap.img` **20G 但 used 0B**（16G 内存 + zram 在跑，纯占位），加上 snap 旧 revision 2.8G，**约 23G 可零/极低风险回收，占用率 61% → ~42%**。

## 环境基线

小机 TianQue，Ubuntu，有线 ping 1ms（SSH 可达 192.168.243.2）。

```
文件系统        大小  已用  可用 已用% 挂载点
/dev/nvme0n1p5  147G   85G   55G   61% /
/dev/nvme0n1p1  256M   42M  215M   17% /boot/efi
/dev/nvme0n1p3  803G  465G  338G   58% /media/OS   (NTFS, 课程文件所在)
zram0           7.6G                    [SWAP]
```

**纠错**：内存实为 **15Gi（16G）**，不是先前从 zram0 7.6G 反推的 8G。`free -h` 为准。

## 一级账（du -xhd1 /）

| 目录 | 占用 | 主要构成 |
|---|---|---|
| `/home` | 31G | 见二级账 |
| `/swap.img` | 21G | `usused 0B`，见专章 |
| `/usr` | 19G | share 12G / lib 4.6G / bin 1.3G |
| `/var` | 10G | lib 8.6G（snapd 7.7G）/ log 727M / cache 594M |
| `/opt` | 5.8G | kingsoft 2.1G / apps 996M / wechat 717M / dev-sidecar 458M / google 437M / Deskreen 423M / Kudu 413M / marktext 348M |
| `/boot` | 218M | — |
| 其他 | <40M | root 37M / etc 14M / tmp 420K |

### 二级：/home/tianque（含隐藏目录，31G）

```
9.8G  .local       → Trash 3.9G / pipx 1.3G / uv 922M / Kingsoft 541M / traecli 415M / lib 810M / bin 758M
5.6G  .cache       → ms-playwright 1.6G / uv 1.1G / pip 1023M / puppeteer 636M / reasonix 377M / JetBrains 369M / babeldoc 330M
3.1G  .elan
2.2G  data         1.8G .reasonix    1.5G ark_env    1.3G snap
1.1G  .npm         1.1G .config      976M .vscode    381M dsh-test   368M .dsh
247M  文档          216M 下载        209M chongchongpiano_downloader
179M  .xwechat     177M .paddlex    152M kvrt.run   111M .backup
```

**方法坑**：`du -sh /home/*/*` 只匹配非隐藏目录，合计 7.5G，与 `/home` 31G 差 23.5G —— **必须补扫 `/home/tianque/.*`**，否则隐藏目录全部漏账。

### 二级：/usr/share（12G）与 /var/lib（8.6G）

```
/usr/share: doc 3.5G / texlive 3.2G / trae-cn 1.3G / code 988M / fonts 727M / texmf 387M
/var/lib:   snapd 7.7G / apt 435M / texmf 256M / dpkg 146M / flatpak 37M
/var/lib/snapd/snaps: pycharm-community_672 1.4G、_662 1.3G、gnome-46-2404 615M、
                      gnome-42-2204 532M×2、mesa-2404 395M+402M、firefox 261M×2、wps-linux 570M …
```

## 「啥都没下」其实是「下了一整套开发栈」

按主题归并（无单项巨型文件，全是几百 M 的长尾）：

| 主题 | 明细 | 合计 |
|---|---|---|
| snap 体系 | /var/lib/snapd 7.7G + ~/snap 1.3G | 9.0G |
| Python 生态 | pip cache 1023M + uv(cache 1.1G+share 922M) + pipx 1.3G + paddlex 177M | 4.5G |
| 编辑器 / IDE | /usr/share/code 988M + .vscode 976M + trae-cn 1.3G + traecli 415M + JetBrains 369M | 4.0G |
| LaTeX | texlive 3.2G + texmf 387M + /var/lib/texmf 256M | 3.8G |
| 回收站 | ~/.local/share/Trash | 3.9G |
| Lean 工具链 | .elan | 3.1G |
| WPS | /opt/kingsoft 2.1G + Kingsoft data 541M | 2.6G |
| 浏览器自动化 | ms-playwright 1.6G + puppeteer 636M | 2.2G |
| reasonix | .reasonix 1.8G + cache 377M + share 46M | 2.2G |
| Node 生态 | .npm 1.1G + node 84M + node-gyp 56M + pnpm 59M | 1.3G |
| 微信 | /opt/wechat 717M + .xwechat 179M | 0.9G |

## 核心发现：/swap.img 20G，一个字节都没用

```
$ swapon --show
NAME       TYPE      SIZE USED PRIO
/swap.img  file       20G   0B   -1
/dev/zram0 partition 7.6G 656K  100
$ free -h        →  内存 15Gi / 已用 2.0Gi / 可用 13Gi
$ ls -lh /swap.img  → -rw------- 1 root root 20G 9月 11 23:35
$ du -h /swap.img   → 21G        （实占，非 sparse）
$ grep -n swap /etc/fstab → 12:/swap.img  none  swap  sw  0  0
```

**三条独立证据说明它是纯占位**：

1. `USED 0B` —— 开机至今从未写入；
2. `PRIO -1` vs zram 的 `100` —— 内核优先用 zram，swapfile 是备胎中的备胎；
3. 16G 内存 + 13G available —— 除休眠外轮不到 swap。

**且 20G 不符合 Ubuntu 任何自动规则**（>8G 内存默认 ~4G swapfile；hibernation 规则也只是配同内存大小），文件 mtime `9月 11 23:35` ⇒ 当初手动 `fallocate` 出来的。**16G 内存留 4G 应急 swap + 7.6G zram 足够，可回收 16G。**

## 分级回收方案

| 操作 | 回收 | 风险 |
|---|---|---|
| `/swap.img` 20G → 4G | 16G | 零（used 0B，`swapoff` 不涉及数据搬迁） |
| 删 snap disabled revision | 2.8G | 极低（丢回滚能力） |
| `pip cache purge` + `uv cache clean` | 2.1G | 零（wheel 可重建） |
| 删 `~/.cache/ms-playwright` + `puppeteer` | 2.2G | 低（用时重下） |
| Trash 挑着删 | ≤3.9G | **须用户确认** |
| **合计（不动 Trash）** | **≈23G** | 85G → 62G，61% → 42% |

snap 旧 revision（`snap list --all` 中 12 个 `disabled`）：pycharm-community_662 1.3G、gnome-42-2204_247 532M、mesa-2404_1165 395M、firefox_8819 261M、core20/22/24 各 64–74M、其余约 90M，合计 ≈2.8G。

### ⚠️ Trash 不是垃圾（删前须人工过目）

`~/.local/share/Trash/files` 3.9G / 30 项，含 `TBB-AllChapters-Portrait.pdf`、`Strang_LaLFD_part002_p051-100.bilingual.pdf`、`L12.bilingual.pdf`（双语成果）、目录 `数学分析` / `数学分析.2` / `lecture` / `output_file_tmp`、`W13/W14/cr_W13/cr_W14.md`、`fwts权威诊断报告-20260903.md`、`usage_data_2026-07-21_2026-08-19`。**真垃圾只有一堆 `wps-office-*.desktop` / `com.alibabainc.dingtalk.desktop` 与 `_wtest.txt` / `_probe.md`。禁 `rm -rf Trash/*`。**

## 故意不做的

- `/usr/share/doc` 3.5G —— 删了破坏 dpkg 一致性，`dpkg --verify` 会报错，不值当。
- `.elan` 3.1G —— Lean 形式化那条线若仍在用则保留。

## 可复用扫描命令

```
du -xhd1 / ; du -sh /home/tianque/.* ; du -sh /var/lib/* /opt/* ; du -sh /usr/share/*
free -h ; swapon --show ; du -h /swap.img ; grep -n swap /etc/fstab
snap list --all | grep disabled ; ls -lh /var/lib/snapd/snaps/
du -sh ~/.cache/* ~/.local/share/*
```

**判据沉淀**：swapfile 的大小占用看 `du`（非 sparse）；**是否值得留看 `swapon --show` 的 USED 与 PRIO**（有 zram 且 PRIO 更高时，swapfile 常年 0B ⇒ 纯占位）。

## 关联

- `63c87fcc-77fb-49ae-814c-3b07b3b709ab` —— 双机 SSD 写入量对照（同日、同一台小机 INTEL TLC SMART 基线）；本次未做磁盘写入口径分析。
- `4eef00de-23d0-46ac-a807-e6e34cecc71d` —— D 盘清理中的「逻辑大小 ≠ 物理占用」判据，与本案 `du` vs `ls` 口径互参。
