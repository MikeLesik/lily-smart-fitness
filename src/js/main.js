/* ============================================
   MAIN JS — Lily Personal Brand Website
   Nav scroll, mobile menu, FAQ, scroll reveal,
   mobile sticky CTA, timeline progress line,
   витрина видеотренировок из /api/catalog
   ============================================ */

(function () {
  'use strict';

  const TELEGRAM_CTA = 'https://t.me/LilyLesik?text=%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82%2C%20%D0%9B%D0%B8%D0%BB%D1%8F!%20%D0%9D%D0%B0%D1%88%D0%BB%D0%B0%20%D1%82%D0%B5%D0%B1%D1%8F%20%D1%87%D0%B5%D1%80%D0%B5%D0%B7%20%D1%81%D0%B0%D0%B9%D1%82%20%D0%B8%20%D1%85%D0%BE%D1%87%D1%83%20%D1%83%D0%B7%D0%BD%D0%B0%D1%82%D1%8C%20%D0%B1%D0%BE%D0%BB%D1%8C%D1%88%D0%B5%20%D0%BE%20%D0%BF%D1%80%D0%BE%D0%B3%D1%80%D0%B0%D0%BC%D0%BC%D0%B0%D1%85.';

  /* -----------------------------------------
     1. Navigation — scroll behavior
     ----------------------------------------- */
  const nav = document.querySelector('.nav');
  const hero = document.querySelector('.hero, .course-hero');

  function handleNavScroll() {
    if (!nav || !hero) return;
    const threshold = 80;
    if (window.scrollY > threshold) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  }

  /* -----------------------------------------
     2. Mobile Menu
     ----------------------------------------- */
  const burger = document.querySelector('.burger');
  const overlay = document.querySelector('.mobile-overlay');

  function setMobileMenu(isOpen) {
    if (!burger || !overlay) return;
    burger.classList.toggle('open', isOpen);
    overlay.classList.toggle('open', isOpen);
    burger.setAttribute('aria-expanded', String(isOpen));
    overlay.setAttribute('aria-hidden', String(!isOpen));
    document.body.style.overflow = isOpen ? 'hidden' : '';
    if (typeof handleStickyCta === 'function') handleStickyCta();
  }

  function toggleMobileMenu() {
    if (!burger) return;
    setMobileMenu(!burger.classList.contains('open'));
  }

  function closeMobileMenu() {
    setMobileMenu(false);
  }

  if (burger) {
    burger.addEventListener('click', toggleMobileMenu);
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

  /* -----------------------------------------
     3. FAQ Accordion
     ----------------------------------------- */
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(function (item) {
    var question = item.querySelector('.faq-question');
    if (!question) return;

    question.addEventListener('click', function () {
      var isActive = item.classList.contains('active');

      // Close all and reset aria
      faqItems.forEach(function (other) {
        other.classList.remove('active');
        var btn = other.querySelector('.faq-question');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      });

      // Open clicked (if was closed)
      if (!isActive) {
        item.classList.add('active');
        question.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* -----------------------------------------
     4. Scroll Reveal (IntersectionObserver)
     ----------------------------------------- */
  var reveals = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window && reveals.length > 0) {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );

    reveals.forEach(function (el) {
      revealObserver.observe(el);
    });
  } else {
    // Fallback: show all
    reveals.forEach(function (el) {
      el.classList.add('visible');
    });
  }

  /* -----------------------------------------
     5. Mobile Sticky CTA
     ----------------------------------------- */
  var stickyCta = document.querySelector('.sticky-cta');

  function handleStickyCta() {
    if (!stickyCta || !hero) return;
    var heroBottom = hero.offsetTop + hero.offsetHeight;
    var isMenuOpen = burger && burger.classList.contains('open');

    var isVisible = window.scrollY > heroBottom && !isMenuOpen;
    stickyCta.classList.toggle('visible', isVisible);
    stickyCta.setAttribute('aria-hidden', String(!isVisible));
    stickyCta.inert = !isVisible;
  }

  /* -----------------------------------------
     6. Smooth Scroll for anchor links
     ----------------------------------------- */
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var targetId = this.getAttribute('href');
      if (targetId === '#') return;
      var target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        var navHeight = nav ? nav.offsetHeight : 0;
        var top = target.getBoundingClientRect().top + window.pageYOffset - navHeight - 20;
        window.scrollTo({ top: top, behavior: 'smooth' });
      }
    });
  });

  /* -----------------------------------------
     7. Count-Up Animation (Trust Bar)
     ----------------------------------------- */
  var countEls = document.querySelectorAll('.count-up');

  function animateCount(el) {
    var target = parseInt(el.getAttribute('data-target'), 10);
    var duration = 1600; // ms
    var start = null;

    function step(timestamp) {
      if (!start) start = timestamp;
      var progress = Math.min((timestamp - start) / duration, 1);
      // ease-out cubic
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.floor(eased * target);
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = target;
      }
    }

    requestAnimationFrame(step);
  }

  if ('IntersectionObserver' in window && countEls.length > 0) {
    var countObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            countObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );

    countEls.forEach(function (el) {
      countObserver.observe(el);
    });
  } else {
    // Fallback: show final numbers
    countEls.forEach(function (el) {
      el.textContent = el.getAttribute('data-target');
    });
  }

  /* -----------------------------------------
     8. Timeline Progress Line
     ----------------------------------------- */
  /*
     Injects a .timeline-progress element as the first child of
     .timeline, then grows it downward (via height) as the user
     scrolls through each step. Each marker gets the .reached
     class when the progress line passes it.
  */
  var timelineEl = document.querySelector('.timeline');

  if (timelineEl) {
    // Inject the animated gold line element
    var progressLine = document.createElement('div');
    progressLine.className = 'timeline-progress';
    timelineEl.insertBefore(progressLine, timelineEl.firstChild);

    var timelineSteps = timelineEl.querySelectorAll('.timeline-step');
    var timelineMarkers = timelineEl.querySelectorAll('.timeline-marker');

    function updateTimelineProgress() {
      if (!timelineEl || timelineSteps.length === 0) return;

      var timelineRect = timelineEl.getBoundingClientRect();
      var viewportH = window.innerHeight;

      // If timeline is not yet in view, do nothing
      if (timelineRect.bottom < 0 || timelineRect.top > viewportH) return;

      // Total scrollable height of the timeline track
      var timelineH = timelineEl.offsetHeight;

      // Progress: how far the center of the viewport has moved
      // through the timeline, clamped 0–1.
      // We start counting when the top of the timeline enters the
      // bottom 70% of the viewport, finish when the bottom leaves.
      var triggerStart = viewportH * 0.7;
      var progressPx = triggerStart - timelineRect.top;
      var ratio = Math.max(0, Math.min(1, progressPx / timelineH));
      var lineHeight = Math.round(ratio * timelineH);

      progressLine.style.height = lineHeight + 'px';

      // Mark each step whose marker center is within the drawn line
      timelineMarkers.forEach(function (marker, i) {
        var markerRect = marker.getBoundingClientRect();
        var markerCenter = markerRect.top + markerRect.height / 2;
        // If the drawn line reaches the marker's vertical midpoint
        var markerOffsetFromTop = markerRect.top - timelineRect.top + markerRect.height / 2;

        if (lineHeight >= markerOffsetFromTop) {
          marker.classList.add('reached');
          if (timelineSteps[i]) timelineSteps[i].classList.add('reached');
        } else {
          marker.classList.remove('reached');
          if (timelineSteps[i]) timelineSteps[i].classList.remove('reached');
        }
      });
    }

    // Run on scroll and on load
    window.addEventListener('scroll', updateTimelineProgress, { passive: true });
    updateTimelineProgress();
  }

  /* -----------------------------------------
     9. Scroll Peek — fade gradient on overflow
     ----------------------------------------- */
  var scrollPeekWrappers = document.querySelectorAll('.scroll-peek');

  scrollPeekWrappers.forEach(function (wrapper) {
    var scroller = wrapper.querySelector('.horizontal-scroll');
    if (!scroller) return;

    function updatePeek() {
      var hasOverflow = scroller.scrollWidth > scroller.clientWidth + 1;
      var atEnd = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 5;

      wrapper.classList.toggle('has-overflow', hasOverflow && !atEnd);
      wrapper.classList.toggle('scrolled-end', atEnd);
    }

    scroller.addEventListener('scroll', updatePeek, { passive: true });
    window.addEventListener('resize', updatePeek, { passive: true });
    updatePeek();
  });

  /* -----------------------------------------
     10. Analytics — wrapper
     -----------------------------------------
     Если на сайт добавят Метрику/GA — переопределить window.track
     или хук внутри. Пока пишем в dataLayer (если есть) и console.
  */
  if (typeof window.track !== 'function') {
    window.track = function (event, payload) {
      try {
        if (Array.isArray(window.dataLayer)) {
          window.dataLayer.push(Object.assign({ event: event }, payload || {}));
        }
        // TODO: подключить ym(ID, 'reachGoal', event, payload) или gtag('event', ...)
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
    var el = e.target.closest('[data-analytics]');
    if (!el) return;
    var event = el.getAttribute('data-analytics');
    var payload = {};
    Array.prototype.forEach.call(el.attributes, function (attr) {
      if (attr.name.indexOf('data-analytics-') === 0 && attr.name !== 'data-analytics') {
        payload[attr.name.replace('data-analytics-', '')] = attr.value;
      }
    });
    window.track(event, payload);
  });

  /* -----------------------------------------
     11. Видеотренировки — витрина из /api/catalog
     -----------------------------------------
     Контейнер: <div class="workouts-grid" data-courses-grid data-locale="ru|en"></div>
     Кнопка «Купить» с data-buy открывает покупку (js/buy.js).
  */
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function catalogPrice(p) {
    if (!p) return '';
    var v = p.amount / 100;
    var sym = { eur: '€', usd: '$' }[(p.currency || '').toLowerCase()];
    return (sym || '') + (v % 1 === 0 ? v : v.toFixed(2));
  }

  function plural(n, forms) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return forms[0];
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1];
    return forms[2];
  }

  function catalogCard(item, locale, isBundle) {
    var L = function (o) { return o ? (o[locale] || o.ru || '') : ''; };
    var en = locale === 'en';
    var title = L(item.title);
    var mains = isBundle ? [] : item.videos.filter(function (v) { return !v.preview; });
    var minutes = Math.max(1, Math.round(mains.reduce(function (s, v) { return s + v.durationSec; }, 0) / 60));
    var meta = isBundle
      ? (en ? 'All programs, including new ones' : 'Все программы, включая новые')
      : (en
          ? mains.length + ' ' + (mains.length === 1 ? 'workout' : 'workouts') + ' · ' + minutes + ' min'
          : mains.length + ' ' + plural(mains.length, ['тренировка', 'тренировки', 'тренировок']) + ' · ' + minutes + ' мин');
    var subtitle = isBundle
      ? (en ? 'One payment, lifetime access.' : 'Одна оплата, доступ навсегда.')
      : L(item.subtitle);
    var cover = item.cover || '';
    var coverHtml = cover
      ? '<picture><source srcset="' + escapeHtml(cover.replace(/\.jpg$/, '.webp')) + '" type="image/webp">' +
        '<img src="' + escapeHtml(cover) + '" alt="" width="480" height="600" loading="lazy" decoding="async"></picture>'
      : '';
    var cta;
    if (item.free) {
      var next = encodeURIComponent('/account/#/c/' + item.slug);
      cta = '<a class="btn-ghost course-card-cta" href="/login/?next=' + next + '">' + (en ? 'Get it free' : 'Получить бесплатно') + '</a>';
    } else {
      var price = catalogPrice(item.price);
      cta = '<a class="btn-primary course-card-cta" href="#workouts" data-buy="' + escapeHtml(item.slug) + '"' +
        ' data-buy-title="' + escapeHtml(title) + '" data-buy-price="' + escapeHtml(price) + '"' +
        ' data-analytics="course_buy_click" data-analytics-slug="' + escapeHtml(item.slug) + '">' +
        (en ? 'Buy' : 'Купить') + '</a>';
    }
    return '' +
      '<article class="course-card reveal">' +
        (coverHtml ? '<div class="course-card-cover">' + coverHtml + '</div>' : '') +
        '<div class="course-card-body">' +
          '<p class="course-card-meta">' + escapeHtml(meta) + '</p>' +
          '<h3 class="course-card-title">' + escapeHtml(title) + '</h3>' +
          (subtitle ? '<p class="course-card-subtitle">' + escapeHtml(subtitle) + '</p>' : '') +
          '<div class="course-card-footer">' +
            '<span class="course-card-price">' + escapeHtml(item.free ? (en ? 'Free' : 'Бесплатно') : catalogPrice(item.price)) + '</span>' +
            cta +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function renderCatalog(cat) {
    document.querySelectorAll('[data-courses-grid]').forEach(function (grid) {
      var locale = (grid.getAttribute('data-locale') || document.documentElement.lang || 'ru').toLowerCase().indexOf('en') === 0 ? 'en' : 'ru';
      var paid = cat.categories.filter(function (c) { return !c.free; });
      var free = cat.categories.filter(function (c) { return c.free; });
      var html = paid.map(function (c) { return catalogCard(c, locale, false); }).join('') +
        (paid.length > 1 ? cat.bundles.map(function (b) { return catalogCard(b, locale, true); }).join('') : '') +
        free.map(function (c) { return catalogCard(c, locale, false); }).join('');
      grid.innerHTML = html;
      grid.querySelectorAll('.reveal').forEach(function (el) {
        if (typeof revealObserver !== 'undefined' && revealObserver) revealObserver.observe(el);
        else el.classList.add('visible');
      });
    });
  }

  if (document.querySelector('[data-courses-grid]') && window.fetch) {
    fetch('/api/catalog')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cat) { if (cat) renderCatalog(cat); })
      .catch(function () { /* витрина просто не появится */ });
  }

  /* -----------------------------------------
     Event Listeners
     ----------------------------------------- */
  window.addEventListener('scroll', function () {
    handleNavScroll();
    handleStickyCta();
  }, { passive: true });

  // Initialize on load
  handleNavScroll();
  handleStickyCta();

})();
