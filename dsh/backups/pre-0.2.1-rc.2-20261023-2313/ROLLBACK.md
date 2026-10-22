# 回滚到 0.2.0-rc.2（升级 0.2.1-rc.2 之前的快照）

备份时间：2026-10-22T23:14:16
全局 dsh 版本：0.2.0-rc.2
git 快照：`git -C ~/.dsh reset --hard <tag>`（tag 名见 git tag | grep pre-0.2.1-rc.2）

## 1. 全局 dsh 回滚
    npm i -g @deepseek-ai/dsh@0.2.0-rc.2 --registry=https://registry.npmmirror.com

## 2. profile 配置回滚
    BK=C:\Users\27063\.dsh\backups\pre-0.2.1-rc.2-20261023-2313
    for p in desktop web headless; do
      cp -a "$BK/$p/package.json"      ~/.dsh/profiles/$p/ 2>/dev/null
      cp -a "$BK/$p/cordis.patch.yml"  ~/.dsh/profiles/$p/ 2>/dev/null
      cp -a "$BK/$p/cordis.yml"        ~/.dsh/profiles/$p/ 2>/dev/null
    done
    # 然后重装依赖：cd ~/.dsh/profiles/desktop && npm install

## 3. 版本对照
versions-before.json（profile 声明） / installed-before.json（node_modules 实际）
