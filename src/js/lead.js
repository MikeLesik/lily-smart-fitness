/* ============================================
   LEAD — /free/ и /en/free/: бесплатный урок за email
   Шаг 1: email (+ согласие на письма, Turnstile) → POST /api/leads.
   Шаг 2: код из письма → POST /api/auth/verify-code → кабинет, бесплатная программа.
   Уже вошла: строка и кнопка сразу к уроку.
   Название урока и длительность берутся из GET /api/catalog (категория с free: true).
   Пока каталог не пришёл, все шаги скрыты. Урока нет (comingSoon, нет видео) или каталог
   не загрузился: вместо формы строка «Урок скоро появится» и ссылка на Telegram-канал.
   Язык из <html lang>. Тексты: черновик до согласования с Лилей.
   ============================================ */

(function () {
  'use strict';

  var I18N = {
    ru: {
      sending: 'Отправляем…',
      checking: 'Проверяем…',
      resend: 'Отправить код ещё раз',
      resendIn: 'Новый код через {s} с',
      resent: 'Новый код отправлен.',
      min: '{m} мин',
      videos: '{n} видео',
      watch: 'Смотреть урок',
      account: 'Кабинет',
      errors: {
        invalid_email: 'Проверь email: кажется, в нём опечатка.',
        captcha_failed: 'Не получилось пройти проверку. Обнови страницу и попробуй ещё раз.',
        captcha_wait: 'Секунду, идёт проверка браузера. Нажми ещё раз через пару секунд.',
        rate_limited: 'Слишком много попыток. Попробуй через час.',
        email_failed: 'Не получилось отправить письмо. Попробуй через минуту или напиши Лиле в Telegram.',
        invalid_code: 'Неверный код. Осталось попыток: {n}.',
        invalid_code_format: 'В коде 6 цифр.',
        code_expired: 'Код устарел. Запроси новый.',
        too_many_attempts: 'Слишком много неверных попыток. Запроси новый код.',
        network: 'Нет связи с сервером. Проверь интернет и попробуй ещё раз.',
        server_error: 'Что-то пошло не так. Попробуй ещё раз.'
      }
    },
    en: {
      sending: 'Sending…',
      checking: 'Checking…',
      resend: 'Send a new code',
      resendIn: 'New code in {s} s',
      resent: 'A new code is on its way.',
      min: '{m} min',
      videos: '{n} videos',
      watch: 'Watch the lesson',
      account: 'Account',
      errors: {
        invalid_email: 'Please check your email: it looks like there is a typo.',
        captcha_failed: 'The browser check did not pass. Reload the page and try again.',
        captcha_wait: 'One moment, the browser check is still running. Tap again in a couple of seconds.',
        rate_limited: 'Too many attempts. Please try again in an hour.',
        email_failed: 'We could not send the email. Try again in a minute or message Lily on Telegram.',
        invalid_code: 'Wrong code. Attempts left: {n}.',
        invalid_code_format: 'The code has 6 digits.',
        code_expired: 'This code has expired. Request a new one.',
        too_many_attempts: 'Too many wrong attempts. Request a new code.',
        network: 'No connection to the server. Check your internet and try again.',
        server_error: 'Something went wrong. Please try again.'
      }
    }
  };

  var locale = (document.documentElement.lang || 'ru').toLowerCase().indexOf('en') === 0 ? 'en' : 'ru';
  var t = I18N[locale];
  var BASE = locale === 'en' ? '/en' : '';
  var RESEND_COOLDOWN_SEC = 60;
  var STORAGE_KEY = 'lily_lead';
  var UTM_KEY = 'lily_utm';

  var freeSlug = 'free';
  function lessonUrl() { return BASE + '/account/#/c/' + encodeURIComponent(freeSlug); }

  /* ---------- UTM первого касания (формат как в buy.js) ---------- */

  function storage() { try { return window.localStorage; } catch (e) { return null; } }

  (function captureUtm() {
    var q = new URLSearchParams(window.location.search);
    var found = {};
    ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (k) {
      if (q.get(k)) found[k] = q.get(k).slice(0, 100);
    });
    var s = storage();
    if (Object.keys(found).length && s && !s.getItem(UTM_KEY)) {
      try { s.setItem(UTM_KEY, JSON.stringify(found)); } catch (e) { /* ignore */ }
    }
  })();

  function utm() {
    var s = storage();
    try { return JSON.parse((s && s.getItem(UTM_KEY)) || '{}') || {}; } catch (e) { return {}; }
  }

  /* ---------- элементы ---------- */

  var hero = document.getElementById('lead');
  var steps = {
    email: document.querySelector('[data-lead-step="email"]'),
    code: document.querySelector('[data-lead-step="code"]'),
    member: document.querySelector('[data-lead-step="member"]'),
    soon: document.querySelector('[data-lead-step="soon"]')
  };
  var emailForm = document.getElementById('lead-form');
  var codeForm = document.getElementById('code-form');
  var emailInput = document.getElementById('lead-email');
  var consentInput = document.getElementById('lead-consent');
  var codeInput = document.getElementById('lead-code');
  var resendBtn = document.querySelector('[data-action="resend"]');
  if (!hero || !emailForm || !codeForm) return;

  var state = { email: '', consent: false, sentAt: 0 };
  var current = 'email';
  // Есть ли урок: pending (каталог грузится) | ready | soon. Форма видна только при ready.
  var lesson = 'pending';
  var resendTimer = null;

  /* ---------- helpers ---------- */

  function format(str, vars) {
    return str.replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] != null ? vars[k] : ''; });
  }

  function errorText(data) {
    var code = (data && data.error) || 'server_error';
    var msg = t.errors[code] || t.errors.server_error;
    return format(msg, { n: data && data.attemptsLeft });
  }

  function showError(form, message) {
    var el = form.querySelector('.cab-error');
    el.classList.remove('cab-error--ok');
    el.textContent = message || '';
    el.hidden = !message;
    var input = form.querySelector('.cab-input');
    if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function setBusy(form, busy, busyLabel) {
    var btn = form.querySelector('[type="submit"]');
    if (!btn.dataset.label) btn.dataset.label = btn.textContent;
    btn.disabled = busy;
    btn.textContent = busy ? busyLabel : btn.dataset.label;
  }

  /** Видимый шаг: нужный (current), если урок есть; «скоро», если урока нет; пока каталог грузится, ничего. */
  function paint() {
    var visible = lesson === 'ready' ? current : lesson === 'soon' ? 'soon' : '';
    hero.setAttribute('data-step', visible || 'pending');
    Object.keys(steps).forEach(function (name) {
      if (steps[name]) steps[name].hidden = name !== visible;
    });
    document.querySelectorAll('[data-lead-ready]').forEach(function (el) { el.hidden = lesson !== 'ready'; });
  }

  function show(step, focus) {
    current = step;
    paint();
    document.querySelectorAll('[data-email]').forEach(function (el) {
      el.textContent = state.email;
    });
    if (focus && lesson === 'ready') {
      var target = step === 'email' ? emailInput : step === 'code' ? codeInput : null;
      if (target) target.focus();
    }
  }

  function save() {
    try {
      if (state.email && state.sentAt) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) { /* приватный режим и т.п. */ }
  }

  function restore() {
    try {
      var saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
      // Код живёт 10 минут: старше не восстанавливаем.
      if (saved && saved.email && Date.now() - saved.sentAt < 10 * 60 * 1000) return saved;
    } catch (e) { /* ignore */ }
    return null;
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

  function minutes(sec) {
    return format(t.min, { m: Math.max(1, Math.round((sec || 0) / 60)) });
  }

  /* ---------- Turnstile (как в login.js) ---------- */

  var turnstile = { siteKey: null, widgetId: null, token: null, waiters: [] };

  function loadTurnstile(siteKey) {
    turnstile.siteKey = siteKey;
    window.onLilyTurnstileLoad = function () {
      turnstile.widgetId = window.turnstile.render('#turnstile', {
        sitekey: siteKey,
        appearance: 'interaction-only',
        size: 'flexible',
        language: locale,
        callback: function (token) {
          turnstile.token = token;
          turnstile.waiters.splice(0).forEach(function (fn) { fn(token); });
        },
        'expired-callback': function () { turnstile.token = null; },
        'error-callback': function () { turnstile.token = null; }
      });
    };
    var s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onLilyTurnstileLoad';
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }

  /** Токен Turnstile (одноразовый). Без настроенного Turnstile отдаёт пустую строку. */
  function takeTurnstileToken() {
    if (!turnstile.siteKey) return Promise.resolve('');
    if (turnstile.token) {
      var token = turnstile.token;
      turnstile.token = null;
      return Promise.resolve(token);
    }
    return new Promise(function (resolve) {
      var timer = setTimeout(function () { resolve(null); }, 15000);
      turnstile.waiters.push(function (tok) {
        clearTimeout(timer);
        turnstile.token = null;
        resolve(tok);
      });
    });
  }

  function resetTurnstile() {
    if (turnstile.widgetId !== null && window.turnstile) window.turnstile.reset(turnstile.widgetId);
  }

  /* ---------- каталог: название урока, видео, длительность ---------- */

  function setText(selector, text) {
    document.querySelectorAll(selector).forEach(function (el) { el.textContent = text; });
  }

  function renderVideos(videos) {
    var list = document.querySelector('[data-free="videos"]');
    if (!list) return;
    list.textContent = '';
    videos.forEach(function (v) {
      var li = document.createElement('li');
      li.className = 'cab-video';
      var body = document.createElement('span');
      body.className = 'cab-video-body';
      var title = document.createElement('span');
      title.className = 'cab-video-title';
      title.textContent = (v.title && v.title[locale]) || '';
      var meta = document.createElement('span');
      meta.className = 'cab-video-meta';
      meta.textContent = minutes(v.durationSec);
      body.appendChild(title);
      body.appendChild(meta);
      var desc = v.description && v.description[locale];
      if (desc) {
        var d = document.createElement('span');
        d.className = 'lead-video-desc';
        d.textContent = desc;
        body.appendChild(d);
      }
      li.appendChild(body);
      list.appendChild(li);
    });
  }

  function setLesson(value) {
    lesson = value;
    paint();
  }

  function applyCatalog(data) {
    var cats = (data && data.categories) || [];
    var free = null;
    for (var i = 0; i < cats.length; i++) {
      if (cats[i].free) { free = cats[i]; break; }
    }
    var videos = free ? (free.videos || []).filter(function (v) { return !v.preview; }) : [];
    if (!free || free.comingSoon || !videos.length) return setLesson('soon');
    freeSlug = free.slug || freeSlug;
    var total = videos.reduce(function (s, v) { return s + (v.durationSec || 0); }, 0);

    if (free.title && free.title[locale]) setText('[data-free="title"]', free.title[locale]);
    setText('[data-free="video"]', videos.length === 1
      ? (videos[0].title && videos[0].title[locale]) || ''
      : format(t.videos, { n: videos.length }));
    setText('[data-free="time"]', minutes(total));
    renderVideos(videos);
    updateLessonLinks();
    setLesson('ready');
  }

  /* ---------- уже вошла ---------- */

  function updateLessonLinks() {
    document.querySelectorAll('[data-lesson-link]').forEach(function (a) { a.href = lessonUrl(); });
    if (current !== 'member') return;
    document.querySelectorAll('[data-lead-jump]').forEach(function (a) {
      a.href = lessonUrl();
      a.textContent = t.watch;
    });
  }

  function showMember(email) {
    clearInterval(resendTimer);
    state = { email: email || '', consent: false, sentAt: 0 };
    save();
    show('member');
    updateLessonLinks();
    // Уже вошла: объяснять, как получить урок, не нужно
    document.querySelectorAll('[data-lead-guest]').forEach(function (el) { el.hidden = true; });
    // «Войти» в шапке ведёт в кабинет
    var login = document.querySelector('[data-nav-login]');
    if (login) {
      login.href = BASE + '/account/';
      login.textContent = t.account;
    }
  }

  /* ---------- шаг 1: email ---------- */

  function requestCode(email, consent) {
    return takeTurnstileToken().then(function (token) {
      if (token === null) return { ok: false, data: { error: 'captcha_wait' } };
      return api('/api/leads', {
        email: email,
        consent: consent,
        turnstileToken: token,
        utm: utm(),
        locale: locale
      });
    }).then(function (res) {
      resetTurnstile();
      return res;
    });
  }

  function startResendCountdown() {
    clearInterval(resendTimer);
    function tick() {
      var left = Math.ceil((state.sentAt + RESEND_COOLDOWN_SEC * 1000 - Date.now()) / 1000);
      if (left > 0) {
        resendBtn.disabled = true;
        resendBtn.textContent = format(t.resendIn, { s: left });
      } else {
        clearInterval(resendTimer);
        resendBtn.disabled = false;
        resendBtn.textContent = t.resend;
      }
    }
    tick();
    resendTimer = setInterval(tick, 1000);
  }

  function codeSent(email, consent) {
    if (window.track) {
      window.track('lead_submit', { slug: 'free' });
      window.track('login_code_sent');
    }
    state = { email: email, consent: consent, sentAt: Date.now() };
    save();
    codeInput.value = '';
    showError(codeForm, '');
    show('code', true);
    startResendCountdown();
  }

  emailForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = emailInput.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      showError(emailForm, t.errors.invalid_email);
      emailInput.focus();
      return;
    }
    var consent = !!(consentInput && consentInput.checked);
    showError(emailForm, '');
    setBusy(emailForm, true, t.sending);
    requestCode(email, consent).then(function (res) {
      setBusy(emailForm, false);
      if (res.ok) {
        codeSent(email.toLowerCase(), consent);
      } else {
        showError(emailForm, errorText(res.data));
      }
    });
  });

  /* ---------- шаг 2: код ---------- */

  function submitCode() {
    var code = codeInput.value.replace(/\D/g, '');
    if (code.length !== 6) {
      showError(codeForm, t.errors.invalid_code_format);
      return;
    }
    showError(codeForm, '');
    setBusy(codeForm, true, t.checking);
    api('/api/auth/verify-code', { email: state.email, code: code, locale: locale }).then(function (res) {
      if (res.ok) {
        state = { email: '', consent: false, sentAt: 0 };
        save();
        if (window.track) window.track('login_success', { slug: 'free' });
        window.location.assign(lessonUrl());
        return;
      }
      setBusy(codeForm, false);
      showError(codeForm, errorText(res.data));
      codeInput.select();
    });
  }

  codeForm.addEventListener('submit', function (e) {
    e.preventDefault();
    submitCode();
  });

  // Только цифры; 6 цифр (ввод, вставка, автоподстановка из почты) отправляются сразу.
  codeInput.addEventListener('input', function () {
    var digits = codeInput.value.replace(/\D/g, '').slice(0, 6);
    if (codeInput.value !== digits) codeInput.value = digits;
    if (digits.length === 6 && !codeForm.querySelector('[type="submit"]').disabled) submitCode();
  });

  resendBtn.addEventListener('click', function () {
    resendBtn.disabled = true;
    showError(codeForm, '');
    requestCode(state.email, state.consent).then(function (res) {
      if (res.ok) {
        state.sentAt = Date.now();
        save();
        startResendCountdown();
        var note = codeForm.querySelector('.cab-error');
        note.textContent = t.resent;
        note.classList.add('cab-error--ok');
        note.hidden = false;
        codeInput.setAttribute('aria-invalid', 'false');
      } else {
        resendBtn.disabled = false;
        showError(codeForm, errorText(res.data));
      }
    });
  });

  document.querySelector('[data-action="change-email"]').addEventListener('click', function () {
    clearInterval(resendTimer);
    emailInput.value = state.email;
    if (consentInput) consentInput.checked = !!state.consent;
    state = { email: '', consent: false, sentAt: 0 };
    save();
    showError(emailForm, '');
    show('email', true);
  });

  /* ---------- «Получить урок» ниже первого экрана ---------- */

  document.querySelectorAll('[data-lead-jump]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (current === 'member') return; // ссылка уже ведёт в кабинет
      e.preventDefault();
      hero.scrollIntoView({ block: 'start' });
      var target = current === 'code' ? codeInput : emailInput;
      target.focus({ preventScroll: true });
    });
  });

  /* ---------- старт ---------- */

  api('/api/auth/config').then(function (res) {
    if (res.ok && res.data && res.data.turnstileSiteKey) loadTurnstile(res.data.turnstileSiteKey);
  });

  api('/api/catalog').then(function (res) {
    // Каталог не пришёл: форму не показываем (урока может не быть), остаётся «скоро» и канал
    if (res.ok) applyCatalog(res.data);
    else setLesson('soon');
  });

  var saved = restore();
  if (saved) {
    state = saved;
    show('code');
    startResendCountdown();
  }

  api('/api/me').then(function (res) {
    if (res.ok && res.data && res.data.user) showMember(res.data.user.email);
  });
})();
