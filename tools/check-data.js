/* 校验 web/data/data.js 的结构与内部引用完整性。无需任何依赖：node tools/check-data.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = path.join(__dirname, '..', 'web', 'data', 'data.js');
const AUGMENT_SOURCE = path.join(__dirname, '..', '_data', 'augments.json');
// 英雄和出装是手写的，数量固定；强化图鉴来自官方数据，数量跟着官方走
const EXPECT = { champions: 42, builds: 84, poolAugments: 64 };
const TIERS = new Set(['T1', 'T2', 'T3', 'T4', 'T5']);
const GRADES = new Set(['S', 'A', 'B', 'C']);
const RARITIES = new Set(['prismatic', 'gold', 'silver', 'event']);

if (!fs.existsSync(FILE)) {
  console.error('缺少 web/data/data.js，请先运行 node tools/generate-data.js');
  process.exit(1);
}

// data.js 是给浏览器用的 <script>，这里用 vm 造一个 window 把它跑起来
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(FILE, 'utf8'), sandbox, { filename: 'data.js' });
const D = sandbox.window.HAIDOU_DATA;

const problems = [];
const check = (cond, msg) => {
  if (!cond) problems.push(msg);
};

check(D && typeof D === 'object', 'data.js 没有挂载 window.HAIDOU_DATA');
if (!D) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const champions = D.champions || [];
const augments = D.augments || [];
const pool = D.augmentPool || [];
const items = D.items || {};
const augIds = new Set(augments.map((a) => a.id));
const poolIds = new Set(pool.map((a) => a.id));

// 1. 数量
const buildCount = champions.reduce((n, c) => n + (c.builds || []).length, 0);
check(champions.length === EXPECT.champions, `英雄数应为 ${EXPECT.champions}，实际 ${champions.length}`);
check(pool.length === EXPECT.poolAugments, `推荐强化池应为 ${EXPECT.poolAugments} 个，实际 ${pool.length}`);
check(buildCount === EXPECT.builds, `出装数应为 ${EXPECT.builds}，实际 ${buildCount}`);

// 官方图鉴的数量以 _data/augments.json 为准，不再写死
if (fs.existsSync(AUGMENT_SOURCE)) {
  const source = JSON.parse(fs.readFileSync(AUGMENT_SOURCE, 'utf8'));
  const sourceCount = (source.augments || []).length;
  check(
    augments.length === sourceCount,
    `图鉴强化数应为 ${sourceCount}（_data/augments.json），实际 ${augments.length}`,
  );
  check(source.mode && D.meta && D.meta.augmentMode === source.mode, `meta.augmentMode 与数据源不一致`);
} else {
  check(augments.length > 0, '图鉴强化为空，请先运行 node tools/update-augments.js');
}

// 2. meta 与实际内容一致
check(D.meta && D.meta.championCount === champions.length, 'meta.championCount 与实际英雄数不符');
check(D.meta && D.meta.augmentCount === augments.length, 'meta.augmentCount 与实际图鉴强化数不符');
check(D.meta && D.meta.augmentPoolCount === pool.length, 'meta.augmentPoolCount 与实际推荐池数量不符');
check(D.meta && D.meta.buildCount === buildCount, 'meta.buildCount 与实际出装数不符');

// 3. 唯一性
const champIds = new Set();
for (const c of champions) {
  check(!champIds.has(c.id), `英雄 id 重复: ${c.id}`);
  champIds.add(c.id);
}
check(augIds.size === augments.length, '图鉴强化 id 存在重复');
check(poolIds.size === pool.length, '推荐强化池 id 存在重复');

// 4. 英雄字段与引用
for (const c of champions) {
  check(TIERS.has(c.tier), `${c.id} 的梯度非法: ${c.tier}`);
  check(Number.isFinite(c.winRate), `${c.id} 缺少 winRate`);
  check(Number.isFinite(c.pickRate), `${c.id} 缺少 pickRate`);
  check(!!c.name && !!c.title, `${c.id} 缺少 name/title`);
  check(Array.isArray(c.roles) && c.roles.every(Boolean), `${c.id} 的 roles 存在空值`);

  check(Array.isArray(c.augments) && c.augments.length >= 3, `${c.id} 的推荐强化少于 3 条`);
  for (const r of c.augments || []) {
    check(poolIds.has(r.id), `${c.id} 引用了推荐池里不存在的强化: ${r.id}`);
    check(GRADES.has(r.grade), `${c.id} 的强化评级非法: ${r.grade}`);
    check(Number.isFinite(r.pickRate), `${c.id}/${r.id} 缺少 pickRate`);
  }

  check(Array.isArray(c.builds) && c.builds.length >= 1, `${c.id} 没有出装方案`);
  for (const b of c.builds || []) {
    check(Array.isArray(b.items) && b.items.length > 0, `${c.id}/${b.name} 没有装备`);
    check(Array.isArray(b.starter) && b.starter.length > 0, `${c.id}/${b.name} 没有出门装`);
    check(!!b.skillOrder, `${c.id}/${b.name} 缺少技能加点`);
    for (const id of [...(b.items || []), ...(b.starter || [])]) {
      check(!!items[id], `${c.id}/${b.name} 引用了不存在的装备: ${id}`);
    }
  }
}

// 5. 图鉴强化：官方数据只有名称、稀有度、描述和图标
for (const a of augments) {
  check(!!a.id && !!a.name, `强化 ${a.id || '(空)'} 缺少 id 或 name`);
  check(RARITIES.has(a.rarity), `强化 ${a.id} 稀有度非法: ${a.rarity}`);
  check(!!a.rarityName, `强化 ${a.id} 缺少 rarityName`);
  check(typeof a.desc === 'string', `强化 ${a.id} 的 desc 不是字符串`);
}

// 6. 推荐强化池：手写数据，额外带适配定位与强度评分
for (const a of pool) {
  check(RARITIES.has(a.rarity), `推荐强化 ${a.id} 稀有度非法: ${a.rarity}`);
  check(Array.isArray(a.arch) && a.arch.length > 0, `推荐强化 ${a.id} 缺少适配定位`);
  check(Number.isFinite(a.power), `推荐强化 ${a.id} 缺少 power`);
}

if (problems.length) {
  console.error(`数据校验失败，共 ${problems.length} 项：`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}

console.log(
  `数据校验通过：${champions.length} 英雄 / ${augments.length} 图鉴强化 / ${pool.length} 推荐强化 / ${buildCount} 套出装 / ${Object.keys(items).length} 件装备`,
);
