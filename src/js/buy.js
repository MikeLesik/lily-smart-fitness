/* ============================================
   BUY — покупка программы через Stripe Checkout.
   Любой элемент с data-buy="<scope>" открывает покупку:
   вошедшая сразу уходит в Stripe, гость вводит email.
   POST /api/checkout → { url } → переход на страницу оплаты.
   Тексты: черновик до согласования с Лилей.
   ============================================ */

(function () {
  'use strict';

  var lang = (document.documentElement.lang || 'ru').toLowerCase().indexOf('en') === 0 ? 'en' : 'ru';
  var T = {
    ru: {
      title: 'Оплата: «{title}»',
      titleShort: 'Оплата программы',
      text: 'Укажи email: на него откроется доступ, и придёт письмо со входом в кабинет.',
      email: 'Email',
      pay: 'Перейти к оплате · {price}',
      payShort: 'Перейти к оплате',
      sending: 'Открываем оплату…',
      note: 'Оплата через Stripe: карта, Apple Pay или Google Pay. Промокод можно ввести на странице оплаты.',
      close: 'Закрыть',
      account: 'Открыть кабинет',
      errors: {
        invalid_email: 'Проверь email: кажется, в нём опечатка.',
        already_owned: 'Эта программа уже есть в твоём кабинете.',
        rate_limited: 'Слишком много попыток. Попробуй через час.',
        payments_unavailable: 'Оплата временно недоступна. Напиши Лиле в Telegram: @LilyLesik.',
        stripe_error: 'Не получилось открыть оплату. Попробуй ещё раз через минуту.',
        invalid_scope: 'Эта программа сейчас не продаётся.',
        coming_soon: 'Программа скоро появится.',
        network: 'Нет связи. Проверь интернет и попробуй ещё раз.'
      }
    },
    en: {
      title: 'Buy “{title}”',
      titleShort: 'Buy a program',
      text: 'Enter your email. Your access is linked to it, and we will email you a sign-in link.',
      email: 'Email',
      pay: 'Continue to payment · {price}',
      payShort: 'Continue to payment',
      sending: 'Opening payment…',
      note: 'Payment via Stripe: card, Apple Pay or Google Pay. You can enter a promo code on the payment page.',
      close: 'Close',
      account: 'Open my account',
      errors: {
        invalid_email: 'Please check your email address.',
        already_owned: 'This program is already in your account.',
        rate_limited: 'Too many attempts. Please try again in an hour.',
        payments_unavailable: 'Payment is temporarily unavailable. Message Lily on Telegram: @LilyLesik.',
        stripe_error: 'Could not open the payment page. Please try again in a minute.',
        invalid_scope: 'This program is not on sale right now.',
        coming_soon: 'This program is coming soon.',
        network: 'No connection. Check your internet and try again.'
      }
    }
  }[lang];

  /* ---------- UTM: первое касание (этап 6 расширит) ---------- */
  var UTM_KEY = 'lily_utm';
  function storage() { try { return window.localStorage; } catch (e) { return null; } }
  (function captureUtm() {
    var q = new URLSearchParams(location.search);
    var utm = {};
    ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (k) { if (q.get(k)) utm[k] = q.get(k).slice(0, 100); });
    var s = storage();
    if (Object.keys(utm).length && s && !s.getItem(UTM_KEY)) {
      try { s.setItem(UTM_KEY, JSON.stringify(utm)); } catch (e) { /* ignore */ }
    }
  })();
  function utm() {
    var s = storage();
    try { return JSON.parse((s && s.getItem(UTM_KEY)) || '{}'); } catch (e) { return {}; }
  }

  /* ---------- helpers ---------- */
  function fmt(str, vars) {
    return str.replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] != null ? vars[k] : ''; });
  }

  function formatPrice(p) {
    if (!p) return '';
    var v = p.amount / 100;
    var num = v % 1 === 0 ? String(v) : v.toFixed(2).replace('.', lang === 'en' ? '.' : ',');
    var sym = { eur: '€', usd: '$' }[(p.currency || '').toLowerCase()];
    return sym ? sym + num : num + ' ' + (p.currency || '').toUpperCase();
  }

  var mePromise = null;
  function getMe() {
    if (!mePromise) {
      mePromise = fetch('/api/me', { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .catch(function () { return { user: null }; });
    }
    return mePromise;
  }

  var catalogPromise = null;
  /** Название, цена и «скоро» (comingSoon: видео ещё нет) по scope из /api/catalog. */
  function getInfo(scope) {
    if (!catalogPromise) {
      catalogPromise = fetch('/api/catalog').then(function (r) { return r.json(); }).catch(function () { return null; });
    }
    return catalogPromise.then(function (cat) {
      if (!cat) return {};
      var item = (cat.categories || []).concat(cat.bundles || []).find(function (c) { return c.slug === scope; });
      return item ? { title: item.title[lang] || item.title.ru, price: formatPrice(item.price), comingSoon: !!item.comingSoon } : {};
    });
  }

  function checkout(scope, email) {
    return fetch('/api/checkout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scope: scope, email: email || undefined, utm: utm(), locale: lang })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, data: data }; });
    }, function () {
      return { ok: false, data: { error: 'network' } };
    });
  }

  /* ---------- окно ---------- */
  var dialog = null;
  var current = null; // { scope, info, loggedIn }

  function build() {
    dialog = document.createElement('dialog');
    dialog.className = 'buy-dialog';
    dialog.setAttribute('aria-labelledby', 'buy-title');
    dialog.innerHTML =
      '<form class="buy-inner" method="dialog" novalidate>' +
        '<button type="button" class="buy-close" data-buy-close aria-label="' + t('close') + '">×</button>' +
        '<h2 class="buy-title" id="buy-title"></h2>' +
        '<p class="buy-text"></p>' +
        '<div data-buy-email>' +
          '<label class="buy-label" for="buy-email">' + t('email') + '</label>' +
          '<input class="buy-input" id="buy-email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" aria-describedby="buy-error" required>' +
        '</div>' +
        '<p class="buy-error" id="buy-error" role="alert" hidden></p>' +
        '<button type="submit" class="btn-primary buy-submit"></button>' +
        '<p class="buy-note"></p>' +
      '</form>';
    document.body.appendChild(dialog);
    dialog.querySelector('[data-buy-close]').addEventListener('click', close);
    dialog.addEventListener('click', function (e) { if (e.target === dialog) close(); });
    dialog.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      submit();
    });
  }

  function t(key) { return T[key]; }

  function q(sel) { return dialog.querySelector(sel); }

  function showError(code) {
    var el = q('.buy-error');
    // «Скоро»: оплатить нечего, поле email и кнопку оплаты прячем, остаётся строка и «Закрыть»
    var soon = code === 'coming_soon';
    q('[data-buy-email]').hidden = soon || current.loggedIn;
    q('.buy-text').hidden = soon || current.loggedIn;
    q('.buy-submit').style.display = soon ? 'none' : ''; // у .btn-primary свой display, hidden не сработает
    q('.buy-note').hidden = soon;
    if (!code) { el.hidden = true; el.textContent = ''; return; }
    el.textContent = T.errors[code] || T.errors.stripe_error;
    if (code === 'already_owned') {
      el.appendChild(document.createTextNode(' '));
      var a = document.createElement('a');
      a.href = (lang === 'en' ? '/en' : '') + '/account/';
      a.textContent = T.account;
      el.appendChild(a);
    }
    el.hidden = false;
  }

  function setBusy(busy) {
    var btn = q('.buy-submit');
    btn.disabled = busy;
    btn.textContent = busy ? T.sending : (current.info.price ? fmt(T.pay, { price: current.info.price }) : T.payShort);
  }

  function open(scope, info, opts) {
    if (!dialog) build();
    current = { scope: scope, info: info || {}, loggedIn: !!(opts && opts.loggedIn) };
    q('.buy-title').textContent = current.info.title ? fmt(T.title, { title: current.info.title }) : T.titleShort;
    q('.buy-text').textContent = T.text;
    q('.buy-note').textContent = T.note;
    showError(opts && opts.error);
    setBusy(false);
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    if (!q('[data-buy-email]').hidden) q('#buy-email').focus();
  }

  function close() {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }

  function submit() {
    var email = current.loggedIn ? '' : q('#buy-email').value.trim();
    if (!current.loggedIn && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      showError('invalid_email');
      q('#buy-email').focus();
      return;
    }
    showError(null);
    setBusy(true);
    checkout(current.scope, email).then(function (res) {
      if (res.ok && res.data.url) {
        if (window.track) window.track('checkout_start', { slug: current.scope });
        window.location.assign(res.data.url);
        return;
      }
      setBusy(false);
      showError(res.data.error || 'stripe_error');
    });
  }

  /** Покупка: вошедшая сразу в Stripe, гость через окно с email. «Скоро»: окно сразу с этой строкой, без email. */
  function start(scope, info) {
    Promise.all([getMe(), getInfo(scope)]).then(function (r) {
      var me = r[0];
      var fromCatalog = r[1] || {};
      var data = info && info.title ? info : fromCatalog;
      if (fromCatalog.comingSoon) {
        open(scope, data, { loggedIn: !!(me && me.user), error: 'coming_soon' });
        return;
      }
      if (me && me.user) {
        checkout(scope).then(function (res) {
          if (res.ok && res.data.url) {
            if (window.track) window.track('checkout_start', { slug: scope });
            window.location.assign(res.data.url);
            return;
          }
          open(scope, data, { loggedIn: true, error: res.data.error || 'stripe_error' });
        });
        return;
      }
      open(scope, data);
    });
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-buy]');
    if (!el) return;
    e.preventDefault();
    if (el.getAttribute('aria-busy') === 'true') return;
    el.setAttribute('aria-busy', 'true');
    setTimeout(function () { el.removeAttribute('aria-busy'); }, 1500);
    start(el.getAttribute('data-buy'), {
      title: el.getAttribute('data-buy-title') || '',
      price: el.getAttribute('data-buy-price') || ''
    });
  });

  /* «Войти» в шапке светлых страниц ведёт в кабинет, если уже вошла */
  (function navLogin() {
    var links = document.querySelectorAll('[data-nav-login]');
    if (!links.length) return;
    getMe().then(function (me) {
      if (!me || !me.user) return;
      links.forEach(function (a) {
        a.href = (lang === 'en' ? '/en' : '') + '/account/';
        a.textContent = lang === 'en' ? 'Account' : 'Кабинет';
      });
    });
  })();

  window.LilyBuy = { start: start };
})();
