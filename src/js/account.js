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
      programsTitle: 'Мои программы',
      moreSection: 'Ещё программы',
      workoutForms: ['тренировка', 'тренировки', 'тренировок'],
      programForms: ['программа', 'программы', 'программ'],
      minutes: '{n}\u00a0мин',
      seconds: '{n}\u00a0с',
      previewFree: 'превью\u00a0бесплатно',
      previewMark: 'превью',
      stoppedAt: 'Остановилась на\u00a0{time} из\u00a0{total}',
      stoppedAtShort: 'остановилась на {time}',
      watchedMark: 'просмотрено',
      continue: 'Продолжить',
      continueFrom: 'Продолжить с {time}',
      again: 'Смотреть снова',
      start: 'Начать',
      preview: 'Смотреть превью · {d}',
      buy: 'Купить · {price}',
      bundleTitle: 'Все программы',
      bundleBoth: 'Обе программы и все новые',
      bundleMany: '{n}\u00a0{programs} и все новые',
      bundleInstead: 'вместо\u00a0{price}',
      back: 'Мои программы',
      toProgram: 'К программе',
      toAll: 'Ко всем программам',
      next: 'Следующее: {title}',
      lockedVideo: 'Эта тренировка входит в программу «{title}».',
      lockedProgram: 'Вся программа откроется сразу после покупки.',
      previewPart: '{part} можно посмотреть бесплатно.',
      previewFirstMinute: 'Первую минуту',
      previewMinuteHalf: 'Первые полторы минуты',
      previewFirstN: 'Первые {n} {unit}',
      secondForms: ['секунду', 'секунды', 'секунд'],
      minuteForms: ['минуту', 'минуты', 'минут'],
      lockedLabel: 'Закрыто',
      doneLabel: 'Просмотрено',
      unavailable: 'Видео временно недоступно. Попробуй позже.',
      networkTitle: 'Нет связи с сервером',
      network: 'Проверь интернет и обнови страницу.',
      networkVideo: 'Нет связи с сервером. Проверь интернет и обнови страницу.',
      reload: 'Обновить',
      notFoundTitle: 'Такого видео нет',
      notFoundText: 'Возможно, ссылка устарела или в ней опечатка.',
      loadingVideo: 'Загружаем видео…',
      profileTitle: 'Профиль',
      email: 'Email',
      purchases: 'Доступы',
      noPurchases: 'Покупок пока нет.',
      noPurchasesFree: 'Покупок пока нет. Начни с бесплатного урока.',
      noAccess: 'Открытых программ сейчас нет.',
      forever: 'Навсегда',
      until: 'До {date}',
      allPrograms: 'Все программы',
      writeLily: 'Написать Лиле',
      writeLilyText: 'Привет, Лиля! Пишу из личного кабинета.',
      logout: 'Выйти',
      paid: 'Оплата прошла. «{title}» уже открыта, письмо со входом отправили на почту.',
      paidAll: 'Оплата прошла. Все программы открыты, письмо со входом отправили на почту.',
      orders: 'Покупки',
      receipt: 'Чек',
      refunded: 'Возврат'
    }
  };

  var t = I18N.ru;
  var locale = 'ru';
  var TELEGRAM = 'https://t.me/LilyLesik';
  var SAVE_EVERY_MS = 15000;
  // Разделитель в мете: перенос строки только после точки, не перед ней
  var SEP = '\u00a0· ';

  var app = document.getElementById('app');
  // recent: id видео с записью прогресса, свежие первыми (сервер отдаёт по updated_at DESC)
  var state = { user: null, entitlements: [], catalog: { categories: [], bundles: [] }, progress: {}, recent: [] };
  var player = null; // { cleanup: fn }
  // ?paid=<scope> после возврата из Stripe: показываем подтверждение один раз
  var paidScope = new URLSearchParams(location.search).get('paid');
  if (paidScope) {
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* ignore */ }
  }

  function paidNotice() {
    if (!paidScope) return '';
    var scope = paidScope;
    paidScope = null;
    var cat = state.catalog.categories.find(function (c) { return c.slug === scope; });
    var text = scope === 'all' || !cat ? t.paidAll : fmt(t.paid, { title: L(cat.title) });
    return '<p class="cab-paid" role="status">' + esc(text) + '</p>';
  }

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

  /** Склонение: 1 тренировка, 2 тренировки, 5 тренировок. */
  function plural(n, forms) {
    var m10 = n % 10;
    var m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return forms[0];
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1];
    return forms[2];
  }

  /** 1346 → «22 мин», 90 → «1,5 мин», 40 → «40 с». */
  function duration(sec) {
    if (sec < 60) return fmt(t.seconds, { n: Math.round(sec) });
    var min = sec / 60;
    var frac = min - Math.floor(min);
    if (min < 10 && frac >= 0.25 && frac < 0.75) return fmt(t.minutes, { n: Math.floor(min) + ',5' });
    return fmt(t.minutes, { n: Math.round(min) });
  }

  /** 312 → «5:12», 3725 → «1:02:05». */
  function clock(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    var ss = (s < 10 ? '0' : '') + s;
    return h ? h + ':' + (m < 10 ? '0' : '') + m + ':' + ss : m + ':' + ss;
  }

  function price(p) {
    if (!p) return '';
    var value = p.amount / 100;
    var num = value % 1 === 0 ? String(value) : value.toFixed(2).replace('.', ',');
    var symbols = { eur: '€', usd: '$', rub: '₽' };
    var sym = symbols[(p.currency || '').toLowerCase()];
    return sym === '₽' ? num + ' ₽' : (sym || '') + num;
  }

  function telegram(text) {
    return TELEGRAM + '?text=' + encodeURIComponent(text);
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
      var video = cat.videos.find(function (v) { return v.id === id; });
      if (video) return { video: video, category: cat };
    }
    return null;
  }

  /* ---------- прогресс: считаем только основные видео, без превью ---------- */

  function mainVideos(cat) {
    return cat.videos.filter(function (v) { return !v.preview; });
  }

  function firstPreview(cat) {
    return cat.videos.find(function (v) { return v.preview; }) || null;
  }

  function isDone(v) {
    var p = state.progress[v.id];
    return !!(p && p.completed);
  }

  /** Есть место, с которого стоит продолжить (та же граница, что и для startTime плеера). */
  function resumable(v) {
    var p = state.progress[v.id];
    return !!(p && !p.completed && p.seconds > 5 && p.seconds < v.durationSec - 10);
  }

  function totalSec(videos) {
    return videos.reduce(function (s, v) { return s + v.durationSec; }, 0);
  }

  /** Σ min(seconds, durationSec) / Σ durationSec по основным видео; досмотренное = 100%. */
  function programFraction(cat) {
    var mains = mainVideos(cat);
    var total = totalSec(mains);
    if (!total) return 0;
    var watched = mains.reduce(function (s, v) {
      var p = state.progress[v.id];
      if (!p) return s;
      return s + (p.completed ? v.durationSec : Math.min(p.seconds, v.durationSec));
    }, 0);
    return Math.min(1, watched / total);
  }

  function allDone(cat) {
    var mains = mainVideos(cat);
    return mains.length > 0 && mains.every(isDone);
  }

  function hasRecord(cat) {
    return mainVideos(cat).some(function (v) { return !!state.progress[v.id]; });
  }

  /** Одна подпись на всех экранах. */
  function actionLabel(cat) {
    if (allDone(cat)) return t.again;
    if (hasRecord(cat)) return t.continue;
    return t.start;
  }

  /** С какого видео продолжить: в открытой программе первое недосмотренное основное (превью пропускаем). */
  function resumeVideo(cat) {
    if (!hasCategory(cat)) return firstPreview(cat);
    var mains = mainVideos(cat);
    return mains.find(function (v) { return !isDone(v); }) || mains[0] || null;
  }

  /** «1 тренировка · 22 мин» (только основные видео). */
  function countMeta(cat) {
    var mains = mainVideos(cat);
    var n = mains.length;
    return n + '\u00a0' + plural(n, t.workoutForms) + SEP + duration(totalSec(mains));
  }

  /** Мета открытой программы: место остановки, «просмотрено» или состав. */
  function progressMeta(cat) {
    var v = resumeVideo(cat);
    if (allDone(cat)) return countMeta(cat) + SEP + t.watchedMark;
    if (v && resumable(v)) {
      return fmt(t.stoppedAt, { time: clock(state.progress[v.id].seconds), total: duration(v.durationSec) });
    }
    return countMeta(cat);
  }

  /** Программа для блока «Продолжить»: начатая, иначе купленная, иначе бесплатный урок. */
  function continueProgram() {
    var cats = state.catalog.categories.filter(function (c) { return hasCategory(c) && mainVideos(c).length; });
    if (!cats.length) return null;
    var started = [];
    state.recent.forEach(function (id) {
      var f = findVideo(id);
      if (f && !f.video.preview && cats.indexOf(f.category) !== -1 && started.indexOf(f.category) === -1) {
        started.push(f.category);
      }
    });
    function unfinished(c) { return !allDone(c); }
    return started.find(unfinished) ||
      cats.find(function (c) { return !c.free && unfinished(c); }) ||
      cats.find(function (c) { return c.free && unfinished(c); }) ||
      started[0] || cats[0];
  }

  /** Покупка через Stripe Checkout: data-buy подхватывает js/buy.js. */
  function buyButton(scope, title, p) {
    return '<a class="btn-primary" href="#" data-buy="' + esc(scope) + '" data-buy-title="' + esc(title) + '"' +
      ' data-buy-price="' + esc(price(p)) + '">' + esc(fmt(t.buy, { price: price(p) })) + '</a>';
  }

  /** «Первую минуту можно посмотреть бесплатно.» */
  function previewSentence(sec) {
    var part;
    if (sec < 55) part = fmt(t.previewFirstN, { n: Math.round(sec), unit: plural(Math.round(sec), t.secondForms) });
    else if (sec <= 65) part = t.previewFirstMinute;
    else if (sec <= 100) part = t.previewMinuteHalf;
    else {
      var n = Math.round(sec / 60);
      part = fmt(t.previewFirstN, { n: n, unit: plural(n, t.minuteForms) });
    }
    return fmt(t.previewPart, { part: part });
  }

  function previewButton(v) {
    return '<a class="cab-secondary" href="#/v/' + esc(v.id) + '">' + esc(fmt(t.preview, { d: duration(v.durationSec) })) + '</a>';
  }

  /* ---------- куски разметки ---------- */

  function back(href, label) {
    return '<a class="cab-back" href="' + esc(href) + '"><span class="cab-back-label">' + esc(label) + '</span></a>';
  }

  function cover(src, eager) {
    if (!src) return '<span class="cab-thumb" aria-hidden="true"><span class="cab-cover"></span></span>';
    var webp = /\.jpe?g$/i.test(src) ? src.replace(/\.jpe?g$/i, '.webp') : null;
    return '<picture class="cab-thumb">' +
      (webp ? '<source type="image/webp" srcset="' + esc(webp) + '">' : '') +
      '<img class="cab-cover" src="' + esc(src) + '" alt="" width="88" height="110" loading="' + (eager ? 'eager' : 'lazy') + '" decoding="async">' +
    '</picture>';
  }

  var ICON_CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" focusable="false"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';
  var ICON_LOCK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true" focusable="false"><rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/></svg>';

  /* ---------- «Мои программы» ---------- */

  function continueCard(cat) {
    var v = resumeVideo(cat);
    var href = v ? '#/v/' + v.id : '#/c/' + cat.slug;
    var pct = Math.round(programFraction(cat) * 100);
    return '<a class="cab-continue" href="' + esc(href) + '">' +
      cover(cat.cover, true) +
      '<div class="cab-continue-body">' +
        '<h2 class="cab-continue-title">' + esc(L(cat.title)) + '</h2>' +
        '<span class="cab-meta">' + esc(progressMeta(cat)) + '</span>' +
        '<span class="cab-bar" aria-hidden="true"><span style="width:' + pct + '%"></span></span>' +
      '</div>' +
      '<span class="btn-primary">' + esc(actionLabel(cat)) + '</span>' +
    '</a>';
  }

  function programRow(cat) {
    var open = hasCategory(cat);
    var meta = open ? progressMeta(cat) : countMeta(cat) + (firstPreview(cat) ? SEP + t.previewFree : '');
    var end = open
      ? '<span class="cab-row-arrow" aria-hidden="true">→</span>'
      : '<span class="cab-row-price">' + esc(price(cat.price)) + '</span>';
    return '<li><a class="cab-row" href="#/c/' + esc(cat.slug) + '">' +
      cover(cat.cover, false) +
      '<span class="cab-row-body"><span class="cab-row-title">' + esc(L(cat.title)) + '</span>' +
      '<span class="cab-row-meta">' + esc(meta) + '</span></span>' +
      end + '</a></li>';
  }

  function bundleRow(bundle) {
    var cats = state.catalog.categories.filter(function (c) {
      return !c.free && c.price && (bundle.categories === '*' || bundle.categories.indexOf(c.slug) !== -1);
    });
    var n = cats.length;
    var sum = cats.reduce(function (s, c) {
      return c.price.currency === bundle.price.currency ? s + c.price.amount : s;
    }, 0);
    var meta = n === 2 ? t.bundleBoth : fmt(t.bundleMany, { n: n, programs: plural(n, t.programForms) });
    if (sum > bundle.price.amount) meta += SEP + fmt(t.bundleInstead, { price: price({ amount: sum, currency: bundle.price.currency }) });
    var title = L(bundle.title) || t.bundleTitle;
    return '<li><a class="cab-row" href="#" data-buy="' + esc(bundle.slug) + '" data-buy-title="' + esc(title) + '" data-buy-price="' + esc(price(bundle.price)) + '">' +
      cover(bundle.cover, false) +
      '<span class="cab-row-body"><span class="cab-row-title">' + esc(title) + '</span>' +
      '<span class="cab-row-meta">' + esc(meta) + '</span></span>' +
      '<span class="cab-row-price">' + esc(price(bundle.price)) + '</span></a></li>';
  }

  function renderPrograms() {
    var cats = state.catalog.categories;
    var cont = continueProgram();
    var open = cats.filter(function (c) { return hasCategory(c) && c !== cont; });
    var locked = cats.filter(function (c) { return !hasCategory(c); });
    var hasAll = state.entitlements.some(function (e) { return e.scope === 'all'; });
    var bundle = state.catalog.bundles.find(function (b) { return b.slug === 'all'; });
    var lockedPaid = locked.filter(function (c) { return !c.free; }).length;

    var html = '<h1 class="cab-title">' + esc(t.programsTitle) + '</h1>' + paidNotice();
    if (cont) html += continueCard(cont);
    if (open.length) html += '<ul class="cab-rows">' + open.map(programRow).join('') + '</ul>';
    if (locked.length) {
      html += '<h2 class="cab-section-title">' + esc(t.moreSection) + '</h2>' +
        '<ul class="cab-rows">' + locked.map(programRow).join('') +
        (bundle && !hasAll && lockedPaid > 1 ? bundleRow(bundle) : '') +
        '</ul>';
    }
    app.innerHTML = html;
  }

  /* ---------- программа ---------- */

  function videoItem(v, i, open) {
    var p = state.progress[v.id];
    var res = open && resumable(v);
    var meta = res
      ? fmt(t.stoppedAt, { time: clock(p.seconds), total: duration(v.durationSec) })
      : duration(v.durationSec);
    var stateHtml = '';
    if (!open) {
      stateHtml = '<span class="cab-video-state">' + ICON_LOCK + '<span class="visually-hidden">' + esc(t.lockedLabel) + '</span></span>';
    } else if (isDone(v)) {
      stateHtml = '<span class="cab-video-state cab-video-state--done">' + ICON_CHECK + '<span class="visually-hidden">' + esc(t.doneLabel) + '</span></span>';
    }
    var bar = res
      ? '<span class="cab-video-bar" style="width:' + Math.round(Math.min(p.seconds / v.durationSec, 1) * 100) + '%" aria-hidden="true"></span>'
      : '';
    var inner = '<span class="cab-video-num" aria-hidden="true">' + (i + 1) + '</span>' +
      '<span class="cab-video-body"><span class="cab-video-title">' + esc(L(v.title)) + '</span>' +
      '<span class="cab-video-meta">' + esc(meta) + '</span></span>' +
      stateHtml + bar;
    return open
      ? '<li><a class="cab-video" href="#/v/' + esc(v.id) + '">' + inner + '</a></li>'
      : '<li><div class="cab-video cab-video--locked">' + inner + '</div></li>';
  }

  function renderCategory(slug) {
    var cat = findCategory(slug);
    if (!cat) return renderPrograms();
    var open = hasCategory(cat);
    var mains = mainVideos(cat);

    var html = back('#/', t.back) +
      '<div class="cab-head">' +
        '<h1 class="cab-title">' + esc(L(cat.title)) + '</h1>' +
        (cat.subtitle ? '<p class="cab-sub">' + esc(L(cat.subtitle)) + '</p>' : '') +
        '<p class="cab-meta">' + esc(countMeta(cat)) + '</p>' +
      '</div>' + paidNotice();

    if (open) {
      var v = resumeVideo(cat);
      if (v) {
        var label = resumable(v) ? fmt(t.continueFrom, { time: clock(state.progress[v.id].seconds) }) : actionLabel(cat);
        html += '<div class="cab-actions"><a class="btn-primary" href="#/v/' + esc(v.id) + '">' + esc(label) + '</a></div>';
      }
    } else {
      var preview = firstPreview(cat);
      html += '<p class="cab-text">' + esc((preview ? previewSentence(preview.durationSec) + ' ' : '') + t.lockedProgram) + '</p>' +
        '<div class="cab-actions">' + buyButton(cat.slug, L(cat.title), cat.price) + (preview ? previewButton(preview) : '') + '</div>';
    }

    // В списке только основные видео: в купленной превью не нужно, в закрытой оно на кнопке.
    html += '<ol class="cab-videos">' + mains.map(function (v, i) { return videoItem(v, i, open); }).join('') + '</ol>';
    app.innerHTML = html;
  }

  /* ---------- просмотр ---------- */

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
    state.progress[videoId] = { videoId: videoId, seconds: Math.floor(seconds), completed: prev.completed || !!completed };
    state.recent = [videoId].concat(state.recent.filter(function (id) { return id !== videoId; }));
    var body = { videoId: videoId, seconds: seconds, completed: !!completed };
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon('/api/progress', new Blob([JSON.stringify(body)], { type: 'application/json' }));
      return;
    }
    api('/api/progress', body);
  }

  function attachProgress(iframe, video, onEnded) {
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
      on('ended', function () {
        current = video.durationSec;
        flush(false, true);
        if (onEnded) onEnded();
      });
    });

    return function cleanup() {
      flush(true);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      if (stream) listeners.forEach(function (l) { stream.removeEventListener(l[0], l[1]); });
    };
  }

  /** Следующее видео: в открытой программе по основным, в закрытой по порядку (превью → закрытое). */
  function nextVideo(v, cat) {
    var seq = hasCategory(cat) ? mainVideos(cat) : cat.videos;
    var i = seq.indexOf(v);
    if (i === -1) return seq[0] || null;
    return seq[i + 1] || null;
  }

  function afterLink(v, cat) {
    var next = nextVideo(v, cat);
    if (next) {
      return '<a class="cab-secondary" href="#/v/' + esc(next.id) + '">' + esc(fmt(t.next, { title: L(next.title) })) + '</a>';
    }
    if (hasCategory(cat) && allDone(cat)) return '<a class="cab-secondary" href="#/">' + esc(t.toAll) + '</a>';
    return '<a class="cab-secondary" href="#/c/' + esc(cat.slug) + '">' + esc(t.toProgram) + '</a>';
  }

  function videoMeta(v, cat) {
    var meta = duration(v.durationSec);
    var p = state.progress[v.id];
    if (v.preview && !hasCategory(cat)) meta += SEP + t.previewMark;
    else if (resumable(v)) meta += SEP + fmt(t.stoppedAtShort, { time: clock(p.seconds) });
    else if (isDone(v)) meta += SEP + t.watchedMark;
    return meta;
  }

  /** Видео без плеера: закрыто (знаем заранее или сервер ответил 403) или недоступно. */
  function renderVideoBlocked(v, cat, kind) {
    document.body.classList.remove('cab-wide');
    var preview = firstPreview(cat);
    var box;
    if (kind === 'locked') {
      var text = fmt(t.lockedVideo, { title: L(cat.title) }) + (preview ? ' ' + previewSentence(preview.durationSec) : '');
      box = '<section class="cab-locked"><p class="cab-text">' + esc(text) + '</p>' +
        '<div class="cab-actions">' + buyButton(cat.slug, L(cat.title), cat.price) + (preview ? previewButton(preview) : '') + '</div></section>';
    } else {
      box = '<section class="cab-panel"><p class="cab-text">' + esc(kind === 'unavailable' ? t.unavailable : t.networkVideo) + '</p>' +
        '<div class="cab-actions"><button type="button" class="cab-secondary" data-action="reload">' + esc(t.reload) + '</button></div></section>';
    }
    app.innerHTML = back('#/c/' + cat.slug, L(cat.title)) +
      '<div class="cab-head">' +
        '<h1 class="cab-title cab-watch-title">' + esc(L(v.title)) + '</h1>' +
        '<p class="cab-meta">' + esc(duration(v.durationSec)) + '</p>' +
      '</div>' +
      box +
      (v.description ? '<p class="cab-video-desc">' + esc(L(v.description)) + '</p>' : '');
  }

  function renderUnknownVideo() {
    app.innerHTML = '<h1 class="cab-title">' + esc(t.notFoundTitle) + '</h1>' +
      '<p class="cab-text">' + esc(t.notFoundText) + '</p>' +
      '<div class="cab-actions"><a class="btn-primary" href="#/">' + esc(t.back) + '</a></div>';
  }

  function renderVideo(id) {
    var found = findVideo(id);
    if (!found) return renderUnknownVideo();
    var v = found.video;
    var cat = found.category;

    // Доступ решает сервер; если и так ясно, что закрыто, плеер не рисуем и API не зовём.
    if (!canWatch(v, cat)) return renderVideoBlocked(v, cat, 'locked');

    document.body.classList.add('cab-wide');
    app.innerHTML =
      back('#/c/' + cat.slug, L(cat.title)) +
      '<div class="cab-watch">' +
        '<div class="cab-player" id="player"><p class="cab-player-msg" role="status">' + esc(t.loadingVideo) + '</p></div>' +
        '<div class="cab-watch-info">' +
          '<h1 class="cab-title cab-watch-title">' + esc(L(v.title)) + '</h1>' +
          '<p class="cab-meta">' + esc(videoMeta(v, cat)) + '</p>' +
          (v.description ? '<p class="cab-video-desc">' + esc(L(v.description)) + '</p>' : '') +
          '<div class="cab-actions" id="after">' + afterLink(v, cat) + '</div>' +
        '</div>' +
      '</div>';

    var box = document.getElementById('player');
    api('/api/videos/' + encodeURIComponent(id) + '/playback').then(function (res) {
      if (!box.isConnected) return;
      if (res.status === 401) return toLogin();
      if (!res.ok) {
        var err = res.data && res.data.error;
        if (err === 'not_found') renderUnknownVideo();
        else renderVideoBlocked(v, cat, res.status === 403 || err === 'forbidden' ? 'locked' : err === 'video_unavailable' ? 'unavailable' : 'network');
        focusHeading();
        return;
      }
      var url = res.data.url;
      // Продолжить с места остановки, если видео не досмотрено.
      if (resumable(v)) {
        url += (url.indexOf('?') === -1 ? '?' : '&') + 'startTime=' + state.progress[v.id].seconds + 's';
      }
      var iframe = document.createElement('iframe');
      iframe.src = url;
      iframe.title = L(v.title);
      iframe.allow = 'accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen';
      iframe.allowFullscreen = true;
      box.innerHTML = '';
      box.appendChild(iframe);
      if (state.user) {
        player = {
          cleanup: attachProgress(iframe, v, function () {
            // Досмотрела последнее: «К программе» меняется на «Ко всем программам».
            var after = document.getElementById('after');
            if (after) after.innerHTML = afterLink(v, cat);
          })
        };
      }
    });
  }

  /* ---------- профиль ---------- */

  function renderProfile() {
    var titles = {};
    state.catalog.categories.forEach(function (c) { titles[c.slug] = L(c.title); });
    var items = state.entitlements.map(function (e) {
      var name = e.scope === 'all' ? t.allPrograms : (titles[e.scope] || e.scope);
      var until = e.expiresAt ? fmt(t.until, { date: new Date(e.expiresAt * 1000).toLocaleDateString('ru-RU') }) : t.forever;
      return '<li><span class="cab-list-value">' + esc(name) + '</span><span class="cab-list-note">' + esc(until) + '</span></li>';
    });
    var free = state.catalog.categories.find(function (c) { return c.free; });

    var purchases = items.length
      ? '<ul class="cab-list">' + items.join('') + '</ul>'
      : (state.orders && state.orders.length)
        ? '<p class="cab-text">' + esc(t.noAccess) + '</p>'
        : '<p class="cab-text">' + esc(free ? t.noPurchasesFree : t.noPurchases) + '</p>' +
        (free ? '<div class="cab-actions cab-empty-actions"><a class="cab-secondary" href="#/c/' + esc(free.slug) + '">' + esc(L(free.title)) + '</a></div>' : '');

    var orders = (state.orders || []).map(function (o) {
      var name = o.scope === 'all' ? t.allPrograms : (titles[o.scope] || o.scope);
      var date = new Date(o.createdAt * 1000).toLocaleDateString('ru-RU');
      var note = price({ amount: o.amount, currency: o.currency }) + SEP + date;
      var link = o.status === 'refunded'
        ? SEP + esc(t.refunded)
        : (o.receiptUrl ? SEP + '<a class="cab-inline-link" href="' + esc(o.receiptUrl) + '" target="_blank" rel="noopener">' + esc(t.receipt) + '</a>' : '');
      return '<li><span class="cab-list-value">' + esc(name) + '</span><span class="cab-list-note">' + esc(note) + link + '</span></li>';
    });

    app.innerHTML =
      '<h1 class="cab-title">' + esc(t.profileTitle) + '</h1>' +
      '<ul class="cab-list"><li><span class="cab-list-label">' + esc(t.email) + '</span>' +
        '<span class="cab-list-value">' + esc(state.user.email) + '</span></li></ul>' +
      '<h2 class="cab-section-title">' + esc(t.purchases) + '</h2>' +
      purchases +
      (orders.length ? '<h2 class="cab-section-title">' + esc(t.orders) + '</h2><ul class="cab-list">' + orders.join('') + '</ul>' : '') +
      '<div class="cab-actions">' +
        '<a class="btn-primary" href="' + esc(telegram(t.writeLilyText)) + '" target="_blank" rel="noopener">' + esc(t.writeLily) + '</a>' +
      '</div>' +
      '<div class="cab-logout"><button type="button" class="cab-link" data-action="logout">' + esc(t.logout) + '</button></div>';
  }

  function renderNetworkError() {
    app.innerHTML = '<h1 class="cab-title">' + esc(t.networkTitle) + '</h1>' +
      '<p class="cab-text">' + esc(t.network) + '</p>' +
      '<div class="cab-actions"><button type="button" class="cab-secondary" data-action="reload">' + esc(t.reload) + '</button></div>';
  }

  /* ---------- router ---------- */

  function focusHeading() {
    var h1 = app.querySelector('h1');
    if (!h1) return;
    h1.tabIndex = -1;
    h1.focus({ preventScroll: true });
    document.title = h1.textContent + ' · Lily';
  }

  function route() {
    if (player) {
      player.cleanup();
      player = null;
    }
    document.body.classList.remove('cab-wide');
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
    focusHeading();
  }

  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    if (action === 'reload') location.reload();
    if (action === 'logout') {
      el.disabled = true;
      api('/api/auth/logout', {}).then(function () { location.replace('/login/'); });
    }
  });

  Promise.all([api('/api/me'), api('/api/catalog'), api('/api/progress')]).then(function (r) {
    var me = r[0];
    var cat = r[1];
    var prog = r[2];
    if (me.ok && !me.data.user) return toLogin();
    if (!me.ok || !cat.ok) {
      renderNetworkError();
      focusHeading();
      return;
    }
    state.user = me.data.user;
    state.entitlements = me.data.entitlements || [];
    state.orders = me.data.orders || [];
    state.catalog = cat.data;
    (prog.ok && prog.data.progress || []).forEach(function (p) {
      state.progress[p.videoId] = p;
      state.recent.push(p.videoId);
    });
    window.addEventListener('hashchange', route);
    route();
  });
})();
