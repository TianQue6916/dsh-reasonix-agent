const fs = require("fs");
const katex = require(process.argv[3] + "/node_modules/katex");
const data = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const bad = {};
let total = 0, fails = 0;
for (const [file, items] of Object.entries(data)) {
  for (const it of items) {
    total++;
    try {
      katex.renderToString(it.tex, { throwOnError: true, displayMode: it.kind === "block", strict: false });
    } catch (e) {
      fails++;
      (bad[file] = bad[file] || []).push({ line: it.line, kind: it.kind, tex: it.tex.slice(0, 160), err: String(e.message).slice(0, 120) });
    }
  }
}
const out = { total, fails, files_with_errors: Object.keys(bad).length, bad };
fs.writeFileSync(process.argv[4], JSON.stringify(out, null, 1));
console.log("total " + total + " fails " + fails + " files " + Object.keys(bad).length);
