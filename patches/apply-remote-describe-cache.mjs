#!/usr/bin/env node
/**
 * 给 ds-harness-remote 的 `harness.transport.describe` 探测加「进程级缓存」。
 *
 * 问题：dist/remote-typert-gateway.js 的 open() 里，每开一条 stream 若
 * this.frameTransfers 未定，就 await 一次 `harness.transport.describe`。
 * 实测这个 RPC 单次 2.0–4.7 秒（p50 2667ms），而 page load 会建几十个 gateway
 * 实例 → 反复问同一个问题 → 事件循环长期堵在等 RPC 上。
 *
 * 症状：UI/动画正常（走合成层），但会话记录不更新（JS 事件循环被堵）。
 *
 * 修法：把「问一次」的结果缓存到 globalThis，整个进程只问一次。
 *
 * 用法（幂等，可重复跑）：
 *   node apply-remote-describe-cache.mjs                 # 扫默认 profile 目录
 *   node apply-remote-describe-cache.mjs <dir> [dir...]  # 扫指定目录下的 node_modules
 *   node apply-remote-describe-cache.mjs --revert        # 从 .bak-describe-cache 还原
 *
 * 注意：node_modules 目录被 ~/.dsh/.gitignore 通配忽略，git 抓不到这个改动。
 * 所以它靠本脚本持久化：重装/升级 ds-harness-remote 之后**必须重跑一次**。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const MARK = '__DSH_FT_CACHE__';
const BAK = '.bak-describe-cache';
const ORIGINAL = [
    "            if (this.frameTransfers === undefined) {",
    "                const description = await this.client.rpc('harness.transport.describe', {}, signal);",
    "                this.frameTransfers = isRecord(description) && Array.isArray(description.capabilities)",
    "                    && description.capabilities.includes('harness.remote.stream.transfer.v1');",
    "            }",
];
const PATCHED = [
    "            if (this.frameTransfers === undefined) {",
    "                const g = globalThis;",
    "                if (g.__DSH_FT_CACHE__ === undefined) {",
    "                    const description = await this.client.rpc(\"harness.transport.describe\", {}, signal);",
    "                    g.__DSH_FT_CACHE__ = isRecord(description) && Array.isArray(description.capabilities)",
    "                        && description.capabilities.includes(\"harness.remote.stream.transfer.v1\");",
    "                }",
    "                this.frameTransfers = g.__DSH_FT_CACHE__;",
    "            }",
];

const args = process.argv.slice(2);
const revert = args.includes('--revert');
const dirs = args.filter((a) => !a.startsWith('--'));

if (dirs.length === 0) {
    const home = os.homedir();
    dirs.push(path.join(home, '.dsh', 'profiles'));
}

/** 递归找所有 ds-harness-remote/dist/remote-typert-gateway.js（浅扫描，避免进 node_modules 深处） */
function findTargets(root) {
    const out = [];
    const walk = (dir, depth) => {
        if (depth > 6) return;
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const e of entries) {
            if (!e.isDirectory()) continue;
            if (e.name === 'ds-harness-remote') {
                const f = path.join(dir, e.name, 'dist', 'remote-typert-gateway.js');
                if (fs.existsSync(f)) out.push(f);
                continue;
            }
            if (e.name === '.git' || e.name === 'sessions' || e.name === 'cache') continue;
            walk(path.join(dir, e.name), depth + 1);
        }
    };
    walk(root, 0);
    return out;
}

function checkSyntax(file) {
    try {
        execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

let changed = 0;
let skipped = 0;
let failed = 0;

for (const root of dirs) {
    const targets = findTargets(root);
    if (targets.length === 0) {
        console.log(`[skip] ${root} 下没找到 ds-harness-remote`);
        continue;
    }
    for (const file of targets) {
        const src = fs.readFileSync(file, 'utf8');

        if (revert) {
            const bak = file + BAK;
            if (!fs.existsSync(bak)) {
                console.log(`[skip] ${file} 没有 ${BAK}，未打过补丁`);
                skipped++;
                continue;
            }
            fs.copyFileSync(bak, file);
            console.log(`[revert] ${file}`);
            changed++;
            continue;
        }

        if (src.includes(MARK)) {
            console.log(`[ok] ${file} 已打过`);
            skipped++;
            continue;
        }

        const block = ORIGINAL.join('\n');
        if (!src.includes(block)) {
            console.log(`[fail] ${file} 找不到原始代码块（上游结构变了？）`);
            failed++;
            continue;
        }

        fs.writeFileSync(file + BAK, src);
        const next = src.replace(block, PATCHED.join('\n'));
        fs.writeFileSync(file, next);

        if (!checkSyntax(file)) {
            fs.copyFileSync(file + BAK, file);
            console.log(`[fail] ${file} 打完语法不通过，已回滚`);
            failed++;
            continue;
        }
        console.log(`[patched] ${file}`);
        changed++;
    }
}

console.log(`\n完成：改动 ${changed}，已是最新 ${skipped}，失败 ${failed}`);
if (!revert && changed > 0) {
    console.log('生效需要重启 dsh（桌面端或 dsh web）。');
}
process.exit(failed > 0 ? 1 : 0);
