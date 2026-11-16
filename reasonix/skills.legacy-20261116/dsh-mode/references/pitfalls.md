> 来源：本技能原 `SKILL.md` 第九～十节（2026-10-01 重排时逐字保留，未作压缩）。

## 九、已知坑

1. dev-sidecar 死代理会挂 npm（已清用户级代理变量）
2. headless 无 preset 选择——锚定靠 profile patch；web 才有 preset 选择
3. 会话日志按 cwd 分组：`~/.dsh/sessions/<cwd-encoded>/`
4. 本机 dsh 在 `~/.local/node22/bin/dsh`（系统 node 18 未动），主力机在 npm 全局
5. **（0.1.5）会话文件是多帧 zstd**：`session.v3.jsonl.zstd` 由大量独立 zstd 帧拼接（一个会话实测 720 帧），**Node 的 `zstdDecompressSync` 只解第一帧**（表现为"解压后仅剩 header 行"，本次踩到）。逐帧解压法：扫描 magic `28 b5 2f fd` 的每个 offset，对 `buf.subarray(offset)` 调 `zstdDecompressSync`，按 `type+seq` 去重（脚本已存 `~/.dsh/_backup-20260920-upgrade/dump-session.mjs`）。zstd **CLI**（`zstd -dc`）按标准支持多帧拼接，`dsh-gate.sh` 的 `find -name "*.zstd"` + `zstd -dc` 因此无需改动；若某次输出明显截断，再改用逐帧脚本。
6. **（0.1.5）profile 的 `node_modules` 是被 CLI 改写的 junction**：`~/.dsh/profiles/node_modules/@deepseek-ai/*` 全是指向 *当前 dsh 安装目录* 的 junction，**每当任何一个 dsh CLI 实例启动就会重建**。用临时目录里的 dsh 跑一次，就会把生产 profile 的 249 个链接全部改指到临时目录（本次实测踩到，用生产 `dsh --profile headless ...` 跑一次即可自动改回）。做版本对照实验时，务必用独立的 `DSH_HOME`，不要只换 CLI 路径
7. **（0.1.5）插件默认挂载变化**：`str_replace_editor` 不再默认（见第三节）；`tool-subagent-report` 已并入 `dsh-tool-subagent`；`dsh-client-runtime` / `dsh-host-apiproxy` / `node-addon-landlock-run` 不再随包分发（升级后会留下 9 个失效 junction，须手工删）
8. **（0.1.5）preset 的 persona 字段改名（最隐蔽的坑）**：`@deepseek-ai/dsh-persona` 的 config 由 `text`（0.1.1）改为 **`prefix`（必填）**，另有 `suffix` / `complete` / `includeRuntimeContext`。写旧名 `text` → 该行 `invalid config` → **整个 preset 挂载失败** → web 侧选该 preset 时「选择工作区」报
   `SessionCreateError: agent-preset/invalid: agent-presets: preset "<name>" failed to mount: failed to apply loader entry persona (@deepseek-ai/dsh-persona): invalid config`
   **表现**：点了工作区也进不去会话（页面始终无输入框）。**诊断法**：这个错误**只在浏览器 console 里**（`console.warn`），服务端 stdout 不打印 —— 必须用 `page.on('console')` 抓；单看 dsh 进程输出会误判成"UI 卡住"。

## 十、2026-08-16 实测事实（v1.1 新增，防止错误结论扩散）

1. **锚定机制生效但轨迹未迁移**：本机 8 个 live 会话首请求 tools=2（bash+str_replace_editor）100% 生效，但 reasoning 首行全部 "Let me …"（let_me=6~143），**无一 "We need"**。上游 98/99（Project2 英文编码任务）在本机中文架构任务上**不成立**。正确预期：锚定 = 首轮噪声隔离与成本结构优化，**不是**轨迹风格保证；不要以 we/let me 指纹作为本机 dsh 健康度指标。
2. **settings.yaml 中继状态**：dsh-gate 运行时临时改写 settings.yaml（trap EXIT INT TERM 恢复）；SIGKILL/断电会残留 pro+max，下个简单任务烧 pro。已加固：flock 并发锁（同机第二实例 exit 9）+ 启动预检（发现 .bak 即恢复）。**dsh-gate 同机不可并发**。
3. **三插件实态**：dsh-hooks 0.2.2 原本未配（2026-08-16 已补 turn/end 落盘）、dsh-llm-fallbacks 0.1.4 默认关（已补 settings.yaml `fallbacks:` 节，pro 失败降 flash）、dsh-model-router 0.8.1 auto 保留。⚠️ **2026-09-20 作废**：三个外装插件均已不在 profile（`dependencies` 为空），见第五节订正与第十一节。
4. **routing-suite 结论**：不装。issue #13（首轮路由结构性失效，所有会话首轮落 weak）+ PR #10 只修 near-field + 与 dsh-gate 功能重叠。复查触发：issue #13 关闭 + 官方 rc.7 发布后再评估。（注：dsh-gate 的 HARD_PATTERNS 关键词判定已于 2026-09-09 废除，routing-suite 更无重叠价值）
