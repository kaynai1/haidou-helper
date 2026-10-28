/* 悬浮窗全量回归：不需要真实对局。
 *
 * 先启动 Electron 悬浮窗（--remote-debugging-port=9444），再连 CDP，
 * 模拟 Live API 把官方名单里每一位英雄按「id / 中文名 / 称号」三种形态
 * 逐个喂给悬浮窗，断言收录英雄直接渲染、未收录英雄正确显示官方中文名；
 * 顺带检查计时格式、模式映射、状态切换和整段过程的控制台报错。
 *
 *   node tools/verify-all-champions.js          自动拉起并测完关闭
 *   node tools/verify-all-champions.js --attach 只连已运行的 9444
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.CDP_PORT || 9444;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadChampions() {
  const raw = fs.readFileSync(path.join(ROOT, 'web', 'data', 'data.js'), 'utf8');
  const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  return json;
}

async function connect() {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page' && t.url.includes('overlay.html'));
  if (!page) throw new Error('没有找到 overlay.html 的页面目标');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  return ws;
}

function makeSession(ws) {
  let id = 0;
  const pending = new Map();
  const consoleErrors = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description || ''));
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      consoleErrors.push(msg.params.entry.text);
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
  return { send, evaluate, consoleErrors };
}

const READ_SNAPSHOT = `(() => {
  const q = (id) => document.getElementById(id);
  return {
    status: q('status-text').textContent,
    clock: q('clock').textContent,
    name: q('champ-name').textContent,
    tier: q('champ-tier').textContent,
    recs: document.querySelectorAll('#recs .rec').length,
    items: document.querySelectorAll('#items .item').length,
    notice: q('notice').hidden ? null : q('notice').textContent,
  };
})()`;

async function main() {
  const attach = process.argv.includes('--attach');
  let child = null;
  if (!attach) {
    const electron = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
    child = spawn(electron, ['.', `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(os.tmpdir(), 'haidou-verify')}`], {
      cwd: ROOT,
      stdio: 'ignore',
      detached: false,
    });
    // 等 CDP 端口就绪
    let up = false;
    for (let i = 0; i < 40 && !up; i++) {
      await sleep(250);
      try {
        await fetch(`http://127.0.0.1:${PORT}/json/list`);
        up = true;
      } catch (e) {}
    }
    if (!up) throw new Error('CDP 端口 40×250ms 内没有就绪');
  }

  const D = loadChampions();
  const curatedIds = new Set(D.champions.map((c) => c.id));
  const rosterIds = Object.keys(D.roster);

  const failures = [];
  const fail = (msg) => { failures.push(msg); };
  try {
    const ws = await connect();
    const { send, evaluate, consoleErrors } = makeSession(ws);
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    await sleep(500);

    // ── 1. 收录英雄：三种上报形态都要直接渲染 ──────────────────────────
    for (const c of D.champions) {
      for (const form of [c.id, c.name, c.title]) {
        await evaluate(`window.__haidouSetState({ status: 'live', championName: ${JSON.stringify(form)}, gameMode: 'ARAM', gameTime: 300 })`);
        const s = await evaluate(READ_SNAPSHOT);
        if (s.name !== c.name) fail(`收录英雄 ${c.id}（上报 ${form}）渲染成了 ${s.name}`);
        if (s.notice !== null) fail(`收录英雄 ${c.id}（上报 ${form}）不应出现「未收录」提示: ${s.notice}`);
        if (!/T[1-5]/.test(s.tier)) fail(`收录英雄 ${c.id} 梯度显示异常: ${s.tier}`);
        if (s.recs < 3) fail(`收录英雄 ${c.id} 推荐强化不足 3 条`);
        if (s.items < 1) fail(`收录英雄 ${c.id} 出装没有渲染`);
      }
    }
    console.log(`收录英雄 ${D.champions.length} 位 × 3 种上报形态 完成`);

    // ── 2. 未收录英雄：官方名单里其余英雄，id / 中文名 / 称号都要认出来 ──
    for (const id of rosterIds) {
      if (curatedIds.has(id)) continue;
      const r = D.roster[id];
      for (const form of [id, r.name, r.title]) {
        await evaluate(`window.__haidouSetState({ status: 'live', championName: ${JSON.stringify(form)}, gameMode: 'ARAM', gameTime: 300 })`);
        const s = await evaluate(READ_SNAPSHOT);
        if (!s.notice || !s.notice.includes(r.name)) {
          fail(`未收录英雄 ${id}（上报 ${form}）提示里没有官方中文名「${r.name}」: ${s.notice}`);
        }
        if (s.notice && /undefined|null/.test(s.notice)) fail(`未收录英雄 ${id}（上报 ${form}）提示出现异常文本: ${s.notice}`);
      }
    }
    console.log(`未收录英雄 ${rosterIds.length - curatedIds.size} 位 × 3 种上报形态 完成`);

    // ── 3. 计时格式：小数秒不能漏进显示 ────────────────────────────────
    await evaluate(`window.__haidouSetState({ status: 'live', championName: 'Jinx', gameMode: 'ARAM', gameTime: 754.7935612 })`);
    await sleep(100);
    const clock = (await evaluate(READ_SNAPSHOT)).clock;
    if (!/^\d{2,}:\d{2}$/.test(clock)) fail(`计时应为 mm:ss 整数格式，实际 ${clock}`);
    else if (!clock.startsWith('12:')) fail(`计时换算错误：754 秒应显示 12:xx，实际 ${clock}`);

    // ── 4. 模式映射与状态切换 ─────────────────────────────────────────
    const modeCases = [
      ['ARAM', '海克斯大乱斗'], ['CHERRY', '斗魂竞技场'], ['CLASSIC', '召唤师峡谷'],
      ['URF', '无限火力'], ['NIGHTMARE', 'NIGHTMARE'],
    ];
    for (const [mode, label] of modeCases) {
      await evaluate(`window.__haidouSetState({ status: 'live', championName: 'Jinx', gameMode: '${mode}', gameTime: 60 })`);
      const s = await evaluate(READ_SNAPSHOT);
      if (!s.status.includes(label)) fail(`模式 ${mode} 的状态文案不含「${label}」: ${s.status}`);
    }
    await evaluate(`window.__haidouSetState({ status: 'lobby' })`);
    let s = await evaluate(READ_SNAPSHOT);
    if (!s.status.includes('等待进入对局')) fail(`lobby 状态文案异常: ${s.status}`);
    await evaluate(`window.__haidouSetState({ status: 'offline' })`);
    s = await evaluate(READ_SNAPSHOT);
    if (!s.status.includes('演示模式')) fail(`offline 状态文案异常: ${s.status}`);
    if (s.clock !== '--:--') fail(`非对局时钟应为 --:--，实际 ${s.clock}`);
    await evaluate(`window.__haidouSetState({ status: 'live', championName: 'Jinx', gameMode: 'ARAM', gameTime: 100 })`);
    await evaluate(`window.__haidouSetState({ status: 'offline' })`);
    await evaluate(`window.__haidouSetState({ status: 'live', championName: 'Jinx', gameMode: 'ARAM', gameTime: 200 })`);
    s = await evaluate(READ_SNAPSHOT);
    if (!/^\d{2,}:\d{2}$/.test(s.clock)) fail(`状态往返后计时应恢复，实际 ${s.clock}`);
    if (s.notice !== null) fail(`对局中显示收录英雄时不应有提示: ${s.notice}`);

    // ── 5. 异常输入不崩 ──────────────────────────────────────────────
    for (const bad of [null, '', '???', 'A'.repeat(500), "Kai'Sa", '卡莎', 'Kiwi_Augment_XXX']) {
      await evaluate(`window.__haidouSetState({ status: 'live', championName: ${JSON.stringify(bad)}, gameMode: 'ARAM', gameTime: 30 })`);
    }
    s = await evaluate(READ_SNAPSHOT);
    if (s.notice === null) fail('完全无法识别的上报（如 Kiwi_Augment_XXX）应显示原文提示');
    console.log('模式映射 / 状态切换 / 异常输入 完成');

    if (consoleErrors.length) fail(`页面控制台出现 ${consoleErrors.length} 条错误: ${consoleErrors.slice(0, 3).join(' | ')}`);

    ws.close();
  } finally {
    if (child) child.kill();
  }

  if (failures.length) {
    console.error(`\n回归失败，共 ${failures.length} 项：`);
    for (const f of failures.slice(0, 40)) console.error('  - ' + f);
    if (failures.length > 40) console.error(`  … 以及另外 ${failures.length - 40} 项`);
    process.exit(1);
  }
  console.log(`\n全部通过：${D.champions.length} 收录 + ${rosterIds.length} 官方名单 × 各 3 种上报形态，计时/模式/状态/异常输入无异常。`);
}

main().catch((e) => { console.error('FAILED', e); process.exitCode = 1; });
