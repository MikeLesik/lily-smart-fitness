/* ============================================
   ANALYTICS — события в PostHog через /api/events
   Без скрипта PostHog и без cookie: сервер сам считает
   анонимный id (хеш IP + браузер, меняется каждый день).
   window.track(event, props) отправляет только события из плана:
   page_view, lead_submit, login_code_sent, login_success,
   preview_play, checkout_start, video_start, video_complete.
   purchase отправляет сервер из вебхука Stripe.
   ============================================ */

(function () {
  'use strict';

  var ALLOWED = ['page_view', 'lead_submit', 'login_code_sent', 'login_success', 'preview_play', 'checkout_start', 'video_start', 'video_complete'];
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'];
  var STORE_KEY = 'lily_utm';

  function storage() { try { return window.localStorage; } catch (e) { return null; } }

  // UTM этого визита; первое касание запоминаем (его же шлют buy.js и lead.js в заказ и лид)
  var visit = {};
  var q = new URLSearchParams(location.search);
  UTM_KEYS.forEach(function (k) { var v = q.get(k); if (v) visit[k] = v.slice(0, 100); });
  var s = storage();
  if (Object.keys(visit).length && s && !s.getItem(STORE_KEY)) {
    try { s.setItem(STORE_KEY, JSON.stringify(visit)); } catch (e) { /* ignore */ }
  }
  function firstTouch() {
    try { return JSON.parse((s && s.getItem(STORE_KEY)) || '{}') || {}; } catch (e) { return {}; }
  }

  var locale = (document.documentElement.lang || 'ru').toLowerCase().indexOf('en') === 0 ? 'en' : 'ru';

  function send(event, props) {
    if (ALLOWED.indexOf(event) === -1) return;
    var utm = Object.keys(visit).length ? visit : firstTouch();
    var data = { path: location.pathname, locale: locale };
    UTM_KEYS.forEach(function (k) { if (utm[k]) data[k] = utm[k]; });
    Object.keys(props || {}).forEach(function (k) { if (props[k] != null) data[k] = props[k]; });
    var body = JSON.stringify({ event: event, props: data });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }))) return;
    } catch (e) { /* fallback ниже */ }
    try {
      fetch('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: body, keepalive: true, credentials: 'same-origin' })
        .catch(function () { /* ignore */ });
    } catch (e) { /* ignore */ }
  }

  window.track = send;
  send('page_view', { referrer: document.referrer || undefined });
})();
