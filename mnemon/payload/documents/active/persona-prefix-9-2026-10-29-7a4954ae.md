---
id: "7a4954ae-28b2-4180-bdb3-5d3d5cbc672f"
title: "「用开源就记账」纪律落地到 persona prefix 第 9 条：选层判断、三端注入点差异与验证链（2026-10-29）"
description: "2026-10-29 把 star 记账/回馈纪律从热记忆提升到 persona prefix（system prompt）的落地记录：为何选 prompt 层而非 MEMORY.md（容量 9304/10240）、web/desktop 各 +12 行、headless 无 persona 段故跳过、--dump-config 与 Electron 独占锁的验证边界、YAML 块标量重复静默无报错的坑。"
status: "active"
created_at: "2026-10-28T16:50:47.839Z"
updated_at: "2026-10-28T16:50:47.839Z"
content_hash: "9644fa6d05c917d62453840fb2bf114c7a53ce04331a82a4ab9ac4c1f8e87d5a"
source_paths:
  - "profiles/web/cordis.patch.yml"
  - "profiles/desktop/cordis.patch.yml"
  - "profiles/headless/cordis.patch.yml"
  - ".dsh/contrib/star-audit.py"
session_ids:
  - "659249a7-d62b-485a-8d52-ccc69d56e73b"
memory_body_ids:
  []
---

# 「用开源就记账」纪律落地到 persona prefix（2026-10-29）

## 背景与目标

用户要求：agent 每采用/受助于一个开源项目（装包、clone 仓库、启用 skill/plugin、照抄实现、查 issue），都要在回复里点名 owner/repo 并补 star。先在线下手做过一轮（34 → 47 star，`star-audit.py --star` 幂等补齐），用户随后指出：光靠热记忆会忘，应该在**提示词注入层**就带上。

## 选层判断（关键 rationale）

| 候选层 | 结论 | 理由 |
|---|---|---|
| 热记忆 MEMORY.md | 已占用 | 实测 `9304 / 10240 bytes`，仅剩约 900 B；再写入会挤掉旧条目 |
| persona prefix | **采用** | 不占 runtime 容量，且每轮必然在场，不依赖 recall 命中 |
| session-end hook | 否 | `~/.dsh/profiles/*/cordis.patch.yml` 里没有现成 hook 声明点，`dsh-hook-protocol` 需先写 plugin；为一个提醒写 plugin 属成本递增原则下的负收益 |
| 脚本 + ledger | 保留 | `~/.dsh/contrib/star-audit.py` 负责幂等执行与留痕（`star-ledger.jsonl`） |

最终形成三层互补：prompt 层管「该做」（无条件在场）→ 热记忆管「怎么做」（细节与踩坑）→ 脚本管「做了没有」（可核验）。缺第 1 层会忘，缺第 3 层会作假。

## 落地内容

新增第 9 条，紧跟在已有的第 8 条（「任何问题都先查资料和社区经验，再动手」）之后，位于 `persona` 的 `prefix` 块标量内：

```
9. **用了别人的东西就记账、就回馈**（2026-10-29 用户要求，默认礼数，不必等提醒）：
   凡是本轮实际采用或受助于某个开源项目 —— 新装的包、clone 的仓库、启用的 skill / plugin、
   照抄的实现思路、查过的 issue / discussions —— 都在回复里点名它（owner/repo）并顺手补 star。
   批量：`python ~/.dsh/contrib/star-audit.py --star`（幂等；三探针扫本机已装 / 已 clone /
   已在 profile 声明的仓库，补 star 并追加 ~/.dsh/contrib/star-ledger.jsonl）。
   自己的仓库（TianQue6916/*）只记账不 star；transitive 依赖不 star ——
   star 列表是「我关注的工具」，依赖清单归 ledger 文件。
```

## 三端注入点差异（可复用的约束）

- `profiles/web/cordis.patch.yml`：+12 行，已注入。
- `profiles/desktop/cordis.patch.yml`：+12 行，结构同源。
- `profiles/headless/cordis.patch.yml`：**未改** —— 该 profile 没有 `persona` / `prefix` 段，走默认 identity，没有插入点。不要再徒劳找「第 8 条锚点」。

生效方式：profile patch 参与 `patchReload: live` 的 HMR，开新会话即生效，不需要重启 dsh 进程（已存在 session 的 system prompt 在创建时固定，仍是旧 prompt）。

## 验证链与边界

- `dsh --profile web --dump-config` → **exit=0**，输出 87683 B，新条目命中 1 次 ⇒ patch 合成合法。
- `dsh --profile desktop --dump-config` → **exit=1**：`profile "desktop" is managed exclusively by the Electron application`，CLI 无法预校验，只能靠结构同源 + 实际启动确认。
- `git diff --stat` 应干净显示 `+12`（每份文件）。

## 本次踩到的坑

1. **YAML 块标量里的重复段不会报错**：第一版插入脚本 `new_lines` 构造写错（`i==0` 用整块、`i>=1` 又逐行），把整条写了两遍；`grep -c` 报 2 才发现。`yaml.safe_load` 对这种重复完全不报错，肉眼也不易察觉 —— 改 patch 后必须用 `--dump-config` 或计数复核，不能看文件「看起来对」。
2. **PyYAML 解析这两份 patch 会失败**：文件用了 `!!js` 自定义 tag（如 `command: !!js process.execPath`、`disabled: !!js process.platform === 'win32'`），`yaml.safe_load` 报 `could not determine a constructor for the tag 'tag:yaml.org,2002:js'`。这是既有设计，不是插入引起的，别被误导为「改动破坏了 YAML」。要校验就用 `dsh --dump-config`，不要用 PyYAML。

## 相关文档

- `efcb68aa-835e-4e42-8de2-26b6c2e154b3`（语言分层契约写入 persona prefix 的选型论证与三端落地，同一注入点、同一验证手段）。
- star 记账的工具与实测坑（`star-audit.py` 三探针、307 改名、`full_name` 大小写、`curl` vs `urllib` SSL）已存在于热记忆条目中，此文档不重复。
