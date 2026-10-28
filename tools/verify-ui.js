/* Minimal CDP driver for visual verification with headless Edge. */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', '_data');
const BASE = 'http://127.0.0.1:8321/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const targets = await (await fetch('http://127.0.0.1:9333/json/list')).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');

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
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
    console.log('shot', name);
  };
  const go = async (hash, wait = 1400) => {
    await send('Page.navigate', { url: BASE + hash });
    await sleep(wait);
  };
  const viewport = (width, height, mobile) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await viewport(1440, 1100, false);

  // 1. global search
  await go('');
  await shot('shot-home3.png');
  await evaluate(`document.querySelector('[data-open-search]').click()`);
  await sleep(350);
  await evaluate(`(() => { const i = document.getElementById('search-input'); i.value = '阿狸'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(450);
  console.log('search results:', await evaluate(`document.querySelectorAll('.search-item').length`));
  await shot('cdp-search.png');
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await sleep(200);

  // 2. augment modal
  await go('#/augments');
  await evaluate(`document.querySelector('.aug-card').click()`);
  await sleep(450);
  await shot('cdp-modal.png');
  await evaluate(`document.querySelector('[data-close-modal]').click()`);
  await sleep(200);

  // 3. champion detail builds area
  await go('#/champion/Ahri', 1700);
  await evaluate(`document.querySelectorAll('.panel')[1].scrollIntoView({ block: 'start' })`);
  await sleep(500);
  await shot('cdp-detail-builds.png');

  // 4. champion filter
  await go('#/champions', 1600);
  await evaluate(`(() => { const i = document.getElementById('champ-q'); i.value = '劫'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(400);
  console.log('filtered count:', await evaluate(`document.getElementById('champ-count').textContent`));
  await shot('cdp-filter.png');

  // 5. mobile
  await viewport(390, 844, true);
  await go('');
  await shot('cdp-mobile-home.png');
  await go('#/champions', 1600);
  await shot('cdp-mobile-champions.png');
  await go('#/champion/Jinx', 1600);
  await shot('cdp-mobile-detail.png');

  console.log('console errors:', errors.length ? errors : 'none');
  ws.close();
}

main().catch((e) => { console.error('FAILED', e); process.exitCode = 1; });
