import { describe, expect, it } from 'vitest';
import { onRequest as programRu } from '../functions/programs/[slug]';
import { onRequest as programEn } from '../functions/en/programs/[slug]';
import { onRequest as indexRu } from '../functions/programs/index';
import { onRequest as indexEn } from '../functions/en/programs/index';
import { catalog, paidCategories, publishedCategories, type CatalogCategory } from '../server/catalog';
import type { Env } from '../server/env';
import { esc, jsonLd, nbsp } from '../server/pages/html';
import { call } from './helpers';

/** Статика Pages: /404.html отдаётся редиректом на /404, как на настоящем Pages. */
const assets = {
  async fetch(input: Request | string | URL): Promise<Response> {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname.endsWith('/404.html')) {
      return new Response(null, { status: 308, headers: { location: url.pathname.replace(/\.html$/, '') } });
    }
    if (url.pathname === '/404') return new Response('<html lang="ru"><title>Страница не найдена · Lily</title></html>');
    if (url.pathname === '/en/404') return new Response('<html lang="en"><title>Page not found · Lily</title></html>');
    return new Response('not found', { status: 404 });
  },
};
const env = { ASSETS: assets } as unknown as Partial<Env>;

const paid = paidCategories();
const first = paid[0];
const freeCat = publishedCategories().find((c) => c.free)!;
const allVideoUids = catalog.categories.flatMap((c) => c.videos.map((v) => v.providerVideoId));

function page(handler: typeof programRu, slug: string, path: string) {
  return call(handler, { path, params: { slug }, env });
}

/** Текст страницы с обычными пробелами вместо неразрывных. */
async function text(res: Response | Promise<Response>): Promise<string> {
  return (await (await res).text()).replace(/\u00a0/g, ' ');
}

function euros(c: CatalogCategory): string {
  return `€${c.price!.amount / 100}`;
}

describe('каталог для продающих страниц', () => {
  it('есть хотя бы две платные программы, набор и бесплатный урок', () => {
    expect(paid.length).toBeGreaterThanOrEqual(2);
    expect(catalog.bundles.find((b) => b.slug === 'all')).toBeDefined();
    expect(freeCat).toBeDefined();
  });

  it('у каждой платной программы 3–4 пункта «Для кого» на обоих языках, описание и превью', () => {
    for (const c of paid) {
      expect(c.forWhom?.ru.length, c.slug).toBeGreaterThanOrEqual(3);
      expect(c.forWhom?.ru.length, c.slug).toBeLessThanOrEqual(4);
      expect(c.forWhom?.en?.length, c.slug).toBe(c.forWhom?.ru.length);
      expect(c.description?.ru, c.slug).toBeTruthy();
      expect(c.description?.en, c.slug).toBeTruthy();
      expect(c.videos.some((v) => v.preview), c.slug).toBe(true);
    }
  });

  it('в новых текстах нет длинного тире', () => {
    expect(JSON.stringify(catalog)).not.toContain('—');
  });
});

