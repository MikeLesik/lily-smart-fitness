/* ============================================
   MAIN JS: главная lily.coach (RU и EN)
   Шапка при прокрутке, мобильное меню, FAQ, появление блоков,
   липкая кнопка, плавные якоря, счётчики, ленты со scroll-snap,
   обёртка аналитики window.track, витрина программ из /api/catalog
   ============================================ */

(function () {
  'use strict';

  var html = document.documentElement;
  var locale = (html.lang || 'ru').toLowerCase().indexOf('en') === 0 ? 'en' : 'ru';
  var prefix = locale === 'en' ? '/en' : '';

  /* -----------------------------------------
     1. Шапка: фон после 80 px прокрутки
     ----------------------------------------- */
  var nav = document.querySelector('.nav');
  var hero = document.querySelector('.hero');

  function handleNavScroll() {
    if (!nav) return;
    nav.classList.toggle('scrolled', window.scrollY > 80);
  }

  /* -----------------------------------------
     2. Мобильное меню: aria-expanded, Esc, фокус
     ----------------------------------------- */
  var burger = document.querySelector('.burger');
  var overlay = document.querySelector('.mobile-overlay');

  function setMobileMenu(isOpen, opts) {
    if (!burger || !overlay) return;
    burger.classList.toggle('open', isOpen);
    overlay.classList.toggle('open', isOpen);
    if (nav) nav.classList.toggle('menu-open', isOpen);
    burger.setAttribute('aria-expanded', String(isOpen));
    overlay.setAttribute('aria-hidden', String(!isOpen));
    document.body.style.overflow = isOpen ? 'hidden' : '';
    handleStickyCta();
    if (isOpen && opts && opts.focusFirst) {
      // Оверлей становится видимым с переходом: фокус чуть позже
      setTimeout(function () {
        var first = overlay.querySelector('a');
        if (first) first.focus();
      }, 60);
    }
  }

  function closeMobileMenu() {
    setMobileMenu(false);
  }

  if (burger) {
    burger.addEventListener('click', function (e) {
      // С клавиатуры (detail === 0) фокус сразу на первый пункт
      setMobileMenu(!burger.classList.contains('open'), { focusFirst: e.detail === 0 });
    });
  }

  if (overlay) {
    overlay.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeMobileMenu);
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && burger && burger.classList.contains('open')) {
      closeMobileMenu();
      burger.focus();
    }
  });

  // Меню только для телефона: при переходе на десктоп закрываем
  window.addEventListener('resize', function () {
    if (window.innerWidth >= 1024 && burger && burger.classList.contains('open')) closeMobileMenu();
  }, { passive: true });

  /* -----------------------------------------
     3. FAQ: открыт один вопрос
     ----------------------------------------- */
  var faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(function (item) {
    var question = item.querySelector('.faq-question');
    if (!question) return;

    question.addEventListener('click', function () {
      var isActive = item.classList.contains('active');
      faqItems.forEach(function (other) {
        other.classList.remove('active');
        var btn = other.querySelector('.faq-question');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      });
      if (!isActive) {
        item.classList.add('active');
        question.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* -----------------------------------------
     4. Появление блоков (IntersectionObserver)
     ----------------------------------------- */
  var revealObserver = null;

  if ('IntersectionObserver' in window) {
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  }

  function observeReveal(root) {
    (root || document).querySelectorAll('.reveal:not(.visible)').forEach(function (el) {
      if (revealObserver) revealObserver.observe(el);
      else el.classList.add('visible');
    });
  }

  observeReveal();

  /* -----------------------------------------
     5. Липкая кнопка (телефон): после первого экрана,
        прячется, пока открыто меню
     ----------------------------------------- */
  var stickyCta = document.querySelector('.sticky-cta');

  function handleStickyCta() {
    if (!stickyCta || !hero) return;
    var heroBottom = hero.offsetTop + hero.offsetHeight;
    var isMenuOpen = burger && burger.classList.contains('open');
    var isVisible = window.scrollY > heroBottom - 80 && !isMenuOpen;
    stickyCta.classList.toggle('visible', isVisible);
    stickyCta.setAttribute('aria-hidden', String(!isVisible));
    stickyCta.inert = !isVisible;
  }

  /* -----------------------------------------
     6. Плавная прокрутка к якорям с учётом шапки
     ----------------------------------------- */
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('a[href^="#"]');
    if (!link) return;
    var targetId = link.getAttribute('href');
    if (targetId === '#') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    var target = document.getElementById(targetId.slice(1));
    if (!target) return;
    e.preventDefault();
    var navHeight = nav ? nav.offsetHeight : 0;
    var top = target.getBoundingClientRect().top + window.pageYOffset - navHeight;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    if (history.replaceState) history.replaceState(null, '', targetId);
  });

  /* -----------------------------------------
     7. Счётчики (5+, 360+)
     ----------------------------------------- */
  var countEls = document.querySelectorAll('.count-up');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function animateCount(el) {
    var target = parseInt(el.getAttribute('data-target'), 10);
    var duration = 1600;
    var start = null;

    function step(timestamp) {
      if (!start) start = timestamp;
      var progress = Math.min((timestamp - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.floor(eased * target);
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = target;
    }

    requestAnimationFrame(step);
  }

  if ('IntersectionObserver' in window && countEls.length && !reduceMotion) {
    var countObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          countObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    countEls.forEach(function (el) {
      // Без JS и до прокрутки в разметке стоит итоговое число
      el.textContent = '0';
      countObserver.observe(el);
    });
  }

  /* -----------------------------------------
     8. Ленты: мягкий край справа, пока есть что листать
     ----------------------------------------- */
  var peekUpdaters = [];

  document.querySelectorAll('.scroll-peek').forEach(function (wrapper) {
    var scroller = wrapper.querySelector('.horizontal-scroll');
    if (!scroller) return;

    function updatePeek() {
      var hasOverflow = scroller.scrollWidth > scroller.clientWidth + 1;
      var atEnd = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 5;
      wrapper.classList.toggle('has-overflow', hasOverflow && !atEnd);
      wrapper.classList.toggle('scrolled-end', atEnd);
    }

    scroller.addEventListener('scroll', updatePeek, { passive: true });
    peekUpdaters.push(updatePeek);
    updatePeek();
  });

  window.addEventListener('resize', function () {
    peekUpdaters.forEach(function (fn) { fn(); });
  }, { passive: true });

  /* -----------------------------------------
     9. Аналитика: обёртка
     -----------------------------------------
     Если подключат PostHog/Метрику, переопределить window.track.
     Пока пишем в dataLayer (если есть) и console.debug.
  */
  if (typeof window.track !== 'function') {
    window.track = function (event, payload) {
      try {
        if (Array.isArray(window.dataLayer)) {
          window.dataLayer.push(Object.assign({ event: event }, payload || {}));
        }
        if (window.console && console.debug) {
          console.debug('[track]', event, payload || {});
        }
      } catch (e) {
        /* no-op */
      }
    };
  }

  // Делегированный клик по элементам с data-analytics
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-analytics]');
    if (!el) return;
    var payload = {};
    Array.prototype.forEach.call(el.attributes, function (attr) {
      if (attr.name.indexOf('data-analytics-') === 0) {
        payload[attr.name.replace('data-analytics-', '')] = attr.value;
      }
    });
    window.track(el.getAttribute('data-analytics'), payload);
  });

  /* -----------------------------------------
     10. Программы: карточки из /api/catalog
     -----------------------------------------
     Контейнер: <div class="programs-list" data-programs data-locale="ru|en">.
     Бесплатная категория здесь не продаётся (у неё свой блок).
     «Купить» с data-buy открывает покупку (js/buy.js).
     Цена «от» в первом экране и липкой кнопке: [data-min-price].
  */
  var T = {
    ru: {
      buy: 'Купить',
      bundleMeta: function (n) { return n + ' ' + plural(n, ['программа', 'программы', 'программ']) + ' и все новые'; },
      bundleSubtitle: function (sum) { return 'Одна оплата вместо ' + sum + ', доступ навсегда'; },
      meta: function (n, min) { return n + ' ' + plural(n, ['тренировка', 'тренировки', 'тренировок']) + ' · ' + min + ' мин'; }
    },
    en: {
      buy: 'Buy',
      bundleMeta: function (n) { return n + ' ' + (n === 1 ? 'program' : 'programs') + ' and all new ones'; },
      bundleSubtitle: function (sum) { return 'One payment instead of ' + sum + ', lifetime access'; },
      meta: function (n, min) { return n + ' ' + (n === 1 ? 'workout' : 'workouts') + ' · ' + min + ' min'; }
    }
  }[locale];

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatPrice(p) {
    if (!p) return '';
    var v = p.amount / 100;
    var sym = { eur: '€', usd: '$' }[(p.currency || '').toLowerCase()];
    var num = v % 1 === 0 ? String(v) : v.toFixed(2);
    return sym ? sym + num : num + ' ' + String(p.currency || '').toUpperCase();
  }

  function plural(n, forms) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return forms[0];
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1];
    return forms[2];
  }

  function L(o) {
    return o ? (o[locale] || o.ru || '') : '';
  }

  function coverHtml(cover) {
    if (!cover) return '';
    var webp = /\.jpe?g$/i.test(cover) ? cover.replace(/\.jpe?g$/i, '.webp') : '';
    return '<div class="program-card-cover"><picture>' +
      (webp ? '<source srcset="' + escapeHtml(webp) + '" type="image/webp">' : '') +
      '<img src="' + escapeHtml(cover) + '" alt="" width="480" height="600" loading="lazy" decoding="async">' +
      '</picture></div>';
  }

  function programCard(item, opts) {
    var title = L(item.title);
    var price = formatPrice(item.price);
    var href = opts.href;
    var meta, subtitle;

    if (opts.bundle) {
      meta = T.bundleMeta(opts.count);
      subtitle = opts.sum ? T.bundleSubtitle(opts.sum) : '';
    } else {
      var mains = (item.videos || []).filter(function (v) { return !v.preview; });
      var seconds = mains.reduce(function (s, v) { return s + (v.durationSec || 0); }, 0);
      meta = T.meta(mains.length, Math.max(1, Math.round(seconds / 60)));
      subtitle = L(item.subtitle);
    }

    return '' +
      '<article class="program-card">' +
        coverHtml(item.cover) +
        '<div class="program-card-body">' +
          '<p class="program-card-meta">' + escapeHtml(meta) + '</p>' +
          '<h3 class="program-card-title"><a class="program-card-link" href="' + escapeHtml(href) + '">' + escapeHtml(title) + '</a></h3>' +
          (subtitle ? '<p class="program-card-subtitle">' + escapeHtml(subtitle) + '</p>' : '') +
          '<div class="program-card-footer">' +
            '<span class="program-card-price">' + escapeHtml(price) + '</span>' +
            '<a class="btn-primary program-card-buy" href="' + escapeHtml(href) + '"' +
              ' data-buy="' + escapeHtml(item.slug) + '"' +
              ' data-buy-title="' + escapeHtml(title) + '"' +
              ' data-buy-price="' + escapeHtml(price) + '"' +
              ' data-analytics="course_buy_click" data-analytics-slug="' + escapeHtml(item.slug) + '"' +
              ' aria-label="' + escapeHtml(T.buy + ': ' + title + ', ' + price) + '">' +
              T.buy +
            '</a>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function renderCatalog(cat) {
    var paid = (cat.categories || []).filter(function (c) { return !c.free && c.price; });
    if (!paid.length) return;

    // Цена «от»: самая низкая цена платной программы
    var min = paid.reduce(function (m, c) { return !m || c.price.amount < m.amount ? c.price : m; }, null);
    document.querySelectorAll('[data-min-price]').forEach(function (el) { el.textContent = formatPrice(min); });

    var sumAmount = paid.reduce(function (s, c) { return s + c.price.amount; }, 0);
    var sum = formatPrice({ amount: sumAmount, currency: paid[0].price.currency });

    var cards = paid.map(function (c) {
      return programCard(c, { href: prefix + '/programs/' + encodeURIComponent(c.slug) + '/' });
    });

    if (paid.length > 1) {
      (cat.bundles || []).forEach(function (b) {
        if (!b.price) return;
        cards.push(programCard(b, {
          bundle: true,
          count: paid.length,
          sum: sumAmount > b.price.amount ? sum : '',
          href: prefix + '/programs/'
        }));
      });
    }

    document.querySelectorAll('[data-programs]').forEach(function (list) {
      list.innerHTML = cards.join('');
    });
    peekUpdaters.forEach(function (fn) { fn(); });
  }

  if (document.querySelector('[data-programs], [data-min-price]') && window.fetch) {
    fetch('/api/catalog', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cat) { if (cat) renderCatalog(cat); })
      .catch(function () { /* остаётся ссылка «Все программы» */ });
  }

  /* -----------------------------------------
     Прокрутка
     ----------------------------------------- */
  window.addEventListener('scroll', function () {
    handleNavScroll();
    handleStickyCta();
  }, { passive: true });

  handleNavScroll();
  handleStickyCta();

})();
