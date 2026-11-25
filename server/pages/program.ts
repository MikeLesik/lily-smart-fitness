import {
  availableBundles,
  bundleCategories,
  coverSmall,
  isBundleComingSoon,
  isComingSoon,
  isVideoReady,
  previewOfVideo,
  type CatalogBundle,
  type CatalogCategory,
  type CatalogVideo,
} from '../catalog';
import { ICON_LOCK, ICON_PLAY, esc, picture } from './html';
import {
  SITE,
  STRINGS,
  accessText,
  accessVars,
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

type ReadyVideo = CatalogVideo & { durationSec: number };

/**
 * Превью для плеера, только если оно уже загружено. Превью у каждой тренировки (previewOf):
 * берём превью первой по порядку программы тренировки, у которой оно готово; порядок превью в массиве не важен.
 */
export function previewVideo(cat: CatalogCategory): ReadyVideo | null {
  for (const v of mainVideos(cat)) {
    const own = previewOfVideo(cat, v.id);
    if (own) return own as ReadyVideo;
  }
  return (cat.videos.find((v) => v.preview && isVideoReady(v)) as ReadyVideo | undefined) ?? null;
}

/** Основное видео, к которому относится превью (previewOf), иначе null. */
function mainOf(cat: CatalogCategory, preview: CatalogVideo): CatalogVideo | null {
  return preview.previewOf ? (cat.videos.find((v) => v.id === preview.previewOf && !v.preview) ?? null) : null;
}

/** Обложка тренировки 9:16: уменьшенная копия -480 и полная 1080 в srcset. */
function coverImg(src: string, alt: string, className: string, sizes: string): string {
  const small = coverSmall(src);
  return (
    `<img class="${esc(className)}" src="${esc(small)}" srcset="${esc(small)} 480w, ${esc(src)} 1080w" sizes="${esc(sizes)}"` +
    ` alt="${esc(alt)}" width="480" height="854" loading="lazy" decoding="async">`
  );
}

/** Постер превью: обложка превью или его тренировки, иначе кадр программы (previewPoster) или её обложка. */
function previewPosterOf(cat: CatalogCategory, preview: CatalogVideo): { src: string; isCover: boolean } {
  const cover = preview.cover ?? mainOf(cat, preview)?.cover;
  if (cover) return { src: cover, isCover: true };
  return { src: cat.previewPoster ?? coverOf(cat), isCover: false };
}

/** Заголовок iframe превью: «Превью: Тренировка для стоп» у превью тренировки, иначе название программы. */
function previewFrameTitle(cat: CatalogCategory, preview: CatalogVideo, lang: Lang): string {
  const main = mainOf(cat, preview);
  return fmt(STRINGS[lang].previewFrameTitle, { title: loc(main ? main.title : cat.title, lang) });
}

/** У основных видео есть обложки: «Что внутри» показывается лентой карточек. «Скоро»: ленты нет. */
export function hasWorkoutCovers(cat: CatalogCategory): boolean {
  return !isComingSoon(cat) && mainVideos(cat).some((v) => Boolean(v.cover));
}

/** «Что понадобится: коврик» под названием видео; пусто, если поле не заполнено. */
function videoEquipment(v: CatalogVideo, lang: Lang, className: string): string {
  const eq = loc(v.equipment, lang).trim();
  return eq ? `<span class="${className}">${esc(fmt(STRINGS[lang].videoEquipment, { list: eq }))}</span>` : '';
}

/** «1 тренировка · 22 мин» по основным видео (превью не считается). Видео ещё нет: «Скоро». */
export function countMeta(cat: CatalogCategory, lang: Lang): string {
  const t = STRINGS[lang];
  if (isComingSoon(cat)) return t.soon;
  const mains = mainVideos(cat);
  const total = mains.reduce((s, v) => s + (v.durationSec ?? 0), 0);
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

/** Набор «все программы», если в нём больше одной платной программы и он дешевле суммы. soon: видео нет ни в одной. */
export function bundleDeal(
  lang: Lang,
): { bundle: CatalogBundle; count: number; price: string; sum: string | null; soon: boolean } | null {
  const bundles = availableBundles();
  const bundle = bundles.find((b) => b.slug === 'all') ?? bundles[0];
  if (!bundle) return null;
  const cats = bundleCategories(bundle);
  if (cats.length < 2) return null;
  const sum = cats.reduce((s, c) => (c.price && c.price.currency === bundle.price.currency ? s + c.price.amount : s), 0);
  return {
    bundle,
    soon: isBundleComingSoon(bundle),
    count: cats.length,
    price: formatPrice(bundle.price, lang),
    sum: sum > bundle.price.amount ? formatPrice({ amount: sum, currency: bundle.price.currency }, lang) : null,
  };
}

/** Длина самого длинного слова: «Послеродовое восстановление» не влезает в узкую колонку без переносов. */
function longestWord(text: string): number {
  return Math.max(0, ...text.split(/\s+/).map((w) => w.length));
}

function heroSection(cat: CatalogCategory, lang: Lang, preview: CatalogVideo | null): string {
  const t = STRINGS[lang];
  const title = loc(cat.title, lang);
  const price = formatPrice(cat.price, lang);
  // «Скоро»: цена остаётся, кнопок покупки и превью нет (мета уже говорит «Скоро»)
  const actions = isComingSoon(cat)
    ? ''
    : `<div class="prg-actions" data-buy-main>` +
      buyButton(cat.slug, title, price, fmt(t.buy, { price })) +
      (preview ? `<a class="cab-secondary" href="#preview" data-preview-play>${esc(t.watchPreview)}</a>` : '') +
      `</div>`;
  return (
    `<section class="prg-hero" aria-labelledby="prg-title">` +
    `<div class="prg-hero-head">` +
    `<h1 class="prg-title${longestWord(title) >= 12 ? ' prg-title--long' : ''}" id="prg-title">${esc(title)}</h1>` +
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
    `<p class="prg-meta">${esc(countMeta(cat, lang) + SEP + accessText(cat.accessDays, lang))}</p>` +
    `<p class="prg-price"><span class="prg-price-value">${esc(price)}</span><span class="prg-price-note">${esc(t.oneTime)}</span></p>` +
    actions +
    `</div>` +
    `</section>`
  );
}

/** Размер постера в плеере: на телефоне до 17,5rem, с 768 px до 20rem. */
const PLAYER_SIZES = '(min-width: 768px) 20rem, 17.5rem';

function previewSection(cat: CatalogCategory, lang: Lang, preview: ReadyVideo): string {
  const t = STRINGS[lang];
  const d = duration(preview.durationSec, lang);
  const poster = previewPosterOf(cat, preview);
  const isTall = poster.isCover || Boolean(cat.previewPoster);
  // Превью тренировки (previewOf) не обязательно начало: другой заголовок
  const each = Boolean(preview.previewOf);
  return (
    `<section class="prg-section prg-preview" id="preview" aria-labelledby="prg-preview-title">` +
    `<div class="prg-preview-text">` +
    `<h2 class="prg-h2" id="prg-preview-title">${esc(each ? t.previewTitleEach : t.previewTitle)}</h2>` +
    `<p class="prg-lead">${esc(each ? t.previewTextEach : fmt(t.previewText, { part: previewPart(preview.durationSec, lang) }))}</p>` +
    `</div>` +
    `<div class="prg-player${poster.isCover ? ' prg-player--card' : ''}" data-preview="${esc(preview.id)}" data-poster="${esc(poster.src)}"` +
    ` data-frame-title="${esc(previewFrameTitle(cat, preview, lang))}"` +
    ` data-msg-loading="${esc(t.previewLoading)}" data-msg-unavailable="${esc(t.previewUnavailable)}" data-msg-network="${esc(t.previewNetwork)}">` +
    (poster.isCover
      ? coverImg(poster.src, '', 'prg-player-poster', PLAYER_SIZES)
      : picture({
          src: poster.src,
          alt: '',
          width: isTall ? 540 : 480,
          height: isTall ? 960 : 600,
          className: 'prg-player-poster',
        })) +
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

function insideSection(cat: CatalogCategory, lang: Lang, preview: (CatalogVideo & { durationSec: number }) | null): string {
  const t = STRINGS[lang];
  const equipment = loc(cat.equipment, lang);
  const equipmentNote = equipment ? `<p class="prg-note">${esc(fmt(t.equipment, { list: equipment }))}</p>` : '';
  const mains = mainVideos(cat);
  // «Скоро», но список тренировок уже есть: названия и «что понадобится», без длительности и замков
  if (isComingSoon(cat) && mains.length) {
    const items = mains
      .map(
        (v) =>
          `<li><div class="prg-item prg-item--soon">` +
          `<span class="prg-item-body"><span class="prg-item-title">${esc(loc(v.title, lang))}</span>` +
          videoEquipment(v, lang, 'prg-item-equip') +
          `</span></div></li>`,
      )
      .join('');
    return (
      `<section class="prg-section prg-inside" aria-labelledby="prg-inside-title">` +
      `<h2 class="prg-h2" id="prg-inside-title">${esc(t.insideTitle)}</h2>` +
      `<p class="prg-meta">${esc(`${mains.length} ${plural(mains.length, t.workoutForms, lang)}${SEP}${t.soon}`)}</p>` +
      `<ul class="prg-items prg-items--compact">${items}</ul>` +
      equipmentNote +
      `</section>`
    );
  }
  if (isComingSoon(cat)) {
    return (
      `<section class="prg-section prg-inside" aria-labelledby="prg-inside-title">` +
      `<h2 class="prg-h2" id="prg-inside-title">${esc(t.insideTitle)}</h2>` +
      `<p class="prg-meta prg-inside-soon">${esc(t.soonInside)}</p>` +
      equipmentNote +
      `</section>`
    );
  }
  if (hasWorkoutCovers(cat)) return insideLane(cat, lang, equipmentNote);
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
  for (const v of mains) {
    const descText = loc(v.description, lang).trim();
    const desc = descText ? `<span class="prg-item-desc">${esc(descText)}</span>` : '';
    rows.push(
      `<li><div class="prg-item prg-item--locked">` +
        `<span class="prg-item-body"><span class="prg-item-title">${esc(loc(v.title, lang))}</span>` +
        videoEquipment(v, lang, 'prg-item-equip') +
        `<span class="prg-item-meta">${esc(duration(v.durationSec ?? 0, lang))}</span>${desc}</span>` +
        `<span class="prg-item-state">${ICON_LOCK}<span class="visually-hidden">${esc(t.lockedLabel)}</span></span>` +
        `</div></li>`,
    );
  }
  return (
    `<section class="prg-section prg-inside" aria-labelledby="prg-inside-title">` +
    `<h2 class="prg-h2" id="prg-inside-title">${esc(t.insideTitle)}</h2>` +
    `<p class="prg-meta">${esc(countMeta(cat, lang))}</p>` +
    `<ul class="prg-items${mains.length > 4 ? ' prg-items--compact' : ''}">${rows.join('')}</ul>` +
    equipmentNote +
    `</section>`
  );
}

/** Размер карточки ленты: на телефоне около половины ширины, с 768 px колонка сетки. */
const EP_SIZES = '(min-width: 768px) 11rem, 48vw';

/**
 * «Что внутри» лентой карточек: обложка 9:16, краткое описание, кнопка своего превью.
 * RU: название и длительность вшиты в обложку, текстом не дублируем. EN и тренировка без обложки:
 * название и длительность текстом под картинкой (на обложке русский текст). «Что понадобится» у обложки в alt.
 */
function insideLane(cat: CatalogCategory, lang: Lang, equipmentNote: string): string {
  const t = STRINGS[lang];
  const mains = mainVideos(cat);
  const cards = mains
    .map((v) => {
      const title = loc(v.title, lang);
      const d = duration(v.durationSec ?? 0, lang);
      const eq = loc(v.equipment, lang).trim();
      const showText = lang !== 'ru' || !v.cover;
      const image = v.cover
        ? coverImg(v.cover, fmt(t.epAlt, { title, d }) + (eq ? `. ${fmt(t.videoEquipment, { list: eq })}` : ''), 'prg-ep-cover', EP_SIZES)
        : picture({ src: coverOf(cat), alt: '', width: 480, height: 600, className: 'prg-ep-cover', pictureClass: 'prg-ep-picture' });
      const text = showText
        ? `<p class="prg-ep-title">${esc(title)}</p>` +
          `<p class="prg-ep-meta">${esc(d)}</p>` +
          // «Что понадобится» строкой только без обложки; у обложки он в alt (иначе EN-лента выше экрана)
          (eq && !v.cover ? `<p class="prg-ep-equip">${esc(fmt(t.videoEquipment, { list: eq }))}</p>` : '')
        : '';
      const descText = loc(v.description, lang).trim();
      const desc = descText ? `<p class="prg-ep-desc">${esc(descText)}</p>` : '';
      const preview = previewOfVideo(cat, v.id) as ReadyVideo | null;
      let action = '';
      if (preview) {
        const pd = duration(preview.durationSec, lang);
        const poster = previewPosterOf(cat, preview);
        action =
          `<div class="prg-ep-actions">` +
          `<a class="cab-secondary prg-ep-play" href="#preview" data-preview-play data-preview-pick="${esc(preview.id)}"` +
          ` data-poster="${esc(poster.src)}" data-poster-small="${esc(poster.isCover ? coverSmall(poster.src) : '')}"` +
          ` data-frame-title="${esc(previewFrameTitle(cat, preview, lang))}"` +
          ` data-play-chip="${esc(fmt(t.playChip, { d: pd }))}" data-play-aria="${esc(fmt(t.playPreview, { d: pd }))}"` +
          ` aria-label="${esc(fmt(t.epPreviewAria, { title, d: pd }))}">${esc(fmt(t.epPreview, { d: pd }))}</a>` +
          `</div>`;
      }
      return `<li class="prg-ep">${image}${text}${desc}${action}</li>`;
    })
    .join('');
  return (
    `<section class="prg-section prg-inside prg-inside--eps" aria-labelledby="prg-inside-title">` +
    `<h2 class="prg-h2" id="prg-inside-title">${esc(t.insideTitle)}</h2>` +
    `<p class="prg-meta">${esc(countMeta(cat, lang))}</p>` +
    `<ul class="prg-eps${lang !== 'ru' ? ' prg-eps--text' : ''}">${cards}</ul>` +
    equipmentNote +
    `</section>`
  );
}

function aboutSection(lang: Lang): string {
  const t = STRINGS[lang];
  return (
    `<section class="prg-section prg-about" aria-labelledby="prg-about-title">` +
    `<div class="prg-about-box">` +
    picture({
      src: '/assets/images/lily-about-480.jpg',
      alt: t.aboutAlt,
      width: 480,
      height: 600,
      className: 'prg-about-img',
      pictureClass: 'prg-about-photo',
    }) +
    `<div class="prg-about-body">` +
    `<h2 class="prg-h2" id="prg-about-title">${esc(t.aboutTitle)}</h2>` +
    `<p class="prg-about-text">${esc(t.aboutText)}</p>` +
    `<a class="cab-link" href="${t.prefix}/#about">${esc(t.aboutLink)}</a>` +
    `</div>` +
    `</div>` +
    `</section>`
  );
}

/** «Скоро» вместо блока покупки: цена, «Программа скоро появится» и вопрос Лиле в Telegram. */
function soonSection(cat: CatalogCategory, lang: Lang): string {
  const t = STRINGS[lang];
  const title = loc(cat.title, lang);
  const price = formatPrice(cat.price, lang);
  return (
    `<section class="prg-section prg-buy prg-buy--soon" id="buy" aria-labelledby="prg-buy-title">` +
    `<div class="prg-buy-box">` +
    `<h2 class="prg-h2" id="prg-buy-title">${esc(t.soonTitle)}</h2>` +
    `<p class="prg-price prg-price--big"><span class="prg-price-value">${esc(price)}</span><span class="prg-price-note">${esc(fmt(t.buyFor, { title }))}</span></p>` +
    `<div class="prg-actions">` +
    `<a class="cab-secondary" href="${esc(telegramLink(fmt(t.telegramQuestion, { title })))}" target="_blank" rel="noopener" data-soon-write>${esc(t.soonWrite)}</a>` +
    `</div>` +
    `</div>` +
    `</section>`
  );
}

function buySection(cat: CatalogCategory, lang: Lang): string {
  const t = STRINGS[lang];
  const title = loc(cat.title, lang);
  const price = formatPrice(cat.price, lang);
  const deal = bundleDeal(lang);
  const russia =
    `<a class="cab-secondary" href="${esc(telegramLink(fmt(t.telegramRussia, { title })))}" target="_blank" rel="noopener" data-russia-pay>` +
    `${esc(t.russiaPay)}</a>`;
  const bundleTitle = deal ? loc(deal.bundle.title, lang) || t.bundleTitle : '';
  return (
    `<section class="prg-section prg-buy" id="buy" aria-labelledby="prg-buy-title">` +
    `<div class="prg-buy-box">` +
    `<h2 class="prg-h2" id="prg-buy-title">${esc(cat.accessDays ? fmt(t.buyTitleTerm, accessVars(cat.accessDays, lang)) : t.buyTitle)}</h2>` +
    `<p class="prg-price prg-price--big"><span class="prg-price-value">${esc(price)}</span><span class="prg-price-note">${esc(fmt(t.buyFor, { title }))}</span></p>` +
    `<ul class="prg-list prg-list--compact">${t.buyPoints.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` +
    `<div class="prg-actions" data-buy-main>${buyButton(cat.slug, title, price, fmt(t.buy, { price }))}${russia}</div>` +
    `<p class="prg-pay-note">${esc(t.russiaPayNote)}</p>` +
    `<p class="prg-note">${esc(t.promoNote)}</p>` +
    (deal && deal.sum && !deal.soon
      ? `<p class="prg-bundle-offer">${buyButton(deal.bundle.slug, bundleTitle, deal.price, fmt(t.bundleOffer, { price: deal.price, sum: deal.sum }), 'cab-link')}</p>`
      : '') +
    `</div>` +
    `</section>`
  );
}

/** Липкая полоса покупки на телефоне: program.js показывает её, когда обе главные кнопки «Купить» вне экрана. */
function stickyBuy(cat: CatalogCategory, lang: Lang): string {
  const t = STRINGS[lang];
  const title = loc(cat.title, lang);
  const price = formatPrice(cat.price, lang);
  return (
    `<div class="prg-sticky" data-sticky-buy role="region" aria-label="${esc(t.stickyLabel)}">` +
    `<p class="prg-sticky-price"><span class="prg-sticky-title">${esc(title)}</span><span class="prg-price-value">${esc(price)}</span></p>` +
    buyButton(cat.slug, title, price, t.buyShort) +
    `</div>`
  );
}

function faqSection(cat: CatalogCategory, lang: Lang): string {
  const t = STRINGS[lang];
  const title = loc(cat.title, lang);
  const own = (cat.faq ?? []).map((f) => ({ q: loc(f.q, lang), a: esc(loc(f.a, lang)) }));
  const general = t.faq.map((f) => {
    let a = esc(cat.accessDays && f.aTerm ? fmt(f.aTerm, accessVars(cat.accessDays, lang)) : f.a);
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
  const soon = isComingSoon(cat);
  // «Скоро»: превью не показываем, даже если оно есть, покупки и липкой полосы нет
  const preview = soon ? null : previewVideo(cat);
  const cover = coverOf(cat);
  const description =
    loc(cat.description, lang) ||
    `${title}: ${loc(cat.subtitle, lang)}. ${countMeta(cat, lang).replace(/ /g, ' ')}, ${accessText(cat.accessDays, lang)}.`;
  const price = cat.price!;
  const image = `${SITE}${cover}`;

  const body =
    heroSection(cat, lang, preview) +
    (preview ? previewSection(cat, lang, preview) : '') +
    // Лента карточек идёт на всю ширину, «Для кого» тогда без пары
    (hasWorkoutCovers(cat)
      ? forWhomSection(cat, lang) + insideSection(cat, lang, preview)
      : `<div class="prg-pair">` + forWhomSection(cat, lang) + insideSection(cat, lang, preview) + `</div>`) +
    aboutSection(lang) +
    (soon ? soonSection(cat, lang) : buySection(cat, lang)) +
    faqSection(cat, lang) +
    (soon || cat.free || !cat.price ? '' : stickyBuy(cat, lang));

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
      // «Скоро»: купить нельзя, поэтому без Offer (PreOrder обещал бы заказ, которого нет)
      ...(soon
        ? {}
        : {
            offers: {
              '@type': 'Offer',
              url,
              price: schemaPrice(price),
              priceCurrency: price.currency.toUpperCase(),
              availability: 'https://schema.org/InStock',
            },
          }),
    },
    current: 'program',
    body,
    withPlayer: !soon,
    telegramText: fmt(t.telegramQuestion, { title }),
  });
}
