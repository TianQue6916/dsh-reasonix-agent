import { readFile } from 'node:fs/promises'
import { remember } from 'file:///C:/Users/27063/.dsh/storages/tools/memory-write-helper.mjs'
const body = await readFile('C:/Users/27063/.dsh/scratch/body2.tmp.md','utf8')
console.log(await remember({
  name: 'verification-fixes-and-tests-20260927',
  description: '近三天核验中 4 个可修缺陷的修复与测试闭环：backup-to-github.ps1 副本漂移（实为 junction + vendored 快照，缺 user_ 脱敏与 3b 全量扫描）、github 加速 fact 与实现漂移（硬编码 gh-proxy.com vs 实际 ~/.ghmirror-git 选优）、skill 用量加权从未触发（headless 真跑生成账本 + A/B 证明排序改变）、3080 开机自启冷启动（5.45s 返回、URL 存档、日志 0 错误）。含三条元教训：判据写错会伪装成产品缺陷、配置类 fact 应指向真相文件、同一失效模式跨层传导',
  factType: 'reference',
  body,
}))
