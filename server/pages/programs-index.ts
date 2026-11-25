import { isComingSoon, paidCategories, publishedCategories, type CatalogCategory } from '../catalog';
import { esc, picture } from './html';
import { SITE, STRINGS, fmt, formatPrice, loc, plural, type Lang } from './i18n';
import { pageUrl, renderDocument } from './layout';
import { buyButton, bundleDeal, countMeta, coverOf } from './program';


function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLocaleLowerCase() + s.slice(1) : s;
}

function card(cat: CatalogCategory, lang: Lang, index: number): string {
  const t = STRINGS[lang];
  const title = loc(cat.title, lang);
  const price = formatPrice(cat.price, lang);
  const href = `${t.prefix}/programs/${cat.slug}/`;
  const soon = isComingSoon(cat);
  // «Скоро»: на месте «Купить» спокойная надпись, в мете только цена
  const meta = soon ? '' : `<span>${esc(countMeta(cat, lang))}</span>`;
  const primary = soon
    ? `<p class="prg-soon">${esc(t.soon)}</p>`
    : `<a class="btn-primary" href="${href}#buy" data-buy="${esc(cat.slug)}" data-buy-title="${esc(title)}" data-buy-price="${esc(price)}">` +
      `${esc(t.buyShort)}<span class="visually-hidden"> «${esc(title)}», ${esc(price)}</span></a>`;
  return (
    `<li class="prg-card">` +
    `<a class="prg-card-cover" href="${href}" tabindex="-1" aria-hidden="true">` +
    picture({
      src: coverOf(cat),
      alt: '',
      width: 480,
      height: 600,
      className: 'prg-cover',
      eager: index < 2,
    }) +
    `</a>` +
    `<h2 class="prg-card-title"><a href="${href}">${esc(title)}</a></h2>` +
    (cat.subtitle ? `<p class="prg-card-sub">${esc(loc(cat.subtitle, lang))}</p>` : '') +
    `<p class="prg-card-meta"><span class="prg-card-price">${esc(price)}</span>${meta}</p>` +
    `<div class="prg-card-actions">` +
    primary +
    `<a class="cab-secondary" href="${href}">${esc(t.more)}<span class="visually-hidden">: ${esc(title)}</span></a>` +
    `</div>` +
    `</li>`
  );
}

/** Каталог /programs/ (EN /en/programs/): платные программы, набор «Все программы», бесплатный урок. */
export function renderProgramsIndex(lang: Lang): string {
  const t = STRINGS[lang];
  const cats = paidCategories();
  const deal = bundleDeal(lang);
  const free = publishedCategories().find((c) => c.free);

  let body =
    `<section class="prg-intro" aria-labelledby="prg-index-title">` +
    `<h1 class="prg-title prg-title--index" id="prg-index-title">${esc(t.indexTitle)}</h1>` +
    `<p class="prg-lead">${esc(t.indexLead)}</p>` +
    `<ul class="prg-cards" aria-label="${esc(t.programsLabel)}">${cats.map((c, i) => card(c, lang, i)).join('')}</ul>` +
    `</section>`;

  if (deal) {
    const title = loc(deal.bundle.title, lang) || t.bundleTitle;
    const text = deal.count === 2 ? t.bundleBoth : fmt(t.bundleMany, { n: deal.count, programs: plural(deal.count, t.programForms, lang) });
    body +=
      `<section class="prg-section prg-bundle" aria-labelledby="prg-bundle-title">` +
      `<div class="prg-bundle-box">` +
      picture({
        src: coverOf(deal.bundle),
        alt: '',
        width: 480,
        height: 600,
        className: 'prg-cover',
        pictureClass: 'prg-bundle-cover',
      }) +
      `<div class="prg-bundle-body">` +
      `<h2 class="prg-h2" id="prg-bundle-title">${esc(title)}</h2>` +
      `<p class="prg-bundle-text">${esc(text)}</p>` +
      `<p class="prg-price"><span class="prg-price-value">${esc(deal.price)}</span>` +
      (deal.sum ? `<span class="prg-price-note">${esc(fmt(t.bundleInstead, { sum: deal.sum }))}</span>` : '') +
      `</p>` +
      // «Скоро»: надпись под ценой вместо кнопки «Купить»
      (deal.soon ? `<p class="prg-soon prg-soon--start">${esc(t.soon)}</p>` : '') +
      `</div>` +
      (deal.soon ? '' : `<div class="prg-actions">${buyButton(deal.bundle.slug, title, deal.price, fmt(t.buy, { price: deal.price }))}</div>`) +
      `</div>` +
      `</section>`;
  }

  // Бесплатного урока пока нет (нет видео): не зовём «посмотреть урок»
  if (free && !isComingSoon(free)) {
    const sub = loc(free.subtitle, lang);
    body +=
      `<section class="prg-section prg-free" aria-labelledby="prg-free-title">` +
      `<h2 class="prg-h2" id="prg-free-title">${esc(t.freeTitle)}</h2>` +
      `<p class="prg-lead">${esc(sub ? fmt(t.freeText, { subtitle: lowerFirst(sub) }) : t.freeTextNoSubtitle)}</p>` +
      `<div class="prg-actions"><a class="cab-secondary" href="${t.prefix}/free/">${esc(t.freeButton)}</a></div>` +
      `</section>`;
  }

  const firstCover = cats[0] ? coverOf(cats[0]) : null;
  return renderDocument({
    lang,
    title: t.indexDocTitle,
    description: t.indexDescription,
    path: '/programs/',
    ogType: 'website',
    image: cats[0]
      ? { url: `${SITE}${coverOf(cats[0])}`, width: 480, height: 600, alt: t.indexTitle }
      : { url: `${SITE}/assets/images/og-image.jpg`, width: 1200, height: 630, alt: t.indexTitle },
    head: firstCover
      ? `<link rel="preload" as="image" type="image/webp" href="${esc(firstCover.replace(/\.jpe?g$/i, '.webp'))}" fetchpriority="high">`
      : '',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: t.indexTitle,
      url: pageUrl(lang, '/programs/'),
      itemListElement: cats.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: pageUrl(lang, `/programs/${c.slug}/`),
        name: loc(c.title, lang),
      })),
    },
    current: 'programs',
    body,
    telegramText: t.telegramGeneral,
  });
}
