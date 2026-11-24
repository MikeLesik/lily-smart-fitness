/* ============================================
   ADMIN — /admin/ (только для email из ADMIN_EMAILS)
   Пользователи и их права, ручная выдача и отзыв доступа,
   выгрузка лидов и покупателей в CSV.
   API: /api/admin/users, /api/admin/grant, /api/admin/revoke,
        /api/admin/export, /api/catalog.
   ============================================ */

(function () {
  'use strict';

  var app = document.getElementById('app');
  var catalog = { categories: [], bundles: [] };
  var searchTimer = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

  function date(sec) {
    return new Date(sec * 1000).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function money(amount, currency) {
    return (amount / 100).toFixed(2).replace('.00', '') + ' ' + String(currency || '').toUpperCase();
  }

  var SOURCE = { stripe: 'покупка', manual: 'вручную', free: 'бесплатно' };

  function scopeTitle(scope) {
    var item = catalog.categories.concat(catalog.bundles).find(function (c) { return c.slug === scope; });
    return item ? item.title.ru : scope;
  }

  function scopeOptions() {
    return catalog.categories.concat(catalog.bundles).map(function (c) {
      return '<option value="' + esc(c.slug) + '">' + esc(c.title.ru) + (c.free ? ' (бесплатно)' : '') + '</option>';
    }).join('');
  }

  function renderShell() {
    app.innerHTML =
      '<h1 class="cab-title">Админка</h1>' +

      '<section class="adm-block" aria-labelledby="grant-title">' +
        '<h2 class="cab-section-title" id="grant-title">Выдать доступ</h2>' +
        '<p class="cab-text">Например, после оплаты переводом. Если такого email ещё нет, пользователь создастся; войти он сможет по коду из письма.</p>' +
        '<form class="adm-form" id="grant-form" novalidate>' +
          '<label><span class="cab-label">Email</span><input class="cab-input" type="email" name="email" autocomplete="off" required></label>' +
          '<label><span class="cab-label">Программа</span><select name="scope">' + scopeOptions() + '</select></label>' +
          '<button type="submit" class="btn-primary">Выдать</button>' +
        '</form>' +
        '<p class="adm-msg" id="grant-msg" role="status" hidden></p>' +
      '</section>' +

      '<section class="adm-block" aria-labelledby="export-title">' +
        '<h2 class="cab-section-title" id="export-title">Выгрузка</h2>' +
        '<div class="adm-links">' +
          '<a class="cab-secondary" href="/api/admin/export?type=buyers">Покупатели (CSV)</a>' +
          '<a class="cab-secondary" href="/api/admin/export?type=leads">Лиды бесплатного урока (CSV)</a>' +
        '</div>' +
      '</section>' +

      '<section class="adm-block" aria-labelledby="users-title">' +
        '<h2 class="cab-section-title" id="users-title">Пользователи</h2>' +
        '<label><span class="cab-label">Поиск по email</span><input class="cab-input" type="search" id="search" autocomplete="off"></label>' +
        '<div class="adm-users" id="users" aria-live="polite"></div>' +
      '</section>';

    document.getElementById('grant-form').addEventListener('submit', onGrant);
    document.getElementById('search').addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(loadUsers, 300);
    });
    document.getElementById('users').addEventListener('click', onRevoke);
  }

  function renderUser(u) {
    var utm = [u.utm.utm_source, u.utm.utm_medium, u.utm.utm_campaign].filter(Boolean).join(' / ');
    var ents = u.entitlements.map(function (e) {
      var active = e.status === 'active';
      return '<div class="adm-chip' + (active ? '' : ' adm-chip--off') + '">' +
        '<span>' + esc(scopeTitle(e.scope)) + ' · ' + esc(SOURCE[e.source] || e.source) + (active ? '' : ' · отозван') + '</span>' +
        (active ? '<button type="button" class="adm-revoke" data-revoke="' + esc(e.id) + '" data-label="' + esc(scopeTitle(e.scope) + ' для ' + u.email) + '">Отозвать</button>' : '') +
      '</div>';
    }).join('') || '<span class="adm-user-meta">доступов нет</span>';
    var orders = u.orders.map(function (o) {
      return '<div class="adm-chip"><span>' + esc(scopeTitle(o.scope)) + ' · ' + esc(money(o.amount, o.currency)) + ' · ' +
        esc(o.status === 'refunded' ? 'возврат' : 'оплачено') + ' · ' + esc(date(o.createdAt)) + '</span>' +
        (o.receiptUrl ? '<a class="adm-revoke" href="' + esc(o.receiptUrl) + '" target="_blank" rel="noopener">Чек</a>' : '') + '</div>';
    }).join('') || '<span class="adm-user-meta">заказов нет</span>';
    return '<article class="adm-user">' +
      '<div><div class="adm-user-email">' + esc(u.email) + '</div>' +
        '<div class="adm-user-meta">с ' + esc(date(u.createdAt)) + ' · ' + esc(u.locale) + (u.marketingConsent ? ' · согласие на письма' : '') +
        (utm ? ' · ' + esc(utm) : '') + '</div></div>' +
      '<div class="adm-chips">' + ents + '</div>' +
      '<div class="adm-chips">' + orders + '</div>' +
    '</article>';
  }

  function loadUsers() {
    var box = document.getElementById('users');
    var q = document.getElementById('search').value.trim();
    api('/api/admin/users?limit=200' + (q ? '&q=' + encodeURIComponent(q) : '')).then(function (res) {
      if (!res.ok) {
        box.innerHTML = '<p class="cab-text">Не получилось загрузить список. Обнови страницу.</p>';
        return;
      }
      box.innerHTML = res.data.users.length
        ? res.data.users.map(renderUser).join('')
        : '<p class="cab-text">Никого не нашли.</p>';
    });
  }

  function onGrant(e) {
    e.preventDefault();
    var form = e.target;
    var msg = document.getElementById('grant-msg');
    var email = form.email.value.trim();
    var scope = form.scope.value;
    var btn = form.querySelector('button');
    btn.disabled = true;
    api('/api/admin/grant', { email: email, scope: scope }).then(function (res) {
      btn.disabled = false;
      msg.hidden = false;
      if (res.ok) {
        msg.textContent = res.data.existing
          ? 'У ' + email + ' уже есть доступ к «' + scopeTitle(scope) + '».'
          : 'Готово: доступ к «' + scopeTitle(scope) + '» открыт для ' + email + '.';
        form.email.value = '';
        document.getElementById('search').value = email;
        loadUsers();
      } else {
        msg.textContent = res.data.error === 'invalid_email' ? 'Проверь email.' : 'Не получилось выдать доступ (' + (res.data.error || res.status) + ').';
      }
    });
  }

  function onRevoke(e) {
    var btn = e.target.closest('[data-revoke]');
    if (!btn) return;
    if (!window.confirm('Отозвать доступ: ' + btn.getAttribute('data-label') + '?')) return;
    btn.disabled = true;
    api('/api/admin/revoke', { entitlementId: btn.getAttribute('data-revoke') }).then(function (res) {
      if (!res.ok) {
        btn.disabled = false;
        window.alert('Не получилось отозвать доступ.');
        return;
      }
      loadUsers();
    });
  }

  Promise.all([api('/api/admin/users?limit=200'), api('/api/catalog')]).then(function (r) {
    var users = r[0];
    if (users.status === 401) {
      location.replace('/login/?next=' + encodeURIComponent('/admin/'));
      return;
    }
    if (users.status === 403) {
      app.innerHTML = '<h1 class="cab-title">Нет доступа</h1><p class="cab-text">Админка открыта только для email из списка админов. Войди под таким email.</p>' +
        '<div class="cab-actions"><a class="cab-secondary" href="/account/">В кабинет</a></div>';
      return;
    }
    if (!users.ok || !r[1].ok) {
      app.innerHTML = '<h1 class="cab-title">Нет связи с сервером</h1><p class="cab-text">Обнови страницу.</p>';
      return;
    }
    catalog = r[1].data;
    renderShell();
    document.getElementById('users').innerHTML = users.data.users.length
      ? users.data.users.map(renderUser).join('')
      : '<p class="cab-text">Пользователей пока нет.</p>';
  });
})();
