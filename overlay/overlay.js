(function () {
  var D = window.HAIDOU_DATA;
  if (!D) return;

  var $ = function (id) {
    return document.getElementById(id);
  };
  var els = {
    dot: $('dot'),
    status: $('status-text'),
    clock: $('clock'),
    splash: $('splash'),
    avatar: $('avatar'),
    name: $('champ-name'),
    tier: $('champ-tier'),
    arch: $('champ-arch'),
    title: $('champ-title'),
    wr: $('champ-wr'),
    notice: $('notice'),
    recs: $('recs'),
    buildName: $('build-name'),
    skill: $('skill-order'),
    items: $('items'),
    itemNames: $('item-names'),
    select: $('demo-select'),
    demoLabel: $('demo-label'),
    patch: $('foot-patch'),
    ver: $('ver'),
    pin: $('btn-pin'),
    web: $('btn-web'),
    hide: $('btn-hide'),
    close: $('btn-close'),
  };

  // 图片加载失败时隐藏。原先靠内联 onerror 实现，而内联事件处理器会让 CSP
  // 不得不放开 script-src 'unsafe-inline'；这里改成捕获阶段的全局监听。
  document.addEventListener(
    'error',
    function (e) {
      if (e.target && e.target.tagName === 'IMG') e.target.style.opacity = 0;
    },
    true,
  );

  var augMap = {};
  // 英雄推荐里的强化来自手写推荐池，不是图鉴里的官方数据
  (D.augmentPool || D.augments).forEach(function (a) {
    augMap[a.id] = a;
  });

  var champById = {};
  var champByKey = {};
  D.champions.forEach(function (c) {
    champById[c.id] = c;
    var byId = key(c.id);
    var byName = key(c.name);
    // 必须挡掉空 key：c.name 是中文（如「阿狸」），旧的 key() 只保留 a-z0-9，
    // 会把 42 位英雄全部压成 ''，互相覆盖后只剩最后一位，
    // 任何非拉丁名字查不到时都会错误地返回那一位。
    if (byId) champByKey[byId] = c;
    if (byName && byName !== byId) champByKey[byName] = c;
  });

  function key(s) {
    // 保留各语言的字母与数字，中文英雄名也能命中；只去掉空格、标点和引号。
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, '');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function findChampion(name) {
    if (!name) return null;
    var k = key(name);
    return champById[name] || (k ? champByKey[k] : null) || null;
  }

  var TIER_ORDER = { T1: 1, T2: 2, T3: 3, T4: 4, T5: 5 };

  function sortedChampions() {
    return D.champions.slice().sort(function (a, b) {
      var t = (TIER_ORDER[a.tier] || 9) - (TIER_ORDER[b.tier] || 9);
      if (t) return t;
      return b.winRate - a.winRate;
    });
  }

  function readDemo() {
    var saved = null;
    try {
      saved = localStorage.getItem('haidou.demoChampion');
    } catch (e) {}
    return findChampion(saved) || D.champions[0];
  }

  function fillDemoSelect(current) {
    els.select.innerHTML = sortedChampions()
      .map(function (c) {
        return (
          '<option value="' +
          esc(c.id) +
          '"' +
          (c.id === current.id ? ' selected' : '') +
          '>' +
          esc(c.tier + ' · ' + c.name) +
          '</option>'
        );
      })
      .join('');
  }

  var MODE_NAMES = {
    ARAM: '海克斯大乱斗',
    CLASSIC: '召唤师峡谷',
    CHERRY: '斗魂竞技场',
    URF: '无限火力',
  };

  function renderChampion(c) {
    els.splash.style.backgroundImage = 'url("' + c.splash + '")';
    els.avatar.src = c.square;
    els.avatar.alt = c.name;
    els.name.textContent = c.name;
    els.tier.textContent = c.tier;
    els.tier.className = 'tier ' + c.tier.toLowerCase();
    els.arch.textContent = c.archetypeName;
    els.title.textContent = c.title;
    els.wr.textContent = fmt(c.winRate, 1) + '%';
  }

  function fmt(n, digits) {
    return Number(n).toFixed(digits == null ? 1 : digits);
  }

  function renderAugments(c) {
    var top = c.augments.slice(0, 3);
    els.recs.innerHTML = top
      .map(function (r) {
        var a = augMap[r.id] || { name: r.id, rarityName: '' };
        var width = Math.max(8, Math.min(100, Math.round((r.pickRate / 50) * 100)));
        return (
          '<div class="rec">' +
          '<span class="g ' +
          esc(r.grade) +
          '">' +
          esc(r.grade) +
          '</span>' +
          '<span class="n">' +
          esc(a.name) +
          '<span class="rar">' +
          esc(a.rarityName) +
          '</span></span>' +
          '<span class="p">' +
          fmt(r.pickRate) +
          '%</span>' +
          '<span class="bar"><i style="width:' +
          width +
          '%"></i></span>' +
          '</div>'
        );
      })
      .join('');
  }

  function renderBuild(c) {
    var b = c.builds[0];
    if (!b) return;
    els.buildName.textContent = b.name;
    els.skill.textContent = b.skillOrder;
    var core = b.coreCount || 3;
    els.items.innerHTML = b.items
      .map(function (id, i) {
        var info = D.items[id] || { name: String(id) };
        return (
          '<span class="item' +
          (i < core ? ' core' : '') +
          '" title="' +
          esc(info.name) +
          '">' +
          '<img src="' +
          D.meta.itemIcon +
          id +
          '.png" alt="' +
          esc(info.name) +
          '">' +
          '</span>'
        );
      })
      .join('');
    els.itemNames.textContent = b.items
      .slice(0, core)
      .map(function (id) {
        return (D.items[id] || {}).name || id;
      })
      .join(' · ');
  }

  var api = window.overlay;
  var demo = readDemo();
  var state = { status: 'offline', championName: null, gameMode: '', gameTime: 0 };
  var stateAt = Date.now();

  function applyState(next) {
    state = {
      status: next.status || 'offline',
      championName: next.championName || null,
      gameMode: next.gameMode || '',
      gameTime: Number(next.gameTime) || 0,
    };
    stateAt = Date.now();

    var live = findChampion(state.championName);

    els.dot.className = 'dot';
    if (state.status === 'live') {
      els.dot.classList.add(live ? 'live' : 'demo');
      els.status.textContent = '对局中 · ' + (MODE_NAMES[state.gameMode] || state.gameMode || '已连接客户端');
    } else if (state.status === 'lobby') {
      els.dot.classList.add('demo');
      els.status.textContent = '已连接客户端 · 等待进入对局';
    } else {
      els.dot.classList.add('demo');
      els.status.textContent = '演示模式 · 未检测到对局';
    }

    if (live) {
      renderChampion(live);
      renderAugments(live);
      renderBuild(live);
      els.notice.hidden = true;
      els.select.disabled = state.status === 'live';
      els.select.value = live.id;
      els.demoLabel.textContent = '当前英雄';
    } else {
      renderChampion(demo);
      renderAugments(demo);
      renderBuild(demo);
      els.select.disabled = false;
      els.select.value = demo.id;
      els.demoLabel.textContent = '演示英雄';
      if (state.status === 'live' && state.championName) {
        els.notice.innerHTML =
          '检测到 <b>' + esc(state.championName) + '</b>，暂未收录该英雄的速查数据，当前展示演示英雄。';
        els.notice.hidden = false;
      } else {
        els.notice.hidden = true;
      }
    }
    updateClock();
    fitWindow();
  }

  function fitWindow() {
    if (!api || !api.resize) return;
    requestAnimationFrame(function () {
      var bar = document.querySelector('.bar');
      var status = document.querySelector('.statusbar');
      var main = document.querySelector('main');
      var foot = document.querySelector('footer');
      var last = main.lastElementChild;
      var padBottom = parseFloat(getComputedStyle(main).paddingBottom) || 0;
      var content = last ? last.offsetTop + last.offsetHeight + padBottom : main.scrollHeight;
      var h = 2 + bar.offsetHeight + status.offsetHeight + content + foot.offsetHeight;
      api.resize(h);
    });
  }

  function updateClock() {
    if (state.status !== 'live') {
      els.clock.textContent = '--:--';
      return;
    }
    var t = Math.max(0, state.gameTime + Math.floor((Date.now() - stateAt) / 1000));
    var m = Math.floor(t / 60);
    var s = t % 60;
    els.clock.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  setInterval(updateClock, 1000);

  fillDemoSelect(demo);
  applyState(state);

  els.select.addEventListener('change', function () {
    var c = findChampion(els.select.value);
    if (!c) return;
    demo = c;
    try {
      localStorage.setItem('haidou.demoChampion', c.id);
    } catch (e) {}
    renderChampion(c);
    renderAugments(c);
    renderBuild(c);
    fitWindow();
  });

  var pinned = false;
  function setPinned(v) {
    pinned = !!v;
    document.body.classList.toggle('pinned', pinned);
    els.pin.classList.toggle('active', pinned);
    els.pin.title = pinned ? '取消点击穿透 (Ctrl+Shift+L)' : '点击穿透 (Ctrl+Shift+L)';
  }

  if (api) {
    if (api.onGameState) api.onGameState(applyState);
    if (api.onPin) api.onPin(setPinned);
    els.pin.addEventListener('click', function () {
      api.togglePin();
    });
    els.web.addEventListener('click', function () {
      api.openWeb();
    });
    els.hide.addEventListener('click', function () {
      api.hide();
    });
    els.close.addEventListener('click', function () {
      api.quit();
    });
  } else {
    els.pin.addEventListener('click', function () {
      setPinned(!pinned);
    });
  }

  els.patch.textContent = D.meta.patch + ' · 演示数据';
  if (D.meta.patch) els.ver.textContent = D.meta.patch;

  window.__haidouSetState = function (next) {
    return applyState(next || {});
  };
})();
