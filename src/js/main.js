/* ============================================
   MAIN JS — Lily Personal Brand Website
   Nav scroll, mobile menu, FAQ, scroll reveal,
   mobile sticky CTA, timeline progress line,
   pricing card entrance
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
     11. Workouts catalog — рендер из window.LILY_COURSES
     -----------------------------------------
     Контейнер: <div class="workouts-grid" data-courses-grid data-locale="ru|en"></div>
     Источник: js/courses.js (window.LILY_COURSES).
  */
  function formatPrice(value, currency) {
    if (value == null) return '';
    var formatted = String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    if (currency === 'RUB') return formatted + ' ₽';
    if (currency === 'EUR') return '€' + formatted;
    return formatted;
  }

  function paymentUrl(value) {
    return typeof value === 'string' && /^https:\/\//i.test(value.trim()) ? value.trim() : '';
  }

  function findCourse(slug) {
    if (!slug || !Array.isArray(window.LILY_COURSES)) return null;
    return window.LILY_COURSES.find(function (c) { return c.slug === slug; }) || null;
  }

  function isPurchasable(course) {
    return !!(course && course.published &&
      (paymentUrl(course.paymentUrlRub) || paymentUrl(course.paymentUrlIntl)));
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function detectLocale() {
    var lang = (document.documentElement.lang || '').toLowerCase();
    if (lang.indexOf('en') === 0) return 'en';
    if (lang.indexOf('ru') === 0) return 'ru';
    if (window.location.pathname.indexOf('/en/') === 0) return 'en';
    return 'ru';
  }

  function renderCoursesCatalog() {
    var grids = document.querySelectorAll('[data-courses-grid]');
    if (!grids.length) return;
    if (!Array.isArray(window.LILY_COURSES)) return;

    grids.forEach(function (grid) {
      var locale = (grid.getAttribute('data-locale') || detectLocale()).toLowerCase();
      var labels = locale === 'en'
        ? { more: 'Learn more', soon: 'Coming soon', from: 'from' }
        : { more: 'Подробнее',    soon: 'Скоро',         from: 'от' };
      var basePath = locale === 'en' ? '../' : '';
      // For EN: course landing lives at en/workouts/<slug>/, so href is `workouts/<slug>/`.
      // Cover path is assets/images/courses/... → prefix with `../` for EN since current dir is /en.

      var html = window.LILY_COURSES.map(function (course, idx) {
        var title = (course.title || {})[locale] || course.title.ru;
        var subtitle = (course.subtitle || {})[locale] || course.subtitle.ru;
        var duration = (course.duration || {})[locale] || course.duration.ru;
        var level = (course.level || {})[locale] || course.level.ru;
        var includes = ((course.includes || {})[locale] || course.includes.ru) || [];
        var hasPrice = course.priceRub || course.priceEur;
        var priceMain = course.priceEur ? formatPrice(course.priceEur, 'EUR') : formatPrice(course.priceRub, 'RUB');
        var priceAlt  = course.priceEur && course.priceRub ? formatPrice(course.priceRub, 'RUB') : '';
        var coverHref = course.cover ? (basePath + course.cover) : '';
        var landingHref = (locale === 'en' ? 'workouts/' : 'workouts/') + course.slug + '/';
        var isPublished = isPurchasable(course);
        var delayClass = ['reveal-delay-1', 'reveal-delay-2', 'reveal-delay-3'][idx % 3];

        var badge = !isPublished
          ? '<span class="course-card-badge">' + labels.soon + '</span>'
          : '';

        var coverInner = coverHref
          ? '<img src="' + escapeHtml(coverHref) + '" alt="' + escapeHtml(title) + '" loading="lazy" onerror="this.style.display=\'none\'">' +
            '<span class="course-card-cover-placeholder" aria-hidden="true">L</span>'
          : '<span class="course-card-cover-placeholder" aria-hidden="true">L</span>';

        var includesHtml = includes.slice(0, 3).map(function (i) {
          return '<li>' + escapeHtml(i) + '</li>';
        }).join('');

        var ctaHtml = isPublished
          ? '<a href="' + escapeHtml(landingHref) + '" class="btn-primary course-card-cta" data-analytics="course_card_click" data-analytics-slug="' + escapeHtml(course.slug) + '">' + labels.more + '</a>'
          : '<span class="btn-ghost course-card-cta" style="opacity:.5;pointer-events:none">' + labels.soon + '</span>';

        return '' +
          '<article class="course-card reveal ' + delayClass + (isPublished ? '' : ' course-card--soon') + '">' +
            '<div class="course-card-cover">' + badge + coverInner + '</div>' +
            '<div class="course-card-body">' +
              '<div class="course-card-meta"><span>' + escapeHtml(duration) + '</span><span>' + escapeHtml(level) + '</span></div>' +
              '<h3 class="course-card-title">' + escapeHtml(title) + '</h3>' +
              '<p class="course-card-subtitle">' + escapeHtml(subtitle) + '</p>' +
              (includesHtml ? '<ul class="course-card-includes">' + includesHtml + '</ul>' : '') +
              '<div class="course-card-footer">' +
                '<div class="course-card-price">' +
                  (hasPrice ? '<span class="course-card-price-main">' + escapeHtml(priceMain) + '</span>' : '') +
                  (priceAlt ? '<span class="course-card-price-alt">' + escapeHtml(priceAlt) + '</span>' : '') +
                '</div>' +
                ctaHtml +
              '</div>' +
            '</div>' +
          '</article>';
      }).join('');

      grid.innerHTML = html;

      // Подключить новые .reveal к observer (если он есть)
      if (typeof revealObserver !== 'undefined' && revealObserver) {
        grid.querySelectorAll('.reveal').forEach(function (el) {
          revealObserver.observe(el);
        });
      } else {
        // на лендингах без observer — просто покажем
        grid.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('visible'); });
      }
    });
  }

  renderCoursesCatalog();

  /* -----------------------------------------
     11b. Success-page — название курса в заголовке
     -----------------------------------------
     Контейнер: [data-success-slug="<slug>"][data-locale="ru|en"]
     Ссылку доступа страница не показывает: success-адрес открыт всем.
     Доступ выдаёт платёжка письмом после оплаты.
  */
  (function renderSuccess() {
    var card = document.querySelector('[data-success-slug]');
    if (!card) return;

    var course = findCourse(card.getAttribute('data-success-slug'));
    if (!course) return;

    var locale = (card.getAttribute('data-locale') || document.documentElement.lang || 'ru').toLowerCase();
    var titleEl = card.querySelector('[data-success-title]');
    if (!titleEl) return;

    titleEl.textContent = locale === 'en'
      ? 'Thank you! “' + (course.title.en || course.title.ru) + '” is yours.'
      : 'Спасибо! Курс «' + (course.title.ru || course.title.en) + '» теперь твой.';
  })();

  /* -----------------------------------------
     12. Pay modal — выбор контура оплаты (РФ / зарубеж)
     -----------------------------------------
     Триггер: любая кнопка/ссылка с
       data-pay-trigger
       data-pay-slug="<slug>"
     Ссылки оплаты берутся только из courses.js (paymentUrlRub /
     paymentUrlIntl), принимаются только https://.
     Сам HTML модалки берётся из элемента #pay-modal
     (см. workouts/<slug>/index.html — там лежит разметка).
  */
  var payModal = document.getElementById('pay-modal');
  var payModalReturnFocus = null;
  var payModalFoot = payModal ? payModal.querySelector('.pay-modal-foot') : null;
  var payModalFootDefault = payModalFoot ? payModalFoot.innerHTML : '';

  function openPayModal(opts) {
    if (!payModal) return;
    var isEn = (document.documentElement.lang || 'ru').toLowerCase() === 'en';
    var labels = isEn
      ? {
          rubLabel: 'Russian card / SBP',
          rubMeta:  'RUB · ZSP · installments',
          intlLabel: 'International card',
          intlMeta:  'EUR / USD',
          soon: 'Payment opens soon. Message Lily in the meantime: '
        }
      : {
          rubLabel: 'Карта РФ / СБП',
          rubMeta:  'RUB · рассрочка',
          intlLabel: 'Зарубежная карта',
          intlMeta:  'EUR / USD',
          soon: 'Оплата скоро откроется. Пока можно написать Лиле: '
        };

      var rubBtn  = payModal.querySelector('[data-pay-option="rub"]');
      var intlBtn = payModal.querySelector('[data-pay-option="intl"]');

      if (payModalFoot) {
        if (opts.rub || opts.intl) {
          payModalFoot.innerHTML = payModalFootDefault;
        } else {
          payModalFoot.textContent = labels.soon;
          var tg = document.createElement('a');
          tg.href = 'https://t.me/LilyLesik';
          tg.target = '_blank';
          tg.rel = 'noopener';
          tg.textContent = '@LilyLesik';
          tg.style.textDecoration = 'underline';
          payModalFoot.appendChild(tg);
        }
      }

      if (rubBtn) {
        rubBtn.setAttribute('href', opts.rub || '#');
        rubBtn.setAttribute('aria-disabled', opts.rub ? 'false' : 'true');
        rubBtn.tabIndex = opts.rub ? 0 : -1;
        rubBtn.setAttribute('data-analytics', 'pay_option_select');
        rubBtn.setAttribute('data-analytics-option', 'rub');
        rubBtn.setAttribute('data-analytics-slug', opts.slug || '');
        var rubLabelEl = rubBtn.querySelector('.pay-modal-option-label');
        var rubMetaEl  = rubBtn.querySelector('.pay-modal-option-meta');
        if (rubLabelEl) rubLabelEl.textContent = labels.rubLabel;
        if (rubMetaEl)  rubMetaEl.textContent  = labels.rubMeta;
      }

      if (intlBtn) {
        intlBtn.setAttribute('href', opts.intl || '#');
        intlBtn.setAttribute('aria-disabled', opts.intl ? 'false' : 'true');
        intlBtn.tabIndex = opts.intl ? 0 : -1;
        intlBtn.setAttribute('data-analytics', 'pay_option_select');
        intlBtn.setAttribute('data-analytics-option', 'intl');
        intlBtn.setAttribute('data-analytics-slug', opts.slug || '');
        var intlLabelEl = intlBtn.querySelector('.pay-modal-option-label');
        var intlMetaEl  = intlBtn.querySelector('.pay-modal-option-meta');
        if (intlLabelEl) intlLabelEl.textContent = labels.intlLabel;
        if (intlMetaEl)  intlMetaEl.textContent  = labels.intlMeta;
      }

      payModalReturnFocus = document.activeElement;
      payModal.classList.add('open');
      document.body.classList.add('pay-modal-open');
      var firstFocus = payModal.querySelector('[data-pay-option][aria-disabled="false"]') ||
        payModal.querySelector('[data-pay-close]');
      if (firstFocus) firstFocus.focus();
      window.track('pay_modal_open', { slug: opts.slug || '' });
  }

  function closePayModal() {
    if (!payModal) return;
    payModal.classList.remove('open');
    document.body.classList.remove('pay-modal-open');
    if (payModalReturnFocus && typeof payModalReturnFocus.focus === 'function') {
      payModalReturnFocus.focus();
    }
    payModalReturnFocus = null;
  }

  if (payModal) {
    // Закрытие по фону / по кнопке × / по Esc
    payModal.addEventListener('click', function (e) {
      if (e.target === payModal || e.target.closest('[data-pay-close]')) {
        closePayModal();
        return;
      }
      var option = e.target.closest('[data-pay-option]');
      if (option && option.getAttribute('aria-disabled') === 'true') {
        e.preventDefault();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (!payModal.classList.contains('open')) return;
      if (e.key === 'Escape') {
        closePayModal();
        return;
      }
      if (e.key !== 'Tab') return;
      var focusable = Array.prototype.filter.call(
        payModal.querySelectorAll('a[href], button'),
        function (el) { return el.tabIndex !== -1 && el.offsetParent !== null; }
      );
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-pay-trigger]');
    if (!trigger) return;
    e.preventDefault();
    var slug = trigger.getAttribute('data-pay-slug') || '';
    var course = findCourse(slug);
    var ready = !course || course.published;
    openPayModal({
      rub:  ready ? paymentUrl(course ? course.paymentUrlRub : trigger.getAttribute('data-pay-rub')) : '',
      intl: ready ? paymentUrl(course ? course.paymentUrlIntl : trigger.getAttribute('data-pay-intl')) : '',
      slug: slug
    });
  });

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
