// 纯文本检查：抓「公式会吞行」与非法定界符（不依赖 KaTeX）。
// 用法: node check-dollar.js <file.md>
const fs = require('fs');
const NL = String.fromCharCode(10);
const D = String.fromCharCode(36);
const BS = String.fromCharCode(92);
const lines = fs.readFileSync(process.argv[2], 'utf8').split(NL);
let bad = 0, inCode = false, inMath = false;
for (let i = 0; i < lines.length; i++) {
  const ln = lines[i], t = ln.trim(), at = i + 1;
  if (inMath) { if (t.slice(0, 3) === '```') inMath = false; continue; }
  if (inCode) { if (t.slice(0, 3) === '```') inCode = false; continue; }
  if (t === '```math') { inMath = true; continue; }
  if (t.slice(0, 3) === '```') { inCode = true; continue; }
  if (ln.split(D + D).length > 1) { console.log('L' + at + ' 出现双美元定界符（禁用）'); bad++; }
  const n = ln.split(D).length - 1;
  if (n % 2 !== 0) { console.log('L' + at + ' 美元符个数为奇数(' + n + ')，公式会吞到下一行: ' + ln.slice(0, 80)); bad++; }
  if (ln.split(BS + '[').length > 1 || ln.split(BS + ']').length > 1) { console.log('L' + at + ' 出现方括号公式定界符（会被渲染器当成 display math 起点）'); bad++; }
}
console.log('异常行 ' + bad + ' 处' + (bad === 0 ? ' [PASS]' : ' [FAIL]'));
process.exit(bad === 0 ? 0 : 1);
