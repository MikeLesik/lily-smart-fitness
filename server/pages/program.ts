import { catalog, paidCategories, type CatalogBundle, type CatalogCategory, type CatalogVideo } from '../catalog';
import { ICON_LOCK, ICON_PLAY, esc, picture } from './html';
import {
  SITE,
  STRINGS,
  duration,
  fmt,
  formatPrice,
  loc,
  locList,
  plural,
  previewPart,
  schemaPrice,
  telegramLink,
  type Lang,
} from './i18n';
import { pageUrl, renderDocument } from './layout';

const SEP = ' · ';

export function mainVideos(cat: CatalogCategory): CatalogVideo[] {
  return cat.videos.filter((v) => !v.preview);
}

export function previewVideo(cat: CatalogCategory): CatalogVideo | null {
  return cat.videos.find((v) => v.preview) ?? null;
}

/** «1 тренировка · 22 мин» по основным видео (превью не считается). */
export function countMeta(cat: CatalogCategory, lang: Lang): string {
  const t = STRINGS[lang];
  const mains = mainVideos(cat);
  const total = mains.reduce((s, v) => s + v.durationSec, 0);
  return `${mains.length} ${plural(mains.length, t.workoutForms, lang)}${SEP}${duration(total, lang)}`;
}

export function coverOf(cat: { slug: string; cover?: string }): string {
  return cat.cover ?? `/assets/images/programs/${cat.slug}.jpg`;
}

/** Кнопка покупки: data-buy подхватывает /js/buy.js (гость вводит email, вошедшая сразу в Stripe). */
export function buyButton(
  scope: string,
  title: string,
  priceText: string,
  label: string,
  className = 'btn-primary',
): string {
  return (
    `<a class="${className}" href="#buy" data-buy="${esc(scope)}" data-buy-title="${esc(title)}" data-buy-price="${esc(priceText)}">` +
    `${esc(label)}</a>`
  );
}

/** Набор «все программы», если в нём больше одной платной программы и он дешевле суммы. */
export function bundleDeal(lang: Lang): { bundle: CatalogBundle; count: number; price: string; sum: string | null } | null {
  const bundle = catalog.bundles.find((b) => b.slug === 'all') ?? catalog.bundles[0];
  if (!bundle) return null;
  const cats = paidCategories().filter((c) => bundle.categories === '*' || bundle.categories.includes(c.slug));
  if (cats.length < 2) return null;
  const sum = cats.reduce((s, c) => (c.price && c.price.currency === bundle.price.currency ? s + c.price.amount : s), 0);
  return {
    bundle,
    count: cats.length,
    price: formatPrice(bundle.price, lang),
    sum: sum > bundle.price.amount ? formatPrice({ amount: sum, currency: bundle.price.currency }, lang) : null,
  };
}

function heroSection(cat: CatalogCategory, lang: Lang, preview: CatalogVideo | null): string {
  const t = STRINGS[lang];
  const title = loc(cat.title, lang);
  const price = formatPrice(cat.price, lang);
  return (
    `<section class="prg-hero" aria-labelledby="prg-title">` +
    `<div class="prg-hero-head">` +
    `<h1 class="prg-title" id="prg-title">${esc(title)}</h1>` +
    (cat.subtitle ? `<p class="prg-sub">${esc(loc(cat.subtitle, lang))}</p>` : '') +
    `</div>` +
    picture({
      src: coverOf(cat),
      alt: fmt(t.imageAlt, { title }),
      width: 480,
      height: 600,
      className: 'prg-cover',
      pictureClass: 'prg-hero-cover',
      eager: true,
    }) +
    `<div class="prg-hero-offer">` +
    `<p class="prg-meta">${esc(countMeta(cat, lang) + SEP + t.forever)}</p>` +
    `<p class="prg-price"><span class="prg-price-value">${esc(price)}</span><span class="prg-price-note">${esc(t.oneTime)}</span></p>` +
    `<div class="prg-actions">` +
    buyButton(cat.slug, title, price, fmt(t.buy, { price })) +
    (preview ? `<a class="cab-secondary" href="#preview" data-preview-play>${esc(t.watchPreview)}</a>` : '') +
    `</div>` +
    `</div>` +
    `</section>`
  );
}

