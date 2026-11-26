import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { onRequestPost as webhook } from '../functions/api/stripe/webhook';
import { onRequestPost as checkout } from '../functions/api/checkout/index';
import { onRequestGet as complete } from '../functions/api/checkout/complete';
import { onRequestGet as playback } from '../functions/api/videos/[id]/playback';
import { onRequestGet as me } from '../functions/api/me';
import { call, freshEmail, grant, loginAs, sessionCookie, streamTestKey } from './helpers';
import { checkoutSession, mockStripe, stripeEvent, stripeSignature } from './stripe-mock';

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

/** Stripe-мок, который ничего не знает: вебхук не должен зависеть от API Stripe. */
function offlineStripe() {
  const m = mockStripe([]);
  restore = m.restore;
  return m;
}

async function deliver(event: unknown, opts: { secret?: string; signature?: string } = {}) {
  const raw = JSON.stringify(event);
  const signature = opts.signature ?? (await stripeSignature(raw, opts.secret));
  return call(webhook, { rawBody: raw, headers: { 'stripe-signature': signature } });
}

async function ordersFor(email: string) {
  const { results } = await env.DB.prepare('SELECT * FROM orders WHERE email = ?').bind(email).all<{ id: string; status: string; items: string }>();
  return results;
}

async function entitlementsFor(email: string) {
  const { results } = await env.DB.prepare(
    'SELECT e.scope, e.status, e.source FROM entitlements e JOIN users u ON u.id = e.user_id WHERE u.email = ? ORDER BY e.scope',
  )
    .bind(email)
    .all<{ scope: string; status: string; source: string }>();
  return results;
}

describe('POST /api/stripe/webhook: подпись', () => {
  it('без подписи 400', async () => {
    offlineStripe();
    const res = await call(webhook, { rawBody: '{}' });
    expect(res.status).toBe(400);
  });

  it('с чужим секретом 400 и ничего не создаётся', async () => {
    offlineStripe();
    const s = checkoutSession();
    const res = await deliver(stripeEvent('checkout.session.completed', s), { secret: 'whsec_wrong' });
    expect(res.status).toBe(400);
    expect(await ordersFor(s.customer_email)).toEqual([]);
  });

  it('старая подпись (больше 5 минут) 400', async () => {
    offlineStripe();
    const event = stripeEvent('checkout.session.completed', checkoutSession());
    const raw = JSON.stringify(event);
    const sig = await stripeSignature(raw, undefined, Math.floor(Date.now() / 1000) - 600);
    expect((await deliver(event, { signature: sig })).status).toBe(400);
  });
});

