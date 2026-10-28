(() => {
  'use strict';

  const D = window.HAIDOU_DATA;
  const app = document.getElementById('app');
  if (!D) {
    app.innerHTML =
      '<div class="wrap" style="padding:80px 0"><h1 class="page-title">数据加载失败</h1><p class="page-desc">请确认 web/data/data.js 存在，或重新运行 tools/generate-data.js。</p></div>';
    return;
  }

  /* ---------- helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  const fmt = (n) => Number(n).toFixed(1);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  const champById = new Map(D.champions.map((c) => [c.id, c]));
  // D.augments 是官方图鉴，D.augmentPool 是英雄推荐用的手写强化池，两边 id 不互通
  const augById = new Map(D.augments.map((a) => [a.id, a]));
  const augPoolById = new Map((D.augmentPool || []).map((a) => [a.id, a]));
  const RARITY_ORDER = { prismatic: 0, gold: 1, silver: 2, event: 3 };
  const byRarity = (a, b) =>
    (RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9) || a.name.localeCompare(b.name, 'zh-Hans-CN');
  const TIER_ORDER = { T1: 0, T2: 1, T3: 2, T4: 3, T5: 4 };
  const tierCls = (t) => t.toLowerCase();
  const winCls = (w) => (w >= 52 ? '' : w < 50 ? 'low' : '');
  const itemName = (id) => (D.items[id] ? D.items[id].name : '装备');
  const itemIcon = (id) => `${D.meta.itemIcon}${id}.png`;
  const champIcon = (c) => `${D.meta.championIcon}${c.id}.png`;
  const gradeFromPower = (p) => (p >= 89 ? 'S' : p >= 72 ? 'A' : p >= 55 ? 'B' : 'C');
  // 数据里出现对不上的 augment id 时不要直接抛 TypeError（会让整个路由白屏），
  // 退回一个占位对象，页面照常渲染。英雄推荐里的 id 来自推荐池，要单独查。
  const augOf = (id) =>
    augById.get(id) ||
    augPoolById.get(id) || { id, name: String(id), rarity: '', rarityName: '', category: '', desc: '', arch: [] };

  const ICONS = {
    arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    chev: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
    grid: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
    hex: '<svg viewBox="0 0 24 24"><path d="M12 3l7.5 4.3v9.4L12 21l-7.5-4.3V7.3z"/><path d="M12 8l1.7 4.3L18 14l-4.3 1.7L12 20l-1.7-4.3L6 14l4.3-1.7z"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12 4.5 4.5L19 7"/></svg>',
    shield:
      '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.4-3 8.2-7 10-4-1.8-7-5.6-7-10V6z"/><path d="m9 12 2 2 4-4"/></svg>',
    bolt: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/></svg>',
    cup: '<svg viewBox="0 0 24 24"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 6h2.5a2.5 2.5 0 0 1 0 5H17M7 6H4.5a2.5 2.5 0 0 0 0 5H7M9 20h6M12 14v6"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    screen:
      '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  };
  const icon = (n) => ICONS[n] || '';

  // 图片加载失败时隐藏。原先靠散落各处的内联 onerror 实现，而内联事件处理器会让
  // CSP 不得不放开 script-src 'unsafe-inline'；这里改成捕获阶段的全局监听。
  document.addEventListener(
    'error',
    (e) => {
      if (e.target && e.target.tagName === 'IMG') e.target.style.opacity = 0;
    },
    true,
  );

  /* ---------- components ---------- */
  function champCard(c, opts = {}) {
    const i = opts.i || 0;
    return `<a class="champ-card reveal" href="#/champion/${c.id}" style="--d:${Math.min(i * 35, 300)}ms">
      <div class="portrait"><img src="${c.loading}" alt="${esc(c.name)}" loading="lazy" decoding="async"></div>
      <span class="tier-badge ${tierCls(c.tier)}">${c.tier}</span>
      <div class="champ-meta">
        <div class="champ-name">${esc(c.name)}</div>
        <div class="champ-title">${esc(c.title)}</div>
        <div class="champ-stats">
          <span class="wr ${winCls(c.winRate)}">${fmt(c.winRate)}%</span>
          <span class="pr">选取 ${fmt(c.pickRate)}%</span>
          <span class="roles">${esc(c.archetypeName)}</span>
        </div>
      </div>
    </a>`;
  }

  function augmentCard(a, opts = {}) {
    const i = opts.i || 0;
    // 官方图鉴的强化没有强度评分和胜率，这些区块整体隐藏
    const hasStats = Number.isFinite(a.power) && Number.isFinite(a.pickRate) && Number.isFinite(a.winRate);
    const grade = opts.grade || (Number.isFinite(a.power) ? gradeFromPower(a.power) : '');
    const meta = [a.rarityName, a.category].filter(Boolean).join(' · ');
    const iconHtml = a.icon
      ? `<img class="aug-img" src="${a.icon}" alt="" loading="lazy" decoding="async">`
      : `<b>${esc(a.name.slice(0, 1))}</b>`;
    return `<article class="aug-card r-${a.rarity} reveal" style="--d:${Math.min(i * 30, 240)}ms" data-augment="${a.id}" tabindex="0" role="button" aria-label="查看海克斯 ${esc(a.name)}">
      <div class="aug-top">
        <div class="aug-icon">${iconHtml}</div>
        <div>
          <div class="aug-name">${esc(a.name)}</div>
          <div class="aug-rarity">${esc(meta)}</div>
        </div>
        ${grade ? `<span class="grade g-${grade}">${grade}</span>` : ''}
      </div>
      <p class="aug-desc${a.desc ? '' : ' muted'}">${esc(a.desc || '官方暂未提供文字说明')}</p>
      ${
        hasStats
          ? `<div class="aug-foot"><span>选取率 <b>${fmt(a.pickRate)}%</b></span><span>胜率 ${fmt(a.winRate)}%</span></div>
      <div class="bar"><i style="--p:${clamp(a.pickRate * 2.2, 6, 100)}%"></i></div>`
          : ''
      }
    </article>`;
  }

  function buildCard(b, c, opts = {}) {
    const i = opts.i || 0;
    const core = b.items.slice(0, 3).map(itemName).join(' · ');
    const rest = b.items.slice(3).map(itemName).join(' · ');
    const items = b.items
      .map(
        (id, idx) =>
          `<span class="item${idx < 3 ? ' core' : ''}" title="${esc(itemName(id))}"><img src="${itemIcon(id)}" alt="${esc(itemName(id))}" loading="lazy"></span>`,
      )
      .join('');
    const starter = b.starter
      .map(
        (id) =>
          `<span class="item item-starter" title="${esc(itemName(id))}"><img src="${itemIcon(id)}" alt="${esc(itemName(id))}" loading="lazy"></span>`,
      )
      .join('');
    return `<article class="build-card reveal" style="--d:${Math.min(i * 40, 240)}ms">
      <div class="build-head">
        <img class="build-champ" src="${champIcon(c)}" alt="${esc(c.name)}" loading="lazy">
        <div class="build-head-txt">
          <div class="build-title">${esc(b.name)}</div>
          <div class="build-champ-name"><a href="#/champion/${c.id}">${esc(c.name)}</a> <span class="tier-text ${tierCls(c.tier)}">${c.tier}</span> <span>· ${esc(c.archetypeName)}</span></div>
        </div>
        <span class="build-style">${esc(b.style)}</span>
      </div>
      <div class="items">${items}</div>
      <div class="item-names"><b>核心</b> ${esc(core)}<br><b>后续</b> ${esc(rest)}</div>
      <p class="build-note">${esc(b.note)}</p>
      <div class="starter-row"><span>出门</span>${starter}</div>
      <div class="build-meta">
        <span class="wr ${winCls(b.winRate)}">胜率 <b>${fmt(b.winRate)}%</b></span>
        <span>选取 <b>${fmt(b.pickRate)}%</b></span>
        <span class="spacer">加点 <b>${esc(b.skillOrder)}</b></span>
      </div>
    </article>`;
  }

  function augRows(c, count = 3) {
    return c.augments
      .slice(0, count)
      .map((r) => {
        const a = augOf(r.id);
        return `<div class="mock-aug"><span class="g g-${r.grade}">${r.grade}</span><span class="an">${esc(a.name)}</span><span class="ap">${fmt(r.pickRate)}%</span><span class="prog"><i style="width:${clamp(r.pickRate * 2, 8, 100)}%"></i></span></div>`;
      })
      .join('');
  }

  function overlayMock(c) {
    const build = c.builds[0];
    const items = build.items
      .slice(0, 6)
      .map((id) => `<img src="${itemIcon(id)}" alt="${esc(itemName(id))}" loading="lazy">`)
      .join('');
    return `<div class="mock">
      <div class="mock-bar">
        <span class="mb-mark"><svg viewBox="0 0 40 40"><path d="M20 3 34 11v18L20 37 6 29V11Z" fill="#F0C15B"/></svg></span>
        <span class="mb-title">海斗速查 · 悬浮窗</span>
        <span class="mb-actions"><i>–</i><i>□</i><i>×</i></span>
      </div>
      <div class="mock-body">
        <div class="mock-status"><i class="live-dot"></i>已识别当前英雄<i class="ms-mode">${D.meta.mode}</i></div>
        <div class="mock-champ">
          <img src="${champIcon(c)}" alt="${esc(c.name)}">
          <div>
            <div class="mc-name">${esc(c.name)}</div>
            <div class="mc-sub"><span class="mc-tier tier-text ${tierCls(c.tier)}">${c.tier}</span><span>${esc(c.archetypeName)}</span><span>·</span><span>${esc(c.title)}</span></div>
          </div>
          <div class="mc-wr"><b>${fmt(c.winRate)}%</b><span>海斗胜率</span></div>
        </div>
        <div class="mock-sec">
          <h6><span>海克斯优先级</span><span>选取率</span></h6>
          ${augRows(c, 3)}
        </div>
        <div class="mock-sec">
          <h6><span>推荐出装 · ${esc(build.name)}</span><span>${esc(build.skillOrder)}</span></h6>
          <div class="mock-items">${items}</div>
        </div>
      </div>
      <div class="mock-foot"><span>Ctrl+Shift+H 隐藏</span><span>Ctrl+Shift+L <b>点击穿透</b></span></div>
    </div>`;
  }

  function previewCard(c) {
    const build = c.builds[0];
    const items = build.items
      .slice(0, 5)
      .map((id) => `<img src="${itemIcon(id)}" alt="${esc(itemName(id))}" loading="lazy">`)
      .join('');
    return `<div class="preview-card">
      <span class="demo-tag">DEMO DATA</span>
      <div class="preview-head"><span class="preview-label">对局速览</span><span class="preview-live"><i class="live-dot"></i>演示模式</span></div>
      <div class="preview-champ">
        <img src="${champIcon(c)}" alt="${esc(c.name)}">
        <div>
          <div class="pc-name">${esc(c.name)}</div>
          <div class="pc-sub"><span class="tier-text ${tierCls(c.tier)}">${c.tier}</span><span>${esc(c.archetypeName)}</span><span>·</span><span>${esc(c.title)}</span></div>
        </div>
        <div class="pc-wr"><b>${fmt(c.winRate)}%</b><span>海斗胜率</span></div>
      </div>
      <div class="preview-section">
        <h5><span>海克斯优先级</span><span>选取率</span></h5>
        ${augRows(c, 3).replace(/class="mock-aug"/g, 'class="mock-aug"')}
      </div>
      <div class="preview-section">
        <h5><span>推荐出装 · ${esc(build.name)}</span><span>${esc(build.skillOrder)}</span></h5>
        <div class="mock-items">${items}</div>
      </div>
      <div class="preview-foot"><span>数据版本 <b>${D.meta.patch}</b> · ${D.meta.updated}</span><span>悬浮窗同源数据</span></div>
    </div>`;
  }

  /* ---------- views ---------- */
  function viewHome() {
    // 写死的演示英雄一旦从数据里移除，这里会拿到 undefined 并在取 builds[0] 时抛错，
    // 整个首页白屏。兜底成第一位英雄，并过滤掉没有出装数据的条目。
    const ahri = champById.get('Ahri') || D.champions[0];
    const t1 = D.champions.filter((c) => c.tier === 'T1');
    const augTop = [...D.augments].sort(byRarity).slice(0, 8);
    const picks = ['Ahri', 'Jinx', 'Sion']
      .map((id) => champById.get(id))
      .filter((c) => c && c.builds && c.builds.length)
      .map((c) => ({ c, b: c.builds[0] }));

    return `
    <section class="hero">
      <div class="hero-art"></div>
      <div class="wrap hero-inner">
        <div class="hero-copy">
          <span class="eyebrow"><i class="live-dot"></i>数据版本 ${D.meta.patch} · ${D.meta.mode}</span>
          <h1>一屏看懂<br><span class="grad">这一局怎么打</span></h1>
          <p class="hero-desc">英雄梯度、海克斯强度、出装方案放在一起查。选人时先看胜率，对局里按优先级拿强化，进商店照着出装走。</p>
          <div class="hero-actions">
            <a class="btn btn-gold" href="#/champions">${icon('grid')}查看英雄梯度</a>
            <a class="btn btn-ghost" href="#/augments">${icon('hex')}打开海克斯图鉴</a>
          </div>
          <div class="hero-stats">
            <div class="stat"><b>${D.meta.championCount}</b><span>收录英雄</span></div>
            <div class="stat"><b>${D.meta.augmentCount}</b><span>海克斯强化</span></div>
            <div class="stat"><b>${D.meta.buildCount}</b><span>出装方案</span></div>
            <div class="stat"><b>${D.meta.patch}</b><span>数据版本</span></div>
          </div>
        </div>
        <div class="hero-preview">${previewCard(ahri)}</div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <div class="section-head">
          <div>
            <div class="eyebrow">TIER LIST</div>
            <h2 class="section-title">当前版本梯度</h2>
            <p class="section-sub">排在 T1 的六位英雄，点开就能看适配海克斯与出装。</p>
          </div>
          <a class="link-more" href="#/champions">完整梯度榜 ${icon('arrow')}</a>
        </div>
        <div class="champ-grid t1-grid">${t1.map((c, i) => champCard(c, { i })).join('')}</div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <div class="section-head">
          <div>
            <div class="eyebrow">AUGMENTS</div>
            <h2 class="section-title">海克斯强度速览</h2>
            <p class="section-sub">棱彩、黄金、白银三个档位，按稀有度排序，点卡片看详细效果。</p>
          </div>
          <a class="link-more" href="#/augments">全部 ${D.meta.augmentCount} 个海克斯 ${icon('arrow')}</a>
        </div>
        <div class="aug-grid">${augTop.map((a, i) => augmentCard(a, { i })).join('')}</div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <div class="section-head">
          <div>
            <div class="eyebrow">BUILDS</div>
            <h2 class="section-title">出装方案</h2>
            <p class="section-sub">每个英雄至少两套路线，标注核心三件与技能加点。</p>
          </div>
          <a class="link-more" href="#/builds">全部 ${D.meta.buildCount} 套出装 ${icon('arrow')}</a>
        </div>
        <div class="build-grid">${picks.map(({ c, b }, i) => buildCard(b, c, { i })).join('')}</div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <div class="split-band reveal">
          <div>
            <div class="eyebrow">DESKTOP OVERLAY</div>
            <h3>开局不用切屏，推荐浮在角落</h3>
            <p>Windows 悬浮窗通过 Riot 官方本地对局接口识别你选的英雄，把海克斯优先级和出装留在屏幕边缘。只读接口，不碰游戏内存。</p>
            <div class="split-actions">
              <a class="btn btn-gold" href="#/overlay">${icon('screen')}查看悬浮窗</a>
              <a class="btn btn-plain" href="#/overlay">快捷键说明</a>
            </div>
            <div class="mini-facts">
              <span>${icon('check')}透明置顶</span>
              <span>${icon('check')}点击穿透</span>
              <span>${icon('check')}离线演示</span>
            </div>
          </div>
          <div class="band-visual"><div class="mini-window">${overlayMock(ahri)}</div></div>
        </div>
      </div>
    </section>`;
  }

  /* ---------- champions list ---------- */
  const champState = { q: '', role: 'all', tier: 'all', sort: 'tier' };
  const ROLES = ['法师', '射手', '刺客', '战士', '坦克', '辅助'];

  function championList() {
    const q = champState.q.trim().toLowerCase();
    let list = D.champions.filter((c) => {
      if (champState.tier !== 'all' && c.tier !== champState.tier) return false;
      if (champState.role !== 'all' && !c.roles.includes(champState.role)) return false;
      if (!q) return true;
      return [c.name, c.title, c.archetypeName, ...c.roles, c.blurb].join(' ').toLowerCase().includes(q);
    });
    const sorters = {
      tier: (a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || b.winRate - a.winRate,
      win: (a, b) => b.winRate - a.winRate,
      pick: (a, b) => b.pickRate - a.pickRate,
      name: (a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'),
    };
    return list.sort(sorters[champState.sort] || sorters.tier);
  }

  function renderChampGrid() {
    const wrap = $('#champ-grid-wrap');
    if (!wrap) return;
    const list = championList();
    const count = $('#champ-count');
    if (count) count.innerHTML = `共 <b>${list.length}</b> 位`;
    $$('.chip[data-tier]').forEach((el) => el.classList.toggle('active', el.dataset.tier === champState.tier));
    $$('.chip[data-role]').forEach((el) => el.classList.toggle('active', el.dataset.role === champState.role));
    wrap.innerHTML = list.length
      ? `<div class="champ-grid cols-4">${list.map((c, i) => champCard(c, { i })).join('')}</div>`
      : `<div class="empty"><b>没有匹配的英雄</b>换个关键词，或清空位置与梯度筛选。</div>`;
    initReveal();
  }

  function viewChampions() {
    const avg = (D.champions.reduce((s, c) => s + c.winRate, 0) / D.champions.length).toFixed(1);
    const roleChips = [['all', '全部'], ...ROLES.map((r) => [r, r])]
      .map(
        ([v, label]) =>
          `<button class="chip ${champState.role === v ? 'active' : ''}" data-role="${v}" type="button">${label}</button>`,
      )
      .join('');
    const tierChips = ['all', 'T1', 'T2', 'T3', 'T4', 'T5']
      .map(
        (t) =>
          `<button class="chip ${champState.tier === t ? 'active' : ''}" data-tier="${t}" type="button">${t === 'all' ? '全部梯度' : t}</button>`,
      )
      .join('');

    return `<div class="wrap">
      <div class="page-head">
        <div class="page-eyebrow">CHAMPION TIER</div>
        <h1 class="page-title">英雄梯度</h1>
        <p class="page-desc">按海斗模式强度分成 T1-T5 五档，结合胜率与选取率。点任意英雄查看适配海克斯、出装和玩法要点。</p>
        <div class="stat-strip">
          <div class="stat"><b>${D.champions.filter((c) => c.tier === 'T1').length}</b><span>T1 英雄</span></div>
          <div class="stat"><b>${avg}%</b><span>平均胜率</span></div>
          <div class="stat"><b>${D.meta.championCount}</b><span>收录英雄</span></div>
          <div class="stat"><b>${D.meta.patch}</b><span>数据版本</span></div>
        </div>
      </div>
      <div class="filters">
        <label class="field">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
          <input class="input" id="champ-q" type="search" placeholder="搜索英雄名 / 称号" value="${esc(champState.q)}" autocomplete="off">
        </label>
        <div class="chips">${roleChips}</div>
        <span class="filter-sep"></span>
        <div class="chips">${tierChips}</div>
        <select class="select" id="champ-sort" aria-label="排序">
          <option value="tier"${champState.sort === 'tier' ? ' selected' : ''}>默认：梯度</option>
          <option value="win"${champState.sort === 'win' ? ' selected' : ''}>胜率优先</option>
          <option value="pick"${champState.sort === 'pick' ? ' selected' : ''}>选取率优先</option>
          <option value="name"${champState.sort === 'name' ? ' selected' : ''}>按名称</option>
        </select>
        <span class="result-count" id="champ-count">共 <b>${D.champions.length}</b> 位</span>
      </div>
      <div id="champ-grid-wrap"></div>
    </div>`;
  }

  /* ---------- champion detail ---------- */
  function viewChampion(id) {
    const c = champById.get(id);
    if (!c) return viewNotFound('没有找到这位英雄');
    const builds = c.builds;
    const recs = c.augments.map((r) => ({ ...r, a: augOf(r.id) }));
    const related = D.champions
      .filter((x) => x.tier === c.tier && x.id !== c.id)
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 5);

    const recRows = recs
      .map(
        (r) => `<div class="rec-row">
      <span class="grade-box g-${r.grade}">${r.grade}</span>
      <div class="rec-main">
        <div class="rec-name">${esc(r.a.name)}<span class="rec-rarity r-${r.a.rarity}">${r.a.rarityName}</span><span class="rec-rarity">${r.a.category}</span></div>
        <div class="rec-note">${esc(r.note)}</div>
      </div>
      <div class="rec-right"><b>${fmt(r.pickRate)}%</b><span>选取</span><div class="bar"><i style="--p:${clamp(r.pickRate * 2.1, 6, 100)}%"></i></div></div>
    </div>`,
      )
      .join('');

    const tips = c.tips.map((t) => `<li>${esc(t)}</li>`).join('');
    const relatedRows = related
      .map(
        (x) => `<a class="related-row" href="#/champion/${x.id}">
      <img src="${champIcon(x)}" alt="${esc(x.name)}" loading="lazy">
      <div><div class="rn">${esc(x.name)}</div><div class="rt">${esc(x.title)}</div></div>
      <span class="tier-text ${tierCls(x.tier)}">${x.tier}</span>
    </a>`,
      )
      .join('');

    return `<div class="wrap">
      <div class="crumbs"><a href="#/champions">英雄梯度</a>${icon('chev')}<span>${esc(c.name)}</span></div>
      <section class="detail-hero">
        <div class="splash" style="background-image:url('${c.splash}')"></div>
        <div class="detail-body">
          <div class="detail-main">
            <div class="detail-tags">
              <span class="tag gold">${c.tier}</span>
              ${[...new Set(c.roles)].map((r) => `<span class="tag">${esc(r)}</span>`).join('')}
              <span class="tag">演示数据</span>
            </div>
            <h1 class="detail-name">${esc(c.name)}<small>${esc(c.title)}</small></h1>
            <p class="detail-blurb">${esc(c.blurb)}</p>
            <div class="detail-stats">
              <div class="stat"><b class="${c.winRate >= 52 ? 'up' : c.winRate < 50 ? 'low' : ''}">${fmt(c.winRate)}%</b><span>海斗胜率</span></div>
              <div class="stat"><b>${fmt(c.pickRate)}%</b><span>选取率</span></div>
              <div class="stat"><b>${builds.length}</b><span>出装方案</span></div>
              <div class="stat"><b>${recs.filter((r) => r.grade === 'S').length}</b><span>S 级海克斯</span></div>
            </div>
            <div class="hero-actions" style="margin-top:20px">
              <a class="btn btn-ghost btn-sm" href="#/overlay/${c.id}">${icon('screen')}在悬浮窗中预览</a>
            </div>
          </div>
          <div class="detail-side-stat"><div class="tier-big">${c.tier}</div><span>当前梯度</span></div>
        </div>
      </section>

      <div class="detail-grid">
        <div>
          <section class="panel">
            <div class="panel-head">
              <h2 class="panel-title">推荐海克斯</h2>
              <span class="panel-sub">按适配度排序 · S 为最优先</span>
            </div>
            <div class="rec-list">${recRows}</div>
          </section>
          <section class="panel">
            <div class="panel-head">
              <h3 class="panel-title">出装方案</h3>
              <span class="panel-sub">${builds.length} 套 · 点装备看名称</span>
            </div>
            <div class="build-grid single">${builds.map((b, i) => buildCard(b, c, { i })).join('')}</div>
          </section>
        </div>
        <aside>
          <section class="panel">
            <h3 class="panel-title">英雄信息</h3>
            <div class="info-list">
              <div class="info-row"><span>定位</span><b>${esc(c.archetypeName)}</b></div>
              <div class="info-row"><span>梯度</span><b class="tier-text ${tierCls(c.tier)}">${c.tier}</b></div>
              <div class="info-row"><span>海斗胜率</span><b>${fmt(c.winRate)}%</b></div>
              <div class="info-row"><span>选取率</span><b>${fmt(c.pickRate)}%</b></div>
              <div class="info-row"><span>数据版本</span><b>${D.meta.patch}</b></div>
              <div class="info-row"><span>更新日期</span><b>${D.meta.updated}</b></div>
            </div>
          </section>
          <section class="panel">
            <h3 class="panel-title">玩法要点</h3>
            <ol class="tips">${tips}</ol>
          </section>
          <section class="panel">
            <h3 class="panel-title">同梯度英雄</h3>
            <div class="related">${relatedRows}</div>
          </section>
        </aside>
      </div>
    </div>`;
  }

  /* ---------- augments list ---------- */
  const augState = { q: '', rarity: 'all', sort: 'rarity' };

  function augmentList() {
    const q = augState.q.trim().toLowerCase();
    const list = D.augments.filter((a) => {
      if (augState.rarity !== 'all' && a.rarity !== augState.rarity) return false;
      if (!q) return true;
      return [a.name, a.desc, a.category || '', a.rarityName, ...(a.arch || [])].join(' ').toLowerCase().includes(q);
    });
    if (augState.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
    else list.sort(byRarity);
    return list;
  }

  function renderAugGrid() {
    const wrap = $('#aug-grid-wrap');
    if (!wrap) return;
    const list = augmentList();
    const count = $('#aug-count');
    if (count) count.innerHTML = `共 <b>${list.length}</b> 个`;
    $$('.chip[data-rarity]').forEach((el) => el.classList.toggle('active', el.dataset.rarity === augState.rarity));
    wrap.innerHTML = list.length
      ? `<div class="aug-grid">${list.map((a, i) => augmentCard(a, { i })).join('')}</div>`
      : `<div class="empty"><b>没有匹配的海克斯</b>换个关键词，或切换稀有度与类型。</div>`;
    initReveal();
  }

  function viewAugments() {
    const countOf = (r) => D.augments.filter((a) => a.rarity === r).length;
    const counts = {
      prismatic: countOf('prismatic'),
      gold: countOf('gold'),
      silver: countOf('silver'),
      event: countOf('event'),
    };
    const rarities = [
      ['all', '全部'],
      ['prismatic', '棱彩'],
      ['gold', '黄金'],
      ['silver', '白银'],
    ]
      .concat(counts.event ? [['event', '事件']] : [])
      .map(
        ([v, l]) =>
          `<button class="chip ${augState.rarity === v ? 'active' : ''}" data-rarity="${v}" type="button">${l}</button>`,
      )
      .join('');
    const withDesc = D.augments.filter((a) => a.desc).length;

    return `<div class="wrap">
      <div class="page-head">
        <div class="page-eyebrow">AUGMENT LIBRARY</div>
        <h1 class="page-title">海克斯图鉴</h1>
        <p class="page-desc">名称、稀有度、图标和效果说明来自官方客户端资源，跑 <code>npm run update-augments</code> 就能跟随版本更新。${withDesc} / ${D.augments.length} 个强化有官方文字说明，其余官方未公开。</p>
        <div class="stat-strip">
          <div class="stat"><b>${counts.prismatic}</b><span>棱彩</span></div>
          <div class="stat"><b>${counts.gold}</b><span>黄金</span></div>
          <div class="stat"><b>${counts.silver}</b><span>白银</span></div>
          <div class="stat"><b>${D.meta.augmentCount}</b><span>收录总数</span></div>
        </div>
      </div>
      <div class="filters">
        <label class="field">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
          <input class="input" id="aug-q" type="search" placeholder="搜索海克斯名称 / 效果" value="${esc(augState.q)}" autocomplete="off">
        </label>
        <div class="chips">${rarities}</div>
        <span class="filter-sep"></span>
        <select class="select" id="aug-sort" aria-label="排序">
          <option value="rarity"${augState.sort === 'rarity' ? ' selected' : ''}>按稀有度</option>
          <option value="name"${augState.sort === 'name' ? ' selected' : ''}>按名称</option>
        </select>
        <span class="result-count" id="aug-count">共 <b>${D.augments.length}</b> 个</span>
      </div>
      <div id="aug-grid-wrap"></div>
    </div>`;
  }

  /* ---------- builds list ---------- */
  const buildState = { q: '', champ: 'all', sort: 'win' };

  function allBuilds() {
    return D.champions.flatMap((c) => c.builds.map((b) => ({ b, c })));
  }

  function buildList() {
    const q = buildState.q.trim().toLowerCase();
    let list = allBuilds().filter(({ b, c }) => {
      if (buildState.champ !== 'all' && c.id !== buildState.champ) return false;
      if (!q) return true;
      return [b.name, b.style, b.note, c.name, c.title, ...b.items.map(itemName)].join(' ').toLowerCase().includes(q);
    });
    if (buildState.sort === 'pick') list.sort((a, b) => b.b.pickRate - a.b.pickRate);
    else if (buildState.sort === 'name') list.sort((a, b) => a.b.name.localeCompare(b.b.name, 'zh-Hans-CN'));
    else list.sort((a, b) => b.b.winRate - a.b.winRate);
    return list;
  }

  function renderBuildGrid() {
    const wrap = $('#build-grid-wrap');
    if (!wrap) return;
    const list = buildList();
    const count = $('#build-count');
    if (count) count.innerHTML = `共 <b>${list.length}</b> 套`;
    wrap.innerHTML = list.length
      ? `<div class="build-grid">${list.map(({ b, c }, i) => buildCard(b, c, { i })).join('')}</div>`
      : `<div class="empty"><b>没有匹配的出装</b>换个关键词或英雄。</div>`;
    initReveal();
  }

  function viewBuilds() {
    const champs = D.champions.filter((c) => c.builds.length);
    const options = ['<option value="all">全部英雄</option>']
      .concat(
        champs.map(
          (c) => `<option value="${c.id}"${buildState.champ === c.id ? ' selected' : ''}>${esc(c.name)}</option>`,
        ),
      )
      .join('');

    return `<div class="wrap">
      <div class="page-head">
        <div class="page-eyebrow">ITEM BUILDS</div>
        <h1 class="page-title">出装方案</h1>
        <p class="page-desc">按英雄整理的完整出装路线：核心三件、后续补强、出门装与技能加点。前 3 件带金点标记。</p>
        <div class="stat-strip">
          <div class="stat"><b>${D.meta.buildCount}</b><span>方案总数</span></div>
          <div class="stat"><b>${champs.length}</b><span>覆盖英雄</span></div>
          <div class="stat"><b>${D.meta.patch}</b><span>数据版本</span></div>
        </div>
      </div>
      <div class="filters">
        <label class="field">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
          <input class="input" id="build-q" type="search" placeholder="搜索英雄 / 装备 / 路线" value="${esc(buildState.q)}" autocomplete="off">
        </label>
        <select class="select" id="build-champ" aria-label="按英雄筛选">${options}</select>
        <select class="select" id="build-sort" aria-label="排序">
          <option value="win"${buildState.sort === 'win' ? ' selected' : ''}>胜率优先</option>
          <option value="pick"${buildState.sort === 'pick' ? ' selected' : ''}>选取率优先</option>
          <option value="name"${buildState.sort === 'name' ? ' selected' : ''}>按路线名</option>
        </select>
        <span class="result-count" id="build-count">共 <b>${D.meta.buildCount}</b> 套</span>
      </div>
      <div id="build-grid-wrap"></div>
    </div>`;
  }

  /* ---------- overlay page ---------- */
  function viewOverlay(id) {
    const c = champById.get(id) || champById.get('Ahri') || D.champions[0];
    const demos = ['Ahri', 'Jinx', 'Sion', 'Yasuo'].map((cid) => champById.get(cid)).filter(Boolean);
    const demoChips = demos
      .map((x) => `<a class="chip ${x.id === c.id ? 'active' : ''}" href="#/overlay/${x.id}">${esc(x.name)}</a>`)
      .join('');

    return `<div class="wrap">
      <section class="overlay-hero">
        <div>
          <div class="eyebrow">DESKTOP · WINDOWS 10 / 11</div>
          <h1>把推荐留在<br><span class="gold">游戏画面边缘</span></h1>
          <p>悬浮窗读取 Riot 官方本地对局接口，自动识别你选的英雄，实时展示该英雄的海克斯优先级与出装。透明置顶、不挡视野，需要时一键穿透点击。</p>
          <div class="hero-actions">
            <button class="btn btn-gold" type="button" data-scroll="start">${icon('bolt')}如何启动</button>
            <a class="btn btn-ghost" href="#/champions">先看英雄梯度</a>
          </div>
          <div class="mini-facts">
            <span>${icon('check')}只读本地接口</span>
            <span>${icon('check')}不读内存、不注入</span>
            <span>${icon('check')}离线可用演示数据</span>
          </div>
        </div>
        <div class="mock-wrap" style="flex-direction:column">${overlayMock(c)}<div class="mock-note">${icon('eye')} 网页内为静态预览，实际窗口可拖动、穿透与隐藏</div></div>
      </section>

      <div class="feature-grid">
        <div class="feature reveal"><div class="fi">${icon('screen')}</div><h4>透明置顶</h4><p>360-420px 窄窗，贴在屏幕任意角落，不遮挡对局信息，可锁定位置。</p></div>
        <div class="feature reveal"><div class="fi">${icon('bolt')}</div><h4>自动识别英雄</h4><p>轮询本地对局接口，选人完成后自动切换英雄数据；没有对局时进入演示模式。</p></div>
        <div class="feature reveal"><div class="fi">${icon('shield')}</div><h4>只读、不注入</h4><p>仅请求 127.0.0.1 上的官方 Live Client 数据，不读写游戏内存，不改按键。</p></div>
      </div>

      <div class="split">
        <div>
          <section class="panel">
            <div class="panel-head"><h3 class="panel-title">默认快捷键</h3><span class="panel-sub">全局生效</span></div>
            <div class="hotkeys">
              <div class="hotkey-row"><b>显示 / 隐藏悬浮窗</b><span class="keycaps"><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>H</kbd></span></div>
              <div class="hotkey-row"><b>切换点击穿透</b><span class="keycaps"><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>L</kbd></span></div>
              <div class="hotkey-row"><b>重置窗口位置</b><span class="keycaps"><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>R</kbd></span></div>
              <div class="hotkey-row"><b>打开主窗口</b><span class="keycaps"><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>O</kbd></span></div>
            </div>
          </section>
          <section class="panel" id="start">
            <div class="panel-head"><h3 class="panel-title">启动步骤</h3><span class="panel-sub">首次使用</span></div>
            <div class="steps">
              <div class="step"><span>运行安装包 <b>HaidouLite-Setup</b>（或免安装版），启动后先打开主窗口，就是现在这个速查界面。</span></div>
              <div class="step"><span>悬浮窗默认隐藏。按 <b>Ctrl+Shift+H</b> 或点右下角托盘图标里的「显示悬浮窗」把它叫出来。</span></div>
              <div class="step"><span>进入对局后悬浮窗会自动出现并识别英雄；未检测到对局时，显示演示英雄 <b>${esc(c.name)}</b>。</span></div>
              <div class="step"><span>拖动顶部标题栏移动窗口，按 <b>Ctrl+Shift+L</b> 切换鼠标穿透，<b>Ctrl+Shift+R</b> 回到默认位置。</span></div>
            </div>
            <div class="notice">${icon('info')}<span>源码运行请先执行 <b>npm install</b>，再双击 <b>启动悬浮窗.bat</b>；安装包用户无需安装任何依赖。</span></div>
          </section>
        </div>
        <aside>
          <section class="panel">
            <h3 class="panel-title">演示英雄</h3>
            <p class="panel-sub" style="margin:8px 0 12px">点一个英雄，右侧预览会切换成对应数据。</p>
            <div class="chips">${demoChips}</div>
          </section>
          <section class="panel">
            <h3 class="panel-title">识别逻辑</h3>
            <div class="info-list">
              <div class="info-row"><span>接口</span><b>Live Client Data</b></div>
              <div class="info-row"><span>地址</span><b>127.0.0.1:2999</b></div>
              <div class="info-row"><span>轮询间隔</span><b>5 秒</b></div>
              <div class="info-row"><span>游戏模式</span><b>${esc(D.meta.mode)}</b></div>
              <div class="info-row"><span>数据版本</span><b>${D.meta.patch}</b></div>
            </div>
            <div class="notice">${icon('info')}<span>对局接口不存在时会静默重试，不影响游戏；数据均来自本地，不需要联网。</span></div>
          </section>
        </aside>
      </div>
    </div>`;
  }

  function viewNotFound(msg) {
    return `<div class="wrap"><div class="page-head"><div class="page-eyebrow">404</div><h1 class="page-title">${esc(msg || '页面不存在')}</h1><p class="page-desc">链接可能已失效，或者这个英雄还没被收录。</p><div class="hero-actions"><a class="btn btn-gold" href="#/champions">返回英雄梯度</a><a class="btn btn-plain" href="#/">回到首页</a></div></div></div>`;
  }

  /* ---------- search ---------- */
  const searchOverlay = $('#search-overlay');
  const searchInput = $('#search-input');
  const searchResults = $('#search-results');
  let searchActive = 0;

  function searchData(q) {
    const s = q.trim().toLowerCase();
    const champs = (
      s
        ? D.champions.filter((c) =>
            [c.name, c.title, c.archetypeName, ...c.roles, c.blurb].join(' ').toLowerCase().includes(s),
          )
        : D.champions.slice(0, 5)
    ).slice(0, 6);
    const augs = (
      s
        ? D.augments.filter((a) => [a.name, a.desc, a.category || '', a.rarityName].join(' ').toLowerCase().includes(s))
        : [...D.augments].sort(byRarity)
    ).slice(0, 6);
    const builds = (
      s
        ? allBuilds().filter(({ b, c }) =>
            [b.name, b.style, c.name, ...b.items.map(itemName)].join(' ').toLowerCase().includes(s),
          )
        : []
    ).slice(0, 4);
    return { champs, augs, builds };
  }

  function searchItemHtml(kind, obj) {
    if (kind === 'champ') {
      return `<div class="search-item" data-kind="champ" data-id="${obj.id}">
        <img src="${champIcon(obj)}" alt="" loading="lazy">
        <div><div class="si-name">${esc(obj.name)}</div><div class="si-sub">${obj.tier} · ${esc(obj.archetypeName)} · ${fmt(obj.winRate)}%</div></div>
        <span class="si-right">${icon('arrow')}</span>
      </div>`;
    }
    if (kind === 'aug') {
      return `<div class="search-item" data-kind="aug" data-id="${obj.id}">
        <span class="si-glyph ${obj.rarity}" aria-hidden="true">${esc(obj.name.slice(0, 1))}</span>
        <div><div class="si-name">${esc(obj.name)}</div><div class="si-sub">${[obj.rarityName, obj.category].filter(Boolean).join(' · ')}${Number.isFinite(obj.pickRate) ? ` · 选取 ${fmt(obj.pickRate)}%` : ''}</div></div>
        <span class="si-right">${Number.isFinite(obj.power) ? gradeFromPower(obj.power) : ''}</span>
      </div>`;
    }
    const c = obj.c;
    return `<div class="search-item" data-kind="build" data-id="${obj.b.id}" data-champ="${c.id}">
      <img src="${champIcon(c)}" alt="" loading="lazy">
      <div><div class="si-name">${esc(c.name)} · ${esc(obj.b.name)}</div><div class="si-sub">${esc(obj.b.items.slice(0, 3).map(itemName).join(' / '))}</div></div>
      <span class="si-right">${icon('arrow')}</span>
    </div>`;
  }

  function renderSearchResults(q) {
    const { champs, augs, builds } = searchData(q);
    let html = '';
    if (champs.length)
      html += `<div class="search-group-title">英雄</div>${champs.map((c) => searchItemHtml('champ', c)).join('')}`;
    if (augs.length)
      html += `<div class="search-group-title">海克斯</div>${augs.map((a) => searchItemHtml('aug', a)).join('')}`;
    if (builds.length)
      html += `<div class="search-group-title">出装</div>${builds.map((b) => searchItemHtml('build', b)).join('')}`;
    if (!html) html = `<div class="search-empty">没有找到「${esc(q)}」相关内容<br>试试英雄名、海克斯名或装备名</div>`;
    searchResults.innerHTML = html;
    searchActive = 0;
    const items = $$('.search-item', searchResults);
    if (items[0]) items[0].classList.add('active');
  }

  function moveSearch(dir) {
    const items = $$('.search-item', searchResults);
    if (!items.length) return;
    items[searchActive]?.classList.remove('active');
    searchActive = (searchActive + dir + items.length) % items.length;
    items[searchActive].classList.add('active');
    items[searchActive].scrollIntoView({ block: 'nearest' });
  }

  function openSearch() {
    searchOverlay.hidden = false;
    searchInput.value = '';
    renderSearchResults('');
    setTimeout(() => searchInput.focus(), 20);
    document.body.style.overflow = 'hidden';
  }

  function closeSearch() {
    if (!searchOverlay || searchOverlay.hidden) return;
    searchOverlay.hidden = true;
    document.body.style.overflow = '';
  }

  function activateSearchItem(el) {
    if (!el) return;
    closeSearch();
    const { kind, id, champ } = el.dataset;
    if (kind === 'champ') location.hash = `#/champion/${id}`;
    else if (kind === 'aug') openAugment(id);
    else if (kind === 'build') location.hash = `#/champion/${champ}`;
  }

  /* ---------- augment modal ---------- */
  const modalOverlay = $('#modal-overlay');
  const modalCard = $('#modal-card');

  function openAugment(id) {
    // 图鉴里的 id 和推荐池里的 id 是两套，这里两边都查
    const a = augById.get(id) || augPoolById.get(id);
    if (!a || !modalOverlay) return;
    const users = D.champions
      .map((c) => ({ c, rec: c.augments.find((r) => r.id === id) }))
      .filter((x) => x.rec)
      .sort((x, y) => 'SABC'.indexOf(x.rec.grade) - 'SABC'.indexOf(y.rec.grade));
    const champPills = users
      .slice(0, 12)
      .map(
        ({ c }) =>
          `<a class="modal-champ" href="#/champion/${c.id}"><img src="${champIcon(c)}" alt="">${esc(c.name)}</a>`,
      )
      .join('');
    // 官方强化没有强度评分和胜率，缺什么就不显示什么
    const hasStats = Number.isFinite(a.power) && Number.isFinite(a.pickRate) && Number.isFinite(a.winRate);
    const ARCH_LABEL = {
      mage: '法师',
      marksman: '射手',
      assassin: '刺客',
      fighter: '战士',
      tank: '坦克',
      support: '辅助',
    };
    const archText = (a.arch || []).map((x) => ARCH_LABEL[x] || x).join(' / ');
    const iconHtml = a.icon
      ? `<img class="aug-img" src="${a.icon}" alt="">`
      : `<b style="font-size:18px">${esc(a.name.slice(0, 1))}</b>`;
    const infoRows = [
      `<div class="info-row"><span>稀有度</span><b>${esc(a.rarityName)}</b></div>`,
      hasStats
        ? `<div class="info-row"><span>综合强度</span><b class="gold">${gradeFromPower(a.power)} 级</b></div>`
        : '',
      hasStats ? `<div class="info-row"><span>选取率</span><b>${fmt(a.pickRate)}%</b></div>` : '',
      hasStats ? `<div class="info-row"><span>胜率</span><b>${fmt(a.winRate)}%</b></div>` : '',
      archText ? `<div class="info-row"><span>适配定位</span><b>${archText}</b></div>` : '',
    ].join('');

    modalCard.innerHTML = `
      <div class="modal-head">
        <div class="aug-icon" style="width:50px;height:50px">${iconHtml}</div>
        <div>
          <div class="aug-rarity">${esc([a.rarityName, a.category].filter(Boolean).join(' · '))}</div>
          <h3 class="modal-title">${esc(a.name)}</h3>
        </div>
        <button class="modal-close" type="button" data-close-modal aria-label="关闭">${icon('close')}</button>
      </div>
      <p class="modal-desc${a.desc ? '' : ' muted'}">${esc(a.desc || '官方暂未提供文字说明。')}</p>
      <div class="info-list">${infoRows}</div>
      ${
        users.length
          ? `<div class="modal-section">
        <h5>推荐该强化的英雄（${users.length}）</h5>
        <div class="modal-champs">${champPills}</div>
      </div>`
          : ''
      }`;
    modalOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
    modalCard.scrollTop = 0;
  }

  function closeModal() {
    if (!modalOverlay || modalOverlay.hidden) return;
    modalOverlay.hidden = true;
    if (searchOverlay.hidden) document.body.style.overflow = '';
  }

  /* ---------- router ---------- */
  function parseRoute() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [pathPart] = raw.split('?');
    const parts = pathPart.split('/').filter(Boolean);
    return { name: parts[0] || 'home', param: parts[1] ? decodeURIComponent(parts[1]) : null };
  }

  function updateNav(name) {
    const map = {
      home: 'home',
      champions: 'champions',
      champion: 'champions',
      augments: 'augments',
      builds: 'builds',
      overlay: 'overlay',
    };
    $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === map[name]));
  }

  function router() {
    const { name, param } = parseRoute();
    let html = '';
    let title = '海斗速查';

    switch (name) {
      case 'home':
        html = viewHome();
        title = '海斗速查 · 海克斯大乱斗数据工具';
        break;
      case 'champions':
        html = viewChampions();
        title = '英雄梯度 · 海斗速查';
        break;
      case 'champion': {
        const c = champById.get(param);
        html = viewChampion(param);
        title = c ? `${c.name} · 海斗速查` : '未找到英雄 · 海斗速查';
        break;
      }
      case 'augments':
        html = viewAugments();
        title = '海克斯图鉴 · 海斗速查';
        break;
      case 'builds':
        html = viewBuilds();
        title = '出装方案 · 海斗速查';
        break;
      case 'overlay':
        html = viewOverlay(param);
        title = '桌面悬浮窗 · 海斗速查';
        break;
      default:
        html = viewNotFound('页面不存在');
        title = '页面不存在 · 海斗速查';
    }

    app.innerHTML = html;
    document.title = title;
    updateNav(name);
    closeSearch();
    closeModal();
    window.scrollTo(0, 0);
    initReveal();

    if (name === 'champions') renderChampGrid();
    if (name === 'augments') renderAugGrid();
    if (name === 'builds') renderBuildGrid();
  }

  /* ---------- reveal ---------- */
  let io;
  function initReveal() {
    const els = $$('.reveal:not(.in)');
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    if (io) io.disconnect();
    io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('in');
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.06, rootMargin: '0px 0px -30px' },
    );
    els.forEach((el) => io.observe(el));
  }

  /* ---------- events ---------- */
  document.addEventListener('click', (e) => {
    const openBtn = e.target.closest('[data-open-search]');
    if (openBtn) {
      e.preventDefault();
      openSearch();
      return;
    }

    if (e.target.classList.contains('search-overlay')) {
      closeSearch();
      return;
    }

    const searchItem = e.target.closest('.search-item');
    if (searchItem) {
      activateSearchItem(searchItem);
      return;
    }

    const augEl = e.target.closest('[data-augment]');
    if (augEl) {
      openAugment(augEl.dataset.augment);
      return;
    }

    const tierChip = e.target.closest('.chip[data-tier]');
    if (tierChip) {
      champState.tier = tierChip.dataset.tier;
      renderChampGrid();
      return;
    }
    const roleChip = e.target.closest('.chip[data-role]');
    if (roleChip) {
      champState.role = roleChip.dataset.role;
      renderChampGrid();
      return;
    }
    const rarityChip = e.target.closest('.chip[data-rarity]');
    if (rarityChip) {
      augState.rarity = rarityChip.dataset.rarity;
      renderAugGrid();
      return;
    }
    const catChip = e.target.closest('.chip[data-cat]');
    if (catChip) {
      augState.cat = catChip.dataset.cat;
      renderAugGrid();
      return;
    }

    const closeBtn = e.target.closest('[data-close-modal]');
    if (closeBtn) {
      closeModal();
      return;
    }
    if (e.target.id === 'modal-overlay') {
      closeModal();
      return;
    }

    const scrollBtn = e.target.closest('[data-scroll]');
    if (scrollBtn) {
      const target = document.getElementById(scrollBtn.dataset.scroll);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
  });

  document.addEventListener('input', (e) => {
    const id = e.target.id;
    if (id === 'champ-q') {
      champState.q = e.target.value;
      renderChampGrid();
    } else if (id === 'aug-q') {
      augState.q = e.target.value;
      renderAugGrid();
    } else if (id === 'build-q') {
      buildState.q = e.target.value;
      renderBuildGrid();
    } else if (id === 'search-input') {
      renderSearchResults(e.target.value);
    }
  });

  document.addEventListener('change', (e) => {
    const id = e.target.id;
    if (id === 'champ-sort') {
      champState.sort = e.target.value;
      renderChampGrid();
    } else if (id === 'aug-sort') {
      augState.sort = e.target.value;
      renderAugGrid();
    } else if (id === 'build-champ') {
      buildState.champ = e.target.value;
      renderBuildGrid();
    } else if (id === 'build-sort') {
      buildState.sort = e.target.value;
      renderBuildGrid();
    }
  });

  document.addEventListener('keydown', (e) => {
    const isSearchOpen = searchOverlay && !searchOverlay.hidden;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      isSearchOpen ? closeSearch() : openSearch();
      return;
    }

    if (isSearchOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSearch();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveSearch(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveSearch(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        activateSearchItem($('.search-item.active', searchResults));
      }
      return;
    }

    if (e.key === 'Escape' && modalOverlay && !modalOverlay.hidden) {
      closeModal();
      return;
    }

    if (
      (e.key === 'Enter' || e.key === ' ') &&
      document.activeElement &&
      document.activeElement.dataset &&
      document.activeElement.dataset.augment
    ) {
      e.preventDefault();
      openAugment(document.activeElement.dataset.augment);
    }
  });

  window.addEventListener('hashchange', router);

  /* ---------- boot ---------- */
  const patchEls = $$('.version-pill span, #foot-patch');
  patchEls.forEach((el) => {
    el.textContent = D.meta.patch;
  });
  $$('.version-pill').forEach((el) => {
    el.title = `数据版本 ${D.meta.patch} · 更新于 ${D.meta.updated}`;
  });

  router();
})();