function previewSection(cat: CatalogCategory, lang: Lang, preview: CatalogVideo): string {
  const t = STRINGS[lang];
  const title = loc(cat.title, lang);
  const d = duration(preview.durationSec, lang);
  const poster = cat.previewPoster ?? coverOf(cat);
  const isTall = Boolean(cat.previewPoster);
  return (
    `<section class="prg-section prg-preview" id="preview" aria-labelledby="prg-preview-title">` +
    `<div class="prg-preview-text">` +
    `<h2 class="prg-h2" id="prg-preview-title">${esc(t.previewTitle)}</h2>` +
    `<p class="prg-lead">${esc(fmt(t.previewText, { part: previewPart(preview.durationSec, lang) }))}</p>` +
    `</div>` +
    `<div class="prg-player" data-preview="${esc(preview.id)}" data-poster="${esc(poster)}"` +
    ` data-frame-title="${esc(fmt(t.previewFrameTitle, { title }))}"` +
    ` data-msg-loading="${esc(t.previewLoading)}" data-msg-unavailable="${esc(t.previewUnavailable)}" data-msg-network="${esc(t.previewNetwork)}">` +
    picture({
      src: poster,
      alt: '',
      width: isTall ? 540 : 480,
      height: isTall ? 960 : 600,
      className: 'prg-player-poster',
    }) +
    `<button type="button" class="prg-play" aria-label="${esc(fmt(t.playPreview, { d }))}">` +
    `<span class="prg-play-chip" aria-hidden="true">${ICON_PLAY}<span class="prg-play-label">${esc(fmt(t.playChip, { d }))}</span></span>` +
    `</button>` +
    `</div>` +
    `<p class="prg-player-msg" role="status" data-preview-msg hidden></p>` +
    `</section>`
  );
}

function forWhomSection(cat: CatalogCategory, lang: Lang): string {
  const items = locList(cat.forWhom, lang);
  if (!items.length) return '';
  const t = STRINGS[lang];
  return (
    `<section class="prg-section prg-for" aria-labelledby="prg-for-title">` +
    `<h2 class="prg-h2" id="prg-for-title">${esc(t.forWhomTitle)}</h2>` +
    `<ul class="prg-list">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` +
    `</section>`
  );
}

function insideSection(cat: CatalogCategory, lang: Lang, preview: CatalogVideo | null): string {
  const t = STRINGS[lang];
  const rows: string[] = [];
  if (preview) {
    rows.push(
      `<li><a class="prg-item prg-item--free" href="#preview" data-preview-play>` +
        `<span class="prg-item-body"><span class="prg-item-title">${esc(loc(preview.title, lang))}</span>` +
        `<span class="prg-item-meta">${esc(duration(preview.durationSec, lang) + SEP + t.freeMark)}</span></span>` +
        `<span class="prg-item-state prg-item-state--play">${ICON_PLAY}<span class="visually-hidden">${esc(t.watchPreview)}</span></span>` +
        `</a></li>`,
    );
  }
  for (const v of mainVideos(cat)) {
    const desc = v.description ? `<span class="prg-item-desc">${esc(loc(v.description, lang))}</span>` : '';
    rows.push(
      `<li><div class="prg-item prg-item--locked">` +
        `<span class="prg-item-body"><span class="prg-item-title">${esc(loc(v.title, lang))}</span>` +
        `<span class="prg-item-meta">${esc(duration(v.durationSec, lang))}</span>${desc}</span>` +
        `<span class="prg-item-state">${ICON_LOCK}<span class="visually-hidden">${esc(t.lockedLabel)}</span></span>` +
        `</div></li>`,
    );
  }
  const equipment = loc(cat.equipment, lang);
  return (
    `<section class="prg-section prg-inside" aria-labelledby="prg-inside-title">` +
    `<h2 class="prg-h2" id="prg-inside-title">${esc(t.insideTitle)}</h2>` +
    `<p class="prg-meta">${esc(countMeta(cat, lang))}</p>` +
    `<ul class="prg-items">${rows.join('')}</ul>` +
    (equipment ? `<p class="prg-note">${esc(fmt(t.equipment, { list: equipment }))}</p>` : '') +
    `</section>`
  );
}

