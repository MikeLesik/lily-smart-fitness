import raw from '../content/catalog.json';

export interface Localized {
  ru: string;
  en?: string;
}

export interface Price {
  amount: number;
  currency: string;
}

export interface CatalogVideo {
  id: string;
  title: Localized;
  description?: Localized;
  /** null, пока видео не загружено: такое видео не готово. */
  durationSec: number | null;
  preview: boolean;
  provider: string;
  /** UID в Cloudflare Stream; null = видео ещё не загружено (не готово, проиграть нельзя). */
  providerVideoId: string | null;
  /** «Что понадобится для тренировки», строчными: «коврик и полотенце». */
  equipment?: Localized;
}

export interface LocalizedList {
  ru: string[];
  en?: string[];
}

export interface CatalogFaqItem {
  q: Localized;
  a: Localized;
}

export interface CatalogCategory {
  slug: string;
  title: Localized;
  subtitle?: Localized;
  /** Обложка 4:5 из кадра видео, путь от корня сайта (/assets/images/programs/<slug>.jpg). */
  cover?: string;
  free: boolean;
  published: boolean;
  price: Price | null;
  /** Продающая страница /programs/<slug>/: meta description и описание товара (до ~160 символов). */
  description?: Localized;
  /** Кадр 9:16 для превью-плеера (/assets/images/programs/<slug>-preview.jpg), иначе обложка. */
  previewPoster?: string;
  /** «Что понадобится», строчными: «гантели и устойчивая ступенька». */
  equipment?: Localized;
  /** «Для кого»: 3–4 коротких пункта. */
  forWhom?: LocalizedList;
  /** Вопросы этой программы, идут перед общими. */
  faq?: CatalogFaqItem[];
  /** Срок доступа после покупки в днях. Нет поля = доступ бессрочный. */
  accessDays?: number;
  videos: CatalogVideo[];
}

export interface CatalogBundle {
  slug: string;
  title: Localized;
  /** false = набор снят с сайта. Нет поля = опубликован. */
  published?: boolean;
  cover?: string;
  categories: '*' | string[];
  price: Price;
}

export interface Catalog {
  categories: CatalogCategory[];
  bundles: CatalogBundle[];
}

/** Источник правды: content/catalog.json (в бандл функций, не в публичные файлы). Копия, чтобы подмена в тестах не трогала сам JSON. */
export const catalog: Catalog = { ...(raw as unknown as Catalog) };

/**
 * Только для тестов: подменить каталог (tests/setup-catalog.ts ставит фикстуру с видео).
 * Объект catalog остаётся тем же, меняется содержимое, поэтому импортёры видят новый каталог.
 */
export function setCatalogForTests(next: Catalog): void {
  const copy = structuredClone(next);
  catalog.categories = copy.categories;
  catalog.bundles = copy.bundles;
}

export function publishedCategories(): CatalogCategory[] {
  return catalog.categories.filter((c) => c.published);
}

/** Платные опубликованные категории с ценой: то, что продают страницы /programs/. */
export function paidCategories(): CatalogCategory[] {
  return publishedCategories().filter((c) => !c.free && c.price !== null);
}

/** Видео готово: загружено в Stream (есть providerVideoId) и известна длительность. */
export function isVideoReady(video: CatalogVideo): boolean {
  return Boolean(video.providerVideoId) && typeof video.durationSec === 'number' && video.durationSec > 0;
}

/**
 * «Скоро»: в категории нет основных видео (превью не в счёт) или хотя бы одно основное ещё не готово.
 * Флагов в JSON нет, правило одно на весь сайт: купить нельзя, бесплатный урок без формы.
 * Когда все основные видео готовы, продажа открывается сама.
 */
export function isComingSoon(category: CatalogCategory): boolean {
  const mains = category.videos.filter((v) => !v.preview);
  return mains.length === 0 || !mains.every(isVideoReady);
}

/** Срок доступа в секундах от момента выдачи; null = бессрочно. */
export function accessSeconds(scope: string): number | null {
  const category = catalog.categories.find((c) => c.slug === scope);
  const days = category?.accessDays;
  return typeof days === 'number' && days > 0 ? Math.round(days * 86400) : null;
}

/** Когда закончится право, выданное сейчас (секунды Unix); null = бессрочно. */
export function accessExpiresAt(scope: string, now: number): number | null {
  const sec = accessSeconds(scope);
  return sec === null ? null : now + sec;
}

/** Платные опубликованные категории, которые входят в набор. */
export function bundleCategories(bundle: CatalogBundle): CatalogCategory[] {
  return paidCategories().filter((c) => bundle.categories === '*' || bundle.categories.includes(c.slug));
}

/** Набор показывается и продаётся, только если он опубликован и в нём минимум две опубликованные платные программы. */
export function isBundleAvailable(bundle: CatalogBundle): boolean {
  return bundle.published !== false && bundleCategories(bundle).length >= 2;
}

export function availableBundles(): CatalogBundle[] {
  return catalog.bundles.filter(isBundleAvailable);
}

/** Набор «скоро», пока ни в одной его платной категории нет видео. */
export function isBundleComingSoon(bundle: CatalogBundle): boolean {
  return bundleCategories(bundle).every(isComingSoon);
}

/** Готовое видео опубликованной категории. Неготовое (без UID в Stream) как будто не существует: playback и прогресс 404. */
export function findVideo(id: string): { video: CatalogVideo & { providerVideoId: string; durationSec: number }; category: CatalogCategory } | null {
  for (const category of publishedCategories()) {
    const video = category.videos.find((v) => v.id === id && isVideoReady(v)) as
      | (CatalogVideo & { providerVideoId: string; durationSec: number })
      | undefined;
    if (video) return { video, category };
  }
  return null;
}

/** Каталог для браузера: без provider и providerVideoId. */
export function publicCatalog() {
  return {
    categories: publishedCategories().map((c) => ({
      slug: c.slug,
      title: c.title,
      subtitle: c.subtitle ?? null,
      cover: c.cover ?? null,
      free: c.free,
      price: c.price,
      accessDays: c.accessDays ?? null,
      comingSoon: isComingSoon(c),
      videos: c.videos.map((v) => ({
        id: v.id,
        title: v.title,
        description: v.description ?? null,
        equipment: v.equipment ?? null,
        durationSec: v.durationSec ?? null,
        preview: v.preview,
        ready: isVideoReady(v),
      })),
    })),
    bundles: availableBundles().map((b) => ({
      slug: b.slug,
      title: b.title,
      cover: b.cover ?? null,
      categories: b.categories,
      price: b.price,
      comingSoon: isBundleComingSoon(b),
    })),
  };
}

/** То, что можно купить: опубликованная платная категория или набор. */
export interface Sellable {
  scope: string;
  kind: 'category' | 'bundle';
  title: Localized;
  price: Price;
  /** Видео ещё нет: оформить оплату нельзя (409 coming_soon). Уже оплаченное вебхук всё равно засчитает. */
  comingSoon: boolean;
  /** Срок доступа в днях (только у категории с accessDays), иначе null. */
  accessDays: number | null;
}

export function findSellable(scope: string): Sellable | null {
  const category = publishedCategories().find((c) => c.slug === scope);
  if (category) {
    return !category.free && category.price
      ? { scope, kind: 'category', title: category.title, price: category.price, comingSoon: isComingSoon(category), accessDays: category.accessDays ?? null }
      : null;
  }
  const bundle = availableBundles().find((b) => b.slug === scope);
  return bundle
    ? { scope, kind: 'bundle', title: bundle.title, price: bundle.price, comingSoon: isBundleComingSoon(bundle), accessDays: null }
    : null;
}
