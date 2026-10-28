/* 从 CommunityDragon 拉取官方海克斯强化数据，写入 _data/augments.json。
 *
 *   node tools/update-augments.js                   拉取 → 重新生成 → 校验
 *   node tools/update-augments.js --dry-run         只看有没有变化，不写文件
 *   node tools/update-augments.js --no-regen        只写 _data/augments.json
 *   node tools/update-augments.js --mode CHERRY     切换模式，默认 KIWI
 *
 * 数据来源（都是官方客户端资源的镜像，不需要 key）：
 *   模式强化列表   .../v1/augment-lists.json
 *   中文名与稀有度 .../v1/cherry-augments.json
 *   效果描述       _data/kiwi-text.json（官方中文，提取自游戏客户端 kiwi.bin +
 *                  zh_cn lol.stringtable，见 tools/extract-kiwi-text.js）
 *   描述兜底       .../cdragon/arena/zh_cn.json
 *
 * 说明：官方没有公开「海克斯大乱斗」强化胜率 / 选取率，这里只同步名称、稀有度、
 * 图标和官方文字说明。
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT_FILE = path.join(ROOT, '_data', 'augments.json');
const GENERATOR = path.join(__dirname, 'generate-data.js');
const CDN = (process.env.CDRAGON_BASE || 'https://raw.communitydragon.org/latest').replace(/\/+$/, '');
const V1 = `${CDN}/plugins/rcp-be-lol-game-data/global/zh_cn/v1`;
const ICON_BASE = `${CDN}/plugins/rcp-be-lol-game-data/global/default/`;
const TIMEOUT_MS = 30000;

const RARITY = {
  kSilver: ['silver', '白银'],
  kGold: ['gold', '黄金'],
  kPrismatic: ['prismatic', '棱彩'],
  kEventChoice: ['event', '事件'],
};

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const argValue = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};

function printHelp() {
  console.log(`用法: node tools/update-augments.js [选项]

  --mode <模式>    CHERRY（斗魂竞技场）/ KIWI（默认）/ KIWI_JADE
  --dry-run        只比较是否有变化，不写文件
  --no-regen       写完 _data/augments.json 后不重新生成
  -h, --help       显示本帮助

环境变量:
  CDRAGON_BASE     替换 https://raw.communitydragon.org/latest`);
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

// 官方描述里混着 <br>、%i:图标% 和 @变量@ 占位符，这里尽量还原成可读文本
function cleanDesc(raw, dataValues) {
  if (!raw) return '';
  const s = String(raw)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/%i:[^%]*%/g, '');
  // 占位符有两种写法：@Name@ 和 @Name*100@（后者已经在公式里换算过）
  const filled = s.replace(/@([A-Za-z0-9_.:]+)(?:\*(\d+(?:\.\d+)?))?@(%?)/g, (match, key, factor, pct, offset) => {
    const raw = dataValues && dataValues[key];
    const base = Array.isArray(raw) ? raw[0] : raw;
    // 查不到数值时连同后面的 % 一起吃掉，避免留下「获得%移动速度」这种残句
    if (typeof base !== 'number' || !Number.isFinite(base)) return '';
    let value = base * (factor ? Number(factor) : 1);
    // 没写系数、后面又紧跟 % 时，0~1 的小数按百分比换算
    if (!factor && pct && value <= 1) value *= 100;
    return String(Math.round(value * 100) / 100) + pct;
  });
  return filled
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([，。；：、）])/g, '$1')
    .trim();
}

function iconUrl(iconPath) {
  if (!iconPath) return '';
  const rel = iconPath.replace(/^\/lol-game-data\/assets\//i, '').toLowerCase();
  return ICON_BASE + rel;
}

function runNode(script) {
  const r = spawnSync(process.execPath, [script], { cwd: ROOT, encoding: 'utf8' });
  return { ok: r.status === 0, output: `${r.stdout || ''}${r.stderr || ''}`.trim() };
}

(async () => {
  if (has('-h') || has('--help')) return printHelp();

  const mode = (argValue('--mode') || 'KIWI').toUpperCase();

  process.stdout.write('下载模式强化列表… ');
  const lists = await fetchJson(`${V1}/augment-lists.json`);
  const target = lists.find((l) => l.modeName === mode);
  if (!target) {
    throw new Error(`没有找到模式 ${mode}，可选：${lists.map((l) => l.modeName).join('、')}`);
  }
  const ids = target.augmentList.map((p) => String(p).split('/').pop());
  console.log(`${mode}，${ids.length} 个`);

  process.stdout.write('下载强化名称与稀有度… ');
  const cherry = await fetchJson(`${V1}/cherry-augments.json`);
  const byId = new Map(cherry.map((c) => [c.augmentNameId, c]));
  console.log(`${cherry.length} 条`);

  process.stdout.write('下载官方效果描述… ');
  const arena = await fetchJson(`${CDN}/cdragon/arena/zh_cn.json`);
  const descById = new Map(arena.augments.map((a) => [a.apiName, a]));
  console.log(`${arena.augments.length} 条`);

  // 大乱斗强化的官方中文文本快照（kiwi.bin + zh_cn stringtable 提取产物），
  // 竞技场的 cdragon 描述只覆盖一部分，这里优先用大乱斗自己的
  const kiwiTextFile = path.join(__dirname, '..', '_data', 'kiwi-text.json');
  const kiwiText = fs.existsSync(kiwiTextFile)
    ? JSON.parse(fs.readFileSync(kiwiTextFile, 'utf8')).augments || {}
    : {};
  const kiwiTextIds = Object.keys(kiwiText).length;
  if (!kiwiTextIds) console.log('提示: 缺少 _data/kiwi-text.json，描述将只有竞技场来源');

  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) throw new Error(`以下强化在 cherry-augments.json 里找不到：${missing.slice(0, 5).join('、')}`);

  const augments = ids
    .map((id) => {
      const c = byId.get(id);
      const [rarity, rarityName] = RARITY[c.rarity] || ['', ''];
      if (!rarity) throw new Error(`未知稀有度 ${c.rarity}（${id}）`);
      // KIWI 列表里的 id 带 ARAM_ 前缀，描述表里不一定带，两种都试一次
      const detail = descById.get(id) || descById.get(id.replace(/^ARAM_/, ''));
      const kiwi =
        kiwiText[id] || kiwiText[id.replace(/^ARAM_/, '')] || kiwiText[`ARAM_${id}`] || null;
      // 优先大乱斗自己的官方描述，缺失时退回竞技场描述
      const kiwiDesc = cleanDesc(kiwi && (kiwi.desc || kiwi.tooltip), kiwi && kiwi.dataValues);
      const arenaDesc = cleanDesc(detail && detail.desc, detail && detail.dataValues);
      const desc = kiwiDesc || arenaDesc;
      return {
        id,
        name: c.nameTRA || c.augmentNameId,
        rarity,
        rarityName,
        desc,
        icon: iconUrl(c.augmentSmallIconPath),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const withDesc = augments.filter((a) => a.desc).length;
  const previous = fs.existsSync(OUT_FILE) ? JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')) : null;
  const prevIds = new Set((previous && previous.augments ? previous.augments : []).map((a) => a.id));
  const nextIds = new Set(augments.map((a) => a.id));
  const added = augments.filter((a) => !prevIds.has(a.id));
  const removed = [...prevIds].filter((id) => !nextIds.has(id));

  const payload = {
    mode,
    updated: new Date().toISOString().slice(0, 10),
    source: `${CDN}/plugins/rcp-be-lol-game-data/global/zh_cn/v1/augment-lists.json`,
    augments,
  };
  const text = `${JSON.stringify(payload, null, 2)}\n`;

  console.log(`\n${mode}：${augments.length} 个强化，其中 ${withDesc} 个有官方文字说明`);
  if (previous) {
    console.log(
      `相比上次：新增 ${added.length} 个${
        added.length
          ? `（${added
              .slice(0, 6)
              .map((a) => a.name)
              .join('、')}${added.length > 6 ? ' 等' : ''}）`
          : ''
      }，移除 ${removed.length} 个${removed.length ? `（${removed.slice(0, 6).join('、')}${removed.length > 6 ? ' 等' : ''}）` : ''}`,
    );
  }

  const unchanged = previous && JSON.stringify(previous) === JSON.stringify(payload);
  if (unchanged) {
    console.log('_data/augments.json 没有变化。');
    return;
  }
  if (has('--dry-run')) {
    console.log('[dry-run] 未写入文件。');
    return;
  }

  const backup = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE) : null;
  const dataJs = path.join(ROOT, 'web', 'data', 'data.js');
  const dataJsBackup = fs.existsSync(dataJs) ? fs.readFileSync(dataJs) : null;
  const rollback = () => {
    if (backup) fs.writeFileSync(OUT_FILE, backup);
    else if (fs.existsSync(OUT_FILE)) fs.unlinkSync(OUT_FILE);
    if (dataJsBackup) fs.writeFileSync(dataJs, dataJsBackup);
    else if (fs.existsSync(dataJs)) fs.unlinkSync(dataJs);
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, text, 'utf8');
  console.log(`\n已写入 _data/augments.json（${Math.round(Buffer.byteLength(text) / 1024)} KB）`);

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
    console.error('\n已回滚到更新前的状态。');
    process.exit(1);
  }
  console.log('完成');

  process.stdout.write('校验数据… ');
  const check = runNode(path.join(__dirname, 'check-data.js'));
  if (!check.ok) {
    rollback();
    console.error('失败');
    console.error(check.output);
    console.error('\n已回滚到更新前的状态。');
    process.exit(1);
  }
  console.log(check.output.split('\n').pop());

  console.log('\n下一步：npm run start:web 或 npm start 看效果，确认后提交 _data/augments.json 和 web/data/data.js。');
})().catch((err) => {
  console.error(`\n更新失败: ${err.message}`);
  console.error('没有写入任何文件。');
  process.exit(1);
});
