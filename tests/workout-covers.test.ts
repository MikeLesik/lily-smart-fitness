import { afterEach, describe, expect, it } from 'vitest';
import { onRequestGet as getCatalog } from '../functions/api/catalog';
import { onRequestGet as playback } from '../functions/api/videos/[id]/playback';
import { onRequest as programRu } from '../functions/programs/[slug]';
import { onRequest as programEn } from '../functions/en/programs/[slug]';
import { catalog, setCatalogForTests, type Catalog } from '../server/catalog';
import type { Env } from '../server/env';
import { call, loginAs, streamTestKey } from './helpers';

// Фикстура: у postpartum обложки у тренировок 1–3, превью у 1 и 2 (previewOf), превью 2 в массиве первое.
const fixture: Catalog = structuredClone(catalog);

afterEach(() => {
  setCatalogForTests(fixture);
});

const env404 = {
  ASSETS: { fetch: async () => new Response('<html><title>404</title></html>', { status: 404 }) },
} as unknown as Partial<Env>;

function page(handler: typeof programRu, slug: string, path: string) {
  return call(handler, { path, params: { slug }, env: env404 });
}

async function text(res: Response | Promise<Response>): Promise<string> {
  return (await (await res).text()).replace(/ /g, ' ');
}

const COVER = (n: number) => `/assets/images/programs/postpartum/0${n}.jpg`;
const SMALL = (n: number) => `/assets/images/programs/postpartum/0${n}-480.jpg`;

/** Лента «Что внутри»: от <ul class="prg-eps"> до её </ul>. */
function lane(html: string): string {
  const m = html.match(/<ul class="prg-eps[^"]*"[^>]*>(.*?)<\/ul>/s);
  expect(m, 'лента карточек').not.toBeNull();
  return m![1];
}

describe('GET /api/catalog: обложки и превью тренировок', () => {
  type V = { id: string; cover: string | null; previewOf: string | null; preview: boolean; ready: boolean };
  async function videos(slug: string): Promise<V[]> {
    const body = await (await call(getCatalog)).json<{ categories: Array<{ slug: string; videos: V[] }> }>();
    return body.categories.find((c) => c.slug === slug)!.videos;
  }

  it('отдаёт cover и previewOf (null, если нет), UID не уходят', async () => {
    const raw = await (await call(getCatalog)).text();
    expect(raw).not.toContain('providerVideoId');
    for (const v of catalog.categories.flatMap((c) => c.videos)) if (v.providerVideoId) expect(raw).not.toContain(v.providerVideoId);

    const pp = await videos('postpartum');
    expect(pp.find((v) => v.id === 'postpartum-01')).toMatchObject({ cover: COVER(1), previewOf: null, preview: false });
    expect(pp.find((v) => v.id === 'postpartum-07')).toMatchObject({ cover: null, previewOf: null });
    expect(pp.find((v) => v.id === 'postpartum-01-preview')).toMatchObject({
      cover: COVER(1),
      previewOf: 'postpartum-01',
      preview: true,
      ready: true,
    });
    const old = await videos('yagodicy');
    expect(old.every((v) => v.cover === null && v.previewOf === null)).toBe(true);
  });
});

describe('GET /api/videos/:id/playback: превью тренировки', () => {
  it('превью тренировки гостю открыто, сама тренировка закрыта', async () => {
    const key = await streamTestKey();
    expect((await call(playback, { params: { id: 'postpartum-01-preview' }, env: key.env })).status).toBe(200);
    expect((await call(playback, { params: { id: 'postpartum-01' }, env: key.env })).status).toBe(401);
    const { cookie } = await loginAs();
    expect((await call(playback, { cookie, params: { id: 'postpartum-01' }, env: key.env })).status).toBe(403);
    expect((await call(playback, { cookie, params: { id: 'postpartum-02-preview' }, env: key.env })).status).toBe(200);
  });
});