describe('POST /api/stripe/webhook: оплата', () => {
  it('оплата Лили: заказ, пользователь и право на категорию', async () => {
    offlineStripe();
    const s = checkoutSession({ scope: 'yagodicy' });
    const res = await deliver(stripeEvent('checkout.session.completed', s));
    expect(res.status).toBe(200);
    const orders = await ordersFor(s.customer_email);
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe('paid');
    expect(JSON.parse(orders[0].items)).toEqual(['yagodicy']);
    expect(await entitlementsFor(s.customer_email)).toEqual([{ scope: 'yagodicy', status: 'active', source: 'stripe' }]);
  });

  it('повтор того же события ничего не дублирует', async () => {
    offlineStripe();
    const s = checkoutSession();
    const event = stripeEvent('checkout.session.completed', s);
    expect((await deliver(event)).status).toBe(200);
    expect((await deliver(event)).status).toBe(200);
    // Другое событие о той же сессии (например, повторная отправка Stripe с новым id) тоже не дублирует.
    expect((await deliver(stripeEvent('checkout.session.completed', s))).status).toBe(200);
    expect(await ordersFor(s.customer_email)).toHaveLength(1);
    expect(await entitlementsFor(s.customer_email)).toHaveLength(1);
    const logged = await env.DB.prepare('SELECT COUNT(*) AS n FROM stripe_events WHERE event_id = ?').bind(event.id).first<{ n: number }>();
    expect(logged!.n).toBe(1);
  });

  it('чужое событие без brand=lily: 200 и ничего не создаётся', async () => {
    offlineStripe();
    const s1 = checkoutSession({ metadata: {} });
    const s2 = checkoutSession({ metadata: { brand: 'restorelab', scope: 'yagodicy' } });
    expect((await deliver(stripeEvent('checkout.session.completed', s1))).status).toBe(200);
    expect((await deliver(stripeEvent('checkout.session.completed', s2))).status).toBe(200);
    expect(await ordersFor(s1.customer_email)).toEqual([]);
    expect(await ordersFor(s2.customer_email)).toEqual([]);
  });

  it('неизвестная область в метаданных не даёт прав', async () => {
    offlineStripe();
    const s = checkoutSession({ scope: 'nope' });
    expect((await deliver(stripeEvent('checkout.session.completed', s))).status).toBe(200);
    expect(await entitlementsFor(s.customer_email)).toEqual([]);
  });

  it('отложенная оплата: право только после async_payment_succeeded', async () => {
    offlineStripe();
    const s = checkoutSession({ payment_status: 'unpaid' });
    await deliver(stripeEvent('checkout.session.completed', s));
    expect(await entitlementsFor(s.customer_email)).toEqual([]);
    await deliver(stripeEvent('checkout.session.async_payment_succeeded', { ...s, payment_status: 'paid' }));
    expect(await entitlementsFor(s.customer_email)).toEqual([{ scope: 'yagodicy', status: 'active', source: 'stripe' }]);
  });

  it('набор all открывает видео любой категории', async () => {
    offlineStripe();
    const email = freshEmail('bundle');
    await deliver(stripeEvent('checkout.session.completed', checkoutSession({ email, scope: 'all', amount_total: 4900 })));
    expect(await entitlementsFor(email)).toEqual([{ scope: 'all', status: 'active', source: 'stripe' }]);
    const { cookie } = await loginAs(email);
    const key = await streamTestKey();
    for (const id of ['yagodicy-01', 'zaryadka-01']) {
      const res = await call(playback, { params: { id }, cookie, env: key.env });
      expect(res.status, id).toBe(200);
    }
  });

  it('полный возврат отзывает право, частичный нет', async () => {
    offlineStripe();
    const full = checkoutSession();
    const part = checkoutSession();
    await deliver(stripeEvent('checkout.session.completed', full));
    await deliver(stripeEvent('checkout.session.completed', part));

    await deliver(stripeEvent('charge.refunded', { id: 'ch_1', object: 'charge', payment_intent: part.payment_intent, amount: 3900, amount_refunded: 1000, refunded: false }));
    expect((await entitlementsFor(part.customer_email))[0].status).toBe('active');

    const res = await deliver(stripeEvent('charge.refunded', { id: 'ch_2', object: 'charge', payment_intent: full.payment_intent, amount: 3900, amount_refunded: 3900, refunded: true }));
    expect(res.status).toBe(200);
    expect((await entitlementsFor(full.customer_email))[0].status).toBe('revoked');
    expect((await ordersFor(full.customer_email))[0].status).toBe('refunded');

    const { cookie } = await loginAs(full.customer_email);
    const key = await streamTestKey();
    expect((await call(playback, { params: { id: 'yagodicy-01' }, cookie, env: key.env })).status).toBe(403);
  });

  it('возврат по чужому платежу игнорируется', async () => {
    offlineStripe();
    const res = await deliver(stripeEvent('charge.refunded', { id: 'ch_x', object: 'charge', payment_intent: 'pi_foreign', amount: 100, amount_refunded: 100, refunded: true }));
    expect(res.status).toBe(200);
  });

  it('ручное право не трогается возвратом другого заказа', async () => {
    offlineStripe();
    const s = checkoutSession({ scope: 'zaryadka' });
    await deliver(stripeEvent('checkout.session.completed', s));
    const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(s.customer_email).first<{ id: string }>();
    await grant(user!.id, 'yagodicy');
    await deliver(stripeEvent('charge.refunded', { id: 'ch_3', object: 'charge', payment_intent: s.payment_intent, amount: 2500, amount_refunded: 2500, refunded: true }));
    const ents = await entitlementsFor(s.customer_email);
    expect(ents).toEqual([
      { scope: 'yagodicy', status: 'active', source: 'manual' },
      { scope: 'zaryadka', status: 'revoked', source: 'stripe' },
    ]);
  });
});

