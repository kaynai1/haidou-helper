/* CDP verification for the Electron overlay (remote-debugging-port=9444). */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', '_data');
const PORT = process.env.CDP_PORT || 9444;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page' && t.url.includes('overlay.html'));
  if (!page) throw new Error('no overlay page target');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const errors = [];

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description || ''));
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      errors.push(msg.params.entry.text);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result && r.result.value;
  };
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
    console.log('shot', name);
  };
  const state = (s) => evaluate(`window.__haidouSetState(${JSON.stringify(s)})`);
  const read = () => evaluate(`({
    size: innerWidth + 'x' + innerHeight,
    status: document.getElementById('status-text').textContent,
    clock: document.getElementById('clock').textContent,
    name: document.getElementById('champ-name').textContent,
    tier: document.getElementById('champ-tier').textContent,
    recs: document.querySelectorAll('#recs .rec').length,
    items: document.querySelectorAll('#items .item').length,
    notice: document.getElementById('notice').hidden ? null : document.getElementById('notice').textContent,
    demoDisabled: document.getElementById('demo-select').disabled,
    pinned: document.body.classList.contains('pinned')
  })`);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await sleep(600);

  console.log('overlay size:', await evaluate(`innerWidth + 'x' + innerHeight`));
  console.log('demo state:', await read());
  await shot('overlay-demo.png');

  await state({ status: 'live', championName: 'Jinx', gameMode: 'ARAM', gameTime: 754 });
  await sleep(400);
  console.log('live Jinx:', await read());
  await shot('overlay-live.png');

  await state({ status: 'live', championName: "Kai'Sa", gameMode: 'ARAM', gameTime: 80 });
  await sleep(300);
  console.log('live KaiSa:', await read());

  await state({ status: 'live', championName: 'Rumble', gameMode: 'ARAM', gameTime: 95 });
  await sleep(300);
  console.log('unknown live:', await read());
  await shot('overlay-unknown.png');

  await state({ status: 'offline' });
  await evaluate(`(() => { const s = document.getElementById('demo-select'); s.value = 'Sett'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(300);
  console.log('offline demo Sett:', await read());
  await shot('overlay-demo-sett.png');

  await evaluate(`document.getElementById('btn-pin').click()`);
  await sleep(300);
  console.log('pinned:', (await read()).pinned);
  await shot('overlay-pinned.png');
  await evaluate(`document.getElementById('btn-pin').click()`);
  await sleep(200);

  console.log('console errors:', errors.length ? errors : 'none');
  ws.close();
}

main().catch((e) => { console.error('FAILED', e); process.exitCode = 1; });
