import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import realCatalog from '../content/catalog.json';
import { onRequestGet as getCatalog } from '../functions/api/catalog';
import { onRequestPost as checkout } from '../functions/api/checkout/index';
import { onRequestPost as leads } from '../functions/api/leads';
import { onRequestPost as webhook } from '../functions/api/stripe/webhook';
import { onRequest as programRu } from '../functions/programs/[slug]';
import { onRequest as programEn } from '../functions/en/programs/[slug]';
import { onRequest as indexRu } from '../functions/programs/index';
import { onRequest as indexEn } from '../functions/en/programs/index';
import {
  catalog,
  findSellable,
  isBundleComingSoon,
  isComingSoon,
  setCatalogForTests,
  type Catalog,
  type CatalogCategory,
} from '../server/catalog';
import type { Env } from '../server/env';
import { call, freshEmail, loginAs } from './helpers';
import { checkoutSession, mockStripe, stripeEvent, stripeSignature } from './stripe-mock';

// Фикстура с видео (tests/setup-catalog.ts); каждый тест сам снимает видео, после теста каталог возвращается.
const fixture: Catalog = structuredClone(catalog);

afterEach(() => {
  setCatalogForTests(fixture);
  vi.restoreAllMocks();
});

/** Каталог без видео у перечисленных категорий (по умолчанию у всех), как после решения 25.11.2026. */
function withoutVideos(slugs?: string[]): void {
  const next = structuredClone(fixture);
  for (const c of next.categories) if (!slugs || slugs.includes(c.slug)) c.videos = [];
  setCatalogForTests(next);
}

const env404 = {
  ASSETS: { fetch: async () => new Response('<html><title>404</title></html>', { status: 404 }) },
} as unknown as Partial<Env>;

function page(handler: typeof programRu, slug: string, path: string) {
  return call(handler, { path, params: { slug }, env: env404 });
}

async function text(res: Response | Promise<Response>): Promise<string> {
  return (await (await res).text()).replace(/ /g, ' ');
}

function cat(slug: string): CatalogCategory {
  return catalog.categories.find((c) => c.slug === slug)!;
}

describe('правило «скоро» (server/catalog.ts)', () => {
  it('категория без основных видео = скоро, превью не в счёт', () => {
    expect(isComingSoon(cat('yagodicy'))).toBe(false);
    withoutVideos(['yagodicy']);
    expect(isComingSoon(cat('yagodicy'))).toBe(true);
    const onlyPreview = { ...structuredClone(fixture.categories[0]), videos: fixture.categories[0].videos.filter((v) => v.preview) };
    expect(onlyPreview.videos.length).toBeGreaterThan(0);
    expect(isComingSoon(onlyPreview)).toBe(true);
  });

  it('набор скоро, только когда видео нет ни в одной платной категории', () => {
    const bundle = () => catalog.bundles.find((b) => b.slug === 'all')!;
    expect(isBundleComingSoon(bundle())).toBe(false);
    withoutVideos(['yagodicy']);
    expect(isBundleComingSoon(bundle())).toBe(false);
    expect(findSellable('all')!.comingSoon).toBe(false);
    withoutVideos(['yagodicy', 'zaryadka', 'postpartum']);
    expect(isBundleComingSoon(bundle())).toBe(true);
    expect(findSellable('all')!.comingSoon).toBe(true);
  });
});

describe('GET /api/catalog: comingSoon', () => {
  it('с видео: comingSoon false у категорий и набора', async () => {
    const body = await (await call(getCatalog)).json<{ categories: Array<{ comingSoon: boolean }>; bundles: Array<{ comingSoon: boolean }> }>();
    expect(body.categories.every((c) => c.comingSoon === false)).toBe(true);
    expect(body.bundles.every((b) => b.comingSoon === false)).toBe(true);
  });

  it('без видео: comingSoon true у всех категорий и у набора, цены и названия на месте', async () => {
    withoutVideos();
    const body = await (await call(getCatalog)).json<{
      categories: Array<{ slug: string; comingSoon: boolean; videos: unknown[]; price: unknown; title: unknown }>;
      bundles: Array<{ slug: string; comingSoon: boolean; price: { amount: number } }>;
    }>();
    for (const c of body.categories) {
      expect(c.comingSoon, c.slug).toBe(true);
      expect(c.videos, c.slug).toEqual([]);
      expect(c.title, c.slug).toBeTruthy();
    }
    expect(body.categories.find((c) => c.slug === 'yagodicy')!.price).toEqual({ amount: 3900, currency: 'eur' });
    expect(body.bundles.find((b) => b.slug === 'all')).toMatchObject({ comingSoon: true, price: { amount: 4900 } });
  });

  it('одна платная без видео: скоро только она, набор продаётся', async () => {
    withoutVideos(['yagodicy']);
    const body = await (await call(getCatalog)).json<{ categories: Array<{ slug: string; comingSoon: boolean }>; bundles: Array<{ comingSoon: boolean }> }>();
    const soon = Object.fromEntries(body.categories.map((c) => [c.slug, c.comingSoon]));
    expect(soon).toMatchObject({ yagodicy: true, zaryadka: false, free: false });
    expect(body.bundles[0].comingSoon).toBe(false);
  });
});

