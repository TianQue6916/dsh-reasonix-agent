import { readFile } from 'node:fs/promises'
import { remember } from 'file:///C:/Users/27063/.dsh/storages/tools/memory-write-helper.mjs'
const body = await readFile('C:/Users/27063/.dsh/scratch/body.tmp.md','utf8')
console.log(await remember({
  name: 'github-加速体系与镜像自动选优-20260927',
  description: 'GitHub 加速三路径体系 + 镜像生态三类分化实测 + 自动化盘点 + 8 个踩坑。【2026-09-27 更正】git 侧不是固定 gh-proxy.com，而是由 ~/.ghmirror-git 每日选优决定（当前 edgeone.gh-proxy.org），与 gitconfig insteadOf 一致',
  factType: 'reference',
  body,
}))
