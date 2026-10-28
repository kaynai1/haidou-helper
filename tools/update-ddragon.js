/* 从 Riot Data Dragon 拉取中文英雄 / 装备数据，写入 _data/ 并同步版本号。
 *
 *   node tools/update-ddragon.js                     下载最新版 → 更新 DDRAGON → 重新生成 → 校验
 *   node tools/update-ddragon.js --no-regen          只下载，不重新生成
 *   node tools/update-ddragon.js --version 16.21.1   指定版本，不取最新
 *   node tools/update-ddragon.js --dry-run           只看有没有新版本，不写文件
 *
 * 国内网络可换镜像：set DDRAGON_BASE=https://你的镜像（末尾斜杠可有可无）
 *
 * 生成或校验失败时会自动还原 _data/ 和 generate-data.js，不会留下半成品。
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, '_data');
const GENERATOR = path.join(__dirname, 'generate-data.js');
const BASE = (process.env.DDRAGON_BASE || 'https://ddragon.leagueoflegends.com').replace(/\/+$/, '');
const TIMEOUT_MS = 30000;
// 顺序即下载顺序，只影响日志
const TARGETS = [
  { name: 'champion.json', label: '英雄' },
  { name: 'item.json', label: '装备' },
];

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const argValue = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};

function printHelp() {
  console.log(`用法: node tools/update-ddragon.js [选项]

  --version <版本>   指定 Data Dragon 版本，默认取 versions.json 的第一项
  --dry-run          只检查是否有新版本，不写任何文件
  --no-regen         下载后不重新生成 web/data/data.js，也不跑校验
  -h, --help         显示本帮助

环境变量:
  DDRAGON_BASE       替换 https://ddragon.leagueoflegends.com，用于国内镜像

数据来源:
  ${BASE}/api/versions.json
  ${BASE}/cdn/<版本>/data/zh_CN/champion.json
  ${BASE}/cdn/<版本>/data/zh_CN/item.json`);
}

async function fetchBuffer(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// 只读执行一个 node 脚本，返回 { ok, output }
function runNode(script) {
  const r = spawnSync(process.execPath, [script], { cwd: ROOT, encoding: 'utf8' });
  const output = `${r.stdout || ''}${r.stderr || ''}`.trim();
  return { ok: r.status === 0, output };
}

function readOrNull(file) {
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

function formatSize(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function bumpGenerator(version) {
  const src = fs.readFileSync(GENERATOR, 'utf8');
  const today = new Date().toISOString().slice(0, 10);
  const next = src
    .replace(/const DDRAGON = '[^']*';/, `const DDRAGON = '${version}';`)
    .replace(/updated: '[^']*'/, `updated: '${today}'`);
  if (next === src) return false;
  fs.writeFileSync(GENERATOR, next, 'utf8');
  return true;
}

(async () => {
  if (has('-h') || has('--help')) return printHelp();

  // 先跑一次基线校验：如果更新前就已经不通过，更新后失败就不能怪新数据
  const baseline = runNode(path.join(__dirname, 'check-data.js'));

  let version = argValue('--version');
  if (!version) {
    process.stdout.write('查询最新版本… ');
    const versions = JSON.parse((await fetchBuffer(`${BASE}/api/versions.json`)).toString('utf8'));
    if (!Array.isArray(versions) || !versions.length) throw new Error('versions.json 格式异常');
    version = versions[0];
    console.log(version);
  } else {
    console.log(`使用指定版本: ${version}`);
  }

  const downloads = [];
  for (const target of TARGETS) {
    const url = `${BASE}/cdn/${version}/data/zh_CN/${target.name}`;
    process.stdout.write(`下载${target.label}数据… `);
    const buf = await fetchBuffer(url);

    let json;
    try {
      json = JSON.parse(buf.toString('utf8'));
    } catch {
      throw new Error(`${target.name} 不是合法 JSON，可能被代理或镜像改写`);
    }
    if (json.version !== version)
      throw new Error(`${target.name} 返回的版本是 ${json.version}，与请求的 ${version} 不一致`);
    const count = json.data ? Object.keys(json.data).length : 0;
    if (!count) throw new Error(`${target.name} 缺少 data 字段`);

    console.log(`${formatSize(buf.length)}，${count} 条`);
    downloads.push({ ...target, buf, count, url });
  }

  const changed = downloads.filter(({ name, buf }) => {
    const old = readOrNull(path.join(DATA_DIR, name));
    return !old || !old.equals(buf);
  });

  if (!changed.length) {
    console.log(`\n_data/ 已经是 ${version} 的数据，没有文件需要更新。`);
    return;
  }

  if (has('--dry-run')) {
    console.log(`\n[dry-run] ${changed.map((c) => c.name).join('、')} 有更新，未写入。`);
    return;
  }

  // 备份，失败时整体回滚
  const backup = new Map();
  for (const { name } of downloads) {
    const file = path.join(DATA_DIR, name);
    backup.set(file, readOrNull(file));
  }
  const generatorBackup = fs.readFileSync(GENERATOR, 'utf8');
  const dataJsBackup = readOrNull(path.join(ROOT, 'web', 'data', 'data.js'));

  const rollback = () => {
    for (const [file, content] of backup) {
      if (content) fs.writeFileSync(file, content);
      else if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    fs.writeFileSync(GENERATOR, generatorBackup, 'utf8');
    const dataJs = path.join(ROOT, 'web', 'data', 'data.js');
    if (dataJsBackup) fs.writeFileSync(dataJs, dataJsBackup);
    else if (fs.existsSync(dataJs)) fs.unlinkSync(dataJs);
  };

  for (const { name, buf } of downloads) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, name), buf);
  }
  const bumped = bumpGenerator(version);
  console.log(
    `\n已写入 _data/${downloads.map((d) => d.name).join('、_data/')}${bumped ? '，并更新 generate-data.js 的版本号' : ''}`,
  );

  if (has('--no-regen')) {
    console.log('\n已跳过重新生成。请手动运行 node tools/generate-data.js，然后跑 npm run check。');
    return;
  }

  process.stdout.write('\n重新生成数据… ');
  const gen = runNode(path.join(__dirname, 'generate-data.js'));
  if (!gen.ok) {
    rollback();
    console.error('失败');
    console.error(gen.output);
    console.error('\n已回滚到更新前的状态。多半是新版本里少了生成器引用的英雄或装备 id。');
    process.exit(1);
  }
  console.log('完成');

  if (!baseline.ok) {
    console.log('\n更新前的校验本来就没通过，跳过更新后的校验。先修好已有问题：');
    console.log(baseline.output);
    return;
  }

  process.stdout.write('校验数据… ');
  const check = runNode(path.join(__dirname, 'check-data.js'));
  if (!check.ok) {
    rollback();
    console.error('失败');
    console.error(check.output);
    console.error('\n已回滚到更新前的状态。请检查生成器里引用的英雄 / 装备 id 是否在新版本中被移除或改名。');
    process.exit(1);
  }
  console.log(check.output.split('\n').pop());

  console.log(`\n完成：Data Dragon ${version}`);
  for (const { name, label, buf, count } of downloads) {
    console.log(`  _data/${name.padEnd(14)} ${formatSize(buf.length).padStart(7)}  ${count} 条${label}`);
  }
  console.log(`  tools/generate-data.js  DDRAGON = '${version}'`);
  console.log('  web/data/data.js        已重新生成');
  console.log(
    '\n下一步：npm run start:web 或 npm start 看效果，确认后提交 _data/、generate-data.js、web/data/data.js。',
  );
})().catch((err) => {
  console.error(`\n更新失败: ${err.message}`);
  console.error('没有写入任何文件。');
  process.exit(1);
});
