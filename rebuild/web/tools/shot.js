// 自动截图工具：开一个看不见的浏览器进游戏，等几秒，拍一张照。
// 用法：node web/tools/shot.js <网址> <输出.png> [等几秒=6] [拍照前在页面里执行的一句 JS]
const { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const [url, out, wait = '6', js = ''] = process.argv.slice(2);
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', PORT = 9333;
const dir = path.join(os.tmpdir(), 'mj-edge-cdp');
const edge = spawn(EDGE, ['--headless=new', '--window-size=1306,760', '--remote-debugging-port=' + PORT, '--user-data-dir=' + dir, '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let tab;
  for (let i = 0; i < 40 && !tab; i++) { await sleep(250); try { tab = (await (await fetch('http://127.0.0.1:' + PORT + '/json')).json()).find(t => t.type === 'page'); } catch (e) { } }
  if (!tab) throw new Error('浏览器没起来');
  const ws = new WebSocket(tab.webSocketDebuggerUrl); let id = 0; const wait4 = new Map(), errs = [];
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && wait4.has(m.id)) { wait4.get(m.id)(m.result || m.error); wait4.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map(a => a.value || a.description).join(' ')); };
  const cmd = (method, params = {}) => new Promise(r => { wait4.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  await cmd('Runtime.enable'); await cmd('Page.enable');
  await cmd('Page.navigate', { url });
  await sleep(+wait * 1000);
  if (js) { const r = await cmd('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true }); if (r.result && r.result.value !== undefined) console.log('JS →', JSON.stringify(r.result.value)); if (r.exceptionDetails) errs.push(r.exceptionDetails.exception?.description); await sleep(1200); }
  const shot = await cmd('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log(errs.length ? '页面报错：\n' + errs.slice(0, 8).join('\n') : '页面没有报错', '\n已保存', out);
  ws.close(); edge.kill(); process.exit(0);
})().catch(e => { console.error(e); edge.kill(); process.exit(1); });
