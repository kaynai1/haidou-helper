/* Generates web/data/data.js from curated tables + DDragon zh_CN data. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, '_data');
const champRaw = require(path.join(SRC, 'champion.json')).data;
const itemRaw = require(path.join(SRC, 'item.json')).data;
// 图鉴用的官方强化数据，由 tools/update-augments.js 维护
const AUGMENT_FILE = path.join(SRC, 'augments.json');
if (!fs.existsSync(AUGMENT_FILE)) {
  throw new Error('缺少 _data/augments.json，请先运行 node tools/update-augments.js');
}
const officialData = JSON.parse(fs.readFileSync(AUGMENT_FILE, 'utf8'));
const officialAugments = officialData.augments;
const DDRAGON = '16.21.1';

// 官方全量英雄名单（Data Dragon 中文，含全部英雄）。悬浮窗用它把 Live API 报上来的
// 任何英雄 id / 名字 / 称号认出来——国服客户端会把称号（诺克萨斯之手）当英雄名上报，
// 只靠手写收录的 42 位会误报「未收录」。
const roster = {};
for (const [key, c] of Object.entries(champRaw)) {
  roster[key] = { name: c.name, title: c.title };
}

const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const pick = (seed, min, max) => {
  const v = (hash(seed) % 1000) / 1000;
  return +(min + v * (max - min)).toFixed(1);
};

const TIERS = {
  T1: ['Ahri', 'Jinx', 'Yasuo', 'Sion', 'Lux', 'Zed'],
  T2: ['Vayne', 'Ezreal', 'Sett', 'Katarina', 'Brand', 'Garen', 'Morgana', 'Seraphine', 'Kaisa'],
  T3: ['Ashe', 'Jhin', 'Akali', 'Riven', 'Darius', 'Veigar', 'Zyra', 'Pyke', 'DrMundo', 'Annie'],
  T4: ['Lucian', 'Kayn', 'Fiora', 'Vex', 'Amumu', 'Thresh', 'Lulu', 'KogMaw', 'Sylas'],
  T5: ['Talon', 'Yone', 'Leona', 'Braum', 'Nami', 'Rakan', 'Yuumi', 'Graves'],
};
const TIER_RANGE = { T1: [52.6, 54.6], T2: [51.2, 52.5], T3: [49.7, 51.1], T4: [48.0, 49.6], T5: [45.6, 47.9] };
const PICK_RANGE = { T1: [12, 19], T2: [9, 14.5], T3: [6, 11], T4: [4, 8], T5: [2, 5.5] };

const META = {
  Ahri: ['mage', '高机动消耗法师，靠魅惑开团与拉扯滚起雪球。'],
  Lux: ['mage', '超远消耗与爆发兼备，注意技能命中率与站位。'],
  Brand: ['mage', '范围灼烧压制前排，团战靠被动的连锁爆炸。'],
  Veigar: ['mage', '叠法强无上限，控住关键目标即可一套带走。'],
  Zyra: ['mage', '植物持续输出，先手控制与地形封锁是核心。'],
  Vex: ['mage', '反打突进阵容的利器，恐惧时机决定上限。'],
  Morgana: ['mage', '黑盾保人、Q 定身开团，功能与伤害兼顾。'],
  Annie: ['mage', '攒被动开团，闪现提伯斯往往是胜负手。'],
  Seraphine: ['support', '团队增益与远程消耗，双音符连招收益极高。'],
  Sylas: ['mage', '偷取关键大招改变战局，进场时机要稳。'],
  Jinx: ['marksman', '被动滚雪球极强，收掉第一个人后接管团战。'],
  Ashe: ['marksman', '减速风筝与全图大招，持续输出稳定。'],
  Ezreal: ['marksman', '灵活拉扯，技能命中率决定输出上限。'],
  Kaisa: ['marksman', '叠被动爆发，进化后机动与输出兼备。'],
  Jhin: ['marksman', '固定节奏的爆发射手，第四发与花开时刻最关键。'],
  Vayne: ['marksman', '前排杀手，靠翻滚拉扯打出真实伤害。'],
  Lucian: ['marksman', '前期强势的双枪手，技能衔接普攻压血线。'],
  KogMaw: ['marksman', '后期百分比输出，站位与保护决定生死。'],
  Graves: ['marksman', '近距离霰弹爆发，靠位移调整角度输出。'],
  Zed: ['assassin', '影子换位刺杀后排，进场时机比伤害更重要。'],
  Katarina: ['assassin', '击杀刷新技能，等控制交完再进场收割。'],
  Akali: ['assassin', '烟雾弹拉扯与爆发兼具，专抓落单后排。'],
  Talon: ['assassin', '翻墙游走与爆发极高，目标选择决定价值。'],
  Kayn: ['assassin', '蓝凯爆发、红凯续航，按阵容选择形态。'],
  Pyke: ['assassin', '斩杀滚钱，钩中关键目标就能打开局面。'],
  Yone: ['fighter', '双段突进与击飞，入场时机和技能命中是门槛。'],
  Yasuo: ['fighter', '风墙与击飞联动，装备成型后持续输出极强。'],
  Sett: ['fighter', '前排对拼与抱摔开团，靠护盾与真伤站场。'],
  Riven: ['fighter', '连招爆发与机动兼具，掌握取消后摇收益最大。'],
  Darius: ['fighter', '血怒叠满后收割，利用 Q 回血与外圈压制。'],
  Fiora: ['fighter', '单挑与切前排专家，打满破绽即可秒杀。'],
  Sion: ['tank', '无限成长的前排，蓄力 Q 控场、死后继续施压。'],
  Garen: ['fighter', '沉默突进与斩杀大招，简单直接的前排战士。'],
  Amumu: ['tank', '大范围开团核心，Q 命中后接大招改变团战。'],
  DrMundo: ['tank', '高回复坦克，扛住第一波伤害后越战越勇。'],
  Leona: ['tank', '连环控制开团，配合队友集火效率极高。'],
  Thresh: ['support', '灯笼救援与钩子开团，功能型坦克的天花板。'],
  Braum: ['tank', '盾墙挡伤害，被动眩晕配合队友打反手。'],
  Lulu: ['support', '变羊与大招保人，保护核心输出。'],
  Nami: ['support', '治疗与击飞控制，团战拉扯型辅助。'],
  Rakan: ['support', '高机动开团辅助，R 闪进场打乱阵型。'],
  Yuumi: ['support', '挂件增益与治疗，附身时机与目标选择是关键。'],
};

const ARCH_LABEL = { mage: '法师', marksman: '射手', assassin: '刺客', fighter: '战士', tank: '坦克', support: '辅助' };

const STARTER = {
  mage: [1056, 2003],
  marksman: [1055, 2003],
  assassin: [1055, 2003],
  fighter: [1055, 2003],
  tank: [1054, 2003],
  support: [1056, 2003],
};
const SKILL = {
  mage: 'Q > W > E',
  marksman: 'Q > W > E',
  assassin: 'Q > E > W',
  fighter: 'Q > E > W',
  tank: 'Q > W > E',
  support: 'E > W > Q',
};

const POOL = {
  mage: [
    {
      name: '爆发流',
      style: '先手秒人',
      items: [6655, 3020, 3089, 4645, 3135, 3157],
      note: '卢登起手打爆发，帽子 + 影焰拉满法强，沙漏用来躲关键控制。',
    },
    {
      name: '灼烧消耗',
      style: '持续压制',
      items: [6653, 3020, 3116, 3165, 3089, 3157],
      note: '面具 + 冰杖拉扯，莫雷洛克制回复阵容，适合对面多前排。',
    },
  ],
  marksman: [
    {
      name: '暴击流',
      style: '平A核心',
      items: [6672, 3006, 3031, 3046, 3036, 3072],
      note: '海妖 + 无尽三件套成型，脆皮阵容下的最高输出路线。',
    },
    {
      name: '续航流',
      style: '稳健对拼',
      items: [3153, 3006, 6673, 3046, 3053, 3036],
      note: '破败 + 盾弓保证续航，面对突进阵容更难被秒。',
    },
  ],
  assassin: [
    {
      name: '穿甲爆发',
      style: '秒后排',
      items: [3142, 3047, 6692, 6694, 3074, 6333],
      note: '幽梦 + 星蚀抓落单，赛瑞尔达处理半肉，死亡之舞提高容错。',
    },
    {
      name: '持续收割',
      style: '多段进场',
      items: [6692, 3047, 3071, 3053, 6333, 3072],
      note: '黑切 + 死舞的战士化路线，适合需要多次进场的对局。',
    },
  ],
  fighter: [
    {
      name: '三相战士',
      style: '正面强攻',
      items: [3078, 3047, 6610, 6333, 3053, 3111],
      note: '三相 + 焚天兼顾技能与普攻，死舞、血手撑住中后期团战。',
    },
    {
      name: '九头蛇带线',
      style: '续航推线',
      items: [6610, 3047, 3074, 6333, 3053, 3111],
      note: '贪欲九头蛇快速清线，靠吸血在边路持续施压。',
    },
  ],
  tank: [
    {
      name: '心钢前排',
      style: '无限成长',
      items: [3084, 3047, 3068, 3075, 3065, 3143],
      note: '心之钢叠层，日炎维持清线与团战存在感，荆棘克制回复。',
    },
    {
      name: '双抗开团',
      style: '抗压开团',
      items: [6665, 3111, 3068, 3075, 3110, 3190],
      note: '贾修 + 冰心应对高攻速阵容，鸟盾给团队额外容错。',
    },
  ],
  support: [
    {
      name: '护盾增益',
      style: '保人核心',
      items: [6617, 3158, 2065, 3107, 3222, 4005],
      note: '月石 + 舒瑞娅拉扯，救赎与米凯尔应对爆发和减速。',
    },
    {
      name: '功能开团',
      style: '团队节奏',
      items: [2065, 3158, 3107, 3190, 3222, 4005],
      note: '舒瑞娅 + 鸟盾打先手，帝国指令让队友的伤害更高。',
    },
  ],
};

const OVERRIDES = {
  Yasuo: {
    builds: [
      {
        name: '盾弓暴击',
        style: '正面接团',
        items: [6673, 3006, 3031, 3046, 6333, 3072],
        note: '盾弓撑过第一波集火，无尽 + 幻影之舞快速成型。',
      },
      {
        name: '海妖输出',
        style: '滚雪球',
        items: [6672, 3006, 6675, 3031, 3053, 3072],
        note: '海妖 + 纳沃利最大化输出，顺风局压制力极强。',
      },
    ],
  },
  Yone: {
    builds: [
      {
        name: '盾弓暴击',
        style: '接团收割',
        items: [6673, 3006, 3031, 3046, 6333, 3072],
        note: '盾弓保证进场容错，第二件无尽后开始接管团战。',
      },
    ],
  },
  Vayne: {
    builds: [
      {
        name: '破败羊刀',
        style: '前排杀手',
        items: [3153, 3006, 3124, 3046, 3036, 3072],
        note: '破败 + 羊刀快速处理坦克，靠翻滚保持安全距离。',
      },
    ],
  },
  KogMaw: {
    builds: [
      {
        name: '破败羊刀',
        style: '百分比输出',
        items: [3153, 3006, 3124, 3046, 3036, 3072],
        note: '百分比 + 鬼索三件套成型，需要队友提供保护。',
      },
    ],
  },
  Ezreal: {
    builds: [
      {
        name: '三相魔切',
        style: '远程拉扯',
        items: [3078, 3004, 3046, 3036, 3153, 3006],
        note: '三相 + 魔切是核心节奏点，靠 Q 频繁触发咒刃消耗。',
      },
    ],
  },
  Jhin: {
    builds: [
      {
        name: '收集者暴击',
        style: '固定爆发',
        items: [6676, 3006, 3031, 3046, 3036, 3072],
        note: '收集者补足斩杀线，第四发与花开时刻是主要伤害来源。',
      },
    ],
  },
  Kaisa: {
    builds: [
      {
        name: '海妖进化',
        style: '混伤爆发',
        items: [6672, 3006, 3124, 3046, 3031, 3072],
        note: '优先凑齐进化条件，混伤让前排和后排都难以针对。',
      },
    ],
  },
  Ashe: {
    builds: [
      {
        name: '海妖暴击',
        style: '减速风筝',
        items: [6672, 3006, 3031, 3046, 3094, 3072],
        note: '海妖 + 火炮扩大消耗距离，大招留着开团或反打。',
      },
    ],
  },
  Graves: {
    builds: [
      {
        name: '星蚀穿甲',
        style: '近距离爆发',
        items: [6692, 3047, 3071, 6333, 3053, 3072],
        note: '星蚀 + 黑切打前中期节奏，贴脸霰弹伤害最高。',
      },
    ],
  },
  Katarina: {
    builds: [
      {
        name: 'AP 爆发',
        style: '刷新收割',
        items: [3152, 3020, 4645, 3089, 3100, 3157],
        note: '腰带进场 + 影焰秒脆皮，等控制交完再进场刷新技能。',
      },
    ],
  },
  Akali: {
    builds: [
      {
        name: 'AP 刺客',
        style: '切后排',
        items: [3152, 3020, 4645, 3089, 3100, 3157],
        note: '腰带 + 影焰打一套爆发，烟雾弹用来拖技能冷却。',
      },
    ],
  },
  Sion: {
    builds: [
      {
        name: '心钢巨九',
        style: '成长前排',
        items: [3084, 3047, 3748, 3065, 3075, 3143],
        note: '心钢叠血 + 巨型九头蛇清线，死后继续用尸体施压。',
      },
    ],
  },
  Sett: {
    builds: [
      {
        name: '焚天战士',
        style: '正面开团',
        items: [6610, 3047, 3078, 6333, 3053, 3111],
        note: '焚天 + 三相强化抱摔后的持续对拼，血手保证开团容错。',
      },
    ],
  },
  Garen: {
    builds: [
      {
        name: '黑切战士',
        style: '沉默切入',
        items: [6610, 3047, 3071, 6333, 3053, 3111],
        note: '黑切削减护甲，Q 沉默配合大招斩杀关键目标。',
      },
    ],
  },
  DrMundo: {
    builds: [
      {
        name: '心钢不朽',
        style: '高回复前排',
        items: [3084, 3111, 3068, 3075, 2504, 6665],
        note: '心钢 + 振奋撑起回复，大招留着扛第一波爆发。',
      },
    ],
  },
  Thresh: {
    builds: [
      {
        name: '团队保护',
        style: '灯笼救援',
        items: [2065, 3158, 3107, 3190, 3222, 4005],
        note: '舒瑞娅 + 鸟盾打反手，灯笼优先救被集火的队友。',
      },
    ],
  },
  Leona: {
    builds: [
      {
        name: '开团坦克',
        style: '连环控制',
        items: [6665, 3047, 3068, 3075, 3110, 3190],
        note: '双抗 + 减伤开团，R 命中后接 Q/E 打满控制链。',
      },
    ],
  },
  Braum: {
    builds: [
      {
        name: '盾墙保护',
        style: '反手核心',
        items: [6665, 3111, 3068, 3075, 3110, 3190],
        note: '盾墙挡住关键技能，被动配合队友打出眩晕。',
      },
    ],
  },
  Pyke: {
    builds: [
      {
        name: '穿甲斩杀',
        style: '滚钱收割',
        items: [3142, 3047, 6692, 6694, 3074, 6333],
        note: '穿甲 + 幽梦找机会，大招斩杀刷新经济滚起雪球。',
      },
    ],
  },
  Sylas: {
    builds: [
      {
        name: 'AP 战士',
        style: '偷大招开团',
        items: [6653, 3020, 4633, 3157, 3089, 3135],
        note: '面具 + 裂隙制造者打持续，偷到关键大招即可改变战局。',
      },
    ],
  },
  Morgana: {
    builds: [
      {
        name: '灼烧控制',
        style: '定身消耗',
        items: [6653, 3020, 3116, 3165, 3157, 3089],
        note: '面具 + 冰杖拉扯，Q 命中后接 W/R 打满控制链。',
      },
    ],
  },
  Seraphine: {
    builds: [
      {
        name: '月石增益',
        style: '团队核心',
        items: [6617, 3158, 2065, 3107, 3222, 4005],
        note: '月石 + 舒瑞娅团队增益，双音符连招优先给前排。',
      },
    ],
  },
};

const AUGMENTS = [
  [
    'jeweled_gauntlet',
    '珠光护手',
    'prismatic',
    '输出',
    ['mage', 'assassin'],
    '技能命中后强化下一次普攻，造成额外法术伤害。',
    95,
  ],
  [
    'giant_slayer',
    '巨兽杀手',
    'prismatic',
    '输出',
    ['marksman', 'fighter'],
    '对生命值高于你的目标造成额外真实伤害。',
    92,
  ],
  ['earthwake', '大地觉醒', 'prismatic', '生存', ['fighter', 'tank'], '施放终极技能后获得护盾与韧性，持续数秒。', 90],
  [
    'soul_siphon',
    '灵魂虹吸',
    'prismatic',
    '功能',
    ['mage', 'fighter', 'tank', 'assassin', 'marksman', 'support'],
    '参与击杀永久获得生命值与法术强度。',
    86,
  ],
  ['infinite_loop', '无尽循环', 'prismatic', '输出', ['mage'], '技能急速大幅提升，但技能法力消耗提高。', 91],
  ['blade_waltz', '剑舞', 'prismatic', '输出', ['fighter', 'assassin'], '普攻与技能交替命中时叠加额外伤害。', 93],
  [
    'time_stop',
    '时间停滞',
    'prismatic',
    '生存',
    ['mage', 'marksman', 'assassin', 'fighter', 'tank', 'support'],
    '生命值过低时短暂无敌并回复生命，冷却较长。',
    88,
  ],
  ['demon_pact', '恶魔契约', 'prismatic', '输出', ['fighter', 'assassin'], '牺牲部分最大生命，换取高额全能吸血。', 84],
  [
    'celestial_body',
    '天界之躯',
    'prismatic',
    '生存',
    ['tank', 'fighter'],
    '最大生命提升、体型增大，并提高控制抗性。',
    87,
  ],
  ['double_cast', '双重施法', 'prismatic', '输出', ['mage', 'support'], '每第三次技能施放会再次触发一次。', 94],
  [
    'lightning_dash',
    '闪电冲刺',
    'prismatic',
    '功能',
    ['assassin', 'marksman'],
    '位移后获得爆发移速，并强化下一次攻击。',
    85,
  ],
  ['void_rift', '虚空裂隙', 'prismatic', '输出', ['mage'], '技能伤害会叠加易伤，层数越高增伤越高。', 89],
  ['iron_bulwark', '钢铁壁垒', 'prismatic', '生存', ['tank'], '获得护盾时对周围敌人造成反弹伤害。', 82],
  ['echo_strike', '回响打击', 'prismatic', '输出', ['mage'], '技能命中后弹射至附近敌人，造成衰减伤害。', 83],
  [
    'rebirth_flame',
    '复生之焰',
    'prismatic',
    '生存',
    ['mage', 'marksman', 'assassin', 'fighter', 'tank', 'support'],
    '阵亡后短暂复活并回复部分生命，每局一次。',
    88,
  ],
  ['scorch', '灼烧', 'gold', '输出', ['mage'], '技能命中附加持续灼烧伤害。', 74],
  ['frost_nova', '寒霜新星', 'gold', '功能', ['tank', 'support'], '受到攻击时释放减速冰环。', 66],
  [
    'first_aid',
    '急救包',
    'gold',
    '生存',
    ['mage', 'marksman', 'assassin', 'fighter', 'tank', 'support'],
    '脱离战斗后快速回复生命。',
    64,
  ],
  ['war_symphony', '战斗交响', 'gold', '输出', ['fighter', 'marksman'], '附近每名敌人提升你的攻击速度。', 72],
  ['shrink_engine', '缩小引擎', 'gold', '功能', ['mage', 'marksman'], '体型缩小，移速与闪避提升。', 65],
  ['berserk_engine', '狂暴引擎', 'gold', '输出', ['fighter', 'marksman'], '低生命值时获得攻速与移速。', 73],
  ['static_field', '静电场', 'gold', '输出', ['tank', 'mage'], '周期性对周围敌人造成魔法伤害。', 70],
  ['burning_soul', '燃烧之魂', 'gold', '输出', ['mage'], '技能造成伤害时叠加法术强度。', 78],
  ['guardian_oath', '守护者之誓', 'gold', '功能', ['support', 'tank'], '为附近队友分担部分伤害。', 68],
  ['hunter_instinct', '猎手本能', 'gold', '输出', ['assassin'], '对低生命值目标伤害提升。', 76],
  ['precise_barrage', '精准弹幕', 'gold', '输出', ['marksman', 'mage'], '远程技能伤害随飞行距离提升。', 71],
  ['armor_piercer', '破甲尖刺', 'gold', '输出', ['marksman', 'fighter'], '普攻削减目标护甲。', 69],
  ['bloodlust', '嗜血渴望', 'gold', '输出', ['fighter', 'assassin'], '生命偷取与全能吸血提升。', 67],
  ['frozen_heart', '冰霜之心', 'gold', '生存', ['tank'], '受到普攻时降低攻击者攻速。', 66],
  ['swift_stride', '迅捷步伐', 'gold', '功能', ['marksman'], '移动积攒充能，下次攻击回血并加速。', 62],
  ['arcane_surge', '秘术涌动', 'gold', '功能', ['mage', 'support'], '法力回复提升，技能命中回复法力。', 60],
  ['duelist', '决斗者', 'gold', '输出', ['fighter', 'assassin'], '附近只有一名敌人时伤害提升。', 75],
  ['reflect_shell', '反伤外壳', 'gold', '生存', ['tank'], '受到伤害时反弹部分伤害。', 63],
  ['phantom_step', '幽灵疾行', 'gold', '功能', ['assassin', 'marksman'], '穿过单位时获得移速。', 61],
  ['vampire', '吸血鬼', 'gold', '生存', ['mage', 'fighter'], '造成伤害时治疗自身。', 69],
  ['heavy_blow', '重击', 'gold', '输出', ['tank', 'fighter'], '普攻附带最大生命值伤害。', 68],
  ['eagle_eye', '鹰眼', 'gold', '功能', ['mage', 'marksman'], '技能射程提升。', 73],
  ['amp_core', '增幅核心', 'gold', '功能', ['support', 'mage'], '附近队友获得额外法术强度。', 62],
  ['armor_plate', '装甲强化', 'gold', '生存', ['tank', 'fighter'], '获得额外护甲与魔抗。', 64],
  ['hunt_moment', '猎杀时刻', 'gold', '输出', ['assassin'], '击杀后刷新部分技能冷却。', 77],
  ['gale_blade', '疾风之刃', 'gold', '输出', ['marksman'], '攻速提升，普攻附带魔法伤害。', 74],
  ['unyielding', '不屈意志', 'gold', '生存', ['fighter', 'tank'], '受到控制时获得护盾。', 65],
  [
    'astral_walker',
    '星界游神',
    'gold',
    '功能',
    ['mage', 'marksman', 'assassin', 'fighter', 'tank', 'support'],
    '脱战后移速大幅提升。',
    58,
  ],
  ['molten_heart', '熔火之心', 'gold', '输出', ['tank'], '周围敌人持续受到灼烧。', 67],
  ['arcane_missile', '秘法飞弹', 'gold', '输出', ['mage'], '技能命中发射追踪飞弹。', 72],
  ['strong_attack', '强攻', 'silver', '输出', ['marksman'], '连续普攻提升伤害。', 52],
  [
    'life_drain',
    '生命汲取',
    'silver',
    '生存',
    ['mage', 'marksman', 'assassin', 'fighter', 'tank', 'support'],
    '参与击杀回复生命值。',
    48,
  ],
  ['mana_shield', '法力护盾', 'silver', '生存', ['mage'], '消耗法力抵挡伤害。', 50],
  ['sharp_eyes', '锐利目光', 'silver', '输出', ['marksman'], '暴击率提升。', 51],
  [
    'swiftness',
    '迅捷',
    'silver',
    '功能',
    ['mage', 'marksman', 'assassin', 'fighter', 'tank', 'support'],
    '移动速度小幅提升。',
    45,
  ],
  ['tenacity', '坚韧', 'silver', '生存', ['tank', 'fighter'], '韧性提升。', 47],
  ['cooldown', '冷却缩减', 'silver', '功能', ['mage', 'support', 'tank'], '技能急速提升。', 53],
  ['attack_up', '攻击强化', 'silver', '输出', ['marksman', 'assassin', 'fighter'], '攻击力提升。', 49],
  ['spell_up', '法术强化', 'silver', '输出', ['mage', 'support'], '法术强度提升。', 50],
  ['armor_up', '护甲强化', 'silver', '生存', ['tank', 'fighter'], '护甲提升。', 44],
  ['mr_up', '魔抗强化', 'silver', '生存', ['tank', 'fighter'], '魔法抗性提升。', 44],
  [
    'health_up',
    '生命强化',
    'silver',
    '生存',
    ['mage', 'marksman', 'assassin', 'fighter', 'tank', 'support'],
    '最大生命值提升。',
    46,
  ],
  ['lifesteal', '吸血', 'silver', '输出', ['fighter', 'marksman'], '生命偷取提升。', 47],
  ['precision', '精准', 'silver', '输出', ['mage', 'marksman'], '技能伤害提升。', 48],
  ['regen', '回复', 'silver', '功能', ['mage', 'support', 'tank'], '生命回复提升。', 43],
  ['battle_will', '战意', 'silver', '输出', ['fighter', 'assassin'], '参与击杀获得攻击速度。', 46],
  ['hold_line', '坚守', 'silver', '功能', ['support', 'tank'], '附近队友获得额外护甲。', 42],
  [
    'charge',
    '蓄能',
    'silver',
    '生存',
    ['mage', 'marksman', 'assassin', 'fighter', 'tank', 'support'],
    '静止时积攒护盾。',
    45,
  ],
  ['spell_pierce', '破法', 'silver', '输出', ['mage'], '技能伤害穿透部分魔法抗性。', 51],
];

const SIGNATURE = {
  Ahri: 'jeweled_gauntlet',
  Lux: 'double_cast',
  Brand: 'burning_soul',
  Veigar: 'infinite_loop',
  Zyra: 'echo_strike',
  Vex: 'void_rift',
  Morgana: 'soul_siphon',
  Annie: 'double_cast',
  Seraphine: 'amp_core',
  Sylas: 'soul_siphon',
  Jinx: 'gale_blade',
  Ashe: 'precise_barrage',
  Ezreal: 'double_cast',
  Kaisa: 'giant_slayer',
  Jhin: 'precise_barrage',
  Vayne: 'armor_piercer',
  Lucian: 'lightning_dash',
  KogMaw: 'giant_slayer',
  Graves: 'armor_piercer',
  Zed: 'hunter_instinct',
  Katarina: 'blade_waltz',
  Akali: 'lightning_dash',
  Talon: 'hunter_instinct',
  Kayn: 'demon_pact',
  Pyke: 'hunt_moment',
  Yone: 'blade_waltz',
  Yasuo: 'blade_waltz',
  Sett: 'earthwake',
  Riven: 'duelist',
  Darius: 'giant_slayer',
  Fiora: 'duelist',
  Sion: 'celestial_body',
  Garen: 'heavy_blow',
  Amumu: 'iron_bulwark',
  DrMundo: 'celestial_body',
  Leona: 'iron_bulwark',
  Thresh: 'guardian_oath',
  Braum: 'guardian_oath',
  Lulu: 'amp_core',
  Nami: 'arcane_surge',
  Rakan: 'guardian_oath',
  Yuumi: 'amp_core',
};

const RARITY = { prismatic: '棱彩', gold: '黄金', silver: '白银' };
const GRADE_ORDER = ['S', 'A', 'B', 'C'];

// 这套手写强化只用于英雄推荐（定位适配、强度评分、胜率都是演示值），不进图鉴。
// 图鉴展示的是官方数据，两边 id 不互通：推荐里出现的名字在图鉴里搜不到，这是已知取舍。
const poolAugments = AUGMENTS.map(([id, name, rarity, category, arch, desc, power]) => ({
  id,
  name,
  rarity,
  rarityName: RARITY[rarity],
  category,
  arch,
  desc,
  power,
  winRate: +(50.2 + power / 18 + (hash(id) % 7) / 10).toFixed(1),
  pickRate: +(4 + power / 3.2 + (hash(id + 'p') % 50) / 10).toFixed(1),
}));
const augById = Object.fromEntries(poolAugments.map((a) => [a.id, a]));

const items = {};
const usedItemIds = new Set();
Object.values(POOL).forEach((list) => list.forEach((b) => b.items.forEach((id) => usedItemIds.add(id))));
Object.values(OVERRIDES).forEach((o) => o.builds.forEach((b) => b.items.forEach((id) => usedItemIds.add(id))));
Object.values(STARTER).forEach((ids) => ids.forEach((id) => usedItemIds.add(id)));
usedItemIds.forEach((id) => {
  const it = itemRaw[id];
  if (!it) throw new Error('Missing item ' + id);
  items[id] = { name: it.name };
});

const champions = [];
for (const [tier, keys] of Object.entries(TIERS)) {
  for (const key of keys) {
    const raw = champRaw[key];
    if (!raw) throw new Error('Missing champion ' + key);
    const [archetype, blurb] = META[key];
    const tierIdx = Number(tier[1]);
    const winRate = pick(key + 'w', ...TIER_RANGE[tier]);
    const pickRate = pick(key + 'p', ...PICK_RANGE[tier]);
    const signature = SIGNATURE[key] || null;

    const scored = poolAugments
      .map((a) => {
        let score = a.power / 25;
        if (a.arch.includes(archetype)) score += 4;
        if (a.arch.length === 6) score -= 0.9;
        if (a.id === signature) score += 8;
        if (hash(a.id + key) % 100 < 22) score += 0.6;
        return { a, score };
      })
      .sort((x, y) => y.score - x.score);

    const recs = [];
    const PICK_BAND = { S: [28, 40], A: [18, 26], B: [10, 16], C: [5, 9] };
    const OUT_NOTES = [
      '与这套出装的伤害节奏契合，拿到就能直接提升输出。',
      '补足中期的伤害空窗，顺风局可以提前锁定。',
      '和核心技能的连招衔接顺滑，团战收益稳定。',
      '偏向持续输出，面对多前排阵容时更好用。',
    ];
    const SURV_NOTES = [
      '提升进场容错，对面爆发高时提前锁定。',
      '用来扛住第一波集火，给输出位创造空间。',
      '被针对时优先级上升，能多拖出一轮技能。',
    ];
    const FUNC_NOTES = [
      '补足机动与拉扯空间，适合作为第二顺位。',
      '改善资源循环，让关键技能转得更快。',
      '偏团队收益，队友强势时价值更高。',
    ];
    for (let i = 0; i < 8; i++) {
      const { a } = scored[i];
      const grade = i < 2 ? 'S' : i < 4 ? 'A' : i < 6 ? 'B' : 'C';
      const isSig = a.id === signature;
      let note;
      if (isSig) note = `本命搭配：${a.desc.replace(/。$/, '')}，和${raw.title}的输出节奏高度契合。`;
      else if (a.arch.length === 6)
        note = ['通用型强化，任何阵容都能稳定吃到收益。', '容错型选择，逆风局或阵容不明时更稳。'][i % 2];
      else if (a.category === '输出') note = OUT_NOTES[i % OUT_NOTES.length];
      else if (a.category === '生存') note = SURV_NOTES[i % SURV_NOTES.length];
      else note = FUNC_NOTES[i % FUNC_NOTES.length];
      const [lo, hi] = PICK_BAND[grade];
      const pickRate = isSig
        ? +(hi - (hash(key + a.id) % 30) / 10).toFixed(1)
        : +pick(key + a.id, lo, hi - 1).toFixed(1);
      recs.push({ id: a.id, grade, pickRate, note });
    }

    let buildsSrc = (OVERRIDES[key] || { builds: POOL[archetype] }).builds.slice(0, 2);
    if (buildsSrc.length < 2) {
      const extra = POOL[archetype].find((b) => !buildsSrc.some((x) => x.name === b.name));
      if (extra) buildsSrc = buildsSrc.concat(extra);
    }
    const builds = buildsSrc.map((b, i) => ({
      id: `${key}-b${i + 1}`,
      name: b.name,
      style: b.style,
      note: b.note,
      items: b.items,
      starter: STARTER[archetype],
      skillOrder: SKILL[archetype],
      winRate: +(winRate + (i === 0 ? 0.8 : -0.6)).toFixed(1),
      pickRate: +(pickRate * (i === 0 ? 0.62 : 0.38)).toFixed(1),
      coreCount: 3,
    }));

    const synergyAug = recs[1] ? augById[recs[1].id] : null;
    const tips = [
      `起手优先锁定【${augById[recs[0].id].name}】，它是这套体系里收益最高的强化。`,
      synergyAug
        ? `第二顺位考虑【${synergyAug.name}】，${synergyAug.category === '输出' ? '补足伤害上限' : synergyAug.category === '生存' ? '提高进场容错' : '改善拉扯与资源循环'}。`
        : '',
      `出装走「${builds[0].name}」：${builds[0].note}`,
    ].filter(Boolean);

    champions.push({
      id: key,
      name: raw.title,
      title: raw.name,
      roles: raw.tags.map(
        (t) =>
          ARCH_LABEL[
            {
              Mage: 'mage',
              Support: 'support',
              Assassin: 'assassin',
              Fighter: 'fighter',
              Tank: 'tank',
              Marksman: 'marksman',
            }[t]
          ],
      ),
      archetype,
      archetypeName: ARCH_LABEL[archetype],
      tier,
      winRate,
      pickRate,
      blurb,
      augments: recs,
      builds,
      tips,
      signature,
      splash: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${key}_0.jpg`,
      loading: `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${key}_0.jpg`,
      square: `https://ddragon.leagueoflegends.com/cdn/${DDRAGON}/img/champion/${key}.png`,
    });
  }
}

const data = {
  meta: {
    name: '海斗速查',
    mode: '海克斯大乱斗',
    patch: DDRAGON,
    updated: '2026-10-28',    championCount: champions.length,
    augmentCount: officialAugments.length,
    augmentPoolCount: poolAugments.length,
    augmentMode: officialData.mode,
    buildCount: champions.reduce((n, c) => n + c.builds.length, 0),
    itemIcon: `https://ddragon.leagueoflegends.com/cdn/${DDRAGON}/img/item/`,
    championIcon: `https://ddragon.leagueoflegends.com/cdn/${DDRAGON}/img/champion/`,
    disclaimer:
      '本工具为个人练习项目，胜率、选取率与推荐评分均为演示数据，不代表官方或任何第三方统计。英雄头像与装备图标来自 Riot Data Dragon，海克斯强化的名称、稀有度、图标与描述来自官方客户端资源（CommunityDragon 镜像）。',
  },
  archetypes: Object.entries(ARCH_LABEL).map(([id, name]) => ({ id, name })),
  items,
  // 图鉴：官方强化数据（名称 / 稀有度 / 描述 / 图标）
  augments: officialAugments,
  // 推荐：手写强化池，只给英雄详情和悬浮窗用
  augmentPool: poolAugments,
  champions,
  // 官方全量英雄名单（id → 中文名 / 称号），只用于悬浮窗的对局识别
  roster,
};

fs.mkdirSync(path.join(ROOT, 'web', 'data'), { recursive: true });
// 只产出 data.js：网页和悬浮窗都通过 <script> 加载它。
// 之前还额外写了一份 data.json，但没有任何代码读取，属于纯冗余产物。
fs.writeFileSync(path.join(ROOT, 'web', 'data', 'data.js'), 'window.HAIDOU_DATA = ' + JSON.stringify(data) + ';\n');
console.log(
  'champions',
  champions.length,
  'official augments',
  officialAugments.length,
  'pool augments',
  poolAugments.length,
  'builds',
  data.meta.buildCount,
  'items',
  Object.keys(items).length,
);
console.log('sample:', champions[0].name, champions[0].tier, champions[0].winRate, champions[0].augments[0]);
