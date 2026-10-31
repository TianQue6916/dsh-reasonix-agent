# dsh-linux-fix

dsh 在 Linux 端起不来 / `dsh web` 报一堆 `Plugin ... is incompatible with dsh ...` 时的
**诊断 + 可逆修复 + 验收**工具。

配套分析见同目录 `REPORT.md`（机制、复现数据、判定树、社区证据）。

## 两条命令

```bash
chmod +x dsh-linux-fix.sh

bash dsh-linux-fix.sh            # DRY-RUN：只读，什么都不改
bash dsh-linux-fix.sh --apply    # 真修：先自动备份，可回滚
```

指定别的 profile：`DSH_PROFILE=headless bash dsh-linux-fix.sh`

## 它会做什么

| 阶段 | 动作 |
|---|---|
| 0 | 读 dsh 版本（`dsh --version`，失败回落全局 npm 包的 package.json）、node 版本、profile 完整性 |
| 1 | `--apply` 时把 `package.json / compatibility.json / cordis.patch.yml / cordis.yml / pnpm-lock.yaml` 备份到 `$DSH_HOME/_repair-backup-<ts>/` |
| 2 | 逐 bundle 复刻官方 `unmetRequirements()` 判定，输出 `OK / EXEMPTED / FAIL / MISSING / WINONLY`，并和官方 `evaluatePluginCompatibility` 交叉验证 |
| R1 | 把当前 dsh **精确版本**合并进 `compatibility.json`（读-改-原子写，`0600`） |
| R2 | 从 `dsh.profile.bundles` 剔除 Linux 不可能加载的项（`os` 排除 linux、`link:D:\...`），**不动 dependencies** |
| 3 | `dsh --profile <p> --dump-config` 零副作用验收：统计 `incompatible / skipping / duplicate / entry 数 / 3080 占用` |

## 它不会做什么（故意的）

- 不删包、不 `pnpm remove`、不降级 dsh。
- 不自动改 `cordis.patch.yml`（`duplicate loader entry id` 只报告不修）。
- 不在 DRY-RUN 模式下写任何文件。

## 回滚

`--apply` 结束时会打印备份目录；回滚：

```bash
cp -p ~/.dsh/_repair-backup-<ts>/package.json       ~/.dsh/profiles/web/
cp -p ~/.dsh/_repair-backup-<ts>/compatibility.json ~/.dsh/profiles/web/
```

## 前置

bash、node（dsh 自带即可）、dsh 在 PATH 上。不需要 jq、不需要 python。

## 验证状态

- Windows 侧对真实 `profiles/web` 跑过三段实验：缺 `compatibility.json` → `incompatible 告警=2 / entries 432`；
  `--apply` 后 → `告警=0 / entries 434`，与本机原有状态一致。详见 `REPORT.md` §2。
- Linux 侧**尚未实测**（本会话不在 Linux 上）。第一次请务必先 DRY-RUN。
