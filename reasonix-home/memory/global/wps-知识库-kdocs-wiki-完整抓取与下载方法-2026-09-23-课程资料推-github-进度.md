---
id: mem-86f8fd4ad734dee2fc47c8fe791b15c0
revision: 1
created_at: "2026-09-23T08:24:09.4155786Z"
updated_at: "2026-09-23T08:24:09.4155786Z"
name: wps-知识库-kdocs-wiki-完整抓取与下载方法-2026-09-23-课程资料推-github-进度
description: WPS 知识库(kdocs wiki)完整抓取与下载方法 + 2026-09-23 课程资料推 GitHub 进度
metadata:
  type: user
  fact_type: project
  scope: global
---

# WPS 知识库抓取与下载（2026-09-23 攻克）

## 背景
用户在 WPS 365 知识库（365.kdocs.cn/wiki/l/<kuid>）放了 4 个课程知识库，需抓取归档并推 GitHub。旧会话卡在「列目录 API 参数不对」。

## 核心 API（实测可用）
前置：Puppeteer 复用已登录 Chrome profile（`D:/gh-publish/_scripts/chrome-profile`，登录态来自本机 WPS），在页面上下文内 `fetch(..., {credentials:'include'})`。

1. **列目录（关键）**：`GET /3rd/drive/api/v3/groups/{drive_id}/files?parentid={file_id}&offset=0&count=100&order_by=name&order=asc`
   - 参数名是 **`parentid`**（无下划线！），根目录用 `parentid=0`
   - 返回 `{files:[{fname,id,parentid,ftype,fsize,...}]}`，`ftype` 为 `folder`/`file`
   - **踩坑**：`parent_id`、`kuid`、`parent_kuid` 等写法会被静默忽略（每次返回根级内容，看起来像「每个目录返回同一文件」）
   - wiki 侧 `/wiki/api/km/file/node/get?parent_kuid=` **不按 parent 过滤**，`node/list`、`node/children` 均 404，别用
2. **下载**：`GET /3rd/drive/api/v3/groups/{drive_id}/files/{file_id}/download` → JSON `{fileinfo:{url}}`，url 为带签名直链（KSS 签名，无需 cookie），Node 端 https.get 直接存盘。
   - 也可用 `/api/v3/office/file/{file_id}/download` → `{download_url}`（效果相同）
3. **元数据**：`/wiki/api/km/kuid/meta?kuid=<kuid>` 拿 space_name、drive_id
4. `top/list` 返回空、`v5 .../download` 报 `support_checksums not found`、`office/file/{id}/export` 404 —— 都别用

## 4 个知识库（kuid / drive_id）
| kuid | 名称 | drive_id | 文档数 |
|---|---|---|---|
| 0suHP9Mz | CSAPP CMU 15-213 | 3093305423 | 541 |
| 0sJjOpKR | 计算机科学数学 6.042J | 3096640247 | 544 |
| 0stDYtvu | 算法导论 6.006 | 3117825280 | 0 |
| 0sQtGddZ | 线性代数导论 18.06 | 3167554407 | 58 |

## 重要发现：知识库 docx 是空壳
CSAPP/6.042J 里 441/490 个 `.docx` 是 **python-docx 生成的空占位**（docProps/core.xml creator=python-docx、Words=0、缩略图全为同一 8324 字节、document.xml 只有 1 个文本节点=标题）。真正有内容的是手机扫描件（扫描全能王 PDF/JPG）：CSAPP 集中在第 2、8 章（100 个），6.042J 集中在第 18 章（54 个）。
下载的 docx 是壳（36600 字节），`is_convert=true` 也一样，别指望从 docx 拿正文。

## 脚本资产（D:\gh-publish\_scripts\）
kdocs-fetch.js（递归抓树）、kdocs-download.js（批量下载，tree JSON 驱动）、kdocs-probe3.js（参数验证）、reorg_scan.py（按章节重组+重命名）、pdfrender.py / pdfpeek.py（PDF 转图/取文本）、merge_linear.py（倒序单页合并）

# 2026-09-23 课程资料推 GitHub 进度

仓库 TianQue6916（全公开，SSH git@github.com 推送，git 直连可用）：
- ✅ 本轮新推/补全：Linear-Algebra-and-Learning-from-Data（Strang LaLFD 双语+18.065 PS）、Introduction-to-Probability-6.041（94）、Design-and-Analysis-of-Algorithms-6.046J（209）、Computer-Networking-CS144（122）、Convex-Optimization-EE364a（457/45.8MB）、Introduction-to-Linear-Algebra（18.06 教材扫描 2 册，倒序重排）、Computer-Systems-A-Programmer-s-Perspective（CSAPP 第2/8章扫描 101 文件/120MB）、Mathematics-for-Computer-Science（补第18章扫描 54 个，注意该仓库默认分支是 **master** 不是 main）
- ✅ 此前已有：Information-Theory(766)、Introduction-to-Algorithms(721，但混入大量 CppLearning C++ 作业)、Introduction-to-Real-Analysis-18.100B(151)
- 资源主源：`C:\Users\27063\Desktop\课程文件`（006算法导论/100b实分析/data lerning/未学课程/归档文件）
- 未处理：Introduction-to-Algorithms-codetry（旧空仓库）、论文类文件（全盘未搜到用户自己的论文）
