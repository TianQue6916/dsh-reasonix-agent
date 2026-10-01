// e2e/mock-upstream.mjs — 假上游，按需吐「退化循环」或「正常文本」的 SSE
// 用 LF 变量拼帧，源码里不出现反斜杠转义（避免被 heredoc/传输层改写）
import http from 'node:http';

const LF = String.fromCharCode(10);
const EOL2 = LF + LF;
const PORT = Number(process.env.MOCK_PORT || 8898);

const POOL = ['好。', '写。', '输出。', '（...）', '（写。）', '（输出。）'];
const LOOP = Array.from({ length: 90 }, () => POOL).flat().join(EOL2);

const NORMAL = [
  '滑动窗口的 novelty 定义在一个长度为 W 的窗口上：窗口里所有 n-gram 中不同的那部分占多大比例。如果模型每一步都在引入新的 token 组合，这个比例就接近一；一旦它开始反复使用同一批短语，比例会迅速塌下去。',
  '要注意这个量和 token 熵不是一回事。token 熵衡量模型分布有多平，novelty 衡量实际吐出来的序列有多新。温度较高时这两个量会分道扬镳：一个在三个词之间随机挑选的循环，分布看起来很平，但序列的 novelty 会掉到周期的倒数。',
  '周期确认是第二道闸。快窗口报出低 novelty 之后，再对尾部若干字符做一次朴素扫描，找最小的 p，使得最后 p 乘 k 个字符严格周期为 p。这一步不做判定，只做诊断，把 period 和 repeats 写进日志。',
  '误报主要来自两个方向。第一是代码块里的缩进与分隔线，它们天然重复；第二是 markdown 表格的对齐行。这两类重复的共同点是块内几乎没有内容字符，所以加一条 minBlockNonSpace 约束就能滤掉绝大部分。',
  '阈值必须实测校准，不能拍脑袋。正确做法是先跑 shadow 模式，只记录不干预，攒够样本之后看 novelty 的分布，找到两类分布的分离点。reasoning 段和 text 段的 baseline 差别很大，必须分开统计。',
  '接入 SSE 时最容易炸的地方是帧边界。绝不能在帧中间断流，必须先攒到完整的双换行边界，再从 data 行取 JSON。半个 JSON 会让下游 parser 直接抛错，客户端会把它当成网络错误走重试路径。',
].join(EOL2);

let n = 0;
function chunk(delta) {
  return 'data: ' + JSON.stringify({
    id: 'mock-' + n, object: 'chat.completion.chunk',
    choices: [{ index: 0, delta, finish_reason: null }],
  }) + EOL2;
}

http.createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    n++;
    const mode = String(req.headers['x-mock-mode'] || 'loop');
    const body = mode === 'normal' ? NORMAL : LOOP;
    const channel = String(req.headers['x-mock-channel'] || 'content');
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      'connection': 'keep-alive',
    });
    let i = 0;
    const t = setInterval(() => {
      if (i >= body.length) {
        clearInterval(t);
        res.write('data: [DONE]' + EOL2);
        res.end();
        return;
      }
      const piece = body.slice(i, i + 24);
      i += 24;
      const delta = channel === 'reasoning' ? { reasoning_content: piece } : { content: piece };
      res.write(chunk(delta));
    }, 2);
    res.on('close', () => clearInterval(t));
  });
}).listen(PORT, '127.0.0.1', () => console.log('MOCK-UPSTREAM listening on ' + PORT + ' mode default=loop'));