describe('POST /api/checkout: «скоро»', () => {
  it('категория без видео: 409 coming_soon, в Stripe не ходит (гость и вошедшая)', async () => {
    withoutVideos(['yagodicy']);
    const m = mockStripe([]);
    const guest = await call(checkout, { body: { scope: 'yagodicy', email: freshEmail() } });
    expect(guest.status).toBe(409);
    expect(await guest.json()).toEqual({ error: 'coming_soon' });
    const { cookie } = await loginAs();
    const member = await call(checkout, { cookie, body: { scope: 'yagodicy' } });
    expect(member.status).toBe(409);
    expect(await member.json()).toEqual({ error: 'coming_soon' });
    expect(m.calls).toEqual([]);
  });

  it('набор без видео: 409 coming_soon, в Stripe не ходит', async () => {
    withoutVideos();
    const m = mockStripe([]);
    const res = await call(checkout, { body: { scope: 'all', email: freshEmail() } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'coming_soon' });
    expect(m.calls).toEqual([]);
  });

  it('неизвестная и бесплатная категория по-прежнему 400 invalid_scope', async () => {
    withoutVideos();
    mockStripe([]);
    expect(await (await call(checkout, { body: { scope: 'nope', email: freshEmail() } })).json()).toEqual({ error: 'invalid_scope' });
    expect(await (await call(checkout, { body: { scope: 'free', email: freshEmail() } })).json()).toEqual({ error: 'invalid_scope' });
  });

  it('оплата, начатая до снятия видео, всё равно открывает доступ (вебхук)', async () => {
    withoutVideos(['yagodicy']);
    mockStripe([]);
    const s = checkoutSession({ scope: 'yagodicy' });
    const raw = JSON.stringify(stripeEvent('checkout.session.completed', s));
    const res = await call(webhook, { rawBody: raw, headers: { 'stripe-signature': await stripeSignature(raw) } });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare(
      'SELECT e.scope, e.status FROM entitlements e JOIN users u ON u.id = e.user_id WHERE u.email = ?',
    )
      .bind(s.customer_email)
      .first();
    expect(row).toEqual({ scope: 'yagodicy', status: 'active' });
  });
});

describe('POST /api/leads: бесплатного урока ещё нет', () => {
  it('409 coming_soon: письма нет, пользователь не создаётся', async () => {
    withoutVideos(['free']);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const email = freshEmail('soon-lead');
    const res = await call(leads, { body: { email, consent: true, utm: { utm_source: 'instagram' } } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'coming_soon' });
    expect(log.mock.calls.map((a) => a.join(' ')).join('\n')).not.toContain(email);
    expect(await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()).toBeNull();
  });
});

describe('страница программы «скоро»', () => {
  it('RU: цена и «Программа скоро появится», без покупки, превью, оплаты из России и липкой полосы', async () => {
    withoutVideos();
    const c = cat('yagodicy');
    const res = await page(programRu, c.slug, `/programs/${c.slug}/`);
    expect(res.status).toBe(200);
    const html = await text(res);
    expect(html).toContain(`>${c.title.ru}</h1>`);
    expect(html).toContain('€39');
    expect(html).toContain('Программа скоро появится');
    expect(html).toContain('Скоро · доступ навсегда');
    expect(html).toContain('Видео появятся скоро.');
    expect(html).toContain('Для кого');
    expect(html).toContain('Частые вопросы');
    expect(html).not.toContain('data-buy=');
    expect(html).not.toMatch(/Купить/);
    expect(html).not.toContain('Оплатить из России переводом');
    expect(html).not.toContain('data-russia-pay');
    expect(html).not.toContain('data-sticky-buy');
    expect(html).not.toContain('id="preview"');
    expect(html).not.toContain('data-preview');
    expect(html).not.toContain('Смотреть превью');
    expect(html).not.toContain('Посмотри начало');
    expect(html).not.toMatch(/(^|\D)0 (тренировок|мин|с[^а-яё])/);
    expect(html).not.toContain('/js/program.js');
    // «Написать Лиле»: вопрос про эту программу
    const write = html.match(/<a class="cab-secondary" href="([^"]+)" target="_blank" rel="noopener" data-soon-write>([^<]+)<\/a>/);
    expect(write).not.toBeNull();
    expect(write![2]).toBe('Написать Лиле');
    expect(decodeURIComponent(write![1].replace('https://t.me/LilyLesik?text=', ''))).toBe(
      `Привет, Лиля! У меня вопрос про программу «${c.title.ru}».`,
    );
    expect(html).toContain('id="buy"');
  });

  it('JSON-LD: Product без Offer', async () => {
    withoutVideos();
    const html = await (await page(programRu, 'yagodicy', '/programs/yagodicy/')).text();
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1]);
    expect(ld['@type']).toBe('Product');
    expect(ld.offers).toBeUndefined();
  });

  it('EN: Coming soon, без Buy', async () => {
    withoutVideos();
    const html = await text(page(programEn, 'zaryadka', '/en/programs/zaryadka/'));
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('€25');
    expect(html).toContain('This program is coming soon');
    expect(html).toContain('Coming soon · lifetime access');
    expect(html).toContain('The videos are coming soon.');
    expect(html).toContain('>Message Lily</a>');
    expect(html).not.toMatch(/>Buy\b|data-buy=|Pay by transfer from Russia|Watch preview|data-sticky-buy/);
    expect(html).not.toMatch(/Скоро|Купить/);
  });

  it('программа с видео рядом со «скоро» продаётся как раньше', async () => {
    withoutVideos(['yagodicy']);
    const html = await text(page(programRu, 'zaryadka', '/programs/zaryadka/'));
    expect(html).toContain('data-buy="zaryadka"');
    expect(html).toContain('data-sticky-buy');
    expect(html).toContain('id="preview"');
    expect(html).not.toContain('Программа скоро появится');
  });
});

