// KaTeX 渲染校验：逐条检查 md 里的行内 $...$ 与 ```math 块。
// 源码刻意不使用任何反斜杠字面量（用 String.fromCharCode(10) 代替换行），
// 这样复制到任何 heredoc / 模板里都不会被转义破坏。
// 用法: node check-katex.js <file.md> [katex模块路径]
const fs = require('fs');
const NL = String.fromCharCode(10);
const DOLLAR = String.fromCharCode(36);
const file = process.argv[2];
const katexPath = process.argv[3] || 'katex';
const katex = require(katexPath);
const lines = fs.readFileSync(file, 'utf8').split(NL);
const items = [];
let inCode = false, inMath = false, buf = [], start = 0;
for (let i = 0; i < lines.length; i++) {
  const ln = lines[i], t = ln.trim();
  if (inMath) {
    if (t.slice(0, 3) === '```') { items.push({ line: start, tex: buf.join(NL), display: true }); inMath = false; buf = []; }
    else buf.push(ln);
    continue;
  }
  if (inCode) { if (t.slice(0, 3) === '```') inCode = false; continue; }
  if (t === '```math') { inMath = true; buf = []; start = i + 2; continue; }
  if (t.slice(0, 3) === '```') { inCode = true; continue; }
  const parts = ln.split(DOLLAR);
  for (let k = 1; k < parts.length; k += 2) items.push({ line: i + 1, tex: parts[k], display: false });
}
let bad = 0;
for (const it of items) {
  if (it.tex.trim() === '') continue;
  try { katex.renderToString(it.tex, { throwOnError: true, displayMode: it.display }); }
  catch (e) {
    bad++;
    console.log('L' + it.line + ' [' + (it.display ? 'block' : 'inline') + '] ' + String(e.message).split(NL)[0]);
    console.log('   tex: ' + it.tex.split(NL).join(' / ').slice(0, 120));
  }
}
console.log('公式总数 ' + items.length + '，渲染失败 ' + bad + ' 条' + (bad === 0 ? ' [PASS]' : ' [FAIL]'));
process.exit(bad === 0 ? 0 : 1);
