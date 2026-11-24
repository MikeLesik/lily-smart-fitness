/* ============================================
   LOGIN — вход по email и коду из письма
   API: /api/auth/config, /api/auth/request-code,
        /api/auth/verify-code, /api/me. Выход живёт в кабинете.
   ============================================ */

(function () {
  'use strict';

  // Тексты: черновик до согласования с Лилей. Язык берётся из <html lang>.
  var I18N = {
    ru: {
      help: 'Помощь',
      emailTitle: 'Вход в кабинет',
      emailText: 'Введи email, который указывала при покупке. Пришлём код, пароль не нужен.',
      emailLabel: 'Email',
      emailSubmit: 'Получить код',
      sending: 'Отправляем…',
      codeTitle: 'Код из письма',
      codeSentTo: 'Мы отправили код на',
      codeSpam: 'Если письма нет, проверь «Спам» и «Промоакции».',
      codeLabel: 'Код из 6 цифр',
      codeSubmit: 'Войти',
      checking: 'Проверяем…',
      resend: 'Отправить код ещё раз',
      resendIn: 'Новый код через {s} с',
      resent: 'Новый код отправлен.',
      changeEmail: 'Другой email',
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
      help: 'Help',
      emailTitle: 'Sign in to your account',
      emailText: 'Enter the email you used at checkout. We will send you a code, no password needed.',
      emailLabel: 'Email',
      emailSubmit: 'Get a code',
      sending: 'Sending…',
      codeTitle: 'Enter the code',
      codeSentTo: 'We sent a code to',
      codeSpam: 'No email? Check your Spam and Promotions folders.',
      codeLabel: '6-digit code',
      codeSubmit: 'Sign in',
      checking: 'Checking…',
      resend: 'Send a new code',
      resendIn: 'New code in {s} s',
      resent: 'A new code is on its way.',
      changeEmail: 'Different email',
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
  // EN-страницы живут под /en/: кабинет и вход в своей языковой ветке
  var BASE = locale === 'en' ? '/en' : '';
  var RESEND_COOLDOWN_SEC = 60;
  var STORAGE_KEY = 'lily_login';

  var steps = {
    email: document.querySelector('[data-step="email"]'),
    code: document.querySelector('[data-step="code"]')
  };
  var emailForm = document.getElementById('email-form');
  var codeForm = document.getElementById('code-form');
  var emailInput = document.getElementById('email');
  var codeInput = document.getElementById('code');
  var resendBtn = document.querySelector('[data-action="resend"]');

  var state = { email: '', sentAt: 0 };
  var resendTimer = null;

  /* ---------- helpers ---------- */

  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (typeof t[key] === 'string') el.textContent = t[key];
    });
  }

  function format(str, vars) {
    return str.replace(/\{(\w+)\}/g, function (_, k) { return vars && k in vars ? vars[k] : ''; });
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

  function show(step) {
    Object.keys(steps).forEach(function (name) {
      steps[name].hidden = name !== step;
    });
    document.querySelectorAll('[data-email]').forEach(function (el) {
      el.textContent = state.email;
    });
    var focusTarget = step === 'email' ? emailInput : step === 'code' ? codeInput : null;
    if (focusTarget) focusTarget.focus();
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

  /**
   * Куда вести после входа: ?next= (только пути этого сайта) или кабинет.
   * Строку разбираем как URL и сверяем origin: «/\evil.com» браузер читает как «//evil.com».
   */
  function nextUrl() {
    var fallback = BASE + '/account/';
    var next = new URLSearchParams(window.location.search).get('next');
    if (!next || next.charAt(0) !== '/') return fallback;
    try {
      var url = new URL(next, window.location.origin);
      if (url.origin !== window.location.origin) return fallback;
      return url.pathname + url.search + url.hash;
    } catch (e) {
      return fallback;
    }
  }

  /* ---------- Turnstile ---------- */

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

  /* ---------- flows ---------- */

  function requestCode(email) {
    return takeTurnstileToken().then(function (token) {
      if (token === null) return { ok: false, data: { error: 'captcha_wait' } };
      return api('/api/auth/request-code', { email: email, turnstileToken: token, locale: locale });
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

  function codeSent(email) {
    state.email = email;
    state.sentAt = Date.now();
    save();
    codeInput.value = '';
    showError(codeForm, '');
    show('code');
    startResendCountdown();
  }

  function loggedIn() {
    state = { email: '', sentAt: 0 };
    save();
    window.location.assign(nextUrl());
  }

  emailForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = emailInput.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      showError(emailForm, t.errors.invalid_email);
      emailInput.focus();
      return;
    }
    showError(emailForm, '');
    setBusy(emailForm, true, t.sending);
    requestCode(email).then(function (res) {
      setBusy(emailForm, false);
      if (res.ok) {
        codeSent(email.toLowerCase());
      } else {
        showError(emailForm, errorText(res.data));
      }
    });
  });

  function submitCode() {
    var code = codeInput.value.replace(/\D/g, '');
    if (code.length !== 6) {
      showError(codeForm, t.errors.invalid_code_format);
      return;
    }
    showError(codeForm, '');
    setBusy(codeForm, true, t.checking);
    api('/api/auth/verify-code', { email: state.email, code: code, locale: locale }).then(function (res) {
      setBusy(codeForm, false);
      if (res.ok) {
        loggedIn();
        return;
      }
      showError(codeForm, errorText(res.data));
      codeInput.select();
    });
  }

  codeForm.addEventListener('submit', function (e) {
    e.preventDefault();
    submitCode();
  });

  // Только цифры; 6 цифр (ввод, вставка, автоподстановка из SMS/почты) отправляются сразу.
  codeInput.addEventListener('input', function () {
    var digits = codeInput.value.replace(/\D/g, '').slice(0, 6);
    if (codeInput.value !== digits) codeInput.value = digits;
    if (digits.length === 6 && !codeForm.querySelector('[type="submit"]').disabled) submitCode();
  });

  resendBtn.addEventListener('click', function () {
    resendBtn.disabled = true;
    showError(codeForm, '');
    requestCode(state.email).then(function (res) {
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
    state = { email: '', sentAt: 0 };
    save();
    showError(emailForm, '');
    show('email');
  });

  /* ---------- init ---------- */

  applyI18n();

  api('/api/auth/config').then(function (res) {
    if (res.ok && res.data.turnstileSiteKey) loadTurnstile(res.data.turnstileSiteKey);
  });

  api('/api/me').then(function (res) {
    if (res.ok && res.data.user) {
      window.location.replace(nextUrl());
      return;
    }
    var saved = restore();
    if (saved) {
      state = saved;
      show('code');
      startResendCountdown();
    } else {
      show('email');
    }
  });
})();