describe('POST /api/checkout', () => {
  function stripeWithPrice(priceId = 'price_existing') {
    const m = mockStripe([
      (c) => (c.method === 'GET' && c.path === '/v1/prices' ? { body: { data: [{ id: priceId, active: true }] } } : undefined),
      (c) => (c.method === 'POST' && c.path === '/v1/checkout/sessions' ? { body: { id: 'cs_test_new', url: 'https://checkout.stripe.com/c/pay/cs_test_new' } } : undefined),
    ]);
    restore = m.restore;
    return m;
  }

  it('гость с email: сессия Stripe с brand=lily, промокодами и возвратом на complete', async () => {
    const m = stripeWithPrice();
    const email = freshEmail('guest');
    const res = await call(checkout, {
      body: { scope: 'yagodicy', email: email.toUpperCase(), utm: { utm_source: 'instagram', utm_medium: 'stories', utm_campaign: 'nov' } },
      env: { STRIPE_SECRET_KEY: `rk_test_${Math.random()}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_new' });

    const lookup = m.calls.find((c) => c.path === '/v1/prices')!;
    expect(lookup.query.get('lookup_keys[0]')).toBe('lily_yagodicy_3900_eur');
    const s = m.calls.find((c) => c.path === '/v1/checkout/sessions')!.body;
    expect(s.get('mode')).toBe('payment');
    expect(s.get('line_items[0][price]')).toBe('price_existing');
    expect(s.get('line_items[0][quantity]')).toBe('1');
    expect(s.get('customer_email')).toBe(email);
    expect(s.get('metadata[brand]')).toBe('lily');
    expect(s.get('metadata[scope]')).toBe('yagodicy');
    expect(s.get('metadata[utm_source]')).toBe('instagram');
    expect(s.get('payment_intent_data[metadata][brand]')).toBe('lily');
    expect(s.get('payment_intent_data[statement_descriptor_suffix]')).toBe('LILY COACH');
    expect(s.get('allow_promotion_codes')).toBe('true');
    // Только евро: без пересчёта в валюту покупательницы (Adaptive Pricing общего аккаунта).
    expect(s.get('adaptive_pricing[enabled]')).toBe('false');
    expect(s.get('success_url')).toBe('https://cabinet.lily-smart-fitness.pages.dev/api/checkout/complete?session_id={CHECKOUT_SESSION_ID}');
    expect(s.get('cancel_url')).toContain('/checkout/cancel/');
    expect(s.get('branding_settings[display_name]')).toBe('Lily');
    expect(s.get('metadata[locale]')).toBe('ru');
    expect(s.get('locale')).toBe('ru');
  });

  it('EN: язык Checkout, metadata.locale и страница отмены на английском', async () => {
    const m = stripeWithPrice();
    await call(checkout, { body: { scope: 'yagodicy', email: freshEmail(), locale: 'en' }, env: { STRIPE_SECRET_KEY: `rk_test_${Math.random()}` } });
    const s = m.calls.find((c) => c.path === '/v1/checkout/sessions')!.body;
    expect(s.get('locale')).toBe('en');
    expect(s.get('metadata[locale]')).toBe('en');
    expect(s.get('cancel_url')).toBe('https://cabinet.lily-smart-fitness.pages.dev/en/checkout/cancel/?scope=yagodicy');
    expect(m.calls.find((c) => c.path === '/v1/prices')!.query.get('lookup_keys[0]')).toBe('lily_yagodicy_en_3900_eur');
  });

  it('EN: отдельный товар с английским названием', async () => {
    const m = mockStripe([
      (c) => (c.method === 'GET' && c.path === '/v1/prices' ? { body: { data: [] } } : undefined),
      (c) => (c.method === 'POST' && c.path === '/v1/products' ? { body: { id: 'lily_zaryadka_en' } } : undefined),
      (c) => (c.method === 'POST' && c.path === '/v1/prices' ? { body: { id: 'price_en' } } : undefined),
      (c) => (c.method === 'POST' && c.path === '/v1/checkout/sessions' ? { body: { id: 'cs_en', url: 'https://checkout.stripe.com/en' } } : undefined),
    ]);
    restore = m.restore;
    await call(checkout, { body: { scope: 'zaryadka', email: freshEmail(), locale: 'en' }, env: { STRIPE_SECRET_KEY: `rk_test_${Math.random()}` } });
    const product = m.calls.find((c) => c.method === 'POST' && c.path === '/v1/products')!.body;
    expect(product.get('id')).toBe('lily_zaryadka_en');
    expect(product.get('name')).toBe('Morning routine');
    expect(product.get('metadata[scope]')).toBe('zaryadka');
    expect(m.calls.find((c) => c.method === 'POST' && c.path === '/v1/prices')!.body.get('lookup_key')).toBe('lily_zaryadka_en_2500_eur');
  });

  it('вошедшая пользовательница платит со своим email, client_reference_id = её id', async () => {
    const m = stripeWithPrice();
    const { cookie, userId, email } = await loginAs();
    const res = await call(checkout, { cookie, body: { scope: 'zaryadka', email: 'other@example.com' }, env: { STRIPE_SECRET_KEY: `rk_test_${Math.random()}` } });
    expect(res.status).toBe(200);
    const s = m.calls.find((c) => c.path === '/v1/checkout/sessions')!.body;
    expect(s.get('customer_email')).toBe(email);
    expect(s.get('client_reference_id')).toBe(userId);
  });

  it('цены нет в Stripe: создаёт товар и цену с lookup_key из каталога', async () => {
    const m = mockStripe([
      (c) => (c.method === 'GET' && c.path === '/v1/prices' ? { body: { data: [] } } : undefined),
      (c) => (c.method === 'POST' && c.path === '/v1/products' ? { body: { id: 'lily_zaryadka' } } : undefined),
      (c) => (c.method === 'POST' && c.path === '/v1/prices' ? { body: { id: 'price_new' } } : undefined),
      (c) => (c.method === 'POST' && c.path === '/v1/checkout/sessions' ? { body: { id: 'cs_1', url: 'https://checkout.stripe.com/x' } } : undefined),
    ]);
    restore = m.restore;
    const res = await call(checkout, { body: { scope: 'zaryadka', email: freshEmail() }, env: { STRIPE_SECRET_KEY: `rk_test_${Math.random()}` } });
    expect(res.status).toBe(200);
    const product = m.calls.find((c) => c.method === 'POST' && c.path === '/v1/products')!.body;
    expect(product.get('id')).toBe('lily_zaryadka');
    expect(product.get('metadata[brand]')).toBe('lily');
    const price = m.calls.find((c) => c.method === 'POST' && c.path === '/v1/prices')!.body;
    expect(price.get('product')).toBe('lily_zaryadka');
    expect(price.get('unit_amount')).toBe('2500');
    expect(price.get('currency')).toBe('eur');
    expect(price.get('lookup_key')).toBe('lily_zaryadka_2500_eur');
    expect(m.calls.find((c) => c.path === '/v1/checkout/sessions')!.body.get('line_items[0][price]')).toBe('price_new');
  });

  it('набор all продаётся по цене набора', async () => {
    const m = stripeWithPrice();
    await call(checkout, { body: { scope: 'all', email: freshEmail() }, env: { STRIPE_SECRET_KEY: `rk_test_${Math.random()}` } });
    expect(m.calls.find((c) => c.path === '/v1/prices')!.query.get('lookup_keys[0]')).toBe('lily_all_4900_eur');
  });

  it('отклоняет неизвестную и бесплатную категорию, пустой email', async () => {
    stripeWithPrice();
    expect((await call(checkout, { body: { scope: 'nope', email: freshEmail() } })).status).toBe(400);
    expect((await call(checkout, { body: { scope: 'free', email: freshEmail() } })).status).toBe(400);
    expect((await call(checkout, { body: { scope: 'yagodicy' } })).status).toBe(400);
  });

  it('уже купленное: 409 already_owned', async () => {
    stripeWithPrice();
    const { cookie, userId } = await loginAs();
    await grant(userId, 'all');
    const res = await call(checkout, { cookie, body: { scope: 'yagodicy' } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'already_owned' });
  });

  it('Stripe не настроен: 503', async () => {
    stripeWithPrice();
    const res = await call(checkout, { body: { scope: 'yagodicy', email: freshEmail() }, env: { STRIPE_SECRET_KEY: '' } });
    expect(res.status).toBe(503);
  });
});

describe('GET /api/checkout/complete', () => {
  function stripeSession(session: Record<string, unknown>) {
    const m = mockStripe([
      (c) => (c.method === 'GET' && c.path === `/v1/checkout/sessions/${session.id}` ? { body: session } : undefined),
    ]);
    restore = m.restore;
    return m;
  }

  it('оплачено: создаёт право, ставит cookie и ведёт в кабинет на программу', async () => {
    const s = checkoutSession({
      scope: 'zaryadka',
      payment_intent: { id: 'pi_rcpt', latest_charge: { id: 'ch_r', receipt_url: 'https://pay.stripe.com/receipts/test' } },
    });
    stripeSession(s);
    const res = await call(complete, { path: `/api/checkout/complete?session_id=${s.id}` });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/account/?paid=zaryadka#/c/zaryadka');
    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/^lily_session=/);

    const body = await (await call(me, { cookie })).json<{ user: { email: string }; entitlements: Array<{ scope: string }>; orders: Array<{ id: string; number: string; scope: string; title: { ru: string } | null; status: string }> }>();
    expect(body.user.email).toBe(s.customer_email);
    expect(body.entitlements.map((e) => e.scope)).toEqual(['zaryadka']);
    // Свой чек в кабинете: номер и название программы; ссылка на чек Stripe в браузер не уходит
    expect(body.orders).toEqual([
      expect.objectContaining({ scope: 'zaryadka', status: 'paid', number: expect.stringMatching(/^[0-9A-F]{4}-[0-9A-F]{4}$/) }),
    ]);
    expect(body.orders[0].title?.ru).toBeTruthy();
    expect(body.orders[0]).not.toHaveProperty('receiptUrl');
  });

  it('cookie по ссылке возврата ставится один раз', async () => {
    const s = checkoutSession();
    stripeSession(s);
    await call(complete, { path: `/api/checkout/complete?session_id=${s.id}` });
    const again = await call(complete, { path: `/api/checkout/complete?session_id=${s.id}` });
    expect(again.status).toBe(302);
    expect(again.headers.get('set-cookie')).toBeNull();
    expect(again.headers.get('location')).toMatch(/^\/login\/\?next=/);
    expect(await ordersFor(s.customer_email)).toHaveLength(1);
  });

  it('после вебхука complete не дублирует заказ', async () => {
    offlineStripe();
    const s = checkoutSession();
    await deliver(stripeEvent('checkout.session.completed', s));
    restore?.();
    stripeSession(s);
    const res = await call(complete, { path: `/api/checkout/complete?session_id=${s.id}` });
    expect(res.headers.get('location')).toBe('/account/?paid=yagodicy#/c/yagodicy');
    expect(await ordersFor(s.customer_email)).toHaveLength(1);
  });

  it('не оплачено: страница ожидания, без cookie и прав', async () => {
    const s = checkoutSession({ payment_status: 'unpaid' });
    stripeSession(s);
    const res = await call(complete, { path: `/api/checkout/complete?session_id=${s.id}` });
    expect(res.headers.get('location')).toBe('/checkout/success/?pending=1');
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(await entitlementsFor(s.customer_email)).toEqual([]);
  });

  it('EN-покупка: кабинет и страницы оплаты на английском', async () => {
    const s = checkoutSession({ metadata: { brand: 'lily', scope: 'yagodicy', locale: 'en' } });
    stripeSession(s);
    const res = await call(complete, { path: `/api/checkout/complete?session_id=${s.id}` });
    expect(res.headers.get('location')).toBe('/en/account/?paid=yagodicy#/c/yagodicy');
    const again = await call(complete, { path: `/api/checkout/complete?session_id=${s.id}` });
    expect(again.headers.get('location')).toMatch(/^\/en\/login\/\?next=%2Fen%2Faccount%2F/);
    restore?.();
    const pending = checkoutSession({ payment_status: 'unpaid', metadata: { brand: 'lily', scope: 'yagodicy', locale: 'en' } });
    stripeSession(pending);
    expect((await call(complete, { path: `/api/checkout/complete?session_id=${pending.id}` })).headers.get('location')).toBe('/en/checkout/success/?pending=1');
  });

  it('чужая или неизвестная сессия: на страницу отмены', async () => {
    const s = checkoutSession({ metadata: { brand: 'restorelab' } });
    stripeSession(s);
    expect((await call(complete, { path: `/api/checkout/complete?session_id=${s.id}` })).headers.get('location')).toBe('/checkout/cancel/');
    expect((await call(complete, { path: '/api/checkout/complete?session_id=cs_unknown' })).headers.get('location')).toBe('/checkout/cancel/');
    expect((await call(complete, { path: '/api/checkout/complete' })).headers.get('location')).toBe('/checkout/cancel/');
  });
});
