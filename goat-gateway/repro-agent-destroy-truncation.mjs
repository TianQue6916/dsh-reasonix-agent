// repro-agent-destroy-truncation.mjs — 证明 http.Agent.destroy() 会腰斩 in-flight SSE 流，
// 以及「有活跃 socket 就跳过回收」这道守卫能救回来。
// 对应 gateway.mjs:194-202 getAgent() 的 agentMaxAgeMs 回收逻辑。
// 跑法：node ~/.dsh/storages/tools/repro-agent-destroy-truncation.mjs
import http from 'node:http';

const CHUNKS = 30, GAP = 200;   // 6s 的流，模拟长 turn
const KILL_AT = 1000;           // 1s 时触发回收

function serve() {
  const srv = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    let i = 0;
    const t = setInterval(() => { res.write(`data: ${i}\n\n`); if (++i >= CHUNKS) { clearInterval(t); res.end(); } }, GAP);
    req.on('close', () => clearInterval(t));
  });
  return new Promise(r => srv.listen(0, () => r(srv)));
}

async function run(mode) {
  const srv = await serve();
  const port = srv.address().port;
  const agent = new http.Agent({ keepAlive: true, maxSockets: 8, timeout: 60000 });
  const got = [];
  const start = Date.now();
  const outcome = await new Promise(resolve => {
    const req = http.request({ port, path: '/', agent }, res => {
      res.on('data', c => got.push(c));
      res.on('end', () => resolve('end'));
      res.on('error', e => resolve('error:' + e.message));
    });
    req.on('error', e => resolve('error:' + e.message));
    req.end();
    setTimeout(() => {
      const active = Object.values(agent.sockets).some(a => a.length);
      if (mode === 'guarded' && active) return;          // 守卫：有活跃 socket 就不回收
      agent.destroy();
    }, KILL_AT);
  });
  srv.close();
  return { mode, outcome, chunks: got.length, ms: Date.now() - start };
}

for (const mode of ['naive', 'guarded']) {
  const r = await run(mode);
  console.log(`${mode.padEnd(8)} outcome=${r.outcome.padEnd(36)} chunks=${String(r.chunks).padStart(2)}/${CHUNKS} ms=${r.ms}`);
}
process.exit(0);