describe('GET /programs/<slug>/', () => {
  it('платная программа: 200, заголовок, цена, кнопка покупки, кеш на 5 минут', async () => {
    const res = await page(programRu, first.slug, `/programs/${first.slug}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    const html = await res.text();
    expect(html).toContain('<html lang="ru">');
    expect(html).toContain(`>${esc(first.title.ru)}</h1>`);
    expect(html).toContain(euros(first));
    expect(html).toContain(`data-buy="${first.slug}"`);
    expect(html).toContain('/js/buy.js');
    expect(html).toContain('/css/buy.css');
    expect(html).toContain('id="preview"');
    expect(html).toContain('/legal/refunds/');
  });

  it('SEO: canonical, hreflang, og и JSON-LD Product с Offer', async () => {
    const html = await (await page(programRu, first.slug, `/programs/${first.slug}/`)).text();
    const url = `https://lily.coach/programs/${first.slug}/`;
    expect(html).toContain(`<link rel="canonical" href="${url}">`);
    expect(html).toContain(`hreflang="ru" href="${url}"`);
    expect(html).toContain(`hreflang="en" href="https://lily.coach/en/programs/${first.slug}/"`);
    expect(html).toContain(`hreflang="x-default" href="${url}"`);
    expect(html).toContain(`<meta property="og:url" content="${url}">`);
    expect(html).toContain(`<meta property="og:image" content="https://lily.coach/assets/images/programs/${first.slug}.jpg">`);
    expect(html).toContain('<meta name="twitter:card"');
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1]);
    expect(ld['@type']).toBe('Product');
    expect(ld.name).toBe(first.title.ru);
    expect(ld.offers).toMatchObject({
      '@type': 'Offer',
      price: (first.price!.amount / 100).toFixed(2),
      priceCurrency: first.price!.currency.toUpperCase(),
      availability: 'https://schema.org/InStock',
      url,
    });
  });

  it('EN-страница на английском, со ссылками на EN-разделы', async () => {
    const res = await page(programEn, first.slug, `/en/programs/${first.slug}/`);
    expect(res.status).toBe(200);
    const html = await text(res);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain(`>${first.title.en}</h1>`);
    expect(html).toContain(`Buy · ${euros(first)}`);
    expect(html).toContain('Who it is for');
    expect(html).toContain('href="/en/free/"');
    expect(html).toContain('href="/en/login/"');
    expect(html).toContain('href="/en/legal/refunds/"');
    expect(html).toContain(`<link rel="canonical" href="https://lily.coach/en/programs/${first.slug}/">`);
    expect(html).not.toMatch(/Купить|Для кого|Частые вопросы/);
  });

  it('в HTML нет идентификаторов видео в хостинге', async () => {
    for (const c of paid) {
      for (const [handler, path] of [
        [programRu, `/programs/${c.slug}/`],
        [programEn, `/en/programs/${c.slug}/`],
      ] as const) {
        const html = await (await page(handler, c.slug, path)).text();
        for (const uid of allVideoUids) expect(html, path).not.toContain(uid);
        expect(html, path).not.toContain('providerVideoId');
      }
    }
  });

  it('неизвестный адрес: страница 404 сайта с кодом 404', async () => {
    const ru = await page(programRu, 'nope', '/programs/nope/');
    expect(ru.status).toBe(404);
    expect(await ru.text()).toContain('Страница не найдена');
    const en = await page(programEn, 'nope', '/en/programs/nope/');
    expect(en.status).toBe(404);
    expect(await en.text()).toContain('Page not found');
  });

  it('набор «all» не категория: 404', async () => {
    const res = await page(programRu, 'all', '/programs/all/');
    expect(res.status).toBe(404);
  });

  it('неопубликованная программа: 404', async () => {
    const hidden: CatalogCategory = { ...first, slug: 'hidden-test', published: false };
    catalog.categories.push(hidden);
    try {
      const res = await page(programRu, 'hidden-test', '/programs/hidden-test/');
      expect(res.status).toBe(404);
    } finally {
      catalog.categories.splice(catalog.categories.indexOf(hidden), 1);
    }
  });

  it('без ASSETS 404 всё равно HTML с кодом 404', async () => {
    const res = await call(programRu, { path: '/programs/nope/', params: { slug: 'nope' } });
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('text/html');
  });

  it('бесплатный урок: 302 на /free/ (EN /en/free/), метки сохраняются', async () => {
    const ru = await page(programRu, freeCat.slug, `/programs/${freeCat.slug}/?utm_source=instagram`);
    expect(ru.status).toBe(302);
    expect(ru.headers.get('location')).toBe('/free/?utm_source=instagram');
    const en = await page(programEn, freeCat.slug, `/en/programs/${freeCat.slug}/`);
    expect(en.status).toBe(302);
    expect(en.headers.get('location')).toBe('/en/free/');
  });

  it('без косой черты в конце: 301 на адрес с ней, метки сохраняются', async () => {
    const res = await page(programRu, first.slug, `/programs/${first.slug}?utm_source=instagram&utm_medium=bio`);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(`/programs/${first.slug}/?utm_source=instagram&utm_medium=bio`);
  });

  it('HEAD без тела, POST 405', async () => {
    const head = await programRu({
      request: new Request(`https://lily.coach/programs/${first.slug}/`, { method: 'HEAD' }),
      env: env as Env,
      params: { slug: first.slug },
      data: {},
      functionPath: '',
      waitUntil() {},
      passThroughOnException() {},
      next: async () => new Response('next'),
    } as unknown as Parameters<typeof programRu>[0]);
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    const post = await call(programRu, { path: `/programs/${first.slug}/`, params: { slug: first.slug }, env, body: {} });
    expect(post.status).toBe(405);
  });
});

describe('GET /programs/', () => {
  it('показывает все платные программы и набор «Все программы», без бесплатного урока в карточках', async () => {
    const res = await call(indexRu, { path: '/programs/', env });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    const html = await res.text();
    for (const c of paid) {
      expect(html).toContain(`href="/programs/${c.slug}/"`);
      expect(html).toContain(`data-buy="${c.slug}"`);
      expect(html).toContain(esc(c.title.ru));
      expect(html).toContain(euros(c));
    }
    expect(html).toContain('data-buy="all"');
    expect(html).toContain('href="/free/"');
    expect(html).not.toContain(`data-buy="${freeCat.slug}"`);
    expect(html).not.toContain(`/programs/${freeCat.slug}/`);
    expect(html).toContain('<link rel="canonical" href="https://lily.coach/programs/">');
    for (const uid of allVideoUids) expect(html).not.toContain(uid);
  });

  it('EN-каталог на английском', async () => {
    const html = await text(call(indexEn, { path: '/en/programs/', env }));
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('Video programs');
    for (const c of paid) expect(html).toContain(`href="/en/programs/${c.slug}/"`);
    expect(html).toContain('href="/en/free/"');
  });

  it('без косой черты: 301 на /programs/', async () => {
    const res = await call(indexRu, { path: '/programs?utm_source=instagram' });
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/programs/?utm_source=instagram');
  });
});

describe('разметка', () => {
  it('esc экранирует HTML и кавычки', () => {
    expect(esc('<b title="x">\'</b>')).toBe('&lt;b title=&quot;x&quot;&gt;&#39;&lt;/b&gt;');
  });

  it('jsonLd не даёт закрыть <script>', () => {
    expect(jsonLd({ a: '</script><b>' })).not.toContain('</script>');
  });

  it('nbsp не оставляет короткие слова в конце строки', () => {
    expect(nbsp('и в доме, a mat')).toBe('и в доме, a mat');
  });
});
