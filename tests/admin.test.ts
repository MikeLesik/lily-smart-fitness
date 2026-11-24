import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet as listUsers } from '../functions/api/admin/users';
import { onRequestPost as grant } from '../functions/api/admin/grant';
import { onRequestPost as revoke } from '../functions/api/admin/revoke';
import { onRequestGet as exportCsv } from '../functions/api/admin/export';
import { onRequestGet as playback } from '../functions/api/videos/[id]/playback';
import { onRequestPost as webhook } from '../functions/api/stripe/webhook';
import { call, freshEmail, loginAs, streamTestKey } from './helpers';
import { checkoutSession, mockStripe, stripeEvent, stripeSignature } from './stripe-mock';

afterEach(() => vi.restoreAllMocks());

const admin = () => loginAs('boss@example.com');

async function webhookPurchase(session: ReturnType<typeof checkoutSession>, extraEnv = {}) {
  const raw = JSON.stringify(stripeEvent('checkout.session.completed', session));
  return call(webhook, { rawBody: raw, headers: { 'stripe-signature': await stripeSignature(raw) }, env: extraEnv });
}

describe('доступ к /api/admin', () => {
  it('гостю 401, не админу 403', async () => {
    expect((await call(listUsers)).status).toBe(401);
    const { cookie } = await loginAs();
    expect((await call(listUsers, { cookie })).status).toBe(403);
    expect((await call(grant, { cookie, body: { email: freshEmail(), scope: 'yagodicy' } })).status).toBe(403);
    expect((await call(exportCsv, { cookie, path: '/api/admin/export?type=buyers' })).status).toBe(403);
  });

  it('админ из списка, регистр email не важен', async () => {
    const { cookie } = await loginAs('lily.admin@example.com');
    expect((await call(listUsers, { cookie })).status).toBe(200);
  });

  it('без ADMIN_EMAILS админов нет', async () => {
    const { cookie } = await admin();
    expect((await call(listUsers, { cookie, env: { ADMIN_EMAILS: '' } })).status).toBe(403);
  });
});

describe('выдача и отзыв доступа', () => {
  it('выдать доступ по email: создаёт пользователя и ручное право, видео открывается', async () => {
    const { cookie } = await admin();
    const email = freshEmail('manual');
    const res = await call(grant, { cookie, body: { email: email.toUpperCase(), scope: 'zaryadka' } });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare(
      "SELECT e.scope, e.source, e.status FROM entitlements e JOIN users u ON u.id = e.user_id WHERE u.email = ?",
    )
      .bind(email)
      .first();
    expect(row).toEqual({ scope: 'zaryadka', source: 'manual', status: 'active' });

    const buyer = await loginAs(email);
    const key = await streamTestKey();
    expect((await call(playback, { params: { id: 'zaryadka-01' }, cookie: buyer.cookie, env: key.env })).status).toBe(200);
  });

  it('повторная выдача не дублирует право', async () => {
    const { cookie } = await admin();
    const email = freshEmail();
    await call(grant, { cookie, body: { email, scope: 'all' } });
    const again = await call(grant, { cookie, body: { email, scope: 'all' } });
    expect(await again.json()).toMatchObject({ ok: true, existing: true });
    const n = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM entitlements e JOIN users u ON u.id = e.user_id WHERE u.email = ? AND e.status = 'active'",
    )
      .bind(email)
      .first<{ n: number }>();
    expect(n!.n).toBe(1);
  });

  it('неизвестная область и пустой email: 400', async () => {
    const { cookie } = await admin();
    expect((await call(grant, { cookie, body: { email: freshEmail(), scope: 'nope' } })).status).toBe(400);
    expect((await call(grant, { cookie, body: { email: 'x', scope: 'yagodicy' } })).status).toBe(400);
  });

  it('отозвать право по id: видео снова закрыто', async () => {
    const { cookie } = await admin();
    const email = freshEmail();
    await call(grant, { cookie, body: { email, scope: 'yagodicy' } });
    const list = await (await call(listUsers, { cookie, path: `/api/admin/users?q=${encodeURIComponent(email)}` })).json<{
      users: Array<{ email: string; entitlements: Array<{ id: string; scope: string; status: string }> }>;
    }>();
    const ent = list.users[0].entitlements[0];
    const res = await call(revoke, { cookie, body: { entitlementId: ent.id } });
    expect(res.status).toBe(200);
    const buyer = await loginAs(email);
    const key = await streamTestKey();
    expect((await call(playback, { params: { id: 'yagodicy-01' }, cookie: buyer.cookie, env: key.env })).status).toBe(403);
    expect((await call(revoke, { cookie, body: { entitlementId: 'nope' } })).status).toBe(404);
  });
});

describe('список пользователей', () => {
  it('поиск по email, права, заказы и UTM', async () => {
    mockStripe([]);
    const s = checkoutSession({ scope: 'yagodicy', metadata: { brand: 'lily', scope: 'yagodicy', utm_source: 'instagram', utm_medium: 'stories', utm_campaign: 'nov' } });
    await webhookPurchase(s);
    const { cookie } = await admin();
    const body = await (await call(listUsers, { cookie, path: `/api/admin/users?q=${encodeURIComponent(s.customer_email)}` })).json<{
      users: Array<Record<string, any>>;
    }>();
    expect(body.users).toHaveLength(1);
    const u = body.users[0];
    expect(u.email).toBe(s.customer_email);
    expect(u.utm).toEqual({ utm_source: 'instagram', utm_medium: 'stories', utm_campaign: 'nov' });
    expect(u.entitlements.map((e: { scope: string }) => e.scope)).toEqual(['yagodicy']);
    expect(u.orders[0]).toMatchObject({ scope: 'yagodicy', amount: 3900, currency: 'eur', status: 'paid' });
  });
});

