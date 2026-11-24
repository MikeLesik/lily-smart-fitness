/* ============================================
   ACCOUNT — личный кабинет /account/
   Маршруты (hash): #/ программы, #/c/<slug> категория,
   #/v/<id> просмотр, #/profile профиль.
   Данные: /api/me, /api/catalog, /api/progress,
   /api/videos/<id>/playback. Доступ решает сервер,
   здесь только отображение.
   ============================================ */

(function () {
  'use strict';

  // Тексты: черновик до согласования с Лилей. EN добавится на этапе 5.
  var I18N = {
    ru: {
      eyebrow: 'Личный кабинет',
      programsTitle: 'Мои программы',
      programsText: 'Открытые программы сверху, остальные можно купить.',
      openSection: 'Открыты',
      lockedSection: 'Можно открыть',
      statusOpen: 'Открыта',
      statusFree: 'Бесплатно',
      statusLocked: 'Закрыта',
      videosCount: '{n} видео',
      minutes: '{n} мин',
      seconds: '{n} с',
      watched: 'Просмотрено {done} из {total}',
      open: 'Открыть',
      continue: 'Продолжить',
      start: 'Начать',
      preview: 'Смотреть превью',
      buy: 'Купить · {price}',
      bundleTitle: 'Все программы',
      bundleText: 'Все программы сразу и те, что появятся позже.',
      back: 'Мои программы',
      backToCategory: 'К программе',
      lockedNotice: 'Программа закрыта. Превью можно посмотреть бесплатно.',
      previewLabel: 'Превью',
      lockedLabel: 'Закрыто',
      doneLabel: 'Просмотрено',
      next: 'Следующее: {title}',
      forbidden: 'Это видео входит в программу «{title}». Открой её, чтобы смотреть.',
      unavailable: 'Видео временно недоступно. Попробуй позже.',
      network: 'Нет связи с сервером. Проверь интернет и обнови страницу.',
      notFound: 'Такого видео нет.',
      profileTitle: 'Профиль',
      email: 'Email',
      purchases: 'Доступы',
      noPurchases: 'Покупок пока нет.',
      sourceStripe: 'покупка',
      sourceManual: 'выдан Лилей',
      sourceFree: 'бесплатно',
      forever: 'навсегда',
      until: 'до {date}',
      allPrograms: 'Все программы',
      writeLily: 'Написать Лиле',
      logout: 'Выйти',
      loading: 'Загружаем…'
    }
  };

  var t = I18N.ru;
  var locale = 'ru';
  var TELEGRAM = 'https://t.me/LilyLesik';
  var SAVE_EVERY_MS = 15000;

  var app = document.getElementById('app');
  var state = { user: null, entitlements: [], catalog: { categories: [], bundles: [] }, progress: {} };
  var player = null; // { cleanup: fn }

  /* ---------- helpers ---------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmt(str, vars) {
    return str.replace(/\{(\w+)\}/g, function (_, k) { return vars && k in vars ? vars[k] : ''; });
  }

  function L(obj) {
    if (!obj) return '';
    return obj[locale] || obj.ru || '';
  }

  function duration(sec) {
    return sec < 60 ? fmt(t.seconds, { n: Math.round(sec) }) : fmt(t.minutes, { n: Math.round(sec / 60) });
  }

  function price(p) {
    if (!p) return '';
    var value = p.amount / 100;
    var num = value % 1 === 0 ? String(value) : value.toFixed(2).replace('.', ',');
    var symbols = { eur: '€', usd: '$', rub: '₽' };
    var sym = symbols[(p.currency || '').toLowerCase()];
    return sym === '₽' ? num + ' ₽' : (sym || '') + num;
  }

  function api(path, body) {
    var opts = { credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      opts.method = 'POST';
      opts.headers['content-type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    }, function () {
      return { ok: false, status: 0, data: { error: 'network' } };
    });
  }

  function toLogin() {
    var next = location.pathname + location.hash;
    location.replace('/login/?next=' + encodeURIComponent(next));
  }

  /* ---------- доступ (отображение; решает сервер) ---------- */

  function hasCategory(cat) {
    if (cat.free) return true;
    return state.entitlements.some(function (e) { return e.scope === cat.slug || e.scope === 'all'; });
  }

  function canWatch(video, cat) {
    return video.preview || hasCategory(cat);
  }

  function findCategory(slug) {
    return state.catalog.categories.find(function (c) { return c.slug === slug; }) || null;
  }

  function findVideo(id) {
    for (var i = 0; i < state.catalog.categories.length; i++) {
      var cat = state.catalog.categories[i];
      var idx = cat.videos.findIndex(function (v) { return v.id === id; });
      if (idx !== -1) return { video: cat.videos[idx], category: cat, index: idx };
    }
    return null;
  }

  function watchedCount(cat) {
    return cat.videos.filter(function (v) { return state.progress[v.id] && state.progress[v.id].completed; }).length;
  }

  /** Видео, с которого продолжить: первое недосмотренное из доступных. */
  function resumeVideo(cat) {
    var playable = cat.videos.filter(function (v) { return canWatch(v, cat); });
    return playable.find(function (v) { return !(state.progress[v.id] && state.progress[v.id].completed); }) || playable[0] || null;
  }

  // Этап 4 заменит это на Stripe Checkout (/api/checkout). Пока покупка через Лилю в Telegram.
  function buyUrl(title) {
    var text = 'Привет, Лиля! Хочу купить программу «' + title + '».';
    return TELEGRAM + '?text=' + encodeURIComponent(text);
  }

  function buyButton(title, p, cls) {
    return '<a class="' + (cls || 'btn-primary') + '" href="' + esc(buyUrl(title)) + '" target="_blank" rel="noopener">' +
      esc(fmt(t.buy, { price: price(p) })) + '</a>';
  }

  /* ---------- views ---------- */

  function head(title, text, back) {
    return (back ? '<a class="cab-back" href="' + esc(back.href) + '">' + esc(back.label) + '</a>' : '') +
      '<div class="cab-head">' +
        '<p class="section-eyebrow">' + esc(t.eyebrow) + '</p>' +
        '<h1 class="cab-title">' + esc(title) + '</h1>' +
        (text ? '<p class="cab-text">' + esc(text) + '</p>' : '') +
      '</div>';
  }

  function programCard(cat) {
    var open = hasCategory(cat);
    var total = cat.videos.length;
    var done = watchedCount(cat);
    var totalSec = cat.videos.reduce(function (s, v) { return s + v.durationSec; }, 0);
    var status = open ? (cat.free ? t.statusFree : t.statusOpen) : t.statusLocked;
    var meta = '<div class="cab-program-meta">' +
      '<span class="cab-program-status">' + esc(status) + '</span>' +
      '<span>' + esc(fmt(t.videosCount, { n: total })) + ' · ' + esc(duration(totalSec)) + '</span>' +
      (!open && cat.price ? '<span>' + esc(price(cat.price)) + '</span>' : '') +
    '</div>';
    var actions;
    if (open) {
      var label = done === 0 ? t.start : (done === total ? t.open : t.continue);
      actions = '<a class="btn-primary" href="#/c/' + esc(cat.slug) + '">' + esc(label) + '</a>';
    } else {
      var hasPreview = cat.videos.some(function (v) { return v.preview; });
      actions = buyButton(L(cat.title), cat.price) +
        (hasPreview ? '<a class="cab-secondary" href="#/c/' + esc(cat.slug) + '">' + esc(t.preview) + '</a>' : '');
    }
    return '<article class="cab-program' + (open ? '' : ' cab-program--locked') + '">' +
      meta +
      '<h2 class="cab-program-title">' + esc(L(cat.title)) + '</h2>' +
      (cat.subtitle ? '<p class="cab-program-subtitle">' + esc(L(cat.subtitle)) + '</p>' : '') +
      (open && total ? '<div class="cab-progress" title="' + esc(fmt(t.watched, { done: done, total: total })) + '"><span style="width:' + Math.round(done / total * 100) + '%"></span></div>' : '') +
      '<div class="cab-program-actions">' + actions + '</div>' +
    '</article>';
  }

  function renderPrograms() {
    var cats = state.catalog.categories;
    var open = cats.filter(hasCategory);
    var locked = cats.filter(function (c) { return !hasCategory(c); });
    var hasAll = state.entitlements.some(function (e) { return e.scope === 'all'; });
    var bundle = state.catalog.bundles.find(function (b) { return b.slug === 'all'; });

    var html = head(t.programsTitle, locked.length ? t.programsText : '');
    if (open.length) {
      html += (locked.length ? '<h2 class="cab-section-title">' + esc(t.openSection) + '</h2>' : '') +
        '<div class="cab-programs">' + open.map(programCard).join('') + '</div>';
    }
    if (locked.length) {
      html += '<h2 class="cab-section-title">' + esc(t.lockedSection) + '</h2>' +
        '<div class="cab-programs">' + locked.map(programCard).join('');
      if (bundle && !hasAll && locked.length > 1) {
        html += '<article class="cab-program cab-program--locked">' +
          '<h2 class="cab-program-title">' + esc(L(bundle.title) || t.bundleTitle) + '</h2>' +
          '<p class="cab-program-subtitle">' + esc(t.bundleText) + '</p>' +
          '<div class="cab-program-actions">' + buyButton(L(bundle.title) || t.bundleTitle, bundle.price) + '</div>' +
        '</article>';
      }
      html += '</div>';
    }
    app.innerHTML = html;
  }

  var ICON_CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';
  var ICON_LOCK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/></svg>';

  function renderCategory(slug) {
    var cat = findCategory(slug);
    if (!cat) return renderPrograms();
    var open = hasCategory(cat);
    var resume = open ? resumeVideo(cat) : null;

    var html = head(L(cat.title), cat.subtitle ? L(cat.subtitle) : '', { href: '#/', label: t.back });
    if (!open) {
      html += '<p class="cab-text">' + esc(t.lockedNotice) + '</p>' +
        '<div class="cab-program-actions" style="margin-bottom:var(--space-md)">' + buyButton(L(cat.title), cat.price) + '</div>';
    } else if (resume) {
      var started = state.progress[resume.id];
      html += '<div class="cab-program-actions" style="margin-bottom:var(--space-md)">' +
        '<a class="btn-primary" href="#/v/' + esc(resume.id) + '">' + esc(started || watchedCount(cat) ? t.continue : t.start) + '</a></div>';
    }

    html += '<div class="cab-videos">' + cat.videos.map(function (v, i) {
      var playable = canWatch(v, cat);
      var p = state.progress[v.id];
      var stateHtml;
      if (p && p.completed) stateHtml = '<span class="cab-video-state cab-video-state--done" title="' + esc(t.doneLabel) + '">' + ICON_CHECK + '</span>';
      else if (!open && v.preview) stateHtml = '<span class="cab-video-state">' + esc(t.previewLabel) + '</span>';
      else if (!playable) stateHtml = '<span class="cab-video-state" title="' + esc(t.lockedLabel) + '">' + ICON_LOCK + '</span>';
      else stateHtml = '';
      return '<a class="cab-video' + (playable ? '' : ' cab-video--locked') + '" href="#/v/' + esc(v.id) + '">' +
        '<span class="cab-video-num">' + (i + 1) + '</span>' +
        '<span class="cab-video-body"><span class="cab-video-title">' + esc(L(v.title)) + '</span>' +
        '<span class="cab-video-meta">' + esc(duration(v.durationSec)) + '</span></span>' +
        stateHtml + '</a>';
    }).join('') + '</div>';
    app.innerHTML = html;
  }

  function loadStreamSdk() {
    if (window.Stream) return Promise.resolve(window.Stream);
    if (loadStreamSdk.p) return loadStreamSdk.p;
    loadStreamSdk.p = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = 'https://embed.cloudflarestream.com/embed/sdk.latest.js';
      s.onload = function () { resolve(window.Stream || null); };
      s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
    });
    return loadStreamSdk.p;
  }

  function saveProgress(videoId, seconds, completed, beacon) {
    var prev = state.progress[videoId] || { seconds: 0, completed: false };
    state.progress[videoId] = { seconds: Math.floor(seconds), completed: prev.completed || !!completed };
    var body = { videoId: videoId, seconds: seconds, completed: !!completed };
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon('/api/progress', new Blob([JSON.stringify(body)], { type: 'application/json' }));
      return;
    }
    api('/api/progress', body);
  }

  function attachProgress(iframe, video) {
    var lastSaved = 0;
    var current = 0;
    var listeners = [];
    var stream = null;

    function flush(beacon, completed) {
      if (current > 0 || completed) saveProgress(video.id, current, completed, beacon);
    }
    function onHide() { if (document.visibilityState === 'hidden') flush(true); }
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);

    loadStreamSdk().then(function (Stream) {
      if (!Stream || !iframe.isConnected) return;
      stream = Stream(iframe);
      function on(ev, fn) { stream.addEventListener(ev, fn); listeners.push([ev, fn]); }
      on('timeupdate', function () {
        current = stream.currentTime || 0;
        if (Date.now() - lastSaved > SAVE_EVERY_MS) {
          lastSaved = Date.now();
          flush(false);
        }
      });
      on('pause', function () { flush(false); });
      on('ended', function () { current = video.durationSec; flush(false, true); });
    });

    return function cleanup() {
      flush(true);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      if (stream) listeners.forEach(function (l) { stream.removeEventListener(l[0], l[1]); });
    };
  }

  function playerMessage(text, cat) {
    return '<div class="cab-player-msg"><p>' + esc(text) + '</p>' +
      (cat && cat.price && !hasCategory(cat) ? buyButton(L(cat.title), cat.price) : '') + '</div>';
  }

  function renderVideo(id) {
    var found = findVideo(id);
    if (!found) {
      app.innerHTML = head(t.notFound, '', { href: '#/', label: t.back });
      return;
    }
    var v = found.video;
    var cat = found.category;
    var next = cat.videos[found.index + 1] || null;

    app.innerHTML =
      head(L(v.title), '', { href: '#/c/' + cat.slug, label: L(cat.title) }) +
      '<div class="cab-player" id="player"><div class="cab-player-msg"><p>' + esc(t.loading) + '</p></div></div>' +
      '<p class="cab-video-meta" style="margin-bottom:0.5rem">' + esc(duration(v.durationSec)) + '</p>' +
      (v.description ? '<p class="cab-video-desc">' + esc(L(v.description)) + '</p>' : '') +
      (next ? '<div class="cab-program-actions"><a class="cab-secondary" href="#/v/' + esc(next.id) + '">' +
        esc(fmt(t.next, { title: L(next.title) })) + '</a></div>' : '');

    var box = document.getElementById('player');
    api('/api/videos/' + encodeURIComponent(id) + '/playback').then(function (res) {
      if (!box.isConnected) return;
      if (res.status === 401) return toLogin();
      if (!res.ok) {
        var err = res.data && res.data.error;
        var text = err === 'forbidden' ? fmt(t.forbidden, { title: L(cat.title) })
          : err === 'video_unavailable' ? t.unavailable
          : err === 'not_found' ? t.notFound
          : t.network;
        box.innerHTML = playerMessage(text, err === 'forbidden' ? cat : null);
        return;
      }
      var p = state.progress[id];
      var url = res.data.url;
      // Продолжить с места остановки, если видео не досмотрено.
      if (p && !p.completed && p.seconds > 5 && p.seconds < v.durationSec - 10) {
        url += (url.indexOf('?') === -1 ? '?' : '&') + 'startTime=' + p.seconds + 's';
      }
      var iframe = document.createElement('iframe');
      iframe.src = url;
      iframe.title = L(v.title);
      iframe.allow = 'accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen';
      iframe.allowFullscreen = true;
      box.innerHTML = '';
      box.appendChild(iframe);
      if (state.user) player = { cleanup: attachProgress(iframe, v) };
    });
  }

  function renderProfile() {
    var titles = {};
    state.catalog.categories.forEach(function (c) { titles[c.slug] = L(c.title); });
    var sources = { stripe: t.sourceStripe, manual: t.sourceManual, free: t.sourceFree };
    var items = state.entitlements.map(function (e) {
      var name = e.scope === 'all' ? t.allPrograms : (titles[e.scope] || e.scope);
      var until = e.expiresAt ? fmt(t.until, { date: new Date(e.expiresAt * 1000).toLocaleDateString('ru-RU') }) : t.forever;
      return '<li><span>' + esc(name) + '</span><span>' + esc((sources[e.source] || e.source) + ', ' + until) + '</span></li>';
    });

    app.innerHTML =
      head(t.profileTitle, '') +
      '<ul class="cab-list"><li><span>' + esc(t.email) + '</span><span>' + esc(state.user.email) + '</span></li></ul>' +
      '<h2 class="cab-section-title">' + esc(t.purchases) + '</h2>' +
      (items.length ? '<ul class="cab-list">' + items.join('') + '</ul>' : '<p class="cab-text">' + esc(t.noPurchases) + '</p>') +
      '<div class="cab-actions">' +
        '<a class="btn-primary" href="' + TELEGRAM + '" target="_blank" rel="noopener">' + esc(t.writeLily) + '</a>' +
        '<button type="button" class="cab-secondary" data-action="logout">' + esc(t.logout) + '</button>' +
      '</div>';

    app.querySelector('[data-action="logout"]').addEventListener('click', function () {
      api('/api/auth/logout', {}).then(function () { location.replace('/login/'); });
    });
  }

  /* ---------- router ---------- */

  function route() {
    if (player) {
      player.cleanup();
      player = null;
    }
    var h = location.hash.replace(/^#/, '') || '/';
    var m;
    var nav = 'programs';
    if ((m = h.match(/^\/c\/([\w-]+)$/))) renderCategory(m[1]);
    else if ((m = h.match(/^\/v\/([\w-]+)$/))) renderVideo(m[1]);
    else if (h === '/profile') { renderProfile(); nav = 'profile'; }
    else renderPrograms();

    document.querySelectorAll('[data-nav]').forEach(function (a) {
      if (a.getAttribute('data-nav') === nav) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
  }

  Promise.all([api('/api/me'), api('/api/catalog'), api('/api/progress')]).then(function (r) {
    var me = r[0];
    var cat = r[1];
    var prog = r[2];
    if (me.ok && !me.data.user) return toLogin();
    if (!me.ok || !cat.ok) {
      app.innerHTML = '<p class="cab-text cab-loading">' + esc(t.network) + '</p>';
      return;
    }
    state.user = me.data.user;
    state.entitlements = me.data.entitlements || [];
    state.catalog = cat.data;
    (prog.ok && prog.data.progress || []).forEach(function (p) { state.progress[p.videoId] = p; });
    window.addEventListener('hashchange', route);
    route();
  });
})();
