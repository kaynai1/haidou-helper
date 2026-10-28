/* 从本地已下载的官方文件里提取「海克斯大乱斗」强化的中文名称与描述，
 * 写入 _data/kiwi-text.json（提交进仓库，作为 tools/update-augments.js 的描述数据源）。
 *
 * 为什么要这一步：大乱斗强化的效果描述不在任何官方 JSON 接口里，而是拆在
 * 游戏客户端的两层文件中——
 *   1. game/maps/modespecificdata/kiwi.bin.json   每条强化的定义，含文本键与数值
 *   2. game/zh_cn/data/menu/en_us/lol.stringtable RST 字符串表，文本键 → 中文
 * 文本键要先经 xxh3 哈希才能在 RST 里查到，哈希反查表来自
 * github.com/CommunityDragon/Data（hashes/lol/hashes.rst.xxh3.txt）。
 *
 * 输入（默认 %TEMP%\haidou-kiwi，可用环境变量 HAIDOU_KIWI_DIR 覆盖）：
 *   kiwi.bin.json / lol-zh_cn.stringtable / hashes.rst.xxh3.txt
 *
 * 用法: node tools/extract-kiwi-text.js <hashes.rst.xxh3.txt>
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const DIR = process.env.HAIDOU_KIWI_DIR || path.join(os.tmpdir(), 'haidou-kiwi');

function readRst(file) {
  const buf = fs.readFileSync(file);
  if (buf.subarray(0, 3).toString('ascii') !== 'RST') throw new Error('不是 RST 文件: ' + file);
  let off = 3;
  const version = buf[off++];
  let hashBits = 40;
  if (version === 2) {
    if (buf[off++]) off += 4 + buf.readUInt32LE(off);
  } else if (version === 3) {
    // hashBits 保持 40
  } else if (version === 4 || version === 5) {
    // 15.02 及以后的补丁用 38 位；新版本字节若查不到再试 39
    hashBits = Number(process.env.RST_BITS || 38);
  } else {
    throw new Error('不支持的 RST 版本: ' + version);
  }
  const mask = (1n << BigInt(hashBits)) - 1n;
  const count = buf.readUInt32LE(off); off += 4;
  const offsets = new Map();
  for (let i = 0; i < count; i++) {
    const v = buf.readBigUInt64LE(off); off += 8;
    offsets.set(v & mask, Number(v >> BigInt(hashBits)));
  }
  const data = buf.subarray(off);
  const table = new Map();
  for (const [hash, offset] of offsets) {
    let end = data.indexOf(0, offset);
    if (end === -1) end = data.length;
    table.set(hash, data.subarray(offset, end).toString('utf8'));
  }
  return { table, mask };
}

// CommunityDragon 哈希反查表行格式："hashhex key"，只留需要的键
function loadHashMap(file, needed) {
  const neededSet = new Set(needed.map((k) => k.toLowerCase()));
  const map = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const idx = line.indexOf(' ');
    if (idx <= 0) continue;
    const key = line.slice(idx + 1).trim();
    if (!neededSet.has(key.toLowerCase())) continue;
    map.set(key.toLowerCase(), line.slice(0, idx).trim());
  }
  return map;
}

(async () => {
  console.error('解析 kiwi.bin.json …');
  const bin = JSON.parse(fs.readFileSync(path.join(DIR, 'kiwi.bin.json'), 'utf8'));
  const augments = [];
  for (const entry of Object.values(bin)) {
    if (entry && typeof entry === 'object' && entry.__type === 'AugmentData') augments.push(entry);
  }
  console.error(`AugmentData: ${augments.length} 条`);

  console.error('解析 RST 字符串表…');
  const { table, mask } = readRst(path.join(DIR, 'lol-zh_cn.stringtable'));
  console.error(`zh_cn 条目: ${table.size}`);

  const neededKeys = [];
  for (const a of augments) {
    for (const k of [a.NameTra, a.DescriptionTra, a.AugmentTooltipTra]) {
      if (typeof k === 'string' && k) neededKeys.push(k);
    }
  }
  const hashList = process.argv[2];
  if (!hashList) throw new Error('用法: node tools/extract-kiwi-text.js <hashes.rst.xxh3.txt>');
  console.error(`需要反查的文本键 ${neededKeys.length} 个，加载哈希表…`);
  const keyHash = loadHashMap(hashList, neededKeys);
  const missing = [...new Set(neededKeys.map((k) => k.toLowerCase()))].filter((k) => !keyHash.has(k));
  if (missing.length) console.error(`哈希表里缺失 ${missing.length} 个键: ${missing.slice(0, 8).join(', ')}`);
  // RST 存哈希的低 N 位，反查表里是完整 64 位值，查表前先掩码
  const lookup = (key) => {
    const hex = keyHash.get(String(key || '').toLowerCase());
    return hex !== undefined ? BigInt('0x' + hex) & mask : undefined;
  };

  console.error('组装输出…');
  const out = {};
  let okName = 0;
  let okDesc = 0;
  for (const a of augments) {
    const id = a.AugmentNameId;
    if (!id) continue;
    const nameH = lookup(a.NameTra);
    const descH = lookup(a.DescriptionTra);
    const tipH = lookup(a.AugmentTooltipTra);
    // @数值@ 占位符来自 RootSpell 的法术 DataValues（每级一组，取第 1 级）
    const spell = bin[a.RootSpell] && bin[a.RootSpell].mSpell;
    const dataValues = {};
    for (const d of (spell && spell.DataValues) || []) {
      if (d && d.name && Array.isArray(d.values) && Number.isFinite(d.values[0])) {
        dataValues[d.name] = d.values[0];
      }
    }
    const name = nameH !== undefined ? table.get(nameH) : undefined;
    const desc = descH !== undefined ? table.get(descH) : undefined;
    const tooltip = tipH !== undefined ? table.get(tipH) : undefined;
    if (name) okName++;
    if (desc || tooltip) okDesc++;
    out[id] = { name: name || '', desc: desc || '', tooltip: tooltip || '', dataValues };
  }

  const payload = {
    note: '海克斯大乱斗强化的官方中文文本，提取自游戏客户端 kiwi.bin + zh_cn lol.stringtable（CommunityDragon 镜像）。desc/tooltip 里的 @键@ 由 dataValues 填充。由 tools/extract-kiwi-text.js 生成。',
    updated: new Date().toISOString().slice(0, 10),
    augments: out,
  };
  const outFile = path.join(ROOT, '_data', 'kiwi-text.json');
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.error(`已写入 ${outFile}（${Math.round(fs.statSync(outFile).size / 1024)} KB）`);
  console.error(`AugmentNameId: ${Object.keys(out).length}，中文名 ${okName}，中文描述 ${okDesc}`);
})().catch((e) => { console.error('FAILED', e); process.exitCode = 1; });
