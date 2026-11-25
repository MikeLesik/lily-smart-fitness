import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import realCatalog from '../content/catalog.json';
import { onRequestPost as webhook } from '../functions/api/stripe/webhook';
import { onRequestPost as checkout } from '../functions/api/checkout/index';
import { onRequestGet as complete } from '../functions/api/checkout/complete';
import { onRequestGet as playback } from '../functions/api/videos/[id]/playback';
import { onRequestPost as postProgress } from '../functions/api/progress';
import { onRequestGet as me } from '../functions/api/me';
import { onRequestGet as getCatalog } from '../functions/api/catalog';
import { onRequestPost as adminGrant } from '../functions/api/admin/grant';
import { onRequestGet as adminUsers } from '../functions/api/admin/users';
import { onRequest as programRu } from '../functions/programs/[slug]';
import { onRequest as programEn } from '../functions/en/programs/[slug]';
import { onRequest as indexRu } from '../functions/programs/index';
import {
  catalog,
  findSellable,
  isBundleAvailable,
  isComingSoon,
  isVideoReady,
  setCatalogForTests,
  type Catalog,
} from '../server/catalog';
import type { Env } from '../server/env';
import { formatDate } from '../server/email';
import { esc } from '../server/pages/html';
import { call, freshEmail, grant, loginAs, sessionCookie, streamTestKey } from './helpers';
import { checkoutSession, mockStripe, stripeEvent, stripeSignature } from './stripe-mock';

const DAY = 86400;
const fixture: Catalog = structuredClone(catalog);
const real = realCatalog as unknown as Catalog;

afterEach(() => {
  setCatalogForTests(fixture);
  vi.restoreAllMocks();
});

const now = () => Math.floor(Date.now() / 1000);

async function deliver(session: ReturnType<typeof checkoutSession>) {
  const raw = JSON.stringify(stripeEvent('checkout.session.completed', session));
  return call(webhook, { rawBody: raw, headers: { 'stripe-signature': await stripeSignature(raw) } });
}

async function entitlementOf(email: string, scope: string) {
  return env.DB.prepare(
    'SELECT e.expires_at, e.source FROM entitlements e JOIN users u ON u.id = e.user_id WHERE u.email = ? AND e.scope = ? ORDER BY e.created_at DESC',
  )
    .bind(email, scope)
    .first<{ expires_at: number | null; source: string }>();
}

function stripeWithPrice() {
  return mockStripe([
    (c) => (c.method === 'GET' && c.path === '/v1/prices' ? { body: { data: [{ id: 'price_x', active: true }] } } : undefined),
    (c) =>
      c.method === 'POST' && c.path === '/v1/checkout/sessions'
        ? { body: { id: 'cs_test_again', url: 'https://checkout.stripe.com/c/pay/cs_test_again' } }
        : undefined,
  ]);
}

const pp = () => catalog.categories.find((c) => c.slug === 'postpartum')!;
// Основное видео программы (превью в фикстуре стоят и перед основными, и после)
const ppVideo = () => pp().videos.find((v) => !v.preview)!;

