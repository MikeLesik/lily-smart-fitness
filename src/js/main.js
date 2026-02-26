/* ============================================
   MAIN JS — Lily Personal Brand Website
   Nav scroll, mobile menu, FAQ, scroll reveal,
   mobile sticky CTA
   ============================================ */

(function () {
  'use strict';

  const TELEGRAM_CTA = 'https://t.me/LilyLesik?text=%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82%2C%20%D0%9B%D0%B8%D0%BB%D1%8F!%20%D0%9D%D0%B0%D1%88%D0%BB%D0%B0%20%D1%82%D0%B5%D0%B1%D1%8F%20%D1%87%D0%B5%D1%80%D0%B5%D0%B7%20%D1%81%D0%B0%D0%B9%D1%82%20%D0%B8%20%D1%85%D0%BE%D1%87%D1%83%20%D1%83%D0%B7%D0%BD%D0%B0%D1%82%D1%8C%20%D0%B1%D0%BE%D0%BB%D1%8C%D1%88%D0%B5%20%D0%BE%20%D0%BF%D1%80%D0%BE%D0%B3%D1%80%D0%B0%D0%BC%D0%BC%D0%B0%D1%85.';

  /* -----------------------------------------
     1. Navigation — scroll behavior
     ----------------------------------------- */
  const nav = document.querySelector('.nav');
  const hero = document.querySelector('.hero');

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

  function toggleMobileMenu() {
    if (!burger || !overlay) return;
    const isOpen = burger.classList.toggle('open');
    overlay.classList.toggle('open', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  }

  function closeMobileMenu() {
    if (!burger || !overlay) return;
    burger.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  if (burger) {
    burger.addEventListener('click', toggleMobileMenu);
  }

  if (overlay) {
    overlay.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeMobileMenu);
    });
  }

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

    if (window.scrollY > heroBottom && !isMenuOpen) {
      stickyCta.classList.add('visible');
    } else {
      stickyCta.classList.remove('visible');
    }
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