describe('/programs/postpartum/: лента тренировок с обложками', () => {
  it('RU: карточки с обложкой 9:16, srcset из -480 и полной, alt с длительностью и «что понадобится»', async () => {
    const html = await text(page(programRu, 'postpartum', '/programs/postpartum/'));
    const cards = lane(html);
    expect(cards.match(/<li class="prg-ep"/g)).toHaveLength(7);
    expect(cards).toContain(`srcset="${SMALL(1)} 480w, ${COVER(1)} 1080w"`);
    expect(cards).toContain(`src="${SMALL(1)}"`);
    expect(cards).toContain('loading="lazy"');
    expect(cards).toContain('sizes="');
    expect(cards).toContain('width="480" height="854"');
    expect(cards).toContain('alt="Тренировка 1, 11 мин. Что понадобится: коврик и подушка"');
    // Описание есть только там, где оно заполнено
    expect(cards).toContain('Мягко будим стопы: с них начинается опора и осанка.');
    expect(cards).toContain('Дыхание и глубокие мышцы живота.');
    expect(cards.match(/class="prg-ep-desc"/g)).toHaveLength(2);
  });

  it('RU: название и длительность у карточки с обложкой не дублируются текстом, у карточки без обложки есть', async () => {
    const cards = lane(await text(page(programRu, 'postpartum', '/programs/postpartum/')));
    const items = cards.split('<li class="prg-ep"').slice(1);
    // Тренировки 1–3 с обложками: текст вшит в картинку
    for (const i of [0, 1, 2]) expect(items[i]).not.toContain('class="prg-ep-title"');
    // Тренировка 7 без обложки: обложка программы и название текстом
    expect(items[6]).toContain('class="prg-ep-title"');
    expect(items[6]).toContain('>Тренировка 7<');
    expect(items[6]).toContain('/assets/images/programs/free.jpg');
  });

  it('кнопки превью только у тренировок с готовым превью, с id этого превью', async () => {
    const cards = lane(await text(page(programRu, 'postpartum', '/programs/postpartum/')));
    const items = cards.split('<li class="prg-ep"').slice(1);
    expect(items[0]).toContain('data-preview-pick="postpartum-01-preview"');
    expect(items[0]).toContain('data-poster="' + COVER(1) + '"');
    expect(items[0]).toContain('>Превью · 31 с</a>');
    expect(items[1]).toContain('data-preview-pick="postpartum-02-preview"');
    for (const i of [2, 3, 4, 5, 6]) expect(items[i]).not.toContain('data-preview-pick');
  });

  it('плеер превью: по умолчанию превью первой тренировки (порядок в массиве не важен), постер = её обложка', async () => {
    const html = await text(page(programRu, 'postpartum', '/programs/postpartum/'));
    const player = html.match(/<div class="prg-player[^"]*"[^>]*>/)![0];
    expect(player).toContain('data-preview="postpartum-01-preview"');
    expect(player).toContain(`data-poster="${COVER(1)}"`);
    expect(player).toContain('data-frame-title="Превью: Тренировка 1"');
    const section = html.match(/<section class="prg-section prg-preview".*?<\/section>/s)![0];
    expect(section).toContain(`srcset="${SMALL(1)} 480w, ${COVER(1)} 1080w"`);
    expect(section).toContain('Посмотри превью');
    // Отдельной строки «превью» в «Что внутри» нет
    expect(html).not.toContain('prg-item--free');
  });

  it('EN: под обложкой название и длительность текстом (текст на картинке русский)', async () => {
    const html = await text(page(programEn, 'postpartum', '/en/programs/postpartum/'));
    const items = lane(html).split('<li class="prg-ep"').slice(1);
    expect(items[0]).toContain('<p class="prg-ep-title">Workout 1</p>');
    expect(items[0]).toContain('<p class="prg-ep-meta">11 min</p>');
    expect(items[0]).toContain('A gentle wake-up for your feet, where support and posture begin.');
    expect(items[0]).toContain('>Preview · 31 s</a>');
    expect(items[0]).toContain('alt="Workout 1, 11 min. What you need: a mat and a pillow"');
    expect(html).toContain('data-frame-title="Preview: Workout 1"');
    expect(html).not.toMatch(/Превью|Тренировка 1/);
  });

  it('«Что внутри» с лентой стоит на всю ширину, не в паре с «Для кого»', async () => {
    const html = await text(page(programRu, 'postpartum', '/programs/postpartum/'));
    const pair = html.match(/<div class="prg-pair">(.*?)<\/div>\s*<section class="prg-section prg-about"/s);
    expect(pair?.[1] ?? '').not.toContain('prg-inside');
    expect(html.indexOf('prg-for')).toBeLessThan(html.indexOf('prg-inside'));
    expect(html.indexOf('prg-inside')).toBeLessThan(html.indexOf('prg-about'));
  });

  it('«Скоро» (основные видео не готовы, превью готовы): ни ленты, ни превью', async () => {
    const next = structuredClone(fixture);
    for (const v of next.categories.find((c) => c.slug === 'postpartum')!.videos) {
      if (!v.preview) {
        v.providerVideoId = null;
        v.durationSec = null;
      }
    }
    setCatalogForTests(next);
    const html = await text(page(programRu, 'postpartum', '/programs/postpartum/'));
    expect(html).toContain('Программа скоро появится');
    expect(html).not.toContain('prg-eps');
    expect(html).not.toContain('data-preview');
    expect(html).not.toContain('id="preview"');
  });
});

describe('программа без обложек у тренировок: вёрстка прежняя', () => {
  it('список вместо ленты, строка превью, плеер с постером программы', async () => {
    const html = await text(page(programRu, 'yagodicy', '/programs/yagodicy/'));
    expect(html).not.toContain('prg-eps');
    expect(html).not.toContain('data-preview-pick');
    expect(html).toContain('<ul class="prg-items">');
    expect(html).toContain('prg-item--free');
    const player = html.match(/<div class="prg-player[^"]*"[^>]*>/)![0];
    expect(player).toContain('data-preview="yagodicy-preview"');
    expect(player).toContain('data-poster="/assets/images/programs/yagodicy-preview.jpg"');
    expect(html).toContain('Посмотри начало');
    // «Что внутри» по-прежнему в паре с «Для кого»
    expect(html).toMatch(/<div class="prg-pair"><section class="prg-section prg-for".*?<section class="prg-section prg-inside"/s);
  });
});