describe('срок доступа: выдача', () => {
  it('вебхук: у программы с accessDays право до «сейчас + 30 дней», письмо со сроком', async () => {
    mockStripe([]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const s = checkoutSession({ scope: 'postpartum', amount_total: 5900 });
    const before = now();
    expect((await deliver(s)).status).toBe(200);
    const e = await entitlementOf(s.customer_email, 'postpartum');
    expect(e!.source).toBe('stripe');
    expect(e!.expires_at).toBeGreaterThanOrEqual(before + 30 * DAY);
    expect(e!.expires_at).toBeLessThanOrEqual(now() + 30 * DAY);
    const mail = log.mock.calls.map((c) => String(c[0])).find((m) => m.includes(s.customer_email));
    expect(mail).toContain(`Доступ открыт до ${formatDate(e!.expires_at!, 'ru')}.`);
  });

  it('вебхук: программа без accessDays остаётся бессрочной, в письме строки о сроке нет', async () => {
    mockStripe([]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const s = checkoutSession({ scope: 'yagodicy' });
    await deliver(s);
    expect((await entitlementOf(s.customer_email, 'yagodicy'))!.expires_at).toBeNull();
    const mail = log.mock.calls.map((c) => String(c[0])).find((m) => m.includes(s.customer_email));
    expect(mail).toBeDefined();
    expect(mail).not.toContain('Доступ открыт до');
  });

  it('/api/checkout/complete тоже ставит срок; повтор вебхука срок не меняет', async () => {
    const s = checkoutSession({ scope: 'postpartum', metadata: { brand: 'lily', scope: 'postpartum', locale: 'en' } });
    mockStripe([(c) => (c.method === 'GET' && c.path === `/v1/checkout/sessions/${s.id}` ? { body: s } : undefined)]);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await call(complete, { path: `/api/checkout/complete?session_id=${s.id}` });
    expect(res.status).toBe(302);
    const first = (await entitlementOf(s.customer_email, 'postpartum'))!.expires_at!;
    expect(first - now()).toBeGreaterThan(30 * DAY - 60);
    await deliver(s);
    expect((await entitlementOf(s.customer_email, 'postpartum'))!.expires_at).toBe(first);

    const body = await (await call(me, { cookie: sessionCookie(res) })).json<{ entitlements: Array<{ scope: string; expiresAt: number }> }>();
    expect(body.entitlements).toEqual([{ scope: 'postpartum', source: 'stripe', expiresAt: first }]);
  });

  it('админка: ручная выдача со сроком, в списке пользователей expiresAt', async () => {
    const { cookie } = await loginAs('boss@example.com');
    const email = freshEmail('manual-pp');
    const res = await call(adminGrant, { cookie, body: { email, scope: 'postpartum' } });
    const body = await res.json<{ ok: boolean; expiresAt: number }>();
    expect(body.ok).toBe(true);
    expect(body.expiresAt - now()).toBeGreaterThan(30 * DAY - 60);
    expect((await entitlementOf(email, 'postpartum'))!.expires_at).toBe(body.expiresAt);
    // Пока право действует, второе не выдаётся
    expect(await (await call(adminGrant, { cookie, body: { email, scope: 'postpartum' } })).json()).toEqual({ ok: true, existing: true });
    // Бессрочная программа: без срока
    const plain = await (await call(adminGrant, { cookie, body: { email, scope: 'zaryadka' } })).json<{ expiresAt: number | null }>();
    expect(plain.expiresAt).toBeNull();
    const users = await (await call(adminUsers, { cookie, path: `/api/admin/users?q=${encodeURIComponent(email)}` })).json<{
      users: Array<{ entitlements: Array<{ scope: string; expiresAt: number | null }> }>;
    }>();
    expect(users.users[0].entitlements.find((e) => e.scope === 'postpartum')!.expiresAt).toBe(body.expiresAt);
  });

  it('после окончания срока админка выдаёт новое право', async () => {
    const { cookie } = await loginAs('boss@example.com');
    const user = await loginAs();
    await grant(user.userId, 'postpartum', { expiresAt: now() - 10 });
    const res = await (await call(adminGrant, { cookie, body: { email: user.email, scope: 'postpartum' } })).json<{ existing?: boolean; expiresAt: number }>();
    expect(res.existing).toBeUndefined();
    expect(res.expiresAt).toBeGreaterThan(now());
  });
});

describe('срок доступа: проверка', () => {
  it('действующее право: playback 200; истёкшее: 403, прогресс 403', async () => {
    const key = await streamTestKey();
    const active = await loginAs();
    await grant(active.userId, 'postpartum', { expiresAt: now() + DAY });
    expect((await call(playback, { cookie: active.cookie, params: { id: ppVideo().id }, env: key.env })).status).toBe(200);

    const expired = await loginAs();
    await grant(expired.userId, 'postpartum', { expiresAt: now() - 1 });
    const res = await call(playback, { cookie: expired.cookie, params: { id: ppVideo().id }, env: key.env });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
    expect((await call(postProgress, { cookie: expired.cookie, body: { videoId: ppVideo().id, seconds: 10 } })).status).toBe(403);
  });

  it('действующее право: повторная покупка 409 already_owned', async () => {
    const m = stripeWithPrice();
    const { cookie, userId } = await loginAs();
    await grant(userId, 'postpartum', { expiresAt: now() + DAY });
    const res = await call(checkout, { cookie, body: { scope: 'postpartum' } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'already_owned' });
    expect(m.calls).toEqual([]);
  });

  it('истёкшее право: купить снова можно, /api/me отдаёт его в expired', async () => {
    stripeWithPrice();
    const { cookie, userId } = await loginAs();
    const ended = now() - 3 * DAY;
    await grant(userId, 'postpartum', { expiresAt: ended - DAY });
    await grant(userId, 'postpartum', { expiresAt: ended });
    const res = await call(checkout, { cookie, body: { scope: 'postpartum' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_again' });

    const body = await (await call(me, { cookie })).json<{ entitlements: unknown[]; expired: unknown[] }>();
    expect(body.entitlements).toEqual([]);
    expect(body.expired).toEqual([{ scope: 'postpartum', expiresAt: ended }]);
  });

  it('купила снова: новое право со свежим сроком, в expired программы больше нет', async () => {
    mockStripe([]);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { cookie, userId, email } = await loginAs();
    await grant(userId, 'postpartum', { expiresAt: now() - DAY });
    await deliver(checkoutSession({ scope: 'postpartum', email }));
    const body = await (await call(me, { cookie })).json<{ entitlements: Array<{ scope: string; expiresAt: number }>; expired: unknown[] }>();
    expect(body.expired).toEqual([]);
    expect(body.entitlements).toHaveLength(1);
    expect(body.entitlements[0].expiresAt - now()).toBeGreaterThan(30 * DAY - 60);
  });
});

describe('неготовые видео (без providerVideoId)', () => {
  function withUnready(ids: string[]) {
    const next = structuredClone(fixture);
    for (const v of next.categories.flatMap((c) => c.videos)) {
      if (ids.includes(v.id)) {
        v.providerVideoId = null;
        v.durationSec = null;
      }
    }
    setCatalogForTests(next);
  }

  it('одно неготовое видео: программа «скоро», в /api/catalog ready: false, UID не уходят', async () => {
    withUnready(['postpartum-03']);
    expect(isVideoReady(pp().videos.find((v) => v.id === 'postpartum-03')!)).toBe(false);
    expect(isComingSoon(pp())).toBe(true);
    const raw = await (await call(getCatalog)).text();
    const body = JSON.parse(raw) as { categories: Array<{ slug: string; comingSoon: boolean; accessDays: number | null; videos: Array<{ id: string; ready: boolean; equipment: unknown }> }> };
    const c = body.categories.find((x) => x.slug === 'postpartum')!;
    expect(c.comingSoon).toBe(true);
    expect(c.accessDays).toBe(30);
    expect(c.videos.find((v) => v.id === 'postpartum-03')!.ready).toBe(false);
    expect(c.videos.find((v) => v.id === 'postpartum-01')).toMatchObject({ ready: true, equipment: { ru: 'коврик и подушка', en: 'a mat and a pillow' } });
    expect(raw).not.toContain('providerVideoId');
  });

  it('неготовое видео: playback 404 даже с правом; покупка 409 coming_soon', async () => {
    withUnready(['postpartum-03']);
    const key = await streamTestKey();
    const { cookie, userId } = await loginAs();
    await grant(userId, 'postpartum', { expiresAt: now() + DAY });
    const res = await call(playback, { cookie, params: { id: 'postpartum-03' }, env: key.env });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
    // Готовое видео той же программы играет
    expect((await call(playback, { cookie, params: { id: 'postpartum-01' }, env: key.env })).status).toBe(200);
    const buy = await call(checkout, { body: { scope: 'postpartum', email: freshEmail() } });
    expect(buy.status).toBe(409);
    expect(await buy.json()).toEqual({ error: 'coming_soon' });
  });

  it('все видео готовы: программа продаётся сама', () => {
    expect(isComingSoon(pp())).toBe(false);
    expect(findSellable('postpartum')).toMatchObject({ comingSoon: false, accessDays: 30, price: { amount: 5900 } });
  });

  it('настоящий каталог: postpartum из 7 тренировок с «что понадобится», превью ссылаются на свои тренировки', async () => {
    setCatalogForTests(real);
    const c = catalog.categories.find((x) => x.slug === 'postpartum')!;
    expect(catalog.categories[0].slug).toBe('postpartum');
    expect(c).toMatchObject({ published: true, free: false, price: { amount: 5900, currency: 'eur' }, accessDays: 30 });
    const mains = c.videos.filter((v) => !v.preview);
    expect(mains.map((v) => v.id)).toEqual([1, 2, 3, 4, 5, 6, 7].map((n) => `postpartum-0${n}`));
    expect(mains.every((v) => v.equipment?.ru && v.equipment?.en)).toBe(true);
    // Превью у каждой тренировки (схема 26.11): previewOf указывает на основное видео этой же программы
    for (const p of c.videos.filter((v) => v.preview)) expect(mains.map((v) => v.id), p.id).toContain(p.previewOf);
    // «Скоро», пока не готово хотя бы одно основное видео; неготовое не играет
    expect(isComingSoon(c)).toBe(!mains.every(isVideoReady));
    const key = await streamTestKey();
    const first = mains[0];
    if (!isVideoReady(first)) expect((await call(playback, { params: { id: first.id }, env: key.env })).status).toBe(404);
    // Старые программы и набор сняты с сайта, записи остались
    for (const slug of ['yagodicy', 'zaryadka']) expect(catalog.categories.find((x) => x.slug === slug)!.published).toBe(false);
    expect(catalog.bundles.find((b) => b.slug === 'all')!.published).toBe(false);
    const body = await (await call(getCatalog)).json<{ categories: Array<{ slug: string }>; bundles: unknown[] }>();
    expect(body.categories.map((x) => x.slug)).toEqual(['postpartum', 'free']);
    expect(body.bundles).toEqual([]);
  });
});

describe('правило набора: минимум две платные программы', () => {
  function onlyPaid(slugs: string[]) {
    const next = structuredClone(fixture);
    for (const c of next.categories) if (!c.free) c.published = slugs.includes(c.slug);
    setCatalogForTests(next);
  }

  it('две и больше: набор в /api/catalog и продаётся', async () => {
    onlyPaid(['yagodicy', 'zaryadka']);
    expect(isBundleAvailable(catalog.bundles[0])).toBe(true);
    expect(findSellable('all')).not.toBeNull();
    const body = await (await call(getCatalog)).json<{ bundles: Array<{ slug: string }> }>();
    expect(body.bundles.map((b) => b.slug)).toEqual(['all']);
  });

  it('одна платная: набора нет нигде, оплатить нельзя', async () => {
    onlyPaid(['postpartum']);
    expect(isBundleAvailable(catalog.bundles[0])).toBe(false);
    expect(findSellable('all')).toBeNull();
    const body = await (await call(getCatalog)).json<{ bundles: unknown[] }>();
    expect(body.bundles).toEqual([]);
    expect((await call(checkout, { body: { scope: 'all', email: freshEmail() } })).status).toBe(400);
    const env404 = { ASSETS: { fetch: async () => new Response('', { status: 404 }) } } as unknown as Partial<Env>;
    const index = await (await call(indexRu, { path: '/programs/', env: env404 })).text();
    expect(index).not.toContain('prg-bundle');
    const program = await (await call(programRu, { path: '/programs/postpartum/', params: { slug: 'postpartum' }, env: env404 })).text();
    expect(program).not.toContain('data-buy="all"');
  });

  it('published: false у набора: снят, даже если программ несколько', async () => {
    const next = structuredClone(fixture);
    next.bundles[0].published = false;
    setCatalogForTests(next);
    expect(findSellable('all')).toBeNull();
    expect((await (await call(getCatalog)).json<{ bundles: unknown[] }>()).bundles).toEqual([]);
  });
});

describe('/programs/postpartum/', () => {
  const env404 = { ASSETS: { fetch: async () => new Response('<html><title>404</title></html>', { status: 404 }) } } as unknown as Partial<Env>;
  const page = async (handler: typeof programRu, path: string) =>
    (await (await call(handler, { path, params: { slug: 'postpartum' }, env: env404 })).text()).replace(/ /g, ' ');

  /** Как текст попадает в HTML страницы, но с обычными пробелами (page() убирает неразрывные). */
  const plain = (value: string) => esc(value).replace(/\u00a0/g, ' ');

  function insideItems(html: string): string[] {
    const section = html.match(/<section class="prg-section prg-inside[^"]*"[\s\S]*?<\/section>/)![0];
    // Строки списка (<li>) или карточки ленты с обложками (<li class="prg-ep">)
    return section.match(/<li[^>]*>[\s\S]*?<\/li>/g) ?? [];
  }

  it('RU, программа продаётся: название, €59, срок 30 дней везде, без «навсегда»', async () => {
    const html = await page(programRu, '/programs/postpartum/');
    expect(html).toContain('>Послеродовое восстановление</h1>');
    expect(html).toContain('€59');
    expect(html).toMatch(/<p class="prg-meta">7 тренировок · \d+ мин · доступ 30 дней<\/p>/);
    expect(html).toContain('>Одна оплата, доступ на 30 дней</h2>');
    expect(html).toContain('Доступ открыт 30 дней с момента оплаты');
    expect(html).not.toMatch(/навсегда/i);
    const items = insideItems(html);
    expect(items).toHaveLength(7);
    // У карточки с обложкой «что понадобится» в alt (текст вшит в картинку), у остальных строкой
    expect(items[0]).toContain('Что понадобится: коврик и подушка');
    for (const item of items.slice(1, 6)) expect(item).toMatch(/Что понадобится: коврик[<"]/);
    // Пустое equipment: строки нет
    expect(items[6]).not.toContain('Что понадобится');
    expect(html).toContain('data-buy="postpartum"');
  });

  it('EN, программа продаётся: 30 days of access, без forever/lifetime', async () => {
    const html = await page(programEn, '/en/programs/postpartum/');
    expect(html).toContain('>Postpartum recovery</h1>');
    expect(html).toContain('€59');
    expect(html).toMatch(/<p class="prg-meta">7 workouts · \d+ min · 30 days of access<\/p>/);
    expect(html).toContain('>Pay once, 30 days of access</h2>');
    expect(html).not.toMatch(/forever|lifetime|for good/i);
    const items = insideItems(html);
    expect(items).toHaveLength(7);
    expect(items[1]).toMatch(/What you need: a mat[<"]/);
  });

  it('бессрочная программа: прежние тексты про доступ', async () => {
    const html = (await (await call(programRu, { path: '/programs/yagodicy/', params: { slug: 'yagodicy' }, env: env404 })).text()).replace(/ /g, ' ');
    expect(html).toContain('Одна оплата, доступ навсегда');
    expect(html).toContain('Видео остаётся у тебя навсегда');
    expect(html).not.toContain('доступ 30 дней');
  });

  it('настоящий каталог (RU и EN): 7 тренировок с «что понадобится», срок 30 дней; пока не всё готово, «Скоро» без покупки', async () => {
    setCatalogForTests(real);
    const cat = catalog.categories.find((x) => x.slug === 'postpartum')!;
    const mains = cat.videos.filter((v) => !v.preview);
    const soon = isComingSoon(cat);
    const ru = await page(programRu, '/programs/postpartum/');
    expect(ru).toContain('>Послеродовое восстановление</h1>');
    expect(ru).toContain('€59');
    expect(ru).toMatch(soon ? /<p class="prg-meta">Скоро · доступ 30 дней<\/p>/ : /<p class="prg-meta">7 тренировок · \d+ мин · доступ 30 дней<\/p>/);
    expect(ru).not.toMatch(/навсегда/i);
    if (soon) expect(ru).not.toContain('data-buy=');
    const items = insideItems(ru);
    expect(items).toHaveLength(7);
    items.forEach((item, i) => {
      const v = mains[i];
      // «Скоро»: строка списка с названием; продаётся: название в тексте или в alt обложки
      expect(item).toContain(plain(v.title.ru));
      expect(item).toContain(plain(`Что понадобится: ${v.equipment!.ru}`));
    });
    expect(ru).not.toContain('—');

    const en = await page(programEn, '/en/programs/postpartum/');
    expect(en).toContain('>Postpartum recovery</h1>');
    if (soon) expect(en).toContain('<p class="prg-meta">Coming soon · 30 days of access</p>');
    expect(en).not.toMatch(/forever|lifetime/i);
    expect(insideItems(en)).toHaveLength(7);
    expect(en).toContain(plain(`What you need: ${mains[0].equipment!.en}`));
  });

  it('настоящий каталог: старые программы отдают 404', async () => {
    setCatalogForTests(real);
    for (const slug of ['yagodicy', 'zaryadka']) {
      const res = await call(programRu, { path: `/programs/${slug}/`, params: { slug }, env: env404 });
      expect(res.status, slug).toBe(404);
    }
  });
});