function buySection(cat: CatalogCategory, lang: Lang): string {
  const t = STRINGS[lang];
  const title = loc(cat.title, lang);
  const price = formatPrice(cat.price, lang);
  const deal = bundleDeal(lang);
  const russia = `<a href="${esc(telegramLink(fmt(t.telegramRussia, { title })))}" target="_blank" rel="noopener">${esc(t.russiaLink)}</a>`;
  const bundleTitle = deal ? loc(deal.bundle.title, lang) || t.bundleTitle : '';
  return (
    `<section class="prg-section prg-buy" id="buy" aria-labelledby="prg-buy-title">` +
    `<div class="prg-buy-box">` +
    `<h2 class="prg-h2" id="prg-buy-title">${esc(t.buyTitle)}</h2>` +
    `<p class="prg-price prg-price--big"><span class="prg-price-value">${esc(price)}</span><span class="prg-price-note">${esc(fmt(t.buyFor, { title }))}</span></p>` +
    `<ul class="prg-list prg-list--compact">${t.buyPoints.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` +
    `<div class="prg-actions">${buyButton(cat.slug, title, price, fmt(t.buy, { price }))}</div>` +
    `<p class="prg-note">${esc(t.promoNote)} ${fmt(esc(t.russiaNote), { link: russia })}</p>` +
    (deal && deal.sum
      ? `<p class="prg-bundle-offer">${buyButton(deal.bundle.slug, bundleTitle, deal.price, fmt(t.bundleOffer, { price: deal.price, sum: deal.sum }), 'cab-link')}</p>`
      : '') +
    `</div>` +
    `</section>`
  );
}

function faqSection(cat: CatalogCategory, lang: Lang): string {
  const t = STRINGS[lang];
  const title = loc(cat.title, lang);
  const own = (cat.faq ?? []).map((f) => ({ q: loc(f.q, lang), a: esc(loc(f.a, lang)) }));
  const general = t.faq.map((f) => {
    let a = esc(f.a);
    if (f.link === 'refunds') a += ` <a href="${t.prefix}/legal/refunds/">${esc(t.faqRefundsLink)}</a>`;
    if (f.link === 'telegram-russia') {
      a += ` <a href="${esc(telegramLink(fmt(t.telegramRussia, { title })))}" target="_blank" rel="noopener">${esc(t.faqTelegramLink)}</a>`;
    }
    return { q: f.q, a };
  });
  const items = [...own, ...general]
    .map((f) => `<details class="prg-faq-item"><summary>${esc(f.q)}</summary><p>${f.a}</p></details>`)
    .join('');
  return (
    `<section class="prg-section prg-faq" aria-labelledby="prg-faq-title">` +
    `<h2 class="prg-h2" id="prg-faq-title">${esc(t.faqTitle)}</h2>` +
    `<div class="prg-faq-list">${items}</div>` +
    `</section>`
  );
}

/** Продающая страница платной программы /programs/<slug>/ (EN /en/programs/<slug>/). */
export function renderProgramPage(cat: CatalogCategory, lang: Lang): string {
  const t = STRINGS[lang];
  const title = loc(cat.title, lang);
  const path = `/programs/${cat.slug}/`;
  const url = pageUrl(lang, path);
  const preview = previewVideo(cat);
  const cover = coverOf(cat);
  const description =
    loc(cat.description, lang) ||
    `${title}: ${loc(cat.subtitle, lang)}. ${countMeta(cat, lang).replace(/ /g, ' ')}, ${t.forever}.`;
  const price = cat.price!;
  const image = `${SITE}${cover}`;

  const body =
    heroSection(cat, lang, preview) +
    (preview ? previewSection(cat, lang, preview) : '') +
    `<div class="prg-pair">` +
    forWhomSection(cat, lang) +
    insideSection(cat, lang, preview) +
    `</div>` +
    buySection(cat, lang) +
    faqSection(cat, lang);

  return renderDocument({
    lang,
    title: fmt(t.programDocTitle, { title }),
    description,
    path,
    ogType: 'product',
    image: { url: image, width: 480, height: 600, alt: fmt(t.imageAlt, { title }) },
    head:
      `<meta property="product:price:amount" content="${schemaPrice(price)}">\n` +
      `<meta property="product:price:currency" content="${esc(price.currency.toUpperCase())}">\n` +
      `<link rel="preload" as="image" type="image/webp" href="${esc(cover.replace(/\.jpe?g$/i, '.webp'))}" fetchpriority="high">`,
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: title,
      description,
      image,
      url,
      brand: { '@type': 'Brand', name: 'Lily' },
      offers: {
        '@type': 'Offer',
        url,
        price: schemaPrice(price),
        priceCurrency: price.currency.toUpperCase(),
        availability: 'https://schema.org/InStock',
      },
    },
    current: 'program',
    body,
    withPlayer: Boolean(preview),
    telegramText: fmt(t.telegramQuestion, { title }),
  });
}