describe('CSV', () => {
  it('покупатели: заказ с теми же UTM, что в Stripe', async () => {
    mockStripe([]);
    const s = checkoutSession({
      scope: 'zaryadka',
      amount_total: 2500,
      metadata: { brand: 'lily', scope: 'zaryadka', utm_source: 'instagram', utm_medium: 'reels', utm_campaign: 'csv-test' },
    });
    await webhookPurchase(s);
    const { cookie } = await admin();
    const res = await call(exportCsv, { cookie, path: '/api/admin/export?type=buyers' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('buyers');
    const text = await res.text();
    const [header, ...rows] = text.replace(/^﻿/, '').trim().split('\r\n');
    expect(header).toBe('email,created_at,scope,amount,currency,status,utm_source,utm_medium,utm_campaign,receipt_url');
    const row = rows.find((r) => r.startsWith(s.customer_email))!;
    expect(row).toContain(',zaryadka,25.00,EUR,paid,instagram,reels,csv-test,');
  });

  it('лиды: пользователи с бесплатным уроком, согласие и UTM', async () => {
    const email = freshEmail('leadcsv');
    await env.DB.prepare(
      "INSERT INTO users (id, email, locale, marketing_consent, utm_source, utm_medium, utm_campaign, created_at) VALUES ('u-lead-csv', ?, 'ru', 1, 'instagram', 'bio', '=HYPERLINK(\"x\")', 0)",
    )
      .bind(email)
      .run();
    await env.DB.prepare(
      "INSERT INTO entitlements (id, user_id, scope, source, status, created_at) VALUES ('e-lead-csv', 'u-lead-csv', 'free', 'free', 'active', 0)",
    ).run();
    const { cookie } = await admin();
    const text = await (await call(exportCsv, { cookie, path: '/api/admin/export?type=leads' })).text();
    const [header, ...rows] = text.replace(/^﻿/, '').trim().split('\r\n');
    expect(header).toBe('email,created_at,locale,marketing_consent,utm_source,utm_medium,utm_campaign');
    const row = rows.find((r) => r.startsWith(email))!;
    // Формула в UTM не исполнится в Excel: впереди апостроф, кавычки удвоены.
    expect(row).toBe(`${email},1970-01-01T00:00:00.000Z,ru,yes,instagram,bio,"'=HYPERLINK(""x"")"`);
  });

  it('неизвестный тип: 400', async () => {
    const { cookie } = await admin();
    expect((await call(exportCsv, { cookie, path: '/api/admin/export?type=nope' })).status).toBe(400);
  });
});

describe('аналитика с сервера', () => {
  function posthogMock() {
    const calls: Array<{ url: string; body: any }> = [];
    const original = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input as RequestInfo, init);
      if (new URL(req.url).hostname === 'eu.i.posthog.com') {
        calls.push({ url: req.url, body: await req.json() });
        return new Response('{"status":"Ok"}');
      }
      if (new URL(req.url).hostname === 'api.stripe.com') return new Response('{}', { status: 404 });
      return original(input as RequestInfo, init);
    });
    return calls;
  }

  it('покупка из вебхука отправляет purchase в PostHog с UTM и id пользователя', async () => {
    const calls = posthogMock();
    const s = checkoutSession({ scope: 'yagodicy', metadata: { brand: 'lily', scope: 'yagodicy', locale: 'en', utm_source: 'instagram', utm_medium: 'ads', utm_campaign: 'ph' } });
    await webhookPurchase(s, { POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://eu.i.posthog.com' });
    const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(s.customer_email).first<{ id: string }>();
    const ev = calls.find((c) => c.body.event === 'purchase')!;
    expect(ev.url).toBe('https://eu.i.posthog.com/i/v0/e/');
    expect(ev.body.api_key).toBe('phc_test');
    expect(ev.body.distinct_id).toBe(user!.id);
    expect(ev.body.properties).toMatchObject({
      slug: 'yagodicy',
      amount: 39,
      currency: 'EUR',
      locale: 'en',
      utm_source: 'instagram',
      utm_medium: 'ads',
      utm_campaign: 'ph',
    });
    expect(JSON.stringify(ev.body)).not.toContain(s.customer_email);
  });

  it('без POSTHOG_KEY ничего не отправляется', async () => {
    const calls = posthogMock();
    await webhookPurchase(checkoutSession());
    expect(calls).toEqual([]);
  });

  it('UTM покупки записывается новому пользователю', async () => {
    mockStripe([]);
    const s = checkoutSession({ metadata: { brand: 'lily', scope: 'yagodicy', utm_source: 'instagram', utm_medium: 'bio', utm_campaign: 'first' } });
    await webhookPurchase(s);
    const u = await env.DB.prepare('SELECT utm_source, utm_medium, utm_campaign FROM users WHERE email = ?').bind(s.customer_email).first();
    expect(u).toEqual({ utm_source: 'instagram', utm_medium: 'bio', utm_campaign: 'first' });
  });
});
