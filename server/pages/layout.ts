import { esc, jsonLd } from './html';
import { SITE, STRINGS, telegramLink, type Lang } from './i18n';

/** Версии статики в ссылках: сброс кеша при правке CSS и JS. */
export const ASSET_VERSIONS = {
  variables: 3,
  reset: 2,
  components: 5,
  cabinet: 7,
  buyCss: 2,
  programsCss: 3,
  buyJs: 4,
  programJs: 3,
  analyticsJs: 1,
};

export interface DocumentOptions {
  lang: Lang;
  title: string;
  description: string;
  /** Путь без языкового префикса: /programs/ или /programs/<slug>/. */
  path: string;
  ogType: 'website' | 'product';
  /** Абсолютный адрес картинки для соцсетей. */
  image: { url: string; width: number; height: number; alt: string };
  /** Дополнительные теги в <head> (preload, product:price). */
  head?: string;
  structuredData: unknown;
  current: 'programs' | 'program';
  body: string;
  /** Подключать program.js (превью-плеер и липкая полоса покупки). */
  withPlayer?: boolean;
  /** Текст для ссылки Telegram в подвале. */
  telegramText: string;
}

export function pageUrl(lang: Lang, path: string): string {
  return `${SITE}${STRINGS[lang].prefix}${path}`;
}

function header(lang: Lang, current: DocumentOptions['current']): string {
  const t = STRINGS[lang];
  const p = t.prefix;
  const here = current === 'programs' ? ' aria-current="page"' : '';
  return (
    `<header class="cab-header prg-header">` +
    `<a href="${p}/" class="cab-logo" aria-label="${esc(t.logoLabel)}"><img src="/assets/images/favicon.png" alt="" width="28" height="28"><span>LILY</span></a>` +
    `<nav class="cab-nav prg-nav" aria-label="${esc(t.navLabel)}">` +
    `<a href="${p}/programs/" class="cab-nav-link"${here}>${esc(t.navPrograms)}</a>` +
    `<a href="${p}/login/" class="cab-nav-link" data-nav-login>${esc(t.navLogin)}</a>` +
    `</nav>` +
    `</header>`
  );
}

function footer(lang: Lang, path: string, telegramText: string): string {
  const t = STRINGS[lang];
  const p = t.prefix;
  const other: Lang = lang === 'ru' ? 'en' : 'ru';
  const year = new Date().getUTCFullYear();
  return (
    `<footer class="prg-footer">` +
    `<nav class="prg-footer-links" aria-label="${esc(t.footerLegal)}">` +
    `<a href="${p}/free/">${esc(t.navFree)}</a>` +
    `<a href="${p}/legal/terms/">${esc(t.terms)}</a>` +
    `<a href="${p}/legal/privacy/">${esc(t.privacy)}</a>` +
    `<a href="${p}/legal/refunds/">${esc(t.refunds)}</a>` +
    `<a href="${esc(telegramLink(telegramText))}" target="_blank" rel="noopener">${esc(t.telegram)}</a>` +
    `<a href="${STRINGS[other].prefix}${path}" hreflang="${other}" lang="${other}">${esc(t.switchLang)}</a>` +
    `</nav>` +
    `<p class="prg-footer-copy">© ${year} Lily Lesik</p>` +
    `</footer>`
  );
}

/** Полная HTML-страница: head с SEO, светлая шапка, контент, подвал, скрипты. */
export function renderDocument(o: DocumentOptions): string {
  const t = STRINGS[o.lang];
  const v = ASSET_VERSIONS;
  const canonical = pageUrl(o.lang, o.path);
  const ru = pageUrl('ru', o.path);
  const en = pageUrl('en', o.path);
  return `<!DOCTYPE html>
<html lang="${o.lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${esc(canonical)}">
<link rel="alternate" hreflang="ru" href="${esc(ru)}">
<link rel="alternate" hreflang="en" href="${esc(en)}">
<link rel="alternate" hreflang="x-default" href="${esc(ru)}">
<meta property="og:type" content="${o.ogType}">
<meta property="og:site_name" content="Lily">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:locale" content="${t.ogLocale}">
<meta property="og:locale:alternate" content="${t.ogLocaleAlt}">
<meta property="og:image" content="${esc(o.image.url)}">
<meta property="og:image:width" content="${o.image.width}">
<meta property="og:image:height" content="${o.image.height}">
<meta property="og:image:alt" content="${esc(o.image.alt)}">
<meta name="twitter:card" content="summary_large_image">
${o.head ?? ''}
<link rel="icon" type="image/png" sizes="32x32" href="/assets/images/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/assets/images/favicon-16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/images/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400&family=Manrope:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/variables.css?v=${v.variables}">
<link rel="stylesheet" href="/css/reset.css?v=${v.reset}">
<link rel="stylesheet" href="/css/components.css?v=${v.components}">
<link rel="stylesheet" href="/css/cabinet.css?v=${v.cabinet}">
<link rel="stylesheet" href="/css/buy.css?v=${v.buyCss}">
<link rel="stylesheet" href="/css/programs.css?v=${v.programsCss}">
<script type="application/ld+json">${jsonLd(o.structuredData)}</script>
<script src="/js/analytics.js?v=${v.analyticsJs}" defer></script>
</head>
<body class="cab-body prg-body">
${header(o.lang, o.current)}
<main class="prg-main" id="main">
${o.body}
</main>
${footer(o.lang, o.path, o.telegramText)}
<script src="/js/buy.js?v=${v.buyJs}" defer></script>
${o.withPlayer ? `<script src="/js/program.js?v=${v.programJs}" defer></script>` : ''}
</body>
</html>
`;
}