describe('/programs/ «скоро»', () => {
  it('RU: карточки и набор без «Купить», с ценами и «Скоро»; без зова на бесплатный урок', async () => {
    withoutVideos();
    const html = await text(call(indexRu, { path: '/programs/', env: env404 }));
    expect(html).not.toContain('data-buy=');
    expect(html).not.toContain('Купить');
    expect(html.match(/<p class="prg-soon[^"]*">Скоро<\/p>/g)).toHaveLength(4); // три программы и набор
    for (const c of ['yagodicy', 'zaryadka']) expect(html).toContain(`href="/programs/${c}/"`);
    expect(html).toContain('€39');
    expect(html).toContain('€25');
    expect(html).toContain('€49');
    expect(html).not.toMatch(/0 тренировок/);
    expect(html).not.toContain('Можно начать бесплатно');
  });

  it('EN: Coming soon', async () => {
    withoutVideos();
    const html = await text(call(indexEn, { path: '/en/programs/', env: env404 }));
    expect(html).not.toContain('data-buy=');
    expect(html).toContain('>Coming soon</p>');
    expect(html).not.toContain('Start for free');
  });
});

describe('content/catalog.json (настоящий каталог)', () => {
  const real = realCatalog as unknown as Catalog;

  it('годится для сайта: цены у платных и наборов, id видео уникальны, UID в формате Stream', () => {
    expect(real).not.toBe(catalog);
    expect(real.categories).not.toBe(fixture.categories);
    expect(real.categories.length).toBeGreaterThan(0);
    for (const c of real.categories) {
      expect(c.title.ru, c.slug).toBeTruthy();
      expect(Array.isArray(c.videos), c.slug).toBe(true);
      if (!c.free) expect(c.price?.amount, c.slug).toBeGreaterThan(0);
    }
    for (const b of real.bundles) expect(b.price.amount, b.slug).toBeGreaterThan(0);
    const videos = real.categories.flatMap((c) => c.videos);
    expect(new Set(videos.map((v) => v.id)).size).toBe(videos.length);
    // Неготовое видео (ещё не загружено): оба поля null. Готовое: длительность и UID в формате Stream.
    for (const v of videos) {
      if (v.providerVideoId === null) {
        expect(v.durationSec, v.id).toBeNull();
        continue;
      }
      expect(v.durationSec, v.id).toBeGreaterThan(0);
      expect(v.providerVideoId, v.id).toMatch(/^[a-f0-9]{32}$/);
    }
    expect(JSON.stringify(real)).not.toContain('—');
  });

  it('/api/catalog на настоящем каталоге: признак comingSoon по правилу, UID в ответ не уходят', async () => {
    setCatalogForTests(real);
    const res = await call(getCatalog);
    const raw = await res.text();
    const body = JSON.parse(raw) as { categories: Array<{ slug: string; comingSoon: boolean }> };
    for (const c of body.categories) expect(c.comingSoon, c.slug).toBe(isComingSoon(real.categories.find((x) => x.slug === c.slug)!));
    expect(raw).not.toContain('providerVideoId');
    for (const v of real.categories.flatMap((c) => c.videos)) if (v.providerVideoId) expect(raw).not.toContain(v.providerVideoId);
  });
});
