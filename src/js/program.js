/* ============================================
   PROGRAM — превью-плеер на странице /programs/<slug>/.
   Нажатие на обложку (или «Смотреть превью») берёт подписанную ссылку
   GET /api/videos/<id>/playback и ставит iframe Cloudflare Stream.
   Тексты сообщений приходят в data-атрибутах (язык страницы).
   ============================================ */

(function () {
  'use strict';

  var box = document.querySelector('[data-preview]');
  if (!box) return;
  var button = box.querySelector('.prg-play');
  var label = box.querySelector('.prg-play-label');
  var msg = document.querySelector('[data-preview-msg]');
  var labelText = label ? label.textContent : '';
  var state = 'idle'; // idle | loading | playing

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
    box.classList.add('is-loading');
    if (button) button.setAttribute('aria-busy', 'true');
    if (label) label.textContent = box.getAttribute('data-msg-loading') || labelText;
    say('');

    fetch('/api/videos/' + encodeURIComponent(box.getAttribute('data-preview')) + '/playback', { credentials: 'same-origin' })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
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
          box.classList.remove('is-loading');
          state = 'playing';
          try { iframe.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
        });
      }, function () {
        reset(box.getAttribute('data-msg-network'));
      });
  }

  if (button) button.addEventListener('click', play);

  // «Смотреть превью» на первом экране и строка превью в «Что внутри»:
  // якорь прокручивает к плееру, видео начинает грузиться сразу.
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('[data-preview-play]');
    if (link) play();
  });
})();
