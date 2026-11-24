import type { Env } from '../env';
import { paidCategories, publishedCategories } from '../catalog';
import { STRINGS, type Lang } from './i18n';
import { renderProgramPage } from './program';
import { renderProgramsIndex } from './programs-index';

/** Pages даёт функциям привязку ASSETS: статика из src/ (нужна для страницы 404). */
export type PagesEnv = Env & { ASSETS?: Fetcher };

type Ctx = EventContext<PagesEnv, string, unknown>;

const PAGE_CACHE = 'public, max-age=300';

function htmlResponse(request: Request, html: string, lang: Lang, status = 200, cache = PAGE_CACHE): Response {
  return new Response(request.method === 'HEAD' ? null : html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-language': lang,
      'cache-control': cache,
    },
  });
}

function redirect(request: Request, path: string, status: 301 | 302): Response {
  const url = new URL(request.url);
  return new Response(null, {
    status,
    headers: { location: path + url.search, 'cache-control': status === 301 ? PAGE_CACHE : 'no-store' },
  });
}

function methodNotAllowed(): Response {
  return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
}

const FALLBACK_404 =
  '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>404 · Lily</title></head><body><h1>404</h1><p><a href="/">lily.coach</a></p></body></html>';

/**
 * Страница 404 сайта с кодом 404: src/404.html (EN src/en/404.html) из статики.
 * Pages отдаёт «/404.html» редиректом на «/404», поэтому идём по редиректу сами.
 */
export async function notFoundPage(request: Request, env: PagesEnv, lang: Lang): Promise<Response> {
  let html = '';
  if (env.ASSETS) {
    try {
      let url = new URL(lang === 'en' ? '/en/404.html' : '/404.html', request.url);
      for (let hop = 0; hop < 3; hop++) {
        const res = await env.ASSETS.fetch(new Request(url, { redirect: 'manual' }));
        const location = res.headers.get('location');
        if (res.status >= 300 && res.status < 400 && location) {
          url = new URL(location, url);
          continue;
        }
        if (res.ok) html = await res.text();
        break;
      }
    } catch (err) {
      console.error('[programs] 404 page', err);
    }
  }
  return htmlResponse(request, html || FALLBACK_404, lang, 404, 'no-store');
}

/** /programs/ и /en/programs/. Без косой черты в конце: 301 на адрес с ней. */
export function programsIndex(lang: Lang): PagesFunction<PagesEnv> {
  return async (ctx: Ctx) => {
    const { request } = ctx;
    if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed();
    const base = `${STRINGS[lang].prefix}/programs/`;
    if (new URL(request.url).pathname !== base) return redirect(request, base, 301);
    return htmlResponse(request, renderProgramsIndex(lang), lang);
  };
}

/**
 * /programs/<slug>/ и /en/programs/<slug>/: продающая страница платной опубликованной программы.
 * Бесплатная категория → 302 на /free/; неизвестная или неопубликованная → 404 сайта.
 */
export function programPage(lang: Lang): PagesFunction<PagesEnv> {
  return async (ctx: Ctx) => {
    const { request, env, params } = ctx;
    if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed();
    const slug = typeof params.slug === 'string' ? params.slug : '';
    const prefix = STRINGS[lang].prefix;

    if (publishedCategories().some((c) => c.free && c.slug === slug)) {
      return redirect(request, `${prefix}/free/`, 302);
    }
    const cat = paidCategories().find((c) => c.slug === slug);
    if (!cat) return notFoundPage(request, env, lang);

    const path = `${prefix}/programs/${cat.slug}/`;
    if (new URL(request.url).pathname !== path) return redirect(request, path, 301);
    return htmlResponse(request, renderProgramPage(cat, lang), lang);
  };
}
