/* ============================================
   PROGRAM — страница /programs/<slug>/: превью-плеер и липкая полоса покупки.
   Превью-плеер (у программы с превью каждой тренировки карточки переключают, какое превью в нём).
   Нажатие на обложку (или «Смотреть превью») берёт подписанную ссылку
   GET /api/videos/<id>/playback и ставит iframe Cloudflare Stream.
   Тексты сообщений приходят в data-атрибутах (язык страницы).
   ============================================ */

(function () {
  'use strict';

  var box = document.querySelector('[data-preview]');
  if (!box) return;
  var msg = document.querySelector('[data-preview-msg]');
  // Кнопка запуска на постере: копия нужна, чтобы вернуть её, когда включают превью другой тренировки
  var buttonHtml = '';
  var button = null;
  var label = null;
  var labelText = '';
  var state = 'idle'; // idle | loading | playing
  var request = 0; // номер запроса: ответ для прежнего превью не должен поставить его плеер

  function bindButton() {
    button = box.querySelector('.prg-play');
    label = box.querySelector('.prg-play-label');
    labelText = label ? label.textContent : '';
    if (button) button.addEventListener('click', play);
  }

  function say(text) {
    if (!msg) return;
    msg.textContent = text || '';
    msg.hidden = !text;
  }

  function reset(text) {
    state = 'idle';
    box.classList.remove('is-loading');
    if (button) button.removeAttribute('aria-busy');
    if (label) label.textContent = labelText;
    say(text);
  }

  function withParams(url) {
    var poster = box.getAttribute('data-poster');
    var params = 'autoplay=true' + (poster ? '&poster=' + encodeURIComponent(location.origin + poster) : '');
    return url + (url.indexOf('?') === -1 ? '?' : '&') + params;
  }

  function play() {
    if (state !== 'idle') return;
    state = 'loading';
    var mine = ++request;
    var id = box.getAttribute('data-preview');
    box.classList.add('is-loading');
    if (button) button.setAttribute('aria-busy', 'true');
    if (label) label.textContent = box.getAttribute('data-msg-loading') || labelText;
    say('');

    fetch('/api/videos/' + encodeURIComponent(id) + '/playback', { credentials: 'same-origin' })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (mine !== request) return;
          if (!res.ok || !data || !data.url) {
            reset(box.getAttribute('data-msg-unavailable'));
            return;
          }
          var iframe = document.createElement('iframe');
          iframe.src = withParams(data.url);
          iframe.title = box.getAttribute('data-frame-title') || '';
          iframe.allow = 'accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen';
          iframe.allowFullscreen = true;
          box.innerHTML = '';
          box.appendChild(iframe);
          if (window.track) window.track('preview_play', { video_id: id });
          box.classList.remove('is-loading');
          state = 'playing';
          try { iframe.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
        });
      }, function () {
        if (mine !== request) return;
        reset(box.getAttribute('data-msg-network'));
      });
  }

  /** Кнопка «Превью» у карточки тренировки: ставит в плеер её превью и постер (обложку тренировки). */
  function choose(pick) {
    var id = pick.getAttribute('data-preview-pick');
    if (!id || id === box.getAttribute('data-preview')) return;
    request++;
    box.setAttribute('data-preview', id);
    box.setAttribute('data-poster', pick.getAttribute('data-poster') || '');
    box.setAttribute('data-frame-title', pick.getAttribute('data-frame-title') || '');
    var poster = pick.getAttribute('data-poster') || '';
    var small = pick.getAttribute('data-poster-small') || '';
    var img = document.createElement('img');
    img.className = 'prg-player-poster';
    img.alt = '';
    img.width = 540;
    img.height = 960;
    img.decoding = 'async';
    if (small) {
      img.src = small;
      img.srcset = small + ' 480w, ' + poster + ' 1080w';
      img.sizes = '(min-width: 768px) 20rem, 17.5rem';
    } else {
      img.src = poster;
    }
    box.innerHTML = '';
    box.appendChild(img);
    box.insertAdjacentHTML('beforeend', buttonHtml);
    bindButton();
    var chip = pick.getAttribute('data-play-chip');
    if (label && chip) label.textContent = labelText = chip;
    if (button && pick.getAttribute('data-play-aria')) button.setAttribute('aria-label', pick.getAttribute('data-play-aria'));
    reset('');
  }

  function scrollToPlayer() {
    var smooth = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    try {
      box.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' });
    } catch (err) {
      box.scrollIntoView();
    }
  }

  var initial = box.querySelector('.prg-play');
  buttonHtml = initial ? initial.outerHTML : '';
  bindButton();

  // «Смотреть превью» на первом экране и строка превью в «Что внутри»:
  // якорь прокручивает к плееру, видео начинает грузиться сразу.
  // Кнопка превью у карточки тренировки сначала ставит в плеер своё превью.
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('[data-preview-play]');
    if (!link) return;
    if (link.hasAttribute('data-preview-pick')) {
      e.preventDefault();
      choose(link);
      scrollToPlayer();
    }
    play();
  });
})();

/* Липкая полоса «Купить» на телефоне: видна, только когда на экране нет
   ни главной кнопки вверху, ни блока покупки внизу. Ширину ≥ 768 px прячет CSS. */
(function () {
  'use strict';

  var bar = document.querySelector('[data-sticky-buy]');
  if (!bar) return;
  var targets = document.querySelectorAll('[data-buy-main]');
  if (!targets.length || !('IntersectionObserver' in window)) return;

  var visible = new Map();
  function update() {
    var any = false;
    visible.forEach(function (v) { if (v) any = true; });
    bar.classList.toggle('is-shown', !any);
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { visible.set(e.target, e.isIntersecting); });
    update();
  });
  Array.prototype.forEach.call(targets, function (el) {
    visible.set(el, true);
    io.observe(el);
  });
})();
