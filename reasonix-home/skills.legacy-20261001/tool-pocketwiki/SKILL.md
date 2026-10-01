---
name: tool-pocketwiki
description: 方舟知识库 PocketWiki 启动/查询/追加笔记 — HTTP 127.0.0.1:8808，零依赖
---

---
name: tool-pocketwiki
description: 方舟知识库 PocketWiki — 启动/查询/追加笔记。HTTP://127.0.0.1:8808，Python 标准库零依赖
---

# Tool: PocketWiki 方舟知识库

个人知识库系统（PocketWiki），存有用户全部学习笔记、思考、DeepSeek 对话记录（103+ 页）。

## 启动（如未运行）

```bash
cd /home/tianque/.reasonix/global-workspace && python3 pocket-wiki.py
# 后台方式: nohup python3 pocket-wiki.py >/tmp/pocket-wiki.log 2>&1 &
```

- 服务地址: http://127.0.0.1:8808（仅本机）
- 数据目录: `/home/tianque/.reasonix/global-workspace/pages/`（每个 .md 文件 = 一个页面）

## 使用场景

1. **查用户过去的笔记/对话记录**：先 `grep -r "关键词" /home/tianque/.reasonix/global-workspace/pages/` 或 curl http://127.0.0.1:8808 在线浏览
2. **追加新知识页**：在 `pages/` 下创建 `<标题>.md`，重启服务或直接写入
3. **导入对话**：参考 `import_to_wiki.py`

## 注意事项

- 服务可能未运行（检查 `ss -tlnp | grep 8808`）
- Wiki 数据曾在 NTFS 分区（`/media/tianque/OS/wiki-data/`），若 `pocket-wiki.py` 不在 workspace 则需先挂载：`udisksctl mount -b /dev/nvme0n1p3`
- 查询时优先给「答案段落 + 页面标题」，避免输出整页
